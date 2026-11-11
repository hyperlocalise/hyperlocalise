package main

import (
	"errors"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/sourcetext"
	"github.com/jackc/pgx/v5"
)

// editorCatMaxSourceText matches the public API's limit on a string's source text.
const editorCatMaxSourceText = 100_000

// canEditSourceText is the projects:write roles: the people who manage a project's files.
func (a editorCatActor) canEditSourceText() bool {
	switch a.role {
	case "admin", "localization_manager", "developer":
		return true
	default:
		return false
	}
}

// setSourceText changes a string's source text from the content editor. The project must allow
// editing source text here, and the string must be one the platform can write back
// (`sourcetext`); a string locked in any language refuses it. With the project set to send approved
// translations to review on a source change, they go to review unless the editor marks the
// change as a small fix.
func (api *editorCatAPI) setSourceText(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEditSourceText() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath       string `json:"sourcePath"`
		ExternalStringID string `json:"externalStringId"`
		SourceText       string `json:"sourceText"`
		KeepApproved     bool   `json:"keepApproved"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if r.PathValue("externalStringId") != trimEditorCat(body.ExternalStringID) || strings.TrimSpace(body.SourceText) == "" ||
		len(body.SourceText) > editorCatMaxSourceText || !sourcetext.ValidText(body.SourceText) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	keyID, err := api.requireTranslationKey(r, actor, project, trimEditorCat(body.SourcePath), body.ExternalStringID)
	if err != nil {
		return nil, 0, err
	}

	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var editable, needsReview bool
	if err := tx.QueryRow(ctx, `
        select p.source_text_editable, p.approved_translations_on_source_change = 'needs_review'
        from projects p where p.id=$1 and p.organization_id=$2`,
		project.ID, actor.organizationID,
	).Scan(&editable, &needsReview); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, missingEditorCatProject()
		}
		return nil, 0, err
	}
	if !editable {
		return nil, 0, editorCatFailure(409, "source_text_not_editable", "Source text editing is off for this project")
	}
	// The same lock translation writers and imports take, so the change and its review reset
	// land together.
	var current string
	var editableHere bool
	err = tx.QueryRow(ctx, `
        select k.source_text, `+sourcetext.KeyEditableSQL("k")+`
        from project_translation_keys k
        where k.id=$1 and k.organization_id=$2 and k.project_id=$3
        for no key update of k`, keyID, actor.organizationID, project.ID).Scan(&current, &editableHere)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
	}
	if err != nil {
		return nil, 0, err
	}
	if !editableHere {
		return nil, 0, editorCatFailure(409, "source_text_not_editable", "This string's source text can't be edited here: it is hidden, or its file isn't a JSON, JSONC or ARB file uploaded by people or synced from a repository (upload the file again if it predates that being recorded)")
	}
	var locked bool
	if err := tx.QueryRow(ctx, `
        select exists (
            select 1 from project_cat_segment_locks
            where organization_id=$1 and project_id=$2 and external_string_id=$3::text
        )`, actor.organizationID, project.ID, keyID).Scan(&locked); err != nil {
		return nil, 0, err
	}
	if locked {
		return nil, 0, editorCatFailure(409, "segment_locked", "This string is locked in at least one language; unlock it to change its source text")
	}
	segment := map[string]any{"externalStringId": keyID, "sourceText": body.SourceText}
	if current == body.SourceText {
		return map[string]any{"segment": segment}, 200, nil
	}
	// The text before the first edit is the base the next import compares with, so it is
	// recorded now if no import has recorded it yet.
	if _, err := tx.Exec(ctx, `
        update project_translation_keys
        set source_text=$2, normalized_source_text=$3, updated_at=now(),
            imported_source_text=case when repository_source_file_id is null then imported_source_text
                else coalesce(imported_source_text, source_text) end
        where id=$1`, keyID, body.SourceText, normalizeMemorySourceText(body.SourceText)); err != nil {
		return nil, 0, err
	}
	// Surrounding whitespace alone is not a source change, as on import and the public API.
	if needsReview && !body.KeepApproved && strings.TrimSpace(current) != strings.TrimSpace(body.SourceText) {
		if err := sendEditorCatApprovedTranslationsToReview(r, tx, actor, project, keyID); err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return map[string]any{"segment": segment}, 200, nil
}

// sendEditorCatApprovedTranslationsToReview moves a key's approved translations to needs_review,
// keeping their text, and records a revision for each with the editor as the actor. A locked
// translation stays approved; the caller already refused a locked string.
func sendEditorCatApprovedTranslationsToReview(r *http.Request, tx pgx.Tx, actor editorCatActor, project editorCatProject, keyID string) error {
	ctx := r.Context()
	// A translation with no revision yet gets one for its approved state first, so the history
	// shows what it was before.
	if _, err := tx.Exec(ctx, `
        insert into project_translation_revisions (
            organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
            provenance, origin, source_job_id, actor_kind, created_at
        )
        select t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, t.text, t.status,
            t.provenance, t.origin, t.source_job_id,
            case t.provenance when 'agent' then 'agent' when 'manual' then 'user' else 'system' end,
            t.updated_at
        from project_translations t
        where t.organization_id=$1 and t.project_id=$2 and t.translation_key_id=$3
            and t.status='approved'
            and not exists (select 1 from project_translation_revisions r where r.translation_id = t.id)`,
		actor.organizationID, project.ID, keyID,
	); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
        with moved as (
            update project_translations
            set status='needs_review', reviewed_by_user_id=null, reviewed_at=null, updated_at=now()
            where organization_id=$1 and project_id=$2 and translation_key_id=$3 and status='approved'
            returning organization_id, project_id, id, translation_key_id, target_locale, text, status,
                provenance, origin, source_job_id
        )
        insert into project_translation_revisions (
            organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
            provenance, origin, source_job_id, actor_kind, actor_user_id, created_at
        )
        select organization_id, project_id, id, translation_key_id, target_locale, text, status,
            provenance, origin, source_job_id, 'user', $4::uuid, clock_timestamp()
        from moved`,
		actor.organizationID, project.ID, keyID, actor.userID,
	)
	return err
}
