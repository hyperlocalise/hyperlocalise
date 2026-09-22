package main

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

func (api *editorCatAPI) skipVisualContext(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	return nil, 0, editorCatVercelDeferred(
		"visual_context_deferred",
		"Visual Context stays on the Hono route; it calls connected TMS screenshot APIs that are not in go-svc yet",
	)
}

func (api *editorCatAPI) skipRecommendation(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	return nil, 0, editorCatVercelDeferred(
		"ai_recommendation_deferred",
		"AI recommendation stays on the Hono route; it uses the Vercel AI Gateway / AI SDK",
	)
}

func (api *editorCatAPI) skipImageRegenerate(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	return nil, 0, editorCatVercelDeferred(
		"image_regenerate_deferred",
		"Image and video regeneration stays on the Hono route; it uses Vercel Workflow and Blob-backed stored files",
	)
}

func (api *editorCatAPI) skipImageUpload(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	return nil, 0, editorCatVercelDeferred(
		"image_upload_deferred",
		"Localized image upload stays on the Hono route; it writes through the Vercel Blob file adapter",
	)
}

func (api *editorCatAPI) stringContext(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	var body struct {
		SourcePath         string  `json:"sourcePath"`
		RepositoryFullName *string `json:"repositoryFullName"`
		Key                string  `json:"key"`
		Text               string  `json:"text"`
		Context            *string `json:"context"`
		CachedOnly         *bool   `json:"cachedOnly"`
		ForceRefresh       *bool   `json:"forceRefresh"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	cachedOnly := body.CachedOnly != nil && *body.CachedOnly
	if !cachedOnly {
		return nil, 0, editorCatVercelDeferred(
			"string_context_deferred",
			"Fresh string-context lookup stays on the Hono route; it runs a Vercel Workflow repository agent",
		)
	}
	sourcePath := trimEditorCat(body.SourcePath)
	key := trimEditorCat(body.Key)
	if sourcePath == "" || key == "" {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	args := []any{actor.organizationID, project.ID, sourcePath, key}
	sql := `
        select summary from project_file_string_repository_contexts
        where organization_id=$1 and project_id=$2 and source_path=$3 and string_key=$4`
	if body.RepositoryFullName != nil && trimEditorCat(*body.RepositoryFullName) != "" {
		args = append(args, trimEditorCat(*body.RepositoryFullName))
		sql += ` and repository_full_name=$5`
	}
	sql += ` order by updated_at desc limit 1`
	var summary *string
	err := api.pool.QueryRow(r.Context(), sql, args...).Scan(&summary)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{"stringContext": map[string]any{"summary": nil, "cached": true}}, 200, nil
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"stringContext": map[string]any{"summary": summary, "cached": true}}, 200, nil
}
