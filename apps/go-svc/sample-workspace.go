package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	sampleWorkspaceRequestTimeout   = 60 * time.Second
	sampleWorkspaceInternalMessage  = "An unexpected error occurred"
	sampleWorkspaceManageCapability = "workspace:update"
)

type sampleWorkspaceAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	objects    *objectstore.Registry
}

type sampleWorkspaceError struct {
	status        int
	code, message string
}

func (e *sampleWorkspaceError) Error() string { return e.code }

func sampleWorkspaceFailure(status int, code, message string) error {
	return &sampleWorkspaceError{status: status, code: code, message: message}
}

func sampleWorkspaceForbidden() error {
	return sampleWorkspaceFailure(http.StatusForbidden, "forbidden", "Insufficient permissions")
}

func sampleWorkspaceExists() error {
	return sampleWorkspaceFailure(http.StatusConflict, "sample_workspace_exists", "Sample data is already loaded in this workspace.")
}

type sampleWorkspaceProject struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type sampleWorkspaceStatus struct {
	Loaded   bool                     `json:"loaded"`
	Projects []sampleWorkspaceProject `json:"projects"`
}

type sampleWorkspaceSeedResult struct {
	Projects        []sampleWorkspaceProject `json:"projects"`
	GlossaryCount   int                      `json:"glossaryCount"`
	MemoryCount     int                      `json:"memoryCount"`
	DictionaryCount int                      `json:"dictionaryCount"`
	FileCount       int                      `json:"fileCount"`
	StringCount     int                      `json:"stringCount"`
}

func (api *sampleWorkspaceAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	path := orgRoutePrefix + "/sample-workspace"
	route := func(pattern string, fn func(*http.Request, organizationActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+path, api.getStatus)
	route("POST "+path, api.seed)
	route("DELETE "+path, api.remove)
}

func (api *sampleWorkspaceAPI) handle(fn func(*http.Request, organizationActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeSampleWorkspaceError(w, r, "origin_guard", sampleWorkspaceFailure(http.StatusForbidden, "forbidden", "Cross-origin request rejected"))
			return
		}
		if api.pool == nil {
			writeSampleWorkspaceError(w, r, "availability", sampleWorkspaceFailure(http.StatusServiceUnavailable, "sample_workspace_unavailable", "Sample data is unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), sampleWorkspaceRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeSampleWorkspaceError(w, r, "auth", sampleWorkspaceFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
			return
		}
		actor, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeSampleWorkspaceError(w, r, "resolve_actor", mapOrganizationAccessError(err, sampleWorkspaceFailure))
			return
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeSampleWorkspaceError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		writeSampleWorkspaceJSON(r.Context(), w, status, value)
	})
}

func writeSampleWorkspaceJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		slog.WarnContext(ctx, "sample_workspace_response_write_failed")
	}
}

func writeSampleWorkspaceError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *sampleWorkspaceError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "sample_workspace_request_failed", phase, err)
		failure = &sampleWorkspaceError{status: http.StatusInternalServerError, code: "internal_error", message: sampleWorkspaceInternalMessage}
	} else {
		logRequestFailure(r, "sample_workspace_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	writeSampleWorkspaceJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *sampleWorkspaceAPI) requireManage(actor organizationActor) error {
	if !authz.HasCapability(actor.role, sampleWorkspaceManageCapability) {
		return sampleWorkspaceForbidden()
	}
	return nil
}

func (api *sampleWorkspaceAPI) getStatus(r *http.Request, actor organizationActor) (any, int, error) {
	if err := api.requireManage(actor); err != nil {
		return nil, 0, err
	}
	status, err := api.status(r.Context(), actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"sampleWorkspace": status}, http.StatusOK, nil
}

func (api *sampleWorkspaceAPI) seed(r *http.Request, actor organizationActor) (any, int, error) {
	if err := api.requireManage(actor); err != nil {
		return nil, 0, err
	}
	result, err := api.seedSampleWorkspace(r.Context(), actor)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"sampleWorkspace": result}, http.StatusCreated, nil
}

func (api *sampleWorkspaceAPI) remove(r *http.Request, actor organizationActor) (any, int, error) {
	if err := api.requireManage(actor); err != nil {
		return nil, 0, err
	}
	if _, err := api.removeSampleWorkspace(r.Context(), actor.organizationID); err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}
