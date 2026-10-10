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
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/check"
)

const (
	guidelineCheckFeatureID = "guideline_checks"
	guidelineCheckBodyLimit = 256 << 10
	guidelineCheckTimeout   = 90 * time.Second
	defaultAIGatewayBaseURL = "https://ai-gateway.vercel.sh/v1"
)

type guidelineCheckMeter interface {
	Check(context.Context, autumn.CheckRequest) (autumn.CheckResponse, error)
	Track(context.Context, autumn.TrackRequest) error
}

type guidelineChecker interface {
	Check(context.Context, guidelines.Scope, check.Request) (check.Result, error)
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

// newGuidelineCheckModel returns nil when the check model is not configured.
func newGuidelineCheckModel() (check.Model, error) {
	model := strings.TrimSpace(os.Getenv("GUIDELINE_CHECK_MODEL"))
	apiKey := strings.TrimSpace(os.Getenv("AI_GATEWAY_API_KEY"))
	if model == "" || apiKey == "" {
		slog.Warn("guideline_check_disabled", "reason", "missing_model_configuration")
		return nil, nil
	}
	baseURL := strings.TrimSpace(os.Getenv("AI_GATEWAY_BASE_URL"))
	if baseURL == "" {
		baseURL = defaultAIGatewayBaseURL
	}
	return check.NewOpenAIModel(check.OpenAIConfig{BaseURL: baseURL, APIKey: apiKey, Model: model})
}

func (api *guidelineCheckAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/guidelines/check", api.knowledge.handleWith(true, guidelineCheckBodyLimit, guidelineCheckTimeout, api.check))
}

func invalidGuidelineCheck(field string) error {
	return knowledgeMemoryFailureDetails(400, "invalid_guideline_check", "Guideline check request is invalid", map[string]any{"field": field})
}

func (api *guidelineCheckAPI) check(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	return api.run(r, actor.organizationID, func(ctx context.Context, projectID string) (string, error) {
		project, err := api.knowledge.projectScope(ctx, actor, projectID)
		return project.projectID, err
	})
}

type internalGuidelineCheckPayload struct {
	OrganizationID string `json:"organizationId"`
	guidelineCheckPayload
}

// internalCheck serves trusted server callers such as MCP, which enforce
// feature flags and team project access before calling.
func (api *guidelineCheckAPI) internalCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
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
	pool := api.knowledge.workspace.pool
	status, value, err := api.evaluate(r.Context(), organizationID, payload.guidelineCheckPayload, func(ctx context.Context, rawProjectID string) (string, error) {
		projectID := strings.TrimSpace(rawProjectID)
		var exists bool
		if err := pool.QueryRow(ctx, `select exists (select 1 from projects where id = $1 and organization_id = $2)`, projectID, organizationID).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return "", knowledgeMemoryFailure(404, "project_not_found", "Project not found")
		}
		return projectID, nil
	})
	if err != nil {
		writeKnowledgeMemoryError(w, r, err)
		return
	}
	writeKnowledgeMemoryJSON(w, status, value)
}

func guidelineCheckDecodeFailure(err error) error {
	if isRequestBodyTooLarge(err) {
		return knowledgeMemoryFailure(413, "guideline_check_too_large", "Guideline check request is too large")
	}
	return invalidGuidelineCheck("body")
}

type guidelineProjectResolver func(ctx context.Context, projectID string) (string, error)

func (api *guidelineCheckAPI) run(r *http.Request, organizationID string, resolveProject guidelineProjectResolver) (int, any, error) {
	var payload guidelineCheckPayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		return 0, nil, guidelineCheckDecodeFailure(err)
	}
	return api.evaluate(r.Context(), organizationID, payload, resolveProject)
}

func (api *guidelineCheckAPI) evaluate(ctx context.Context, organizationID string, payload guidelineCheckPayload, resolveProject guidelineProjectResolver) (int, any, error) {
	if api.checker == nil {
		return 0, nil, knowledgeMemoryFailure(503, "guideline_check_unavailable", "Guideline checks are not configured")
	}
	request, err := check.Normalize(check.Request{Segments: payload.Segments, Checks: payload.Checks})
	if err != nil {
		return 0, nil, invalidGuidelineCheck("segments")
	}
	sourceLocale, err := guidelines.NormalizeLocale(payload.SourceLocale)
	if err != nil {
		return 0, nil, invalidGuidelineCheck("sourceLocale")
	}
	targetLocale, err := guidelines.NormalizeLocale(payload.TargetLocale)
	if err != nil {
		return 0, nil, invalidGuidelineCheck("targetLocale")
	}
	request.SourceLocale, request.TargetLocale = sourceLocale, targetLocale

	scope := guidelines.Scope{OrganizationID: organizationID, Locale: targetLocale}
	if payload.ProjectID != nil {
		projectID, err := resolveProject(ctx, *payload.ProjectID)
		if err != nil {
			return 0, nil, err
		}
		scope.ProjectID = projectID
	}

	units := float64(len(request.Segments))
	if api.meter != nil {
		allowance, err := api.meter.Check(ctx, autumn.CheckRequest{CustomerID: organizationID, FeatureID: guidelineCheckFeatureID, RequiredBalance: &units})
		if err != nil {
			return 0, nil, knowledgeMemoryFailure(503, "guideline_check_limit_check_failed", "Unable to verify guideline check usage")
		}
		if !allowance.Allowed {
			return 0, nil, knowledgeMemoryFailure(402, "guideline_check_limit_reached", "Guideline check limit reached")
		}
	}

	started := time.Now()
	result, err := api.checker.Check(ctx, scope, request)
	if errors.Is(err, check.ErrInvalidInput) {
		return 0, nil, invalidGuidelineCheck("segments")
	}
	if err != nil {
		slog.WarnContext(ctx, "guideline_check_failed", "organization_id", organizationID, "project_id", scope.ProjectID, "segments", len(request.Segments), "error", err)
		return 0, nil, knowledgeMemoryFailure(502, "guideline_check_failed", "Guideline check failed")
	}
	slog.InfoContext(ctx, "guideline_check_completed",
		"organization_id", organizationID, "project_id", scope.ProjectID, "segments", len(request.Segments),
		"findings", len(result.Findings), "search_available", result.SearchAvailable, "duration_ms", time.Since(started).Milliseconds())

	if api.meter != nil {
		trackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := api.meter.Track(trackCtx, autumn.TrackRequest{
			CustomerID: organizationID, FeatureID: guidelineCheckFeatureID, Value: units, IdempotencyKey: uuid.NewString(),
		}); err != nil {
			slog.WarnContext(ctx, "guideline_check_usage_track_failed", "organization_id", organizationID, "error", err)
		}
	}
	return http.StatusOK, result, nil
}
