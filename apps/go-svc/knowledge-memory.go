package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
)

const (
	knowledgeMemoryFeatureFlag = "workspace-knowledge"
	knowledgeMemoryBodyLimit   = 1 << 20
	knowledgeMemoryMaxContent  = 50_000
	knowledgeMemoryMaxSummary  = 160
	knowledgeMemoryMaxPreview  = 4_000
	knowledgeMemorySmallLimit  = 2_000
)

type knowledgeMemoryAPI struct {
	workspace *workspaceAPI
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

type knowledgeMemoryRecord struct {
	RevisionID      *string `json:"revisionId"`
	Version         int     `json:"version"`
	Content         string  `json:"content"`
	Summary         *string `json:"summary"`
	UpdatedAt       *string `json:"updatedAt"`
	UpdatedByUserID *string `json:"updatedByUserId"`
	UpdatedByName   *string `json:"-"`
}

type knowledgeMemoryRevisionMetadata struct {
	RevisionID      string  `json:"revisionId"`
	Version         int     `json:"version"`
	Summary         string  `json:"summary"`
	CreatedAt       string  `json:"createdAt"`
	CreatedByUserID *string `json:"createdByUserId"`
	CreatedByName   *string `json:"createdByName"`
	IsCurrent       bool    `json:"isCurrent"`
}

type knowledgeMemoryUpdatePayload struct {
	Content string  `json:"content"`
	Summary *string `json:"summary"`
}

type knowledgeMemoryPreviewPayload struct {
	TargetLocale  *string           `json:"targetLocale"`
	TargetLocales []string          `json:"targetLocales"`
	SourceLocale  *string           `json:"sourceLocale"`
	SourceText    *string           `json:"sourceText"`
	Context       *string           `json:"context"`
	Key           *string           `json:"key"`
	Path          *string           `json:"path"`
	Metadata      map[string]string `json:"metadata"`
	MaxChars      *int              `json:"maxChars"`
}

func (api *knowledgeMemoryAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	workspacePath := orgRoutePrefix + "/knowledge-memory"
	projectPath := orgRoutePrefix + "/projects/{projectId}/knowledge-memory"

	registerAuthenticated(mux, verifier, "GET "+workspacePath, api.handle(false, api.getWorkspace))
	registerAuthenticated(mux, verifier, "PUT "+workspacePath, api.handle(true, api.putWorkspace))
	registerAuthenticated(mux, verifier, "POST "+workspacePath+"/preview", api.handle(true, api.previewWorkspace))
	registerAuthenticated(mux, verifier, "GET "+workspacePath+"/revisions", api.handle(false, api.listWorkspaceRevisions))
	registerAuthenticated(mux, verifier, "GET "+workspacePath+"/revisions/{revisionId}", api.handle(false, api.getWorkspaceRevision))
	registerAuthenticated(mux, verifier, "POST "+workspacePath+"/revisions/{revisionId}/restore", api.handle(true, api.restoreWorkspaceRevision))

	registerAuthenticated(mux, verifier, "GET "+projectPath, api.handle(false, api.getProject))
	registerAuthenticated(mux, verifier, "PUT "+projectPath, api.handle(true, api.putProject))
	registerAuthenticated(mux, verifier, "POST "+projectPath+"/preview", api.handle(true, api.previewProject))
	registerAuthenticated(mux, verifier, "GET "+projectPath+"/revisions", api.handle(false, api.listProjectRevisions))
	registerAuthenticated(mux, verifier, "GET "+projectPath+"/revisions/{revisionId}", api.handle(false, api.getProjectRevision))
	registerAuthenticated(mux, verifier, "POST "+projectPath+"/revisions/{revisionId}/restore", api.handle(true, api.restoreProjectRevision))
}

type knowledgeMemoryRouteHandler func(http.ResponseWriter, *http.Request, workspaceActor) (int, any, error)

func (api *knowledgeMemoryAPI) handle(mutation bool, fn knowledgeMemoryRouteHandler) http.Handler {
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

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		if mutation {
			r.Body = http.MaxBytesReader(w, r.Body, knowledgeMemoryBodyLimit)
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
		writeKnowledgeMemoryJSON(w, status, value)
	})
}

func writeKnowledgeMemoryJSON(w http.ResponseWriter, status int, value any) {
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

func (api *knowledgeMemoryAPI) getWorkspace(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	current, err := api.getCurrent(r.Context(), knowledgeMemoryScope{organizationID: actor.organizationID})
	if err != nil {
		return 0, nil, err
	}
	setKnowledgeMemoryETagHeader(w, current)
	return http.StatusOK, map[string]any{"knowledgeMemory": current}, nil
}

func (api *knowledgeMemoryAPI) getProject(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	scope, err := api.projectScope(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	current, err := api.getCurrent(r.Context(), scope)
	if err != nil {
		return 0, nil, err
	}
	setKnowledgeMemoryETagHeader(w, current)
	return http.StatusOK, map[string]any{"knowledgeMemory": current}, nil
}

func (api *knowledgeMemoryAPI) putWorkspace(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	payload, err := decodeKnowledgeMemoryUpdate(r)
	if err != nil {
		return 0, nil, err
	}
	if !canUpdateKnowledgeMemory(actor.role) {
		return 0, nil, knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can update knowledge memory")
	}
	precondition, err := requireKnowledgeMemoryPrecondition(r)
	if err != nil {
		return 0, nil, err
	}
	return api.commitResponse(w, r, knowledgeMemoryScope{organizationID: actor.organizationID}, actor.userID, payload, precondition, false)
}

func (api *knowledgeMemoryAPI) putProject(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	payload, err := decodeKnowledgeMemoryUpdate(r)
	if err != nil {
		return 0, nil, err
	}
	if !canUpdateKnowledgeMemory(actor.role) {
		return 0, nil, knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can update knowledge memory")
	}
	precondition, err := requireKnowledgeMemoryPrecondition(r)
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.projectScope(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	return api.commitResponse(w, r, scope, actor.userID, payload, precondition, false)
}

func (api *knowledgeMemoryAPI) commitResponse(w http.ResponseWriter, r *http.Request, scope knowledgeMemoryScope, userID string, payload knowledgeMemoryUpdatePayload, expected *string, forceNew bool) (int, any, error) {
	result, err := api.commit(r.Context(), scope, userID, payload.Content, optionalTrimmedSummary(payload.Summary), expected, forceNew)
	if err != nil {
		var conflict *knowledgeMemoryConflict
		if errors.As(err, &conflict) {
			setKnowledgeMemoryETagHeader(w, conflict.current)
			return 0, nil, knowledgeMemoryFailureDetails(412, "knowledge_memory_precondition_failed", "Knowledge Memory changed after it was loaded", map[string]any{"knowledgeMemory": conflict.current})
		}
		return 0, nil, err
	}
	setKnowledgeMemoryETagHeader(w, result)
	return http.StatusOK, map[string]any{"knowledgeMemory": result}, nil
}

func (api *knowledgeMemoryAPI) previewWorkspace(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	payload, err := decodeKnowledgeMemoryPreview(r)
	if err != nil {
		return 0, nil, err
	}
	current, err := api.getCurrent(r.Context(), knowledgeMemoryScope{organizationID: actor.organizationID})
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, map[string]any{"memoryPreview": selectKnowledgeMemoryContext(current.Content, payload)}, nil
}

func (api *knowledgeMemoryAPI) previewProject(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	payload, err := decodeKnowledgeMemoryPreview(r)
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.projectScope(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	current, err := api.getCurrent(r.Context(), scope)
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, map[string]any{"memoryPreview": selectKnowledgeMemoryContext(current.Content, payload)}, nil
}

func (api *knowledgeMemoryAPI) listWorkspaceRevisions(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	limit, cursor, err := parseKnowledgeMemoryRevisionQuery(r)
	if err != nil {
		return 0, nil, err
	}
	result, err := api.listRevisions(r.Context(), knowledgeMemoryScope{organizationID: actor.organizationID}, limit, cursor)
	return http.StatusOK, result, err
}

func (api *knowledgeMemoryAPI) listProjectRevisions(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	limit, cursor, err := parseKnowledgeMemoryRevisionQuery(r)
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.projectScope(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	result, err := api.listRevisions(r.Context(), scope, limit, cursor)
	return http.StatusOK, result, err
}

func (api *knowledgeMemoryAPI) getWorkspaceRevision(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	revisionID, err := parseKnowledgeMemoryRevisionID(r.PathValue("revisionId"))
	if err != nil {
		return 0, nil, err
	}
	result, err := api.getRevision(r.Context(), knowledgeMemoryScope{organizationID: actor.organizationID}, revisionID)
	return http.StatusOK, result, err
}

func (api *knowledgeMemoryAPI) getProjectRevision(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	revisionID, err := parseKnowledgeMemoryRevisionID(r.PathValue("revisionId"))
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.projectScope(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	result, err := api.getRevision(r.Context(), scope, revisionID)
	return http.StatusOK, result, err
}

func (api *knowledgeMemoryAPI) restoreWorkspaceRevision(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	revisionID, err := parseKnowledgeMemoryRevisionID(r.PathValue("revisionId"))
	if err != nil {
		return 0, nil, err
	}
	if !canUpdateKnowledgeMemory(actor.role) {
		return 0, nil, knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can restore knowledge memory")
	}
	precondition, err := requireKnowledgeMemoryPrecondition(r)
	if err != nil {
		return 0, nil, err
	}
	return api.restoreResponse(w, r, knowledgeMemoryScope{organizationID: actor.organizationID}, actor.userID, revisionID, precondition)
}

func (api *knowledgeMemoryAPI) restoreProjectRevision(w http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	revisionID, err := parseKnowledgeMemoryRevisionID(r.PathValue("revisionId"))
	if err != nil {
		return 0, nil, err
	}
	if !canUpdateKnowledgeMemory(actor.role) {
		return 0, nil, knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can restore knowledge memory")
	}
	precondition, err := requireKnowledgeMemoryPrecondition(r)
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.projectScope(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	return api.restoreResponse(w, r, scope, actor.userID, revisionID, precondition)
}

func (api *knowledgeMemoryAPI) restoreResponse(w http.ResponseWriter, r *http.Request, scope knowledgeMemoryScope, userID, revisionID string, expected *string) (int, any, error) {
	revision, err := api.findRevision(r.Context(), scope, revisionID)
	if err != nil {
		return 0, nil, err
	}
	if revision == nil {
		return 0, nil, knowledgeMemoryFailure(404, "knowledge_memory_revision_not_found", "Knowledge Memory revision was not found")
	}
	payload := knowledgeMemoryUpdatePayload{Content: revision.Content, Summary: stringPointer(fmt.Sprintf("Restored version %d", revision.Version))}
	return api.commitResponse(w, r, scope, userID, payload, expected, true)
}

func canUpdateKnowledgeMemory(role string) bool {
	return role == "admin" || role == "localization_manager"
}

func setKnowledgeMemoryETagHeader(w http.ResponseWriter, record knowledgeMemoryRecord) {
	revisionID := "0"
	if record.RevisionID != nil {
		revisionID = *record.RevisionID
	}
	w.Header().Set("ETag", `"`+revisionID+`"`)
}

func parseKnowledgeMemoryRevisionID(raw string) (string, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return "", knowledgeMemoryFailureDetails(400, "invalid_knowledge_memory_revision_params", "Knowledge memory revision is invalid", map[string]any{"field": "revisionId"})
	}
	return id.String(), nil
}

func parseKnowledgeMemoryRevisionQuery(r *http.Request) (int, *int, error) {
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 50 {
			return 0, nil, knowledgeMemoryFailure(400, "invalid_knowledge_memory_revision_query", "Knowledge memory revision query is invalid")
		}
		limit = parsed
	}
	var cursor *int
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			return 0, nil, knowledgeMemoryFailure(400, "invalid_knowledge_memory_revision_query", "Knowledge memory revision query is invalid")
		}
		cursor = &parsed
	}
	return limit, cursor, nil
}

func requireKnowledgeMemoryPrecondition(r *http.Request) (*string, error) {
	value := r.Header.Get("If-Match")
	if value == "" {
		return nil, knowledgeMemoryFailure(428, "knowledge_memory_precondition_required", "Reload Knowledge Memory before committing changes")
	}
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < 3 || trimmed[0] != '"' || trimmed[len(trimmed)-1] != '"' || strings.Contains(trimmed[1:len(trimmed)-1], `"`) {
		return nil, knowledgeMemoryFailure(400, "invalid_knowledge_memory_precondition", "If-Match must contain the current Knowledge Memory ETag")
	}
	token := trimmed[1 : len(trimmed)-1]
	if token == "0" {
		return nil, nil
	}
	id, err := uuid.Parse(token)
	if err != nil {
		return nil, knowledgeMemoryFailure(400, "invalid_knowledge_memory_precondition", "If-Match must contain the current Knowledge Memory ETag")
	}
	canonical := id.String()
	return &canonical, nil
}

func decodeKnowledgeMemoryUpdate(r *http.Request) (knowledgeMemoryUpdatePayload, error) {
	var fields map[string]json.RawMessage
	if err := decodeSingleJSON(r.Body, &fields); err != nil || fields == nil {
		return knowledgeMemoryUpdatePayload{}, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
	}
	contentRaw, ok := fields["content"]
	if !ok || string(contentRaw) == "null" {
		return knowledgeMemoryUpdatePayload{}, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
	}
	var content string
	if err := json.Unmarshal(contentRaw, &content); err != nil {
		return knowledgeMemoryUpdatePayload{}, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
	}
	if summaryRaw, ok := fields["summary"]; ok && string(summaryRaw) == "null" {
		return knowledgeMemoryUpdatePayload{}, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
	}
	var payload knowledgeMemoryUpdatePayload
	encoded, err := json.Marshal(fields)
	if err != nil || json.Unmarshal(encoded, &payload) != nil {
		return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
	}
	payload.Content = content
	payload.Content = normalizeKnowledgeMemoryContent(payload.Content)
	if utf16Length(payload.Content) > knowledgeMemoryMaxContent {
		return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
	}
	if payload.Summary != nil {
		trimmed := javascriptTrim(*payload.Summary)
		if trimmed == "" || utf16Length(trimmed) > knowledgeMemoryMaxSummary {
			return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_payload", "Knowledge memory payload is invalid")
		}
		payload.Summary = &trimmed
	}
	return payload, nil
}

func decodeKnowledgeMemoryPreview(r *http.Request) (knowledgeMemoryPreviewPayload, error) {
	var fields map[string]json.RawMessage
	if err := decodeSingleJSON(r.Body, &fields); err != nil || fields == nil {
		return knowledgeMemoryPreviewPayload{}, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
	}
	for _, name := range []string{"targetLocale", "targetLocales", "sourceLocale", "sourceText", "context", "key", "path", "metadata", "maxChars"} {
		if raw, ok := fields[name]; ok && string(raw) == "null" {
			return knowledgeMemoryPreviewPayload{}, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
		}
	}
	var payload knowledgeMemoryPreviewPayload
	encoded, err := json.Marshal(fields)
	if err != nil || json.Unmarshal(encoded, &payload) != nil {
		return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
	}
	for _, field := range []struct {
		name  string
		value *string
		max   int
		trim  bool
	}{{"targetLocale", payload.TargetLocale, 32, true}, {"sourceLocale", payload.SourceLocale, 32, true}, {"sourceText", payload.SourceText, 100_000, true}, {"context", payload.Context, 20_000, false}, {"key", payload.Key, 256, true}, {"path", payload.Path, 1024, true}} {
		if field.value == nil {
			continue
		}
		value := *field.value
		if field.trim {
			value = javascriptTrim(value)
		}
		if (field.name == "targetLocale" || field.name == "sourceLocale") && value == "" || utf16Length(value) > field.max {
			return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
		}
		*field.value = value
	}
	if len(payload.TargetLocales) > 20 || len(payload.TargetLocales) == 0 && payload.TargetLocales != nil {
		return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
	}
	for i := range payload.TargetLocales {
		payload.TargetLocales[i] = javascriptTrim(payload.TargetLocales[i])
		if payload.TargetLocales[i] == "" || utf16Length(payload.TargetLocales[i]) > 32 {
			return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
		}
	}
	if payload.Metadata != nil {
		if len(payload.Metadata) > 50 {
			return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
		}
		var metadataFields map[string]json.RawMessage
		if err := json.Unmarshal(fields["metadata"], &metadataFields); err != nil || metadataFields == nil {
			return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
		}
		for key, value := range payload.Metadata {
			if string(metadataFields[key]) == "null" {
				return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
			}
			if utf16Length(key) > 100 || utf16Length(value) > 1000 {
				return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
			}
		}
	}
	if payload.MaxChars != nil && (*payload.MaxChars < 256 || *payload.MaxChars > knowledgeMemoryMaxPreview) {
		return payload, knowledgeMemoryFailure(400, "invalid_knowledge_memory_preview_payload", "Knowledge memory preview payload is invalid")
	}
	return payload, nil
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

func normalizeKnowledgeMemoryContent(content string) string {
	return strings.TrimRightFunc(content, func(r rune) bool { return unicode.IsSpace(r) || r == '\uFEFF' })
}

func javascriptTrim(value string) string {
	return strings.TrimFunc(value, func(r rune) bool { return unicode.IsSpace(r) || r == '\uFEFF' })
}

func optionalTrimmedSummary(summary *string) *string {
	if summary == nil {
		return nil
	}
	trimmed := javascriptTrim(*summary)
	return &trimmed
}

func formatKnowledgeMemoryTime(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
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
	return knowledgeMemoryScope{projectID: projectID}, nil
}
