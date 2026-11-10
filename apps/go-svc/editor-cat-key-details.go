package main

import (
	"errors"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/keymeta"
	"github.com/jackc/pgx/v5"
)

// canEditKeyDetails is the projects:write roles, who manage a project's strings. Tags and the
// design link describe the string itself, so translators and reviewers only read them.
func (a editorCatActor) canEditKeyDetails() bool {
	switch a.role {
	case "admin", "localization_manager", "developer":
		return true
	default:
		return false
	}
}

func (api *editorCatAPI) setTags(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEditKeyDetails() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath        string   `json:"sourcePath"`
		ExternalStringIDs []string `json:"externalStringIds"`
		AddTags           []string `json:"addTags"`
		RemoveTags        []string `json:"removeTags"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	ids := uniqueEditorCatIDs(body.ExternalStringIDs, editorCatMaxHiddenBatch)
	if body.AddTags == nil {
		body.AddTags = []string{}
	}
	if body.RemoveTags == nil {
		body.RemoveTags = []string{}
	}
	if len(ids) == 0 || len(body.AddTags)+len(body.RemoveTags) == 0 ||
		!keymeta.ValidTags(body.AddTags, keymeta.MaxTagsPerChange) ||
		!keymeta.ValidTags(body.RemoveTags, keymeta.MaxTagsPerChange) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	tags := keymeta.TagsAfterChangeSQL("tags", 4, 5)
	sql := `update project_translation_keys set tags = ` + tags + `, updated_at=now()
        where organization_id=$1 and project_id=$2 and id = any($3::uuid[]) and tags is distinct from ` + tags
	args := []any{actor.organizationID, project.ID, ids, body.AddTags, body.RemoveTags}
	if !isEditorCatAllFiles(body.SourcePath) {
		sourceFileID, err := api.sourceFileID(r, actor, project, trimEditorCat(body.SourcePath))
		if err != nil {
			return nil, 0, err
		}
		sql += ` and repository_source_file_id=$6`
		args = append(args, sourceFileID)
	}
	tag, err := api.pool.Exec(r.Context(), sql, args...)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `select id::text, tags from project_translation_keys
        where organization_id=$1 and project_id=$2 and id = any($3::uuid[])`,
		actor.organizationID, project.ID, ids)
	if err != nil {
		return nil, 0, err
	}
	segments, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (map[string]any, error) {
		var id string
		var saved []string
		if err := row.Scan(&id, &saved); err != nil {
			return nil, err
		}
		return map[string]any{"externalStringId": id, "tags": saved}, nil
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"updatedCount": tag.RowsAffected(), "segments": segments}, 200, nil
}

func (api *editorCatAPI) setDesignURL(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEditKeyDetails() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath       string  `json:"sourcePath"`
		ExternalStringID string  `json:"externalStringId"`
		DesignURL        *string `json:"designUrl"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if r.PathValue("externalStringId") != trimEditorCat(body.ExternalStringID) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	var link *string
	if body.DesignURL != nil {
		trimmed := trimEditorCat(*body.DesignURL)
		if trimmed != "" {
			if !keymeta.ValidDesignURL(trimmed) {
				return nil, 0, editorCatFailure(400, "invalid_design_url", "Use an http or https address")
			}
			link = &trimmed
		}
	}
	keyID, err := api.requireTranslationKey(r, actor, project, trimEditorCat(body.SourcePath), body.ExternalStringID)
	if err != nil {
		return nil, 0, editorCatFailure(404, "translation_key_not_found", "Translation key not found")
	}
	var saved *string
	err = api.pool.QueryRow(r.Context(), `
        update project_translation_keys set design_url=$2, updated_at=now()
        where id=$1 returning design_url`, keyID, link).Scan(&saved)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "translation_key_not_found", "Translation key not found")
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"segment": map[string]any{"externalStringId": keyID, "designUrl": saved}}, 200, nil
}
