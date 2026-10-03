package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/jackc/pgx/v5"
)

// Identical source strings form a group. Grouped queues show one representative per group,
// and a grouped save writes every unlocked occurrence in the same queue scope. Original key
// identities and per-key translations stay intact.

type editorCatSaveGroupScope struct {
	SourcePath  string   `json:"sourcePath"`
	SourcePaths []string `json:"sourcePaths"`
	// OccurrenceIDs narrows a save to one translation variant. IDs outside the group are ignored.
	OccurrenceIDs []string `json:"occurrenceIds"`
}

type editorCatGroupOccurrence struct {
	ID         string `json:"id"`
	Key        string `json:"key"`
	SourcePath string `json:"sourcePath"`
	IsLocked   bool   `json:"isLocked"`
}

// editorCatGroupVariant is one distinct translation shared by some occurrences of a group.
type editorCatGroupVariant struct {
	Text        string                     `json:"text"`
	IsApproved  bool                       `json:"isApproved"`
	Occurrences []editorCatGroupOccurrence `json:"occurrences"`
}

func (api *editorCatAPI) getSegmentGroupVariants(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	query := r.URL.Query()
	targetLocale, err := requireEditorCatQuery(query, "targetLocale", 32)
	if err != nil {
		return nil, 0, err
	}
	scopePath, err := requireEditorCatQuery(query, "groupSourcePath", 2048)
	if err != nil {
		return nil, 0, err
	}
	sourcePath, err := requireEditorCatQuery(query, "sourcePath", 2048)
	if err != nil {
		return nil, 0, err
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, r.PathValue("externalStringId"))
	if err != nil {
		return nil, 0, err
	}
	scope := editorCatSaveGroupScope{SourcePath: scopePath, SourcePaths: parseEditorCatSourcePaths(query.Get("groupSourcePaths"))}
	ids, err := api.editorCatGroupOccurrenceIDs(r, actor, project, keyID, scope)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `
        select k.id::text, k.key, f.source_path, coalesce(t.text, ''), coalesce(t.status::text, 'draft'),
            exists(select 1 from project_cat_segment_locks l where l.organization_id=$1 and l.project_id=$2
                and l.target_locale=$3 and l.external_string_id=k.id::text)
        from project_translation_keys k
        join repository_source_files f on f.id=k.repository_source_file_id
        left join project_translations t on t.translation_key_id=k.id and t.target_locale=$3
            and t.organization_id=$1 and t.project_id=$2
        where k.organization_id=$1 and k.project_id=$2 and k.id=any($4::uuid[])
        order by f.source_path, k.key, k.id`, actor.organizationID, project.ID, targetLocale, ids)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	variants := []*editorCatGroupVariant{}
	byText := map[string]*editorCatGroupVariant{}
	for rows.Next() {
		var occurrence editorCatGroupOccurrence
		var text, status string
		if err := rows.Scan(&occurrence.ID, &occurrence.Key, &occurrence.SourcePath, &text, &status, &occurrence.IsLocked); err != nil {
			return nil, 0, err
		}
		variant := byText[text]
		if variant == nil {
			variant = &editorCatGroupVariant{Text: text, IsApproved: true}
			byText[text] = variant
			variants = append(variants, variant)
		}
		variant.IsApproved = variant.IsApproved && status == "approved"
		variant.Occurrences = append(variant.Occurrences, occurrence)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"variants": variants}, http.StatusOK, nil
}

func parseEditorCatSourcePaths(raw string) []string {
	paths := []string{}
	seen := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		path := trimEditorCat(part)
		if path == "" || seen[path] {
			continue
		}
		seen[path] = true
		paths = append(paths, path)
	}
	return paths
}

const editorCatMaxGroupSaveOccurrences = 1000

func queryEditorCatGroupID(ctx context.Context, db dictionaryDB, organizationID, projectID, segmentID string) (string, error) {
	var groupID string
	err := db.QueryRow(ctx, `select encode(sha256(convert_to(`+editorCatGroupIdentitySQL()+`, 'UTF8')), 'hex')
        from project_translation_keys k
        join repository_source_files f on f.id=k.repository_source_file_id
            and f.organization_id=k.organization_id and f.project_id=k.project_id
        where k.organization_id=$1 and k.project_id=$2 and k.id=$3`, organizationID, projectID, segmentID).Scan(&groupID)
	return groupID, err
}

// editorCatGroupOccurrenceIDs returns every key in the queue scope whose source is identical
// to keyID. Media strings stay separate, so they only match themselves.
func (api *editorCatAPI) editorCatGroupOccurrenceIDs(r *http.Request, actor editorCatActor, project editorCatProject, keyID string, scope editorCatSaveGroupScope) ([]string, error) {
	paths := scope.SourcePaths
	if paths == nil {
		paths = []string{}
	}
	identity := editorCatGroupIdentitySQL()
	rows, err := api.pool.Query(r.Context(), `
        select k.id::text
        from project_translation_keys k
        join repository_source_files f on f.id=k.repository_source_file_id
            and f.organization_id=k.organization_id and f.project_id=k.project_id
        where k.organization_id=$1 and k.project_id=$2
            and ($3='*' or f.source_path=$3)
            and (cardinality($4::text[])=0 or f.source_path=any($4::text[]))
            and `+identity+` = (
                select `+identity+`
                from project_translation_keys rk
                join repository_source_files rf on rf.id=rk.repository_source_file_id
                    and rf.organization_id=rk.organization_id and rf.project_id=rk.project_id
                where rk.organization_id=$1 and rk.project_id=$2 and rk.id=$5
            )
        order by k.id
        limit $6`, actor.organizationID, project.ID, trimEditorCat(scope.SourcePath), paths, keyID, editorCatMaxGroupSaveOccurrences+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]string, 0)
	includesKey := false
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		includesKey = includesKey || id == keyID
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) > editorCatMaxGroupSaveOccurrences {
		return nil, editorCatFailure(422, "group_too_large", "This string has too many occurrences to update at once. Narrow the file selection.")
	}
	if !includesKey {
		ids = append(ids, keyID)
	}
	if len(scope.OccurrenceIDs) == 0 {
		return ids, nil
	}
	requested := map[string]bool{keyID: true}
	for _, id := range scope.OccurrenceIDs {
		requested[id] = true
	}
	narrowed := make([]string, 0, len(scope.OccurrenceIDs)+1)
	for _, id := range ids {
		if requested[id] {
			narrowed = append(narrowed, id)
		}
	}
	return narrowed, nil
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
		return editorCatFailure(409, "group_membership_changed", "An occurrence no longer belongs to this project. Refresh and try again.")
	}
	return nil
}

func editorCatLockedKeyIDs(r *http.Request, tx pgx.Tx, actor editorCatActor, project editorCatProject, targetLocale string, keyIDs []string) (map[string]bool, error) {
	rows, err := tx.Query(r.Context(), `select external_string_id from project_cat_segment_locks
        where organization_id=$1 and project_id=$2 and target_locale=$3 and external_string_id=any($4::text[])`,
		actor.organizationID, project.ID, targetLocale, keyIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	locked := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		locked[id] = true
	}
	return locked, rows.Err()
}

func editorCatValidateTargetText(sourceText, sourcePath, targetText, targetLocale string, maxLength *int) error {
	limit := 0
	if maxLength != nil && *maxLength > 0 {
		limit = *maxLength
	}
	for _, check := range segmentvalidate.ValidateSegment(segmentvalidate.Request{
		SourceText: sourceText, TargetText: targetText, SourcePath: sourcePath, MaxLength: limit, TargetLocale: targetLocale,
	}) {
		if check.Status == segmentvalidate.StatusFail {
			return editorCatFailure(422, "group_member_validation_failed", sourcePath+": "+check.Message)
		}
	}
	return nil
}

func insertEditorCatActivity(ctx context.Context, db dictionaryDB, actor editorCatActor, eventType, segmentID string, payload map[string]any) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		slog.ErrorContext(ctx, "editor_cat_activity_encode_failed", "event_type", eventType)
		return
	}
	if _, err = db.Exec(ctx, `insert into organization_activity_events(organization_id,actor_kind,actor_user_id,event_type,target_kind,target_id,payload) values($1,'user',$2,$3,'string_segment',$4,$5::jsonb)`, actor.organizationID, actor.userID, eventType, segmentID, encoded); err != nil {
		slog.ErrorContext(ctx, "editor_cat_activity_insert_failed", "event_type", eventType)
	}
}
