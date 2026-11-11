package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"
)

const (
	knowledgeMemoryFeatureFlag = "workspace-knowledge"
	knowledgeMemoryBodyLimit   = 1 << 20
	knowledgeMemoryTimeout     = 30 * time.Second
)

// knowledgeMemoryAPI is the shared authenticated handler wrapper for the
// guideline document, assignment, check and retrieve routes. The typed
// workspace and project notes it used to serve are retired; every guideline
// is a guideline_documents record now.
type knowledgeMemoryAPI struct {
	workspace       *workspaceAPI
	guidelineIngest guidelineIngestPublisher
}

// knowledgeMemoryScope carries the authorized organization and optional
// project for guideline routes.
type knowledgeMemoryScope struct {
	organizationID string
	projectID      string
}

type knowledgeMemoryError struct {
	status        int
	code, message string
	details       any
}

func (e *knowledgeMemoryError) Error() string { return e.code }

func knowledgeMemoryFailure(status int, code, message string) error {
	return &knowledgeMemoryError{status: status, code: code, message: message}
}

func knowledgeMemoryFailureDetails(status int, code, message string, details any) error {
	return &knowledgeMemoryError{status: status, code: code, message: message, details: details}
}

type knowledgeMemoryRouteHandler func(http.ResponseWriter, *http.Request, workspaceActor) (int, any, error)

func (api *knowledgeMemoryAPI) handle(mutation bool, fn knowledgeMemoryRouteHandler) http.Handler {
	return api.handleWith(mutation, knowledgeMemoryBodyLimit, knowledgeMemoryTimeout, fn)
}

func (api *knowledgeMemoryAPI) handleWith(mutation bool, bodyLimit int64, timeout time.Duration, fn knowledgeMemoryRouteHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if mutation && denyBrowserMutation(r) {
			writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.workspace == nil || api.workspace.pool == nil {
			writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(503, "service_unavailable", "Knowledge memory service unavailable"))
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		r = r.WithContext(ctx)
		if mutation {
			r.Body = http.MaxBytesReader(w, r.Body, bodyLimit)
		}
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.workspace.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeKnowledgeMemoryError(w, r, mapOrganizationAccessError(err, knowledgeMemoryFailure))
			return
		}
		if err := api.workspace.requireFlag(ctx, actor, knowledgeMemoryFeatureFlag, "Workspace knowledge is not enabled for this organization"); err != nil {
			var failure *workspaceError
			if errors.As(err, &failure) {
				writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(failure.status, failure.code, failure.message))
			} else {
				writeKnowledgeMemoryError(w, r, err)
			}
			return
		}

		status, value, err := fn(w, r, actor)
		if err != nil {
			writeKnowledgeMemoryError(w, r, err)
			return
		}
		if download, ok := value.(interchangeDownload); ok {
			writeInterchangeDownload(w, status, download)
			return
		}
		writeKnowledgeMemoryJSON(w, status, value)
	})
}

func writeKnowledgeMemoryJSON(w http.ResponseWriter, status int, value any) {
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("knowledge_memory_response_write_failed")
	}
}

func writeKnowledgeMemoryError(w http.ResponseWriter, r *http.Request, err error) {
	var failure *knowledgeMemoryError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "knowledge_memory_request_failed", "handle", err)
		failure = &knowledgeMemoryError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "knowledge_memory_request_failed", "handle", err, "status", failure.status, "code", failure.code)
	}
	payload := map[string]any{"error": failure.code, "message": failure.message}
	if failure.details != nil {
		payload["details"] = failure.details
	}
	writeKnowledgeMemoryJSON(w, failure.status, payload)
}

func canUpdateKnowledgeMemory(role string) bool {
	return role == "admin" || role == "localization_manager"
}

func stringPointer(value string) *string { return &value }

func javascriptTrim(value string) string {
	return strings.TrimFunc(value, func(r rune) bool { return unicode.IsSpace(r) || r == '\uFEFF' })
}

func decodeSingleJSON(reader io.Reader, dest any) error {
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(dest); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("multiple JSON values")
	}
	return nil
}

func formatKnowledgeMemoryTime(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}

func formatKnowledgeMemoryCursorTime(value time.Time) string {
	// Microsecond precision matches PostgreSQL timestamptz so page cursors
	// built from these strings do not skip same-millisecond rows.
	return value.UTC().Format("2006-01-02T15:04:05.000000Z")
}

func (api *knowledgeMemoryAPI) projectScope(ctx context.Context, actor workspaceActor, rawProjectID string) (knowledgeMemoryScope, error) {
	projectID := strings.TrimSpace(rawProjectID)
	if projectID == "" || len(projectID) > 256 {
		return knowledgeMemoryScope{}, knowledgeMemoryFailure(404, "project_not_found", "Project not found")
	}
	var exists bool
	err := api.workspace.pool.QueryRow(ctx, `
		select exists (
			select 1 from projects p
			where p.id = $1 and p.organization_id = $2
				and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		)`, projectID, actor.organizationID, actor.role == "admin" || actor.role == "localization_manager", actor.userID).Scan(&exists)
	if err != nil {
		return knowledgeMemoryScope{}, err
	}
	if !exists {
		return knowledgeMemoryScope{}, knowledgeMemoryFailure(404, "project_not_found", "Project not found")
	}
	return knowledgeMemoryScope{organizationID: actor.organizationID, projectID: projectID}, nil
}
