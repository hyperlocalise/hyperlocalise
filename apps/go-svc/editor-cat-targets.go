package main

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
)

const (
	editorCatTargetMaxSegments = 50
	editorCatTargetMaxLocales  = 8
	editorCatTargetMaxCells    = 200
)

type editorCatTargetIdentity struct {
	ExternalStringID string `json:"externalStringId"`
	SourcePath       string `json:"sourcePath"`
}

type editorCatTargetsBody struct {
	Segments      []editorCatTargetIdentity `json:"segments"`
	TargetLocales []string                  `json:"targetLocales"`
}

type editorCatTargetRow struct {
	editorCatTargetIdentity
	Targets map[string]*editorCatTranslation `json:"targets"`
}

func (body *editorCatTargetsBody) validate() error {
	invalid := func() error { return editorCatFailure(400, "invalid_project_payload", "Invalid translation rectangle") }
	if len(body.Segments) == 0 || len(body.Segments) > editorCatTargetMaxSegments ||
		len(body.TargetLocales) == 0 || len(body.TargetLocales) > editorCatTargetMaxLocales ||
		len(body.Segments)*len(body.TargetLocales) > editorCatTargetMaxCells {
		return invalid()
	}
	seen := make(map[editorCatTargetIdentity]bool)
	for i := range body.Segments {
		segment := &body.Segments[i]
		segment.ExternalStringID = strings.TrimSpace(segment.ExternalStringID)
		segment.SourcePath = strings.TrimSpace(segment.SourcePath)
		if segment.ExternalStringID == "" || len(segment.ExternalStringID) > 128 ||
			segment.SourcePath == "" || len(segment.SourcePath) > 2048 || seen[*segment] {
			return invalid()
		}
		if !isEditorCatWholeFile(segment.SourcePath) && uuid.Validate(segment.ExternalStringID) != nil {
			return invalid()
		}
		seen[*segment] = true
	}
	locales := make(map[string]bool)
	for i, raw := range body.TargetLocales {
		locale := strings.TrimSpace(raw)
		if locale == "" || len(locale) > 32 || locales[locale] {
			return invalid()
		}
		locales[locale] = true
		body.TargetLocales[i] = locale
	}
	return nil
}

func (api *editorCatAPI) getSegmentTargets(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body editorCatTargetsBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if err := body.validate(); err != nil {
		return nil, 0, err
	}
	targets, err := api.loadSegmentTargets(r, actor, project, body)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"targets": targets}, http.StatusOK, nil
}

// One tenant-scoped query reads the entire rectangle, including missing translations.
// Joining keys before translations distinguishes missing targets from inaccessible keys.
func (api *editorCatAPI) loadSegmentTargets(r *http.Request, actor editorCatActor, project editorCatProject, body editorCatTargetsBody) ([]editorCatTargetRow, error) {
	ids, paths, kinds := make([]string, len(body.Segments)), make([]string, len(body.Segments)), make([]string, len(body.Segments))
	result := make([]editorCatTargetRow, len(body.Segments))
	for i, segment := range body.Segments {
		ids[i], paths[i], kinds[i] = segment.ExternalStringID, segment.SourcePath, string(editorCatSourceKind(segment.SourcePath))
		result[i] = editorCatTargetRow{editorCatTargetIdentity: segment, Targets: make(map[string]*editorCatTranslation)}
	}
	rows, err := api.pool.Query(r.Context(), `
        with requested as (
            select * from unnest($3::text[], $4::text[], $5::text[]) with ordinality as r(id, path, kind, ordinal)
        ), cells as (
            select r.ordinal, l.locale, t.id::text, t.text, t.status::text,
                   coalesce(k.metadata->>'contentKind', 'text') as kind, null::text as stored_file_id,
                   t.updated_at::text as revision
            from requested r
            join project_translation_keys k on k.id = case when r.kind='text' then r.id::uuid end
                and k.organization_id=$1 and k.project_id=$2
            left join repository_source_files f on f.id=k.repository_source_file_id
            cross join unnest($6::text[]) l(locale)
            left join project_translations t on t.translation_key_id=k.id and t.target_locale=l.locale
                and t.organization_id=$1 and t.project_id=$2
            where r.kind='text' and (r.path='*' or f.source_path=r.path)
            union all
            select r.ordinal, l.locale, v.id::text, ''::text, v.status::text, r.kind, v.stored_file_id::text, v.updated_at::text
            from requested r
            join repository_source_files f on f.organization_id=$1 and f.project_id=$2 and f.source_path=r.path
                and (r.id=f.id::text or r.id in ('binary:'||r.path, 'image:'||r.path, 'video:'||r.path))
            cross join unnest($6::text[]) l(locale)
            left join project_image_variants v on v.organization_id=$1 and v.project_id=$2
                and v.source_path=r.path and v.target_locale=l.locale
            where r.kind not in ('text', 'video_file')
            union all
            select r.ordinal, l.locale, v.id::text, ''::text, v.status::text, r.kind, v.stored_file_id::text, v.updated_at::text
            from requested r
            join repository_source_files f on f.organization_id=$1 and f.project_id=$2 and f.source_path=r.path
                and (r.id=f.id::text or r.id in ('binary:'||r.path, 'video:'||r.path))
            cross join unnest($6::text[]) l(locale)
            left join project_video_variants v on v.organization_id=$1 and v.project_id=$2
                and v.source_path=r.path and v.target_locale=l.locale
            where r.kind='video_file'
        ) select ordinal, locale, id, text, status, kind, stored_file_id, revision from cells`,
		actor.organizationID, project.ID, ids, paths, kinds, body.TargetLocales)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var ordinal int
		var locale, kind string
		var id, text, status, storedFileID, revision *string
		if err := rows.Scan(&ordinal, &locale, &id, &text, &status, &kind, &storedFileID, &revision); err != nil {
			return nil, err
		}
		var target *editorCatTranslation
		if id != nil {
			target = &editorCatTranslation{ExternalTranslationID: id, Revision: revision}
			if text != nil {
				target.Text = *text
			}
			if status != nil {
				target.Status, target.IsApproved = *status, *status == "approved"
			}
			if kind != "text" {
				target.ContentKind = &kind
				if kind == "image_url" || kind == "video_url" {
					target.TargetAssetURL = text
				} else {
					target.ImageVariantID = id
					if storedFileID != nil {
						asset := editorCatAssetPath(actor.organizationSlug, project.ID, *storedFileID)
						target.TargetAssetURL, target.Text = &asset, asset
					}
				}
			}
		}
		result[ordinal-1].Targets[locale] = target
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, row := range result {
		if len(row.Targets) != len(body.TargetLocales) {
			return nil, editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
		}
	}
	return result, nil
}
