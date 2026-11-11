package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const (
	automationBodyLimit       = 1 << 20
	automationRequestTimeout  = 30 * time.Second
	automationListDefault     = 50
	automationListMax         = 100
	automationNameMaxChars    = 120
	automationInstructionsMax = 20_000
	automationSkillIDMax      = 64
	automationSkillMaxCount   = 64
	automationRecentRunLimit  = 10
	automationDefaultModel    = "openai/gpt-6-luna"
	automationTimeLayout      = "2006-01-02T15:04:05.000Z"
)

var (
	emptyJSONObject = json.RawMessage(`{}`)
	emptyJSONArray  = json.RawMessage(`[]`)
)

type automationAPI struct {
	pool        dictionaryPool
	membership  organizationMembershipLookup
	activityLog activityLogPublisher
}

type automationActor struct {
	userID, organizationID, role, workosUserID string
}

func (a automationActor) canManage() bool {
	return hasOrganizationCapability(a.role, "integrations:write")
}

type automationError struct {
	status        int
	code, message string
	details       map[string]any
}

func (e *automationError) Error() string { return e.code }

func automationFailure(status int, code, message string) error {
	return &automationError{status: status, code: code, message: message}
}

func automationFailureDetails(status int, code, message string, details map[string]any) error {
	return &automationError{status: status, code: code, message: message, details: details}
}

func automationJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "automation_response_write_failed")
	}
}

func writeAutomationError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *automationError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "automation_request_failed", phase, err)
		failure = &automationError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "automation_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	body := map[string]any{"error": failure.code, "message": failure.message}
	if len(failure.details) > 0 {
		body["details"] = failure.details
	}
	automationJSON(r.Context(), w, failure.status, body)
}

func formatAutomationTime(t time.Time) string {
	return t.UTC().Format(automationTimeLayout)
}

func formatAutomationTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	formatted := formatAutomationTime(*t)
	return &formatted
}

func (api *automationAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	automations := orgRoutePrefix + "/automations"
	visual := orgRoutePrefix + "/visual-workflows"
	route := func(pattern string, fn func(*http.Request, automationActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+automations, bindActor(api, (*automationAPI).listWorkspaceAutomations))
	route("POST "+automations, bindActor(api, (*automationAPI).createWorkspaceAutomation))
	route("GET "+automations+"/{automationId}", bindActor(api, (*automationAPI).getWorkspaceAutomation))
	route("PATCH "+automations+"/{automationId}", bindActor(api, (*automationAPI).patchWorkspaceAutomation))
	route("DELETE "+automations+"/{automationId}", bindActor(api, (*automationAPI).deleteWorkspaceAutomation))
	route("GET "+visual, bindActor(api, (*automationAPI).listVisualWorkflows))
	route("POST "+visual, bindActor(api, (*automationAPI).createVisualWorkflow))
	route("GET "+visual+"/{visualWorkflowId}", bindActor(api, (*automationAPI).getVisualWorkflow))
	route("PATCH "+visual+"/{visualWorkflowId}", bindActor(api, (*automationAPI).patchVisualWorkflow))
	route("DELETE "+visual+"/{visualWorkflowId}", bindActor(api, (*automationAPI).deleteVisualWorkflow))
}

func (api *automationAPI) handle(fn func(*http.Request, automationActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeAutomationError(w, r, "origin_guard", automationFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeAutomationError(w, r, "availability", automationFailure(503, "automations_unavailable", "Automations service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), automationRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeAutomationError(w, r, "auth", automationFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeAutomationError(w, r, "resolve_actor", err)
			return
		}
		if !actor.canManage() {
			writeAutomationError(w, r, "authorize", automationFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		switch r.Method {
		case http.MethodPost, http.MethodPatch, http.MethodPut:
			r.Body = http.MaxBytesReader(w, r.Body, automationBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeAutomationError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		automationJSON(ctx, w, status, value)
	})
}

func (api *automationAPI) actor(ctx context.Context, claims AuthClaims, slug string) (automationActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return automationActor{}, mapOrganizationAccessError(err, automationFailure)
	}
	return automationActor{
		userID:         resolved.userID,
		organizationID: resolved.organizationID,
		role:           resolved.role,
		workosUserID:   claims.UserID,
	}, nil
}

func (api *automationAPI) publishActivity(ctx context.Context, input activityLogEventInput) {
	if api.activityLog == nil {
		slog.WarnContext(ctx, "automation_activity_log_publish_skipped",
			"reason", "publisher_disabled",
			"environment_variable", activityLogQueueURLEnv,
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
		)
		return
	}
	publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), activityLogPublishTimeout)
	defer cancel()
	if err := api.activityLog.Publish(publishCtx, input); err != nil {
		slog.ErrorContext(ctx, "automation_activity_log_publish_failed",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
	}
}

func automationIDParam(r *http.Request, name, code string) (string, error) {
	id := r.PathValue(name)
	if !apiKeyIDPattern.MatchString(id) {
		return "", automationFailure(http.StatusNotFound, code, "Not found")
	}
	return id, nil
}

func readJSONObject(r *http.Request) (map[string]json.RawMessage, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return nil, automationFailure(http.StatusRequestEntityTooLarge, "payload_too_large", "Request payload is too large")
		}
		return nil, automationFailure(http.StatusBadRequest, "invalid_payload", "Request payload is invalid")
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil {
		return nil, automationFailure(http.StatusBadRequest, "invalid_payload", "Request payload is invalid")
	}
	if decoder.More() {
		return nil, automationFailure(http.StatusBadRequest, "invalid_payload", "Request payload is invalid")
	}
	return fields, nil
}

func rejectUnknownJSONKeys(fields map[string]json.RawMessage, allowed map[string]struct{}, code, message string) error {
	for key := range fields {
		if _, ok := allowed[key]; !ok {
			return automationFailure(http.StatusBadRequest, code, message)
		}
	}
	return nil
}

func jsonRawObject(raw []byte) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return emptyJSONObject
	}
	return json.RawMessage(bytes.Clone(trimmed))
}

func jsonRawArray(raw []byte) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return emptyJSONArray
	}
	return json.RawMessage(bytes.Clone(trimmed))
}

func decodeJSONString(raw json.RawMessage) (string, bool) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false
	}
	return value, true
}

func requireJSONObjectField(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return false
	}
	var obj map[string]json.RawMessage
	return json.Unmarshal(trimmed, &obj) == nil
}

func parseAutomationListQuery(r *http.Request, statuses map[string]struct{}) (status, projectID string, limit, offset int, err error) {
	query := r.URL.Query()
	limit = automationListDefault
	if raw, ok := query["limit"]; ok {
		if len(raw) != 1 {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		parsed, parseErr := parseBoundedInt(raw[0], 1, automationListMax)
		if parseErr != nil {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		limit = parsed
	}
	if raw, ok := query["offset"]; ok {
		if len(raw) != 1 {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		parsed, parseErr := parseBoundedInt(raw[0], 0, 1_000_000)
		if parseErr != nil {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		offset = parsed
	}
	if raw, ok := query["status"]; ok {
		if len(raw) != 1 {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		if _, allowed := statuses[raw[0]]; !allowed {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		status = raw[0]
	}
	if raw, ok := query["projectId"]; ok {
		if len(raw) != 1 {
			return "", "", 0, 0, automationFailure(http.StatusBadRequest, "invalid_query_params", "Query parameters are invalid.")
		}
		projectID = strings.TrimSpace(raw[0])
	}
	return status, projectID, limit, offset, nil
}

func parseBoundedInt(raw string, min, max int) (int, error) {
	value, err := strconvAtoi(raw)
	if err != nil || value < min || value > max {
		return 0, err
	}
	return value, nil
}

func strconvAtoi(raw string) (int, error) {
	if raw == "" {
		return 0, errors.New("empty")
	}
	n := 0
	for _, r := range raw {
		if r < '0' || r > '9' {
			return 0, errors.New("invalid")
		}
		n = n*10 + int(r-'0')
		if n > 1_000_000 {
			return 0, errors.New("overflow")
		}
	}
	return n, nil
}

func formatAutomationAuthorName(firstName, lastName, email *string) *string {
	parts := make([]string, 0, 2)
	if firstName != nil && strings.TrimSpace(*firstName) != "" {
		parts = append(parts, strings.TrimSpace(*firstName))
	}
	if lastName != nil && strings.TrimSpace(*lastName) != "" {
		parts = append(parts, strings.TrimSpace(*lastName))
	}
	if name := strings.TrimSpace(strings.Join(parts, " ")); name != "" {
		return &name
	}
	if email != nil {
		trimmed := strings.TrimSpace(*email)
		if trimmed != "" {
			return &trimmed
		}
	}
	return nil
}
