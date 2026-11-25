package main

import (
	"bytes"
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
	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
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
	objects    *objectstore.Registry
	// ai serves the text model, AI feature gating, and usage metering for the
	// native recommendation route. Nil in tests that do not touch it.
	ai *irisGenerationAPI
	// matchPublisher is nil when automatic visual-context matching is not configured.
	matchPublisher visualContextMatchPublisher
}

type editorCatActor struct {
	userID, organizationID, organizationSlug, role string
	// vendor is set for a person in a vendor team, who reaches the editor only through open tasks
	// they own (vendor-access.go). Their role decides what they may do there.
	vendor bool
	// taskScope is set when the person reaches the project through open tasks they own and not
	// through the team rule (vendor-access.go). The request was already held to those tasks'
	// files and languages; branch is the file branch it named.
	taskScope *editorTaskScope
	branch    string
}

func (a editorCatActor) isVendor() bool {
	return a.vendor
}

func (a editorCatActor) canRead() bool {
	// A vendor reaches the editor only through a task: the wrapper lets one in only with a task
	// scope. Within it their role decides, as for anyone.
	if a.isVendor() && a.taskScope == nil {
		return false
	}
	switch a.role {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func (a editorCatActor) canEdit() bool {
	if a.isVendor() && a.taskScope == nil {
		return false
	}
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
	// A vendor never has the whole workspace, whatever their role (vendor-access.go).
	return !a.vendor && (a.role == "admin" || a.role == "localization_manager")
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

func editorCatFailureAttrs(r *http.Request) []any {
	query := r.URL.Query()
	attrs := make([]any, 0, 10)
	if filter := trimEditorCat(query.Get("queueFilter")); filter != "" {
		attrs = append(attrs, "queue_filter", filter)
	}
	if sort := trimEditorCat(query.Get("queueSort")); sort != "" {
		attrs = append(attrs, "queue_sort", sort)
	}
	if locale := trimEditorCat(query.Get("targetLocale")); locale != "" {
		attrs = append(attrs, "target_locale", locale)
	}
	if limit := trimEditorCat(query.Get("limit")); limit != "" {
		attrs = append(attrs, "limit", limit)
	}
	if offset := trimEditorCat(query.Get("offset")); offset != "" {
		attrs = append(attrs, "offset", offset)
	}
	return attrs
}

func writeEditorCatError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *editorCatError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "editor_cat_request_failed", phase, err, editorCatFailureAttrs(r)...)
		failure = &editorCatError{500, "internal_error", "Internal server error"}
	} else {
		attrs := append(editorCatFailureAttrs(r), "status", failure.status, "code", failure.code)
		logRequestFailure(r, "editor_cat_request_failed", phase, err, attrs...)
	}
	editorJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *editorCatAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	p := orgRoutePrefix + "/projects/{projectId}"
	cat := p + "/files/detail/cat"
	route := func(pattern string, fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn, editorScopeClosed))
	}
	// Routes opened to a vendor, and to anyone who reaches the project through an open task they
	// own and not through its team. The rule holds each request to the task's file and languages
	// before the handler runs (vendor-access.go). Every other route here stays closed to them.
	taskRoute := func(pattern string, rule editorScopeRule, fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn, rule))
	}
	routeMultipart := func(pattern string, fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handleWithBodyLimit(editorCatImageBodyLimit, fn, editorScopeClosed))
	}
	taskRoute("GET "+cat+"/queue", editorScopeQuery, api.getQueue)
	taskRoute("POST "+cat+"/targets", editorScopeTargets, api.getSegmentTargets)
	route("GET "+cat+"/activity-logs", api.listActivityLogs)
	taskRoute("GET "+cat, editorScopeQuery, api.getFile)
	taskRoute("GET "+cat+"/segments/{externalStringId}/target", editorScopeQuery, api.getSegmentTarget)
	route("GET "+cat+"/segments/{externalStringId}/variants", api.getSegmentGroupVariants)
	taskRoute("GET "+cat+"/segments/{externalStringId}/comments", editorScopeQuery, api.getSegmentComments)
	taskRoute("GET "+cat+"/segments/{externalStringId}/revisions", editorScopeQuery, api.listSegmentRevisions)
	taskRoute("POST "+cat+"/segments/{externalStringId}/revisions/{revisionId}/restore", editorScopeBody, api.restoreSegmentRevision)
	route("POST "+cat+"/operations/{operationId}/undo", api.undoOperation)
	taskRoute("POST "+cat+"/translations", editorScopeBody, api.saveTranslation)
	route("POST "+cat+"/document/parse-back", api.parseBackDocument)
	route("PATCH "+cat+"/translations/status", api.updateTranslationStatus)
	route("POST "+cat+"/translations/status", api.updateTranslationStatus)
	taskRoute("POST "+cat+"/comments", editorScopeBody, api.saveComment)
	route("PATCH "+cat+"/comments/{commentId}/resolve", api.resolveComment)
	route("POST "+cat+"/concordance", api.loadConcordance)
	route("GET "+cat+"/tm-segments/{entryId}", api.getTmSegment)
	route("PATCH "+cat+"/tm-segments/{entryId}", api.patchTmSegment)
	route("DELETE "+cat+"/tm-segments/{entryId}/records/{recordId}", api.deleteTmSegmentRecord)
	taskRoute("POST "+cat+"/visual-context", editorScopeBodyFile, api.loadVisualContext)
	route("POST "+cat+"/visual-context/screenshots", api.createVisualContextScreenshot)
	route("POST "+cat+"/visual-context/screenshots/{screenshotId}/finalize", api.finalizeVisualContextScreenshot)
	route("POST "+cat+"/visual-context/screenshots/{screenshotId}/match", api.matchVisualContextScreenshot)
	route("GET "+cat+"/visual-context/processes/{processId}", api.loadVisualContextMatchProcess)
	route("POST "+cat+"/visual-context/screenshots/{screenshotId}/bindings", api.bindVisualContextScreenshot)
	route("DELETE "+cat+"/visual-context/screenshots/{screenshotId}/bindings/{bindingId}", api.unbindVisualContextScreenshot)
	route("DELETE "+cat+"/visual-context/screenshots/{screenshotId}", api.deleteVisualContextScreenshot)
	route("POST "+cat+"/recommendation", api.recommendTranslation)
	route("POST "+cat+"/strings/hidden", api.setHidden)
	route("POST "+cat+"/strings/locked", api.setLocked)
	route("POST "+cat+"/segments/{externalStringId}/max-length", api.setMaxLength)
	route("POST "+cat+"/strings/tags", api.setTags)
	route("POST "+cat+"/segments/{externalStringId}/design-url", api.setDesignURL)
	route("POST "+cat+"/segments/{externalStringId}/source-text", api.setSourceText)
	route("POST "+cat+"/images/regenerate", api.regenerateImage)
	routeMultipart("POST "+cat+"/images/upload", api.uploadImage)
	routeMultipart("POST "+cat+"/images/edit", api.editImage)
	route("PATCH "+cat+"/images/status", api.updateImageStatus)
	route("POST "+cat+"/segments/{externalStringId}/treat-as-image", api.treatAsImage)
	route("POST "+cat+"/segments/{externalStringId}/treat-as-video", api.treatAsVideo)
	route("POST "+p+"/files/string-context", api.stringContext)
}

func (api *editorCatAPI) actorFor(ctx context.Context, claims AuthClaims, slug string, allowVendor bool) (editorCatActor, error) {
	resolved, vendor, err := resolveOrganizationActorAllowingVendorIf(ctx, api.pool, api.membership, claims, slug, allowVendor)
	if err != nil {
		return editorCatActor{}, mapOrganizationAccessError(err, editorCatFailure)
	}
	return editorCatActor{
		userID:           resolved.userID,
		organizationID:   resolved.organizationID,
		organizationSlug: slug,
		role:             resolved.role,
		vendor:           vendor,
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

// taskScopedProject is the project for a person who reaches it through open tasks they own,
// with those tasks' files and languages. It returns a nil scope when they own none there.
func (api *editorCatAPI) taskScopedProject(ctx context.Context, actor editorCatActor, rawProjectID string) (editorCatProject, *editorTaskScope, error) {
	projectID := normalizeDictionaryProjectID(rawProjectID)
	if projectID == "" {
		return editorCatProject{}, nil, nil
	}
	scope, err := loadEditorTaskScope(ctx, api.pool, actor.organizationID, actor.userID, projectID)
	if err != nil || scope == nil {
		return editorCatProject{}, nil, err
	}
	// The team's name is not theirs to see, so it is left out.
	var project editorCatProject
	err = api.pool.QueryRow(ctx, `
        select p.id, p.source, coalesce(p.source_locale, '')
        from projects p
        where p.id = $1 and p.organization_id = $2`,
		projectID, actor.organizationID,
	).Scan(&project.ID, &project.Source, &project.SourceLocale)
	if errors.Is(err, pgx.ErrNoRows) {
		return editorCatProject{}, nil, nil
	}
	if err != nil {
		return editorCatProject{}, nil, err
	}
	return project, scope, nil
}

// handle wraps an editor route. scopeRule is editorScopeClosed for a route only people on the
// project's team may call; any other rule also opens it to the owner of an open task there,
// a vendor included, held to that task's file and languages.
func (api *editorCatAPI) handle(fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error), scopeRule editorScopeRule) http.Handler {
	return api.handleWithBodyLimit(editorCatBodyLimit, fn, scopeRule)
}

// handleWithBodyLimit is handle with its own cap on the request body.
func (api *editorCatAPI) handleWithBodyLimit(limit int64, fn func(*http.Request, editorCatActor, editorCatProject) (any, int, error), scopeRule editorScopeRule) http.Handler {
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
		actor, err := api.actorFor(ctx, claims, r.PathValue("organizationSlug"), scopeRule != editorScopeClosed)
		if err != nil {
			writeEditorCatError(w, r, "resolve_actor", err)
			return
		}
		noteRequest(r, "role", actor.role, "user_id", actor.userID)
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		// The team rule first. A vendor never passes it: a team they were left in gives nothing.
		project, err := editorCatProject{}, missingEditorCatProject()
		if !actor.isVendor() {
			if !actor.canRead() {
				writeEditorCatError(w, r, "role", editorCatFailure(403, "forbidden", "Insufficient permissions"))
				return
			}
			project, err = api.ownedProject(ctx, actor, r.PathValue("projectId"))
		}
		var missing *editorCatError
		if errors.As(err, &missing) && missing.code == "project_not_found" && scopeRule != editorScopeClosed {
			// Not through a team: through an open task they own in this project, if any.
			scoped, scope, scopeErr := api.taskScopedProject(ctx, actor, r.PathValue("projectId"))
			if scopeErr != nil {
				writeEditorCatError(w, r, "resolve_task_scope", scopeErr)
				return
			}
			if scope != nil {
				var rawBody []byte
				if r.Method != http.MethodGet {
					rawBody, scopeErr = io.ReadAll(r.Body)
					if scopeErr != nil {
						writeEditorCatError(w, r, "read_body", editorCatFailure(413, "payload_too_large", "request body exceeds maximum allowed size"))
						return
					}
					r.Body = io.NopCloser(bytes.NewReader(rawBody))
				}
				if scopeErr = checkEditorTaskScope(r, scopeRule, rawBody, scope); scopeErr != nil {
					writeEditorCatError(w, r, "task_scope", scopeErr)
					return
				}
				actor.taskScope = scope
				actor.branch = nativeproject.ResolveBranchName(r.URL.Query().Get("branch"))
				project, err = scoped, nil
				noteRequest(r, "task_scoped", true)
			}
		}
		if err != nil {
			if actor.isVendor() {
				// Their only way in is an open task of their own. It may also be waiting for an
				// earlier task, so the message does not claim to know which.
				err = editorCatFailure(404, "task_not_open", "This task is not open for you. It may be finished, waiting for an earlier task, or given to someone else")
			}
			writeEditorCatError(w, r, "resolve_project", err)
			return
		}
		noteRequest(r, "project_source", project.Source)
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

// editorCatSourcePathScopeSQL keeps a mutation on keys whose file has this source path,
// on any version branch. Callers bind organization_id=$1, project_id=$2, and sourcePath
// at argN. Matching by path (not a single file id) lets a version-branch key stay
// writable when the request omits ?branch=.
func editorCatSourcePathScopeSQL(keyTable string, argN int) string {
	return ` and exists (
        select 1 from repository_source_files f
        where f.id = ` + keyTable + `.repository_source_file_id
            and f.organization_id=$1 and f.project_id=$2 and f.source_path=$` + strconv.Itoa(argN) + `
    )`
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
	if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
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

// editorCatSourceLooksLikeMediaURLSQL mirrors looksLikeEditorCatImageURL and
// looksLikeEditorCatVideoURL for SQL grouping (pathname suffix after host).
func editorCatSourceLooksLikeMediaURLSQL(sourceTextColumn string) string {
	trimmed := "trim(" + sourceTextColumn + ")"
	path := "split_part(split_part(lower(regexp_replace(" + trimmed + ", '^https?://[^/?#]+', '', 'i')), '?', 1), '#', 1)"
	return "((" + trimmed + " like 'http://%' or " + trimmed + " like 'https://%') and " + path + " ~ '\\.(png|jpe?g|webp|mp4)$')"
}

func editorCatGroupSeparatesMediaSQL(alias string) string {
	return "(coalesce(" + alias + ".metadata->>'contentKind', '') in ('image_url','video_url') or " + editorCatSourceLooksLikeMediaURLSQL(alias+".source_text") + ")"
}

func editorCatGroupIdentitySQL(alias string) string {
	return "case when " + editorCatGroupSeparatesMediaSQL(alias) + " then 'media:' || " + alias + ".id::text else 'text:' || " + alias + ".source_text end"
}

func editorCatExcludeCalloutFenceSQL(alias string) string {
	col := alias + ".source_text"
	return "(trim(" + col + ") <> ':::' and trim(" + col + ") not like ':::callout%')"
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
	case ".html", ".htm", ".md", ".mdx", ".adoc", ".asciidoc", ".asc", ".txt":
		return editorCatKindDocument
	default:
		return editorCatKindText
	}
}

func isEditorCatBinaryWholeFile(sourcePath string) bool {
	kind := editorCatSourceKind(sourcePath)
	return kind == editorCatKindImage || kind == editorCatKindVideo || kind == editorCatKindOffice
}

// Office files ingested as paragraph or cell segments queue like documents.
// Legacy uploads without keys stay whole-file on the source-file UUID.
func isEditorCatOffice(sourcePath string) bool {
	return editorCatSourceKind(sourcePath) == editorCatKindOffice
}

// isEditorCatSegmentedFile reports kinds whose segment UUIDs resolve as text
// while the source-file UUID still addresses the whole file.
func isEditorCatSegmentedFile(sourcePath string) bool {
	kind := editorCatSourceKind(sourcePath)
	return kind == editorCatKindDocument || kind == editorCatKindOffice
}

// PDF block keys queue as text; File view previews the generated download.
func isEditorCatPdf(sourcePath string) bool {
	return strings.ToLower(path.Ext(sourcePath)) == ".pdf"
}

func isEditorCatDocument(sourcePath string) bool {
	return editorCatSourceKind(sourcePath) == editorCatKindDocument
}

func isEditorCatWholeFile(sourcePath string) bool {
	return editorCatSourceKind(sourcePath) != editorCatKindText
}

func looksLikeEditorCatFileBackedAlias(id, sourcePath string) bool {
	return id == "binary:"+sourcePath || id == "image:"+sourcePath || id == "video:"+sourcePath
}

func editorCatTargetKind(sourcePath, id string) editorCatFileKind {
	kind := editorCatSourceKind(sourcePath)
	if isEditorCatSegmentedFile(sourcePath) && !looksLikeEditorCatFileBackedAlias(id, sourcePath) {
		return editorCatKindText
	}
	return kind
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

func canonicalEditorCatID(id string) string {
	parsed, err := uuid.Parse(trimEditorCat(id))
	if err != nil {
		return trimEditorCat(id)
	}
	return parsed.String()
}
