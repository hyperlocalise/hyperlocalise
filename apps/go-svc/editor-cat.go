package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

const (
	editorCatBodyLimit      = 2 << 20
	editorCatRequestTimeout = 30 * time.Second
	editorCatDefaultLimit   = 50
	editorCatMaxLimit       = 100
	editorCatMaxHiddenBatch = 200
	editorCatMaxSearchLen   = 256
)

type editorCatAPI struct {
	pool       dictionaryPool
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
}

type editorCatActor struct {
	userID, organizationID, organizationSlug, role string
}

func (a editorCatActor) canRead() bool {
	switch a.role {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func (a editorCatActor) canEdit() bool {
	switch a.role {
	case "admin", "localization_manager", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func (a editorCatActor) canReviewApprove() bool {
	switch a.role {
	case "admin", "localization_manager", "reviewer":
		return true
	default:
		return false
	}
}

func (a editorCatActor) canManageGlossaries() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

func (a editorCatActor) canWriteProjectTeam() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

type editorCatProject struct {
	ID           string
	Source       string
	SourceLocale string
	TeamID       *string
	TeamName     *string
	TeamSlug     *string
}

type editorCatError struct {
	status        int
	code, message string
}

func (e *editorCatError) Error() string { return e.code }

func editorCatFailure(status int, code, message string) error {
	return &editorCatError{status: status, code: code, message: message}
}

func missingEditorCatProject() error {
	return editorCatFailure(404, "project_not_found", "Project not found")
}

func editorCatProviderDeferred() error {
	return editorCatFailure(501, "provider_cat_deferred", "Connected TMS CAT remains on the Hono route until provider adapters move to go-svc")
}

func editorCatVercelDeferred(code, message string) error {
	return editorCatFailure(501, code, message)
}

func editorJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "editor_cat_json_encode_failed")
	}
}

func writeEditorCatError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *editorCatError
	if !errors.As(err, &failure) {
		slog.ErrorContext(r.Context(), "editor_cat_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "error", err.Error())
		failure = &editorCatError{500, "internal_error", "Internal server error"}
	} else if failure.status >= 500 && failure.status != 501 {
		slog.ErrorContext(r.Context(), "editor_cat_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "code", failure.code)
	}
	editorJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *editorCatAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	p := orgRoutePrefix + "/projects/{projectId}"
	cat := p + "/files/detail/cat"
	route := func(pattern string, fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+cat+"/queue", api.getQueue)
	route("POST "+cat+"/targets", api.getSegmentTargets)
	route("GET "+cat+"/activity-logs", api.listActivityLogs)
	route("GET "+cat, api.getFile)
	route("GET "+cat+"/segments/{externalStringId}/target", api.getSegmentTarget)
	route("GET "+cat+"/segments/{externalStringId}/comments", api.getSegmentComments)
	route("POST "+cat+"/translations", api.saveTranslation)
	route("PATCH "+cat+"/translations/status", api.updateTranslationStatus)
	route("POST "+cat+"/translations/status", api.updateTranslationStatus)
	route("POST "+cat+"/comments", api.saveComment)
	route("PATCH "+cat+"/comments/{commentId}/resolve", api.resolveComment)
	route("POST "+cat+"/concordance", api.loadConcordance)
	route("POST "+cat+"/visual-context", api.skipVisualContext)
	route("POST "+cat+"/recommendation", api.skipRecommendation)
	route("POST "+cat+"/strings/hidden", api.setHidden)
	route("POST "+cat+"/strings/locked", api.setLocked)
	route("POST "+cat+"/segments/{externalStringId}/max-length", api.setMaxLength)
	route("POST "+cat+"/images/regenerate", api.skipImageRegenerate)
	route("POST "+cat+"/images/upload", api.skipImageUpload)
	route("PATCH "+cat+"/images/status", api.updateImageStatus)
	route("POST "+cat+"/segments/{externalStringId}/treat-as-image", api.treatAsImage)
	route("POST "+cat+"/segments/{externalStringId}/treat-as-video", api.treatAsVideo)
	route("POST "+p+"/files/string-context", api.stringContext)
}

func (api *editorCatAPI) actor(ctx context.Context, claims AuthClaims, slug string) (editorCatActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return editorCatActor{}, mapOrganizationAccessError(err, editorCatFailure)
	}
	return editorCatActor{
		userID:           resolved.userID,
		organizationID:   resolved.organizationID,
		organizationSlug: slug,
		role:             resolved.role,
	}, nil
}

func (api *editorCatAPI) ownedProject(ctx context.Context, actor editorCatActor, rawProjectID string) (editorCatProject, error) {
	projectID := normalizeDictionaryProjectID(rawProjectID)
	if projectID == "" {
		return editorCatProject{}, missingEditorCatProject()
	}
	var project editorCatProject
	err := api.pool.QueryRow(ctx, `
        select p.id, p.source, coalesce(p.source_locale, ''), p.team_id, t.name, t.slug
        from projects p
        left join teams t on t.id = p.team_id
        where p.id = $1 and p.organization_id = $2
        and `+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID, actor.organizationID, actor.canWriteProjectTeam(), actor.userID,
	).Scan(&project.ID, &project.Source, &project.SourceLocale, &project.TeamID, &project.TeamName, &project.TeamSlug)
	if errors.Is(err, pgx.ErrNoRows) {
		return editorCatProject{}, missingEditorCatProject()
	}
	if err != nil {
		return editorCatProject{}, err
	}
	return project, nil
}

func requireNativeEditorCat(project editorCatProject) error {
	if project.Source != "native" {
		return editorCatProviderDeferred()
	}
	return nil
}

func (api *editorCatAPI) handle(fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeEditorCatError(w, r, "origin_guard", editorCatFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeEditorCatError(w, r, "availability", editorCatFailure(503, "editor_unavailable", "Editor service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), editorCatRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeEditorCatError(w, r, "auth", editorCatFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeEditorCatError(w, r, "resolve_actor", err)
			return
		}
		if !actor.canRead() {
			writeEditorCatError(w, r, "role", editorCatFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		project, err := api.ownedProject(ctx, actor, r.PathValue("projectId"))
		if err != nil {
			writeEditorCatError(w, r, "resolve_project", err)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, editorCatBodyLimit)
		value, status, err := fn(r, actor, project)
		if err != nil {
			writeEditorCatError(w, r, "handle", err)
			return
		}
		editorJSON(ctx, w, status, value)
	})
}

func readEditorCatJSON(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		if isRequestBodyTooLarge(err) {
			return editorCatFailure(413, "payload_too_large", "request body exceeds maximum allowed size")
		}
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	return nil
}

func trimEditorCat(value string) string {
	return strings.TrimSpace(value)
}

func requireEditorCatQuery(values url.Values, key string, max int) (string, error) {
	value := trimEditorCat(values.Get(key))
	if value == "" || len(value) > max {
		return "", editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	return value, nil
}

func parseEditorCatIntQuery(values url.Values, key string, fallback, min, max int) (int, error) {
	raw := trimEditorCat(values.Get(key))
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < min || n > max {
		return 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	return n, nil
}

func isEditorCatAllFiles(sourcePath string) bool {
	trimmed := trimEditorCat(sourcePath)
	return trimmed == "" || trimmed == "*"
}

func filenameFromSourcePath(sourcePath string) string {
	base := path.Base(strings.ReplaceAll(sourcePath, "\\", "/"))
	if base == "." || base == "/" || base == "" {
		return sourcePath
	}
	return base
}

func editorCatAssetPath(organizationSlug, projectID, fileID string) string {
	return "/api/orgs/" + url.PathEscape(organizationSlug) + "/projects/" + url.PathEscape(projectID) + "/assets/" + url.PathEscape(fileID)
}

func looksLikeEditorCatHTTPURL(value, extPattern string) bool {
	trimmed := trimEditorCat(value)
	if !strings.HasPrefix(strings.ToLower(trimmed), "http://") && !strings.HasPrefix(strings.ToLower(trimmed), "https://") {
		return false
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	lower := strings.ToLower(parsed.Path)
	for _, ext := range strings.Split(extPattern, ",") {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

func looksLikeEditorCatImageURL(value string) bool {
	return looksLikeEditorCatHTTPURL(value, ".png,.jpg,.jpeg,.webp")
}

func looksLikeEditorCatVideoURL(value string) bool {
	return looksLikeEditorCatHTTPURL(value, ".mp4")
}

type editorCatFileKind string

const (
	editorCatKindText     editorCatFileKind = "text"
	editorCatKindImage    editorCatFileKind = "image_file"
	editorCatKindVideo    editorCatFileKind = "video_file"
	editorCatKindOffice   editorCatFileKind = "office_file"
	editorCatKindDocument editorCatFileKind = "document"
)

func editorCatSourceKind(sourcePath string) editorCatFileKind {
	ext := strings.ToLower(path.Ext(sourcePath))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp":
		return editorCatKindImage
	case ".mp4":
		return editorCatKindVideo
	case ".docx", ".xlsx", ".xls", ".pptx":
		return editorCatKindOffice
	case ".md", ".mdx":
		return editorCatKindDocument
	default:
		return editorCatKindText
	}
}

func isEditorCatWholeFile(sourcePath string) bool {
	return editorCatSourceKind(sourcePath) != editorCatKindText
}

func binaryEditorCatStringID(sourceFileID, sourcePath string) string {
	if sourceFileID != "" {
		return sourceFileID
	}
	return "binary:" + sourcePath
}

func parseEditorCatUUID(raw string) (string, error) {
	id := trimEditorCat(raw)
	if uuid.Validate(id) != nil {
		return "", editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	return id, nil
}
