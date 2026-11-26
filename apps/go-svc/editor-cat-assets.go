package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Project file bytes for CAT image and document views. go-svc CAT responses name
// assets as `/api/orgs/.../assets/{fileId}` for the web app; Iris maps that path to
// `/v1/orgs/.../assets/{fileId}` on this service with a Bearer token.
func (api *editorCatAPI) registerProjectAssets(mux *http.ServeMux, verifier SessionVerifier) {
	pattern := "GET " + orgRoutePrefix + "/projects/{projectId}/assets/{fileId}"
	registerAuthenticated(mux, verifier, pattern, http.HandlerFunc(api.serveProjectAsset))
}

func (api *editorCatAPI) serveProjectAsset(w http.ResponseWriter, r *http.Request) {
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

	fileID := strings.TrimSpace(r.PathValue("fileId"))
	if fileID == "" {
		writeEditorCatError(w, r, "param", editorCatFailure(404, "file_not_found", "File not found"))
		return
	}

	slug := r.PathValue("organizationSlug")
	actor, err := api.actorFor(ctx, claims, slug, true)
	if err != nil {
		writeEditorCatError(w, r, "resolve_actor", err)
		return
	}

	var project editorCatProject
	if actor.isVendor() {
		project, err = api.resolveEditorCatVendorProjectAsset(ctx, actor, r.PathValue("projectId"), fileID)
	} else {
		project, err = api.resolveEditorCatTeamProjectAsset(ctx, actor, r.PathValue("projectId"), fileID)
	}
	if err != nil {
		writeEditorCatError(w, r, "resolve_project", err)
		return
	}

	body, contentType, filename, err := api.readEditorCatStoredFileForProject(ctx, actor.organizationID, project.ID, fileID)
	if err != nil {
		writeEditorCatError(w, r, "read_asset", err)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", `inline; filename*=UTF-8''`+url.PathEscape(filename))
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox;")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (api *editorCatAPI) resolveEditorCatTeamProjectAsset(ctx context.Context, actor editorCatActor, rawProjectID, fileID string) (editorCatProject, error) {
	if !actor.canRead() {
		return editorCatProject{}, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	project, err := api.ownedProject(ctx, actor, rawProjectID)
	if err != nil {
		return editorCatProject{}, err
	}
	ok, err := api.storedFileBelongsToProject(ctx, actor.organizationID, project.ID, fileID)
	if err != nil {
		return editorCatProject{}, err
	}
	if !ok {
		return editorCatProject{}, editorCatFailure(404, "file_not_found", "File not found")
	}
	return project, nil
}

func (api *editorCatAPI) resolveEditorCatVendorProjectAsset(ctx context.Context, actor editorCatActor, rawProjectID, fileID string) (editorCatProject, error) {
	scoped, scope, err := api.taskScopedProject(ctx, actor, rawProjectID)
	if err != nil {
		return editorCatProject{}, err
	}
	if scope == nil {
		return editorCatProject{}, editorCatFailure(404, "task_not_open", "This task is not open for you. It may be finished, waiting for an earlier task, or given to someone else")
	}
	allowed, err := api.vendorMayReadStoredFile(ctx, actor, scoped.ID, fileID)
	if err != nil {
		return editorCatProject{}, err
	}
	if !allowed {
		return editorCatProject{}, editorScopeDenied()
	}
	return scoped, nil
}

func (api *editorCatAPI) storedFileBelongsToProject(ctx context.Context, organizationID, projectID, fileID string) (bool, error) {
	var storedProjectID *string
	err := api.pool.QueryRow(ctx, `
        select project_id from stored_files
        where id=$1 and organization_id=$2
        limit 1`, fileID, organizationID).Scan(&storedProjectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if storedProjectID != nil && *storedProjectID != "" && *storedProjectID != projectID {
		return false, nil
	}
	return true, nil
}

func (api *editorCatAPI) vendorMayReadStoredFile(ctx context.Context, actor editorCatActor, projectID, fileID string) (bool, error) {
	var exists bool
	query := fmt.Sprintf(`
        select exists (
            select 1
            from jobs j
            where j.organization_id=$1 and j.project_id=$2 and j.owner_user_id=$3
              and coalesce(j.input_payload->>'sourceFileId', '') = $4
              and %s
        )`, fileTaskSQL(false))
	err := api.pool.QueryRow(ctx, query, actor.organizationID, projectID, actor.userID, fileID).Scan(&exists)
	return exists, err
}

func (api *editorCatAPI) readEditorCatStoredFileForProject(ctx context.Context, organizationID, projectID, storedFileID string) ([]byte, string, string, error) {
	ok, err := api.storedFileBelongsToProject(ctx, organizationID, projectID, storedFileID)
	if err != nil {
		return nil, "", "", err
	}
	if !ok {
		return nil, "", "", editorCatFailure(404, "file_not_found", "File not found")
	}
	return api.readEditorCatStoredFile(ctx, organizationID, storedFileID)
}
