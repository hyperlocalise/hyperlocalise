package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/jackc/pgx/v5"
)

type editorCatApplyMember struct {
	ID                  string `json:"id"`
	SourceRevision      string `json:"sourceRevision"`
	TranslationRevision string `json:"translationRevision"`
}

type editorCatGroupApplyBody struct {
	SourceText   string                 `json:"sourceText"`
	TargetLocale string                 `json:"targetLocale"`
	Text         string                 `json:"text"`
	Members      []editorCatApplyMember `json:"members"`
}

// Lock key rows in a stable order. Lock mutations use the same rows, including
// when no locale translation or lock record exists yet.
func lockEditorCatKeys(ctx context.Context, tx pgx.Tx, actor editorCatActor, project editorCatProject, ids []string) error {
	rows, err := tx.Query(ctx, `select id from project_translation_keys
        where organization_id=$1 and project_id=$2 and id=any($3::uuid[])
        order by id for update`, actor.organizationID, project.ID, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count != len(ids) {
		return editorCatFailure(409, "group_membership_changed", "An occurrence no longer belongs to this project. Refresh the preview.")
	}
	return nil
}

func (api *editorCatAPI) applyStringGroup(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body editorCatGroupApplyBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if strings.TrimSpace(body.TargetLocale) == "" || len(body.TargetLocale) > 128 || len(body.Text) > 100000 || len(body.Members) == 0 || len(body.Members) > 200 || editorCatTextGroupID(body.SourceText) != r.PathValue("groupId") {
		return nil, 0, editorCatFailure(400, "invalid_group_apply", "Select between 1 and 200 text occurrences.")
	}
	ids := make([]string, 0, len(body.Members))
	seen := map[string]bool{}
	for _, m := range body.Members {
		if _, err := uuid.Parse(m.ID); err != nil || seen[m.ID] || m.SourceRevision == "" || m.TranslationRevision == "" {
			return nil, 0, editorCatFailure(400, "invalid_group_apply", "Each occurrence requires unique identity and preview revisions.")
		}
		seen[m.ID] = true
		ids = append(ids, m.ID)
	}
	sort.Slice(body.Members, func(i, j int) bool { return body.Members[i].ID < body.Members[j].ID })
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if err = lockEditorCatKeys(r.Context(), tx, actor, project, ids); err != nil {
		return nil, 0, err
	}
	operationID := uuid.NewString()
	saved := make([]map[string]any, 0, len(body.Members))
	for _, m := range body.Members {
		var source, path, sourceRevision string
		var maxLength *int
		var media, locked bool
		err = tx.QueryRow(r.Context(), `select k.source_text, f.source_path, k.xmin::text, k.max_length,
            `+editorCatGroupSeparatesMediaSQL()+`, exists(select 1 from project_cat_segment_locks l where l.organization_id=$1 and l.project_id=$2 and l.external_string_id=k.id::text and l.target_locale=$4)
            from project_translation_keys k join repository_source_files f on f.id=k.repository_source_file_id
            where k.organization_id=$1 and k.project_id=$2 and k.id=$3`, actor.organizationID, project.ID, m.ID, body.TargetLocale).Scan(&source, &path, &sourceRevision, &maxLength, &media, &locked)
		if err != nil {
			return nil, 0, err
		}
		if source != body.SourceText || sourceRevision != m.SourceRevision || media || editorCatSourceKind(path) == editorCatKindImage || editorCatSourceKind(path) == editorCatKindVideo {
			return nil, 0, editorCatFailure(409, "group_membership_changed", "A source changed since preview. Refresh the preview.")
		}
		if locked {
			return nil, 0, editorCatFailure(409, "group_member_locked", "A selected occurrence is locked. Explicitly deselect it before applying.")
		}
		limit := 0
		if maxLength != nil {
			limit = *maxLength
		}
		for _, check := range segmentvalidate.ValidateSegment(segmentvalidate.Request{SourceText: source, TargetText: body.Text, SourcePath: path, MaxLength: limit, TargetLocale: body.TargetLocale}) {
			if check.Status == segmentvalidate.StatusFail {
				return nil, 0, editorCatFailure(422, "group_member_validation_failed", path+": "+check.Message)
			}
		}
		var before, oldStatus, revision string
		err = tx.QueryRow(r.Context(), `select text,status::text,xmin::text from project_translations where organization_id=$1 and project_id=$2 and translation_key_id=$3 and target_locale=$4 for update`, actor.organizationID, project.ID, m.ID, body.TargetLocale).Scan(&before, &oldStatus, &revision)
		if errors.Is(err, pgx.ErrNoRows) {
			revision = "missing"
			oldStatus = "draft"
		} else if err != nil {
			return nil, 0, err
		}
		if revision != m.TranslationRevision {
			return nil, 0, editorCatFailure(409, "translation_conflict", "A translation changed since preview. Refresh the preview.")
		}
		var translationID, newRevision string
		// A concurrent importer may insert a previously missing translation. Never overwrite it.
		if revision == "missing" {
			err = tx.QueryRow(r.Context(), `insert into project_translations(organization_id,project_id,translation_key_id,target_locale,text,status,provenance)
                values($1,$2,$3,$4,$5,'draft','manual') on conflict(translation_key_id,target_locale) do nothing returning id,xmin::text`, actor.organizationID, project.ID, m.ID, body.TargetLocale, body.Text).Scan(&translationID, &newRevision)
		} else {
			err = tx.QueryRow(r.Context(), `update project_translations set text=$5,status='draft',provenance='manual',reviewed_by_user_id=null,reviewed_at=null,updated_at=now()
                where organization_id=$1 and project_id=$2 and translation_key_id=$3 and target_locale=$4 returning id,xmin::text`, actor.organizationID, project.ID, m.ID, body.TargetLocale, body.Text).Scan(&translationID, &newRevision)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, editorCatFailure(409, "translation_conflict", "A translation changed since preview. Refresh the preview.")
		}
		if err != nil {
			return nil, 0, err
		}
		payload := map[string]any{"projectId": project.ID, "segmentId": m.ID, "sourcePath": path, "targetLocale": body.TargetLocale, "operationId": operationID, "operationMemberIds": ids, "groupSourceText": body.SourceText, "beforeText": before, "afterText": body.Text, "beforeStatus": oldStatus, "nextStatus": "draft", "sourceRevision": sourceRevision, "beforeRevision": revision, "afterRevision": newRevision}
		if err = insertEditorCatActivity(r.Context(), tx, actor, "string_segment_translation_updated", m.ID, payload); err != nil {
			return nil, 0, err
		}
		saved = append(saved, map[string]any{"id": m.ID, "sourcePath": path, "translation": editorCatTranslation{Text: body.Text, ExternalTranslationID: &translationID, Status: "draft", Revision: &newRevision}})
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	return map[string]any{"operationId": operationID, "members": saved}, http.StatusOK, nil
}

func insertEditorCatActivity(ctx context.Context, db dictionaryDB, actor editorCatActor, eventType, segmentID string, payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `insert into organization_activity_events(organization_id,actor_kind,actor_user_id,event_type,target_kind,target_id,payload) values($1,'user',$2,$3,'string_segment',$4,$5::jsonb)`, actor.organizationID, actor.userID, eventType, segmentID, encoded)
	return err
}
