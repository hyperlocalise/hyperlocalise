package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/aisdk"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/check"
)

const (
	guidelineCheckBodyLimit = 256 << 10
	guidelineCheckTimeout   = 90 * time.Second
	// WriteTimeout is 75s globally. These routes need longer so a check that
	// finishes near the work deadline can still track usage and write JSON.
	guidelineCheckWriteSlack             = 20 * time.Second
	defaultAIGatewayBaseURL              = "https://ai-gateway.vercel.sh/v1"
	defaultGuidelineCheckClassifierModel = "typesafe-ai/jev"
	// The reasoning model must support strict json_schema structured output.
	defaultGuidelineCheckModel = "openai/gpt-6-luna"
	guidelineExplainMinCredit  = 0.01
)

func setGuidelineCheckWriteDeadline(w http.ResponseWriter) {
	deadline := time.Now().Add(guidelineCheckTimeout + guidelineCheckWriteSlack)
	if err := http.NewResponseController(w).SetWriteDeadline(deadline); err != nil && !errors.Is(err, http.ErrNotSupported) {
		slog.Warn("guideline_check_write_deadline_failed", "error", err)
	}
}

type guidelineCheckMeter interface {
	Check(context.Context, autumn.CheckRequest) (autumn.CheckResponse, error)
	Track(context.Context, autumn.TrackRequest) error
	TrackTokens(context.Context, autumn.TrackTokensRequest) error
}

type guidelineChecker interface {
	CheckBeforeModel(context.Context, guidelines.Scope, check.Request, func(context.Context) error) (check.Result, error)
	ExplainBeforeModel(context.Context, guidelines.Scope, check.ExplainRequest, func(context.Context) error) (check.Result, error)
}

type guidelineCheckAPI struct {
	knowledge *knowledgeMemoryAPI
	checker   guidelineChecker
	// A nil meter skips billing, for local development without Autumn.
	meter guidelineCheckMeter
}

type guidelineCheckPayload struct {
	ProjectID    *string         `json:"projectId"`
	SourceLocale string          `json:"sourceLocale"`
	TargetLocale string          `json:"targetLocale"`
	Segments     []check.Segment `json:"segments"`
	Checks       []check.Field   `json:"checks"`
}

type guidelineExplainPayload struct {
	guidelineCheckPayload
	PassageIDs []string `json:"passageIds"`
}

// newGuidelineCheckClassifier returns nil when AI Gateway is not configured.
func newGuidelineCheckClassifier() (check.Classifier, error) {
	apiKey := strings.TrimSpace(os.Getenv("AI_GATEWAY_API_KEY"))
	if apiKey == "" {
		slog.Warn("guideline_check_disabled", "reason", "missing_ai_gateway_api_key")
		return nil, nil
	}
	opts := []aisdk.Option{aisdk.WithAPIKey(apiKey)}
	if baseURL := strings.TrimSpace(os.Getenv("AI_GATEWAY_EVALUATE_BASE_URL")); baseURL != "" {
		opts = append(opts, aisdk.WithBaseURL(baseURL))
	}
	client, err := aisdk.NewClient(opts...)
	if err != nil {
		return nil, err
	}
	model := strings.TrimSpace(os.Getenv("GUIDELINE_CHECK_CLASSIFIER_MODEL"))
	if model == "" {
		model = defaultGuidelineCheckClassifierModel
	}
	return check.NewEvaluateClassifier(client, model), nil
}

// newGuidelineCheckModel returns nil when AI Gateway is not configured.
func newGuidelineCheckModel() (check.Model, error) {
	apiKey := strings.TrimSpace(os.Getenv("AI_GATEWAY_API_KEY"))
	if apiKey == "" {
		return nil, nil
	}
	model := strings.TrimSpace(os.Getenv("GUIDELINE_CHECK_REASONING_MODEL"))
	if model == "" {
		model = strings.TrimSpace(os.Getenv("GUIDELINE_CHECK_MODEL"))
	}
	if model == "" {
		model = defaultGuidelineCheckModel
	}
	baseURL := strings.TrimSpace(os.Getenv("AI_GATEWAY_BASE_URL"))
	if baseURL == "" {
		baseURL = defaultAIGatewayBaseURL
	}
	return check.NewOpenAIModel(check.OpenAIConfig{BaseURL: baseURL, APIKey: apiKey, Model: model})
}

func (api *guidelineCheckAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/guidelines/check", api.knowledge.handleWith(true, guidelineCheckBodyLimit, guidelineCheckTimeout, api.check))
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/guidelines/explain", api.knowledge.handleWith(true, guidelineCheckBodyLimit, guidelineCheckTimeout, api.explain))
}

func invalidGuidelineCheck(field string) error {
	return knowledgeMemoryFailureDetails(400, "invalid_guideline_check", "Guideline check request is invalid", map[string]any{"field": field})
}

func (api *guidelineCheckAPI) check(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	setGuidelineCheckWriteDeadline(w)
	return api.run(r, actor.organizationID, func(ctx context.Context, projectID string) (string, error) {
		project, err := api.knowledge.projectScope(ctx, actor, projectID)
		return project.projectID, err
	}, false)
}

func (api *guidelineCheckAPI) explain(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	setGuidelineCheckWriteDeadline(w)
	return api.runExplain(r, actor.organizationID, func(ctx context.Context, projectID string) (string, error) {
		project, err := api.knowledge.projectScope(ctx, actor, projectID)
		return project.projectID, err
	})
}

type internalGuidelineCheckPayload struct {
	OrganizationID string `json:"organizationId"`
	// AutoExplain is optional. Omitted or true explains flagged segments.
	// Project QA scans send false and explain a finding when someone asks.
	AutoExplain *bool `json:"autoExplain"`
	guidelineCheckPayload
}

type internalGuidelineExplainPayload struct {
	OrganizationID string `json:"organizationId"`
	guidelineExplainPayload
}

// internalCheck serves trusted server callers such as MCP and project QA scans,
// which enforce feature flags and team project access before calling. Flagged
// segments are explained with Luna unless the body sets autoExplain to false.
func (api *guidelineCheckAPI) internalCheck(w http.ResponseWriter, r *http.Request) {
	api.serveInternal(w, r)
}

func (api *guidelineCheckAPI) internalExplain(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	setGuidelineCheckWriteDeadline(w)
	if api.knowledge == nil || api.knowledge.workspace == nil || api.knowledge.workspace.pool == nil {
		writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(503, "service_unavailable", "Knowledge memory service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), guidelineCheckTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, guidelineCheckBodyLimit)
	var payload internalGuidelineExplainPayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		writeKnowledgeMemoryError(w, r, guidelineCheckDecodeFailure(err))
		return
	}
	organizationID := strings.TrimSpace(payload.OrganizationID)
	if _, err := uuid.Parse(organizationID); err != nil {
		writeKnowledgeMemoryError(w, r, invalidGuidelineCheck("organizationId"))
		return
	}
	status, value, err := api.explainPayload(r.Context(), organizationID, payload.guidelineExplainPayload, api.internalProjectResolver(organizationID))
	if err != nil {
		writeKnowledgeMemoryError(w, r, err)
		return
	}
	writeKnowledgeMemoryJSON(w, status, value)
}

func (api *guidelineCheckAPI) serveInternal(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	setGuidelineCheckWriteDeadline(w)
	if api.knowledge == nil || api.knowledge.workspace == nil || api.knowledge.workspace.pool == nil {
		writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(503, "service_unavailable", "Knowledge memory service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), guidelineCheckTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, guidelineCheckBodyLimit)
	var payload internalGuidelineCheckPayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		writeKnowledgeMemoryError(w, r, guidelineCheckDecodeFailure(err))
		return
	}
	organizationID := strings.TrimSpace(payload.OrganizationID)
	if _, err := uuid.Parse(organizationID); err != nil {
		writeKnowledgeMemoryError(w, r, invalidGuidelineCheck("organizationId"))
		return
	}
	autoExplain := payload.AutoExplain == nil || *payload.AutoExplain
	status, value, err := api.evaluate(r.Context(), organizationID, payload.guidelineCheckPayload, api.internalProjectResolver(organizationID), autoExplain)
	if err != nil {
		writeKnowledgeMemoryError(w, r, err)
		return
	}
	writeKnowledgeMemoryJSON(w, status, value)
}

func (api *guidelineCheckAPI) internalProjectResolver(organizationID string) guidelineProjectResolver {
	pool := api.knowledge.workspace.pool
	return func(ctx context.Context, rawProjectID string) (string, error) {
		projectID := strings.TrimSpace(rawProjectID)
		var exists bool
		if err := pool.QueryRow(ctx, `select exists (select 1 from projects where id = $1 and organization_id = $2)`, projectID, organizationID).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return "", knowledgeMemoryFailure(404, "project_not_found", "Project not found")
		}
		return projectID, nil
	}
}

func guidelineCheckDecodeFailure(err error) error {
	if isRequestBodyTooLarge(err) {
		return knowledgeMemoryFailure(413, "guideline_check_too_large", "Guideline check request is too large")
	}
	return invalidGuidelineCheck("body")
}

type guidelineProjectResolver func(ctx context.Context, projectID string) (string, error)

func (api *guidelineCheckAPI) run(r *http.Request, organizationID string, resolveProject guidelineProjectResolver, autoExplain bool) (int, any, error) {
	var payload guidelineCheckPayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		return 0, nil, guidelineCheckDecodeFailure(err)
	}
	return api.evaluate(r.Context(), organizationID, payload, resolveProject, autoExplain)
}

func (api *guidelineCheckAPI) runExplain(r *http.Request, organizationID string, resolveProject guidelineProjectResolver) (int, any, error) {
	var payload guidelineExplainPayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		return 0, nil, guidelineCheckDecodeFailure(err)
	}
	return api.explainPayload(r.Context(), organizationID, payload, resolveProject)
}

func (api *guidelineCheckAPI) evaluate(ctx context.Context, organizationID string, payload guidelineCheckPayload, resolveProject guidelineProjectResolver, autoExplain bool) (int, any, error) {
	if api.checker == nil {
		return 0, nil, knowledgeMemoryFailure(503, "guideline_check_unavailable", "Guideline checks are not configured")
	}
	request, scope, err := api.normalizedRequest(ctx, organizationID, payload, resolveProject)
	if err != nil {
		return 0, nil, err
	}

	units := float64(len(request.Segments))
	started := time.Now()
	result, err := api.checker.CheckBeforeModel(ctx, scope, request, func(ctx context.Context) error {
		if api.meter == nil {
			return nil
		}
		allowance, err := api.meter.Check(ctx, autumn.CheckRequest{CustomerID: organizationID, FeatureID: autumn.GuidelineChecks, RequiredBalance: &units})
		if err != nil {
			return knowledgeMemoryFailure(503, "guideline_check_limit_check_failed", "Unable to verify guideline check usage")
		}
		if !allowance.Allowed {
			return knowledgeMemoryFailure(402, "guideline_check_limit_reached", "Guideline check limit reached")
		}
		return nil
	})
	if status, value, failErr := api.checkFailure(ctx, organizationID, scope.ProjectID, len(request.Segments), err); failErr != nil {
		return status, value, failErr
	}
	slog.InfoContext(ctx, "guideline_check_completed",
		"organization_id", organizationID, "project_id", scope.ProjectID, "segments", len(request.Segments),
		"findings", len(result.Findings), "search_available", result.SearchAvailable, "model_invoked", result.ModelInvoked,
		"cache_hit", result.Cached, "duration_ms", time.Since(started).Milliseconds())

	if result.ModelInvoked && api.meter != nil {
		trackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := api.meter.Track(trackCtx, autumn.TrackRequest{
			CustomerID: organizationID, FeatureID: autumn.GuidelineChecks, Value: units, IdempotencyKey: uuid.NewString(),
		}); err != nil {
			slog.WarnContext(ctx, "guideline_check_usage_track_failed", "organization_id", organizationID, "error", err)
		}
	}

	if autoExplain {
		result = api.maybeExplain(ctx, organizationID, scope, request, result)
	}
	return http.StatusOK, result, nil
}

func (api *guidelineCheckAPI) explainPayload(ctx context.Context, organizationID string, payload guidelineExplainPayload, resolveProject guidelineProjectResolver) (int, any, error) {
	if api.checker == nil {
		return 0, nil, knowledgeMemoryFailure(503, "guideline_check_unavailable", "Guideline checks are not configured")
	}
	request, scope, err := api.normalizedRequest(ctx, organizationID, payload.guidelineCheckPayload, resolveProject)
	if err != nil {
		return 0, nil, err
	}
	started := time.Now()
	result, err := api.runExplainModel(ctx, organizationID, scope, check.ExplainRequest{Request: request, PassageIDs: payload.PassageIDs})
	if status, value, failErr := api.checkFailure(ctx, organizationID, scope.ProjectID, len(request.Segments), err); failErr != nil {
		return status, value, failErr
	}
	slog.InfoContext(ctx, "guideline_explain_completed",
		"organization_id", organizationID, "project_id", scope.ProjectID, "segments", len(request.Segments),
		"findings", len(result.Findings), "model_invoked", result.ModelInvoked,
		"cache_hit", result.Cached, "duration_ms", time.Since(started).Milliseconds())
	return http.StatusOK, result, nil
}

func (api *guidelineCheckAPI) normalizedRequest(ctx context.Context, organizationID string, payload guidelineCheckPayload, resolveProject guidelineProjectResolver) (check.Request, guidelines.Scope, error) {
	request, err := check.Normalize(check.Request{Segments: payload.Segments, Checks: payload.Checks})
	if err != nil {
		return check.Request{}, guidelines.Scope{}, invalidGuidelineCheck("segments")
	}
	sourceLocale, err := guidelines.NormalizeLocale(payload.SourceLocale)
	if err != nil {
		return check.Request{}, guidelines.Scope{}, invalidGuidelineCheck("sourceLocale")
	}
	targetLocale, err := guidelines.NormalizeLocale(payload.TargetLocale)
	if err != nil {
		return check.Request{}, guidelines.Scope{}, invalidGuidelineCheck("targetLocale")
	}
	request.SourceLocale, request.TargetLocale = sourceLocale, targetLocale

	scope := guidelines.Scope{OrganizationID: organizationID, Locale: targetLocale}
	if payload.ProjectID != nil {
		projectID, err := resolveProject(ctx, *payload.ProjectID)
		if err != nil {
			return check.Request{}, guidelines.Scope{}, err
		}
		scope.ProjectID = projectID
	}
	return request, scope, nil
}

func (api *guidelineCheckAPI) maybeExplain(ctx context.Context, organizationID string, scope guidelines.Scope, request check.Request, result check.Result) check.Result {
	explainReq, ok := explainRequestFromFindings(request, result.Findings)
	if !ok {
		return result
	}
	explained, err := api.runExplainModel(ctx, organizationID, scope, explainReq)
	if err != nil {
		slog.WarnContext(ctx, "guideline_check_auto_explain_failed", "organization_id", organizationID, "error", err)
		return result
	}
	if len(explained.Findings) == 0 {
		return result
	}
	return explained
}

func (api *guidelineCheckAPI) runExplainModel(ctx context.Context, organizationID string, scope guidelines.Scope, req check.ExplainRequest) (check.Result, error) {
	result, err := api.checker.ExplainBeforeModel(ctx, scope, req, func(ctx context.Context) error {
		if api.meter == nil {
			return nil
		}
		required := guidelineExplainMinCredit
		allowance, err := api.meter.Check(ctx, autumn.CheckRequest{CustomerID: organizationID, FeatureID: autumn.AITokens, RequiredBalance: &required})
		if err != nil {
			return knowledgeMemoryFailure(503, "guideline_explain_limit_check_failed", "Unable to verify AI credit")
		}
		if !allowance.Allowed {
			return knowledgeMemoryFailure(402, "ai_credit_exhausted", "Your workspace has used all of its AI credit. Change your plan on the Billing page, or wait for your AI credit to renew.")
		}
		return nil
	})
	if err != nil {
		return check.Result{}, err
	}
	if result.ModelInvoked && api.meter != nil && (result.InputTokens > 0 || result.OutputTokens > 0) {
		trackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := api.meter.TrackTokens(trackCtx, autumn.TrackTokensRequest{
			CustomerID:   organizationID,
			FeatureID:    autumn.AITokens,
			ModelID:      result.Model,
			InputTokens:  result.InputTokens,
			OutputTokens: result.OutputTokens,
			Properties:   map[string]any{"feature": "guideline_explain"},
		}); err != nil {
			slog.WarnContext(ctx, "guideline_explain_usage_track_failed", "organization_id", organizationID, "error", err)
		}
	}
	return result, nil
}

func (api *guidelineCheckAPI) checkFailure(ctx context.Context, organizationID, projectID string, segments int, err error) (int, any, error) {
	if err == nil {
		return 0, nil, nil
	}
	if errors.Is(err, check.ErrInvalidInput) {
		return 0, nil, invalidGuidelineCheck("segments")
	}
	if errors.Is(err, check.ErrMandatoryPassagesOverBudget) {
		return 0, nil, knowledgeMemoryFailure(
			400,
			"guideline_check_mandatory_too_large",
			"Mandatory guidelines exceed the size limit for a single check. Shorten always-applied notes or uploaded documents.",
		)
	}
	var memoryErr *knowledgeMemoryError
	if errors.As(err, &memoryErr) {
		return 0, nil, memoryErr
	}
	slog.WarnContext(ctx, "guideline_check_failed", "organization_id", organizationID, "project_id", projectID, "segments", segments, "error", err)
	return 0, nil, knowledgeMemoryFailure(502, "guideline_check_failed", "Guideline check failed")
}

func explainRequestFromFindings(request check.Request, findings []check.Finding) (check.ExplainRequest, bool) {
	wantedSegments := map[string]bool{}
	passageIDs := make([]string, 0)
	seenPassage := map[string]bool{}
	for _, finding := range findings {
		if !finding.ReasoningAvailable || finding.SegmentID == "" {
			continue
		}
		wantedSegments[finding.SegmentID] = true
		if finding.PassageID == "" || seenPassage[finding.PassageID] {
			continue
		}
		seenPassage[finding.PassageID] = true
		passageIDs = append(passageIDs, finding.PassageID)
	}
	if len(wantedSegments) == 0 {
		return check.ExplainRequest{}, false
	}
	segments := make([]check.Segment, 0, len(wantedSegments))
	for _, segment := range request.Segments {
		if wantedSegments[segment.ID] {
			segments = append(segments, segment)
		}
	}
	if len(segments) == 0 {
		return check.ExplainRequest{}, false
	}
	explained := request
	explained.Segments = segments
	return check.ExplainRequest{Request: explained, PassageIDs: passageIDs}, true
}
