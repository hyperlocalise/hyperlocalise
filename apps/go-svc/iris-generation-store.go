package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	irisUploadTTL      = 15 * time.Minute
	irisDownloadTTL    = 60 * time.Minute
	irisMaxUploadBytes = 64 << 20
)

type irisPendingJob struct {
	OrgID  string `json:"organizationId"`
	UserID string `json:"userId"`
	JobID  string `json:"jobId"`
}

type irisPendingIndex struct {
	Jobs []irisPendingJob `json:"jobs"`
}

type irisJobRecord struct {
	ID                  string              `json:"id"`
	Model               string              `json:"model"`
	Request             irisGenerateRequest `json:"request"`
	Status              string              `json:"status"`
	Phase               *string             `json:"phase"`
	Progress            *float64            `json:"progress"`
	Credits             float64             `json:"credits"`
	ETASeconds          int                 `json:"etaSeconds"`
	ETARemainingSeconds *int                `json:"etaRemainingSeconds"`
	Name                *string             `json:"name"`
	Assets              []irisJobAsset      `json:"assets"`
	Error               *irisJobError       `json:"error"`
	CreatedAt           string              `json:"createdAt"`
	StartedAt           *string             `json:"startedAt"`
	CompletedAt         *string             `json:"completedAt"`
	ExpiresAt           *string             `json:"expiresAt"`
	OutputKeys          []string            `json:"-"`
	UserID              string              `json:"-"`
	OrgID               string              `json:"-"`
}

type irisStoredJob struct {
	irisJobRecord
	OutputKeys []string `json:"outputKeys"`
	UserID     string   `json:"userId"`
	OrgID      string   `json:"organizationId"`
}

type irisJobAsset struct {
	URL         string `json:"url"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	Key         string `json:"-"`
}

type irisJobError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func irisOrgPrefix(orgID string) string {
	return "iris/generation/orgs/" + strings.TrimSpace(orgID)
}

func irisUploadKey(orgID, sha string) string {
	return irisOrgPrefix(orgID) + "/uploads/" + strings.ToLower(sha)
}

func irisJobKey(orgID, jobID string) string {
	return irisOrgPrefix(orgID) + "/jobs/" + jobID + ".json"
}

func irisIdempotencyKey(orgID, key string) string {
	return irisOrgPrefix(orgID) + "/idempotency/" + strings.TrimSpace(key)
}

func irisOutputKey(orgID, jobID, filename string) string {
	return irisOrgPrefix(orgID) + "/jobs/" + jobID + "/assets/" + filename
}

func irisPendingIndexKey() string {
	return "iris/generation/pending-index.json"
}

func irisPendingKey(jobID string) string {
	return "iris/generation/pending/" + strings.TrimSpace(jobID) + ".json"
}

func irisCancelKey(orgID, jobID string) string {
	return irisOrgPrefix(orgID) + "/cancels/" + strings.TrimSpace(jobID)
}

func irisRunLockKey(jobID string) string {
	return "iris/generation/locks/" + strings.TrimSpace(jobID)
}

func (api *irisGenerationAPI) registry() (*objectstore.Registry, error) {
	if api == nil || api.objects == nil {
		return nil, fmt.Errorf("object_storage_not_configured")
	}
	return api.objects, nil
}

func (api *irisGenerationAPI) presigner(ctx context.Context) (objectstore.Presigner, string, error) {
	reg, err := api.registry()
	if err != nil {
		return nil, "", err
	}
	location := reg.DefaultLocationID()
	signer, err := reg.Presigner(location)
	if err != nil {
		return nil, "", err
	}
	return signer, location, nil
}

func (api *irisGenerationAPI) putJSON(ctx context.Context, key string, value any) error {
	return api.writeJSON(ctx, objectstore.PutInput{Key: key}, value)
}

func (api *irisGenerationAPI) putJSONIfAbsent(ctx context.Context, key string, value any) error {
	return api.writeJSON(ctx, objectstore.PutInput{Key: key, IfAbsent: true}, value)
}

func (api *irisGenerationAPI) writeJSON(ctx context.Context, input objectstore.PutInput, value any) error {
	reg, err := api.registry()
	if err != nil {
		return err
	}
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	input.Body = bytes.NewReader(body)
	input.Size = int64(len(body))
	if input.ContentType == "" {
		input.ContentType = "application/json"
	}
	_, _, err = reg.Put(ctx, input)
	return err
}

func (api *irisGenerationAPI) deleteObject(ctx context.Context, key string) error {
	reg, err := api.registry()
	if err != nil {
		return err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return err
	}
	return store.Delete(ctx, key)
}

func (api *irisGenerationAPI) getJSON(ctx context.Context, key string, dest any) error {
	_, err := api.getJSONInfo(ctx, key, dest)
	return err
}

func (api *irisGenerationAPI) getJSONInfo(ctx context.Context, key string, dest any) (objectstore.Info, error) {
	reg, err := api.registry()
	if err != nil {
		return objectstore.Info{}, err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return objectstore.Info{}, err
	}
	body, info, err := store.Get(ctx, key)
	if err != nil {
		return objectstore.Info{}, err
	}
	defer func() { _ = body.Close() }()
	if err := json.NewDecoder(body).Decode(dest); err != nil {
		return objectstore.Info{}, err
	}
	return info, nil
}

func (api *irisGenerationAPI) statUpload(ctx context.Context, orgID, sha string) (objectstore.Info, error) {
	reg, err := api.registry()
	if err != nil {
		return objectstore.Info{}, err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return objectstore.Info{}, err
	}
	return store.Stat(ctx, irisUploadKey(orgID, sha))
}

func (api *irisGenerationAPI) putBytes(ctx context.Context, key, contentType string, body []byte) error {
	reg, err := api.registry()
	if err != nil {
		return err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, _, err = reg.Put(ctx, objectstore.PutInput{
		Key:         key,
		Body:        bytes.NewReader(body),
		Size:        int64(len(body)),
		ContentType: contentType,
	})
	return err
}

func (api *irisGenerationAPI) getBytes(ctx context.Context, key string) ([]byte, string, error) {
	reg, err := api.registry()
	if err != nil {
		return nil, "", err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return nil, "", err
	}
	info, err := store.Stat(ctx, key)
	if err != nil {
		return nil, "", err
	}
	if info.Size > irisMaxUploadBytes {
		return nil, "", fmt.Errorf("asset is too large")
	}
	body, info, err := store.Get(ctx, key)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(io.LimitReader(body, irisMaxUploadBytes+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > irisMaxUploadBytes {
		return nil, "", fmt.Errorf("asset is too large")
	}
	return data, info.ContentType, nil
}

func (api *irisGenerationAPI) saveJob(ctx context.Context, job irisJobRecord) error {
	stored := irisStoredJob{irisJobRecord: job, OutputKeys: job.OutputKeys, UserID: job.UserID, OrgID: job.OrgID}
	return api.putJSON(ctx, irisJobKey(job.OrgID, job.ID), stored)
}

func (api *irisGenerationAPI) loadJob(ctx context.Context, orgID, jobID string) (irisJobRecord, error) {
	var stored irisStoredJob
	if err := api.getJSON(ctx, irisJobKey(orgID, jobID), &stored); err != nil {
		return irisJobRecord{}, err
	}
	job := stored.irisJobRecord
	job.OutputKeys = stored.OutputKeys
	job.UserID = stored.UserID
	job.OrgID = stored.OrgID
	if job.OrgID == "" {
		job.OrgID = orgID
	}
	return api.signJobAssets(ctx, job)
}

func (api *irisGenerationAPI) signJobAssets(ctx context.Context, job irisJobRecord) (irisJobRecord, error) {
	if len(job.OutputKeys) == 0 {
		return job, nil
	}
	signer, _, err := api.presigner(ctx)
	if err != nil {
		return job, err
	}
	expires := time.Now().UTC().Add(irisDownloadTTL).Format(time.RFC3339)
	job.ExpiresAt = &expires
	assets := make([]irisJobAsset, 0, len(job.Assets))
	for i, asset := range job.Assets {
		key := asset.Key
		if key == "" && i < len(job.OutputKeys) {
			key = job.OutputKeys[i]
		}
		signed, err := signer.PresignDownload(ctx, key, irisDownloadTTL)
		if err != nil {
			return job, err
		}
		asset.URL = signed.URL
		asset.Key = key
		assets = append(assets, asset)
	}
	job.Assets = assets
	return job, nil
}

func headerMap(headers http.Header) map[string]string {
	out := make(map[string]string, len(headers))
	for key, values := range headers {
		if len(values) > 0 {
			out[key] = values[0]
		}
	}
	return out
}

func (api *irisGenerationAPI) requestCancel(ctx context.Context, userID, jobID string) error {
	return api.putJSON(ctx, irisCancelKey(userID, jobID), map[string]string{"status": "canceled"})
}

func (api *irisGenerationAPI) cancelRequested(ctx context.Context, userID, jobID string) bool {
	var stored map[string]string
	return api.getJSON(ctx, irisCancelKey(userID, jobID), &stored) == nil
}

func (api *irisGenerationAPI) acquireRunLock(ctx context.Context, jobID string) bool {
	until := api.clock().Add(irisProviderTimeout + time.Minute).Format(time.RFC3339)
	err := api.putJSONIfAbsent(ctx, irisRunLockKey(jobID), map[string]string{"until": until})
	if err == nil {
		return true
	}
	if !errors.Is(err, objectstore.ErrAlreadyExists) {
		return false
	}
	var lock struct {
		Until string `json:"until"`
	}
	if err := api.getJSON(ctx, irisRunLockKey(jobID), &lock); err != nil {
		return false
	}
	expires, err := time.Parse(time.RFC3339, lock.Until)
	if err != nil || !expires.After(api.clock()) {
		_ = api.deleteObject(ctx, irisRunLockKey(jobID))
		return api.putJSONIfAbsent(ctx, irisRunLockKey(jobID), map[string]string{"until": until}) == nil
	}
	return false
}

const irisPendingIndexAttempts = 32

func (api *irisGenerationAPI) enqueuePending(ctx context.Context, job irisJobRecord) error {
	item := irisPendingJob{OrgID: job.OrgID, UserID: job.UserID, JobID: job.ID}
	if err := api.putJSON(ctx, irisPendingKey(job.ID), item); err != nil {
		return err
	}
	return api.mutatePendingIndex(ctx, func(index *irisPendingIndex) bool {
		for _, existing := range index.Jobs {
			if existing.JobID == job.ID {
				return false
			}
		}
		index.Jobs = append(index.Jobs, item)
		return true
	})
}

func (api *irisGenerationAPI) dequeuePending(ctx context.Context, jobID string) error {
	indexErr := api.mutatePendingIndex(ctx, func(index *irisPendingIndex) bool {
		kept := make([]irisPendingJob, 0, len(index.Jobs))
		changed := false
		for _, existing := range index.Jobs {
			if existing.JobID == jobID {
				changed = true
				continue
			}
			kept = append(kept, existing)
		}
		index.Jobs = kept
		return changed
	})
	delErr := api.deleteObject(ctx, irisPendingKey(jobID))
	if indexErr != nil {
		return indexErr
	}
	return delErr
}

func (api *irisGenerationAPI) mutatePendingIndex(ctx context.Context, mutate func(*irisPendingIndex) bool) error {
	api.queueMu.Lock()
	defer api.queueMu.Unlock()
	for range irisPendingIndexAttempts {
		if err := ctx.Err(); err != nil {
			return err
		}
		index, info, err := api.loadPendingIndex(ctx)
		if err != nil {
			return err
		}
		if !mutate(&index) {
			return nil
		}
		put := objectstore.PutInput{Key: irisPendingIndexKey()}
		if info.ETag == "" {
			put.IfAbsent = true
		} else {
			put.IfMatch = info.ETag
		}
		err = api.writeJSON(ctx, put, index)
		if err == nil {
			return nil
		}
		if !errors.Is(err, objectstore.ErrAlreadyExists) {
			return err
		}
	}
	return fmt.Errorf("pending-index update conflicted")
}

func (api *irisGenerationAPI) listPending(ctx context.Context) ([]irisPendingJob, error) {
	byID := map[string]irisPendingJob{}
	index, _, err := api.loadPendingIndex(ctx)
	if err != nil {
		return nil, err
	}
	for _, job := range index.Jobs {
		if job.JobID != "" {
			byID[job.JobID] = job
		}
	}
	objects, err := api.listPendingObjects(ctx)
	if err != nil {
		if len(byID) == 0 {
			return nil, err
		}
	} else {
		for _, job := range objects {
			if job.JobID != "" {
				byID[job.JobID] = job
			}
		}
	}
	out := make([]irisPendingJob, 0, len(byID))
	for _, job := range byID {
		out = append(out, job)
	}
	return out, nil
}

func (api *irisGenerationAPI) listPendingObjects(ctx context.Context) ([]irisPendingJob, error) {
	reg, err := api.registry()
	if err != nil {
		return nil, err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return nil, err
	}
	keys, err := store.List(ctx, "iris/generation/pending/")
	if err != nil {
		return nil, err
	}
	jobs := make([]irisPendingJob, 0, len(keys))
	for _, key := range keys {
		if !strings.HasSuffix(key, ".json") {
			continue
		}
		var item irisPendingJob
		if err := api.getJSON(ctx, key, &item); err != nil {
			continue
		}
		if item.JobID != "" {
			jobs = append(jobs, item)
		}
	}
	return jobs, nil
}

func (api *irisGenerationAPI) loadPendingIndex(ctx context.Context) (irisPendingIndex, objectstore.Info, error) {
	var index irisPendingIndex
	info, err := api.getJSONInfo(ctx, irisPendingIndexKey(), &index)
	if err == nil {
		return index, info, nil
	}
	if errors.Is(err, objectstore.ErrNotFound) {
		return irisPendingIndex{}, objectstore.Info{}, nil
	}
	return irisPendingIndex{}, objectstore.Info{}, err
}
