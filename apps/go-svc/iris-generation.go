package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

type irisGenerationAPI struct {
	objects  *objectstore.Registry
	provider irisGenerationProvider
	now      func() time.Time
	run      func(func())
}

type irisUploadResponse struct {
	Asset         irisAssetRef      `json:"asset"`
	UploadURL     *string           `json:"uploadUrl"`
	UploadHeaders map[string]string `json:"uploadHeaders"`
}

type irisGenerateBody struct {
	Request        irisGenerateRequest `json:"request"`
	IdempotencyKey string              `json:"idempotencyKey"`
	MaxCredits     *float64            `json:"maxCredits"`
}

func (api *irisGenerationAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "POST /v1/iris/uploads", http.HandlerFunc(api.createUpload))
	registerAuthenticated(mux, verifier, "POST /v1/iris/generate", http.HandlerFunc(api.generate))
	registerAuthenticated(mux, verifier, "POST /v1/iris/estimate", http.HandlerFunc(api.estimate))
	registerAuthenticated(mux, verifier, "GET /v1/iris/models", http.HandlerFunc(api.listModels))
	registerAuthenticated(mux, verifier, "GET /v1/iris/jobs/{jobId}", http.HandlerFunc(api.getJob))
	registerAuthenticated(mux, verifier, "POST /v1/iris/jobs/{jobId}/cancel", http.HandlerFunc(api.cancelJob))
}

func (api *irisGenerationAPI) claims(r *http.Request) (AuthClaims, bool) {
	claims, ok := r.Context().Value(authContextKey{}).(AuthClaims)
	return claims, ok && strings.TrimSpace(claims.UserID) != ""
}

func (api *irisGenerationAPI) clock() time.Time {
	if api != nil && api.now != nil {
		return api.now()
	}
	return time.Now().UTC()
}

func (api *irisGenerationAPI) start(fn func()) {
	if api != nil && api.run != nil {
		api.run(fn)
		return
	}
	go fn()
}

func (api *irisGenerationAPI) createUpload(w http.ResponseWriter, r *http.Request) {
	claims, ok := api.claims(r)
	if !ok {
		writeUnauthorized(w, "Authentication required")
		return
	}
	var body struct {
		SHA256      string `json:"sha256"`
		ContentType string `json:"contentType"`
		Size        int64  `json:"size"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "Invalid upload request"})
		return
	}
	sha := strings.ToLower(strings.TrimSpace(body.SHA256))
	contentType := strings.TrimSpace(body.ContentType)
	if !isSHA256(sha) || contentType == "" || body.Size < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "sha256, contentType, and size are required"})
		return
	}
	asset := irisAssetRef{Kind: "asset", ID: sha}
	if _, err := api.statUpload(r.Context(), claims.UserID, sha); err == nil {
		writeJSON(w, http.StatusOK, irisUploadResponse{Asset: asset})
		return
	} else if !errors.Is(err, objectstore.ErrNotFound) && !errors.Is(err, objectstore.ErrUnknownLocation) {
		if err.Error() == "object_storage_not_configured" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "object_storage_not_configured", "message": "S3 object storage is not configured"})
			return
		}
	}
	signer, _, err := api.presigner(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "object_storage_not_configured", "message": "S3 object storage is not configured"})
		return
	}
	signed, err := signer.PresignUpload(r.Context(), objectstore.Upload{
		Key:         irisUploadKey(claims.UserID, sha),
		ContentType: contentType,
		IfAbsent:    true,
	}, irisUploadTTL)
	if err != nil {
		logRequestFailure(r, "iris_generation_presign_failed", "upload", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not sign the upload"})
		return
	}
	url := signed.URL
	writeJSON(w, http.StatusOK, irisUploadResponse{
		Asset:         asset,
		UploadURL:     &url,
		UploadHeaders: headerMap(signed.Headers),
	})
}

func (api *irisGenerationAPI) listModels(w http.ResponseWriter, r *http.Request) {
	if _, ok := api.claims(r); !ok {
		writeUnauthorized(w, "Authentication required")
		return
	}
	writeJSON(w, http.StatusOK, irisPublicModels())
}

func (api *irisGenerationAPI) estimate(w http.ResponseWriter, r *http.Request) {
	if _, ok := api.claims(r); !ok {
		writeUnauthorized(w, "Authentication required")
		return
	}
	req, err := decodeIrisRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	estimate, _, err := estimateIrisRequest(req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, estimate)
}

func (api *irisGenerationAPI) generate(w http.ResponseWriter, r *http.Request) {
	claims, ok := api.claims(r)
	if !ok {
		writeUnauthorized(w, "Authentication required")
		return
	}
	var body irisGenerateBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "Invalid generate request"})
		return
	}
	if strings.TrimSpace(body.IdempotencyKey) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "idempotencyKey is required"})
		return
	}
	estimate, model, err := estimateIrisRequest(body.Request)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	if body.MaxCredits != nil && estimate.Credits > *body.MaxCredits {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "max_credits_exceeded", "message": "This generation exceeds maxCredits"})
		return
	}
	if jobID, err := api.lookupIdempotency(r.Context(), claims.UserID, body.IdempotencyKey); err == nil && jobID != "" {
		job, loadErr := api.loadJob(r.Context(), claims.UserID, jobID)
		if loadErr == nil {
			writeJSON(w, http.StatusOK, job)
			return
		}
	}
	now := api.clock()
	job := irisJobRecord{
		ID:         "job_" + uuid.NewString(),
		Model:      model.ID,
		Request:    body.Request,
		Status:     "queued",
		Credits:    estimate.Credits,
		ETASeconds: estimate.ETASeconds,
		Assets:     []irisJobAsset{},
		CreatedAt:  now.Format(time.RFC3339),
		UserID:     claims.UserID,
	}
	remaining := estimate.ETASeconds
	job.ETARemainingSeconds = &remaining
	if err := api.saveJob(r.Context(), job); err != nil {
		logRequestFailure(r, "iris_generation_save_failed", "generate", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "object_storage_not_configured", "message": "S3 object storage is not configured"})
		return
	}
	_ = api.putJSON(r.Context(), irisIdempotencyKey(claims.UserID, body.IdempotencyKey), map[string]string{"jobId": job.ID})
	api.start(func() { api.runJob(job) })
	writeJSON(w, http.StatusOK, job)
}

func (api *irisGenerationAPI) getJob(w http.ResponseWriter, r *http.Request) {
	claims, ok := api.claims(r)
	if !ok {
		writeUnauthorized(w, "Authentication required")
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobId"))
	job, err := api.loadJob(r.Context(), claims.UserID, jobID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job_not_found", "message": "Job not found"})
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (api *irisGenerationAPI) cancelJob(w http.ResponseWriter, r *http.Request) {
	claims, ok := api.claims(r)
	if !ok {
		writeUnauthorized(w, "Authentication required")
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobId"))
	job, err := api.loadJob(r.Context(), claims.UserID, jobID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job_not_found", "message": "Job not found"})
		return
	}
	if job.Status == "queued" || job.Status == "running" {
		now := api.clock().Format(time.RFC3339)
		job.Status = "canceled"
		job.CompletedAt = &now
		job.Error = &irisJobError{Code: "CANCELED", Message: "The generation was canceled."}
		job.ETARemainingSeconds = nil
		if err := api.saveJob(r.Context(), job); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not cancel the job"})
			return
		}
	}
	writeJSON(w, http.StatusOK, job)
}

func (api *irisGenerationAPI) lookupIdempotency(ctx context.Context, userID, key string) (string, error) {
	var stored struct {
		JobID string `json:"jobId"`
	}
	if err := api.getJSON(ctx, irisIdempotencyKey(userID, key), &stored); err != nil {
		return "", err
	}
	return stored.JobID, nil
}

func (api *irisGenerationAPI) runJob(job irisJobRecord) {
	ctx, cancel := context.WithTimeout(context.Background(), irisProviderTimeout)
	defer cancel()
	current, err := api.loadJob(ctx, job.UserID, job.ID)
	if err == nil {
		job = current
	}
	if job.Status == "canceled" {
		return
	}
	started := api.clock().Format(time.RFC3339)
	job.Status = "running"
	job.StartedAt = &started
	phase := "generating"
	job.Phase = &phase
	progress := 0.2
	job.Progress = &progress
	if err := api.saveJob(ctx, job); err != nil {
		slog.Error("iris_generation_mark_running_failed", "job_id", job.ID, "error", err)
		return
	}
	if api.provider == nil {
		api.failJob(ctx, job, "PROVIDER_ERROR", "Generation provider is not configured (set AI_GATEWAY_API_KEY)")
		return
	}
	model, ok := irisModelByID(job.Model)
	if !ok {
		api.failJob(ctx, job, "INVALID_INPUT", "Unknown model")
		return
	}
	inputs, err := api.loadInputs(ctx, job)
	if err != nil {
		api.failJob(ctx, job, "INVALID_INPUT", err.Error())
		return
	}
	outputs, err := api.provider.Generate(ctx, irisProviderRequest{
		Model:       model,
		Prompt:      job.Request.prompt(),
		Voice:       job.Request.voice(),
		Duration:    job.Request.duration(),
		AspectRatio: job.Request.stringField("aspectRatio"),
		Resolution:  job.Request.stringField("resolution"),
		Count:       job.Request.count(),
		Language:    job.Request.languageCode(),
		Inputs:      inputs,
	})
	if err != nil {
		api.failJob(ctx, job, "PROVIDER_ERROR", err.Error())
		return
	}
	latest, loadErr := api.loadJob(ctx, job.UserID, job.ID)
	if loadErr == nil && latest.Status == "canceled" {
		return
	}
	assets := make([]irisJobAsset, 0, len(outputs))
	keys := make([]string, 0, len(outputs))
	for _, output := range outputs {
		key := irisOutputKey(job.UserID, job.ID, output.Filename)
		if err := api.putBytes(ctx, key, output.ContentType, output.Bytes); err != nil {
			api.failJob(ctx, job, "INTERNAL", "Could not store the generated file")
			return
		}
		keys = append(keys, key)
		assets = append(assets, irisJobAsset{
			Filename:    output.Filename,
			ContentType: output.ContentType,
			Size:        len(output.Bytes),
			Key:         key,
		})
	}
	completed := api.clock().Format(time.RFC3339)
	job.Status = "succeeded"
	job.Assets = assets
	job.OutputKeys = keys
	job.CompletedAt = &completed
	job.Error = nil
	job.Phase = nil
	done := 1.0
	job.Progress = &done
	job.ETARemainingSeconds = nil
	if err := api.saveJob(ctx, job); err != nil {
		slog.Error("iris_generation_complete_failed", "job_id", job.ID, "error", err)
	}
}

func (api *irisGenerationAPI) failJob(ctx context.Context, job irisJobRecord, code, message string) {
	completed := api.clock().Format(time.RFC3339)
	job.Status = "failed"
	job.CompletedAt = &completed
	job.Error = &irisJobError{Code: code, Message: message}
	job.ETARemainingSeconds = nil
	if err := api.saveJob(ctx, job); err != nil {
		slog.Error("iris_generation_fail_failed", "job_id", job.ID, "error", err)
	}
}

func (api *irisGenerationAPI) loadInputs(ctx context.Context, job irisJobRecord) ([]irisProviderInput, error) {
	var inputs []irisProviderInput
	add := func(role string, ref irisAssetRef, ok bool) error {
		if !ok {
			return nil
		}
		data, contentType, err := api.readRef(ctx, job.UserID, ref)
		if err != nil {
			return err
		}
		inputs = append(inputs, irisProviderInput{Role: role, Bytes: data, ContentType: contentType})
		return nil
	}
	addField := func(role, field string) error {
		ref, ok := job.Request.asset(field)
		return add(role, ref, ok)
	}
	if err := addField("image", "image"); err != nil {
		return nil, err
	}
	if err := addField("video", "video"); err != nil {
		return nil, err
	}
	if err := addField("audio", "audio"); err != nil {
		return nil, err
	}
	if err := addField("media", "media"); err != nil {
		return nil, err
	}
	if err := addField("start", "startFrame"); err != nil {
		return nil, err
	}
	if err := addField("end", "endFrame"); err != nil {
		return nil, err
	}
	for _, ref := range job.Request.assets("images") {
		if err := add("image", ref, true); err != nil {
			return nil, err
		}
	}
	return inputs, nil
}

func (api *irisGenerationAPI) readRef(ctx context.Context, userID string, ref irisAssetRef) ([]byte, string, error) {
	switch ref.Kind {
	case "asset":
		return api.getBytes(ctx, irisUploadKey(userID, ref.ID))
	case "url":
		return fetchHTTPS(ctx, ref.URL)
	default:
		return nil, "", fmtError("unsupported asset ref")
	}
}

func decodeIrisRequest(r *http.Request) (irisGenerateRequest, error) {
	var req irisGenerateRequest
	if err := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 2<<20)).Decode(&req); err != nil {
		return nil, errors.New("invalid generate request")
	}
	if req.modelID() == "" {
		return nil, errors.New("model is required")
	}
	return req, nil
}

func fmtError(message string) error {
	return errors.New(message)
}
