package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

const (
	apiKeyBodyLimit      = 16 << 10
	apiKeyRequestTimeout = 30 * time.Second
	apiKeyNameMaxLength  = 128
)

type apiKeyAPI struct {
	pool        dictionaryPool
	membership  organizationMembershipLookup
	activityLog activityLogPublisher
	audit       patAuditor
}

type apiKeyError struct {
	status        int
	code, message string
	details       map[string]any
	cause         error
}

func (e *apiKeyError) Error() string { return e.code }

func (e *apiKeyError) Unwrap() error { return e.cause }

func apiKeyFailure(status int, code, message string) error {
	return &apiKeyError{status: status, code: code, message: message}
}

func apiKeyFailureDetails(status int, code, message string, details map[string]any) error {
	return &apiKeyError{status: status, code: code, message: message, details: details}
}

func apiKeyInternalFailure(code, message string, cause error) error {
	return &apiKeyError{status: http.StatusInternalServerError, code: code, message: message, cause: cause}
}

func apiKeyNotFound() error {
	return apiKeyFailure(http.StatusNotFound, "api_key_not_found", "API key not found")
}

func apiKeyJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "api_key_response_write_failed")
	}
}

func writeAPIKeyError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *apiKeyError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "api_key_request_failed", phase, err)
		failure = &apiKeyError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "api_key_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	body := map[string]any{"error": failure.code, "message": failure.message}
	if len(failure.details) > 0 {
		body["details"] = failure.details
	}
	apiKeyJSON(r.Context(), w, failure.status, body)
}

func (api *apiKeyAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/api-keys"
	route := func(pattern string, fn func(*http.Request, organizationActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+base, bindActor(api, (*apiKeyAPI).listAPIKeysHandler))
	route("POST "+base, bindActor(api, (*apiKeyAPI).createAPIKeyHandler))
	route("DELETE "+base+"/{apiKeyId}", bindActor(api, (*apiKeyAPI).revokeAPIKeyHandler))
}

func (api *apiKeyAPI) handle(fn func(*http.Request, organizationActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The create response carries the only copy of the plaintext token.
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeAPIKeyError(w, r, "origin_guard", apiKeyFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		if api.pool == nil {
			writeAPIKeyError(w, r, "availability", apiKeyFailure(503, "api_key_unavailable", "API key API is unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), apiKeyRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeAPIKeyError(w, r, "auth", apiKeyFailure(401, "unauthorized", "Unauthorized"))
			return
		}
		actor, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, r.PathValue("organizationSlug"))
		if err != nil {
			err = mapOrganizationAccessCode(err, func(status int, code string) error {
				return apiKeyFailure(status, code, organizationAccessMessage(code))
			})
			writeAPIKeyError(w, r, "resolve_actor", err)
			return
		}
		if r.Method == http.MethodPost {
			r.Body = http.MaxBytesReader(w, r.Body, apiKeyBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeAPIKeyError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		apiKeyJSON(r.Context(), w, status, value)
	})
}

// publishActivity is best-effort, like the Hono route: the token change has
// already committed, so a queue failure is logged and never fails the request.
func (api *apiKeyAPI) publishActivity(ctx context.Context, input activityLogEventInput) {
	if api.activityLog == nil {
		slog.WarnContext(ctx, "api_key_activity_log_publish_skipped",
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
		slog.ErrorContext(ctx, "api_key_activity_log_publish_failed",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
	}
}
