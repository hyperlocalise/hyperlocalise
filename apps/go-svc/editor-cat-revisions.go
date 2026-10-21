package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const editorCatMaxOperationIDLength = 200

// editorCatTranslationSnapshot is a project_translations row as it was before a write.
type editorCatTranslationSnapshot struct {
	id, text, status, provenance string
	sourceJobID                  *string
	updatedAt                    time.Time
	revision                     string
}

// lockEditorCatTranslation locks and reads the translation a write is about to change. It
// returns nil when the string has no translation in the locale yet.
//
// The key row is locked first, because a translation that does not exist yet has no row to
// lock. The web app's writers (lockProjectTranslationKeys) take the same lock, so every write
// to a key, its snapshot and its revision run one at a time.
func lockEditorCatTranslation(ctx context.Context, db dictionaryDB, organizationID, keyID, targetLocale string) (*editorCatTranslationSnapshot, error) {
	if _, err := db.Exec(ctx, `
        select 1 from project_translation_keys
        where organization_id=$1 and id=$2
        for no key update`,
		organizationID, keyID,
	); err != nil {
		return nil, err
	}
	var snapshot editorCatTranslationSnapshot
	err := db.QueryRow(ctx, `
        select id, text, status::text, provenance::text, source_job_id, updated_at, xmin::text
        from project_translations
        where organization_id=$1 and translation_key_id=$2 and target_locale=$3
        for update`,
		organizationID, keyID, targetLocale,
	).Scan(&snapshot.id, &snapshot.text, &snapshot.status, &snapshot.provenance, &snapshot.sourceJobID, &snapshot.updatedAt, &snapshot.revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}

type editorCatRevisionWrite struct {
	translationID          string
	before                 *editorCatTranslationSnapshot
	afterText, afterStatus string
	actorUserID            string
	operationID            string
	restoredFromRevisionID string
}

// recordEditorCatRevision appends the translation's current state to its history. The first
// change to a translation with no history also keeps its earlier state as a baseline, so the
// change can be undone. It returns "" when the write left text and status unchanged.
func recordEditorCatRevision(ctx context.Context, db dictionaryDB, organizationID string, write editorCatRevisionWrite) (string, error) {
	if before := write.before; before != nil {
		if before.text == write.afterText && before.status == write.afterStatus {
			return "", nil
		}
		if _, err := db.Exec(ctx, `
            insert into project_translation_revisions (
                organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
                provenance, source_job_id, actor_kind, created_at
            )
            select t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, $3::text,
                $4::text::project_translation_status, $5::text::project_translation_provenance, $6::text,
                case $5::text when 'agent' then 'agent' when 'manual' then 'user' else 'system' end,
                $7::timestamptz
            from project_translations t
            where t.id=$1 and t.organization_id=$2
                and not exists (select 1 from project_translation_revisions r where r.translation_id=$1)`,
			write.translationID, organizationID, before.text, before.status, before.provenance, before.sourceJobID, before.updatedAt,
		); err != nil {
			return "", err
		}
	}
	var revisionID string
	err := db.QueryRow(ctx, `
        insert into project_translation_revisions (
            organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
            provenance, source_job_id, actor_kind, actor_user_id, operation_id, restored_from_revision_id, created_at
        )
        select t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, t.text, t.status,
            t.provenance, t.source_job_id, 'user', $3::uuid, nullif($4::text, ''), nullif($5::text, '')::uuid,
            clock_timestamp()
        from project_translations t
        where t.id=$1 and t.organization_id=$2
        returning id`,
		write.translationID, organizationID, write.actorUserID, write.operationID, write.restoredFromRevisionID,
	).Scan(&revisionID)
	return revisionID, err
}

type editorCatRevisionView struct {
	Actor                  activityLogActorView `json:"actor"`
	CreatedAt              string               `json:"createdAt"`
	ID                     string               `json:"id"`
	IsCurrent              bool                 `json:"isCurrent"`
	OperationID            *string              `json:"operationId"`
	Provenance             string               `json:"provenance"`
	RestoredFromRevisionID *string              `json:"restoredFromRevisionId"`
	SourceJobID            *string              `json:"sourceJobId"`
	Status                 string               `json:"status"`
	Text                   string               `json:"text"`
}

func (api *editorCatAPI) listSegmentRevisions(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	query := r.URL.Query()
	sourcePath, err := requireEditorCatQuery(query, "sourcePath", 2048)
	if err != nil {
		return nil, 0, err
	}
	targetLocale, err := requireEditorCatQuery(query, "targetLocale", 64)
	if err != nil {
		return nil, 0, err
	}
	limit, err := parseEditorCatIntQuery(query, "limit", editorCatDefaultLimit, 1, editorCatMaxLimit)
	if err != nil {
		return nil, 0, err
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, r.PathValue("externalStringId"))
	if err != nil {
		return nil, 0, err
	}
	fingerprint := "cat-revisions:" + project.ID + ":" + keyID + ":" + targetLocale
	args := []any{actor.organizationID, project.ID, keyID, targetLocale}
	cursorSQL := ""
	if raw := trimEditorCat(query.Get("cursor")); raw != "" {
		decoded, err := decodeActivityLogCursor(raw, fingerprint)
		if err != nil {
			return nil, 0, editorCatFailure(400, "invalid_revision_cursor", "Revision cursor is invalid")
		}
		cursorSQL = " and (r.created_at, r.id) < ($5, $6::uuid)"
		args = append(args, decoded.createdAt, decoded.id)
	}
	args = append(args, limit+1)
	rows, err := api.pool.Query(r.Context(), `
        select r.id, r.text, r.status::text, r.provenance::text, r.source_job_id, r.actor_kind, r.actor_user_id,
            u.first_name, u.last_name, r.operation_id, r.restored_from_revision_id, r.created_at,
            r.id = (
                select latest.id from project_translation_revisions latest
                where latest.translation_id = r.translation_id
                order by latest.created_at desc, latest.id desc
                limit 1
            )
        from project_translation_revisions r
        left join users u on u.id = r.actor_user_id
        where r.organization_id=$1 and r.project_id=$2 and r.translation_key_id=$3 and r.target_locale=$4`+cursorSQL+`
        order by r.created_at desc, r.id desc
        limit $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	revisions := make([]editorCatRevisionView, 0)
	createdAts := make([]time.Time, 0)
	for rows.Next() {
		var view editorCatRevisionView
		var actorKind string
		var actorUserID, firstName, lastName *string
		var createdAt time.Time
		if err := rows.Scan(&view.ID, &view.Text, &view.Status, &view.Provenance, &view.SourceJobID, &actorKind, &actorUserID,
			&firstName, &lastName, &view.OperationID, &view.RestoredFromRevisionID, &createdAt, &view.IsCurrent); err != nil {
			return nil, 0, err
		}
		view.Actor = activityLogActorViewFromRow(actorKind, actorUserID, nil, firstName, lastName, nil)
		view.CreatedAt = formatActivityLogTime(createdAt)
		revisions = append(revisions, view)
		createdAts = append(createdAts, createdAt)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var nextCursor *string
	if len(revisions) > limit {
		revisions = revisions[:limit]
		last := limit - 1
		encoded := encodeActivityLogCursor(activityLogCursor{createdAt: createdAts[last], id: revisions[last].ID}, fingerprint)
		nextCursor = &encoded
	}
	return map[string]any{"revisions": revisions, "nextCursor": nextCursor}, 200, nil
}

// editorCatRestoreTarget is the state a translation is put back to.
type editorCatRestoreTarget struct {
	text, status, provenance string
	sourceJobID              *string
	restoredFromRevisionID   string
}

// applyEditorCatRestore writes target over the locked translation, records the revision and the
// activity event, and returns the saved translation with the new revision id ("" when nothing
// changed).
func applyEditorCatRestore(ctx context.Context, tx pgx.Tx, actor editorCatActor, project editorCatProject, keyID, targetLocale string, before editorCatTranslationSnapshot, target editorCatRestoreTarget, operationID string) (editorCatTranslation, string, error) {
	var reviewedAt *time.Time
	var reviewedBy *string
	if target.status == "approved" || target.status == "rejected" {
		now := time.Now().UTC()
		reviewedAt = &now
		reviewedBy = &actor.userID
	}
	var id, text, status, afterRevision, occurrencePath string
	err := tx.QueryRow(ctx, `
        with saved as (
            update project_translations
            set text=$3, status=$4::text::project_translation_status, provenance=$5::text::project_translation_provenance,
                source_job_id=$6, reviewed_at=$7, reviewed_by_user_id=$8, updated_at=now()
            where id=$1 and organization_id=$2
            returning id, translation_key_id, text, status::text as status, xmin::text as revision
        )
        select saved.id, saved.text, saved.status, saved.revision, coalesce(f.source_path, '')
        from saved
        join project_translation_keys k on k.id = saved.translation_key_id
        left join repository_source_files f on f.id = k.repository_source_file_id`,
		before.id, actor.organizationID, target.text, target.status, target.provenance, target.sourceJobID, reviewedAt, reviewedBy,
	).Scan(&id, &text, &status, &afterRevision, &occurrencePath)
	if err != nil {
		return editorCatTranslation{}, "", err
	}
	saved := editorCatTranslation{
		Text:                  text,
		ExternalTranslationID: &id,
		IsApproved:            status == "approved",
		Status:                status,
		Revision:              &afterRevision,
	}
	revisionID, err := recordEditorCatRevision(ctx, tx, actor.organizationID, editorCatRevisionWrite{
		translationID:          before.id,
		before:                 &before,
		afterText:              text,
		afterStatus:            status,
		actorUserID:            actor.userID,
		operationID:            operationID,
		restoredFromRevisionID: target.restoredFromRevisionID,
	})
	if err != nil || revisionID == "" {
		return saved, "", err
	}
	groupID, err := queryEditorCatGroupID(ctx, tx, actor.organizationID, project.ID, keyID)
	if err != nil {
		return editorCatTranslation{}, "", err
	}
	payload := map[string]any{
		"projectId": project.ID, "segmentId": keyID, "sourcePath": occurrencePath, "targetLocale": targetLocale,
		"groupId": groupID, "beforeRevision": before.revision, "afterRevision": afterRevision, "nextStatus": status,
		"revisionId": revisionID,
	}
	if target.restoredFromRevisionID != "" {
		payload["restoredFromRevisionId"] = target.restoredFromRevisionID
	}
	if operationID != "" {
		payload["operationId"] = operationID
	}
	insertEditorCatActivity(ctx, tx, actor, "string_segment_translation_updated", keyID, payload)
	return saved, revisionID, nil
}

func (api *editorCatAPI) restoreSegmentRevision(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath   string `json:"sourcePath"`
		TargetLocale string `json:"targetLocale"`
		// ExpectedCurrentRevisionID rejects the restore when someone saved after the history was read.
		ExpectedCurrentRevisionID *string `json:"expectedCurrentRevisionId"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	if sourcePath == "" || targetLocale == "" {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	revisionID, err := parseEditorCatUUID(r.PathValue("revisionId"))
	if err != nil {
		return nil, 0, editorCatFailure(404, "cat_revision_not_found", "Revision not found")
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, trimEditorCat(r.PathValue("externalStringId")))
	if err != nil {
		return nil, 0, err
	}
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	// Locking a segment takes this key lock too, so the lock check below holds until commit.
	if err := lockEditorCatKeys(r.Context(), tx, actor, project, []string{keyID}); err != nil {
		return nil, 0, err
	}
	locked, err := editorCatLockedKeyIDs(r, tx, actor, project, targetLocale, []string{keyID})
	if err != nil {
		return nil, 0, err
	}
	if locked[canonicalEditorCatID(keyID)] {
		return nil, 0, editorCatFailure(409, "cat_segment_locked", "This string is locked")
	}
	before, err := lockEditorCatTranslation(r.Context(), tx, actor.organizationID, keyID, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	if before == nil {
		return nil, 0, editorCatFailure(404, "cat_revision_not_found", "Revision not found")
	}
	target := editorCatRestoreTarget{restoredFromRevisionID: revisionID}
	err = tx.QueryRow(r.Context(), `
        select text, status::text, provenance::text, source_job_id
        from project_translation_revisions
        where id=$1 and organization_id=$2 and project_id=$3 and translation_id=$4`,
		revisionID, actor.organizationID, project.ID, before.id,
	).Scan(&target.text, &target.status, &target.provenance, &target.sourceJobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "cat_revision_not_found", "Revision not found")
	}
	if err != nil {
		return nil, 0, err
	}
	if body.ExpectedCurrentRevisionID != nil {
		latest, err := latestEditorCatRevision(r.Context(), tx, before.id)
		if err != nil {
			return nil, 0, err
		}
		if canonicalEditorCatID(latest.id) != canonicalEditorCatID(*body.ExpectedCurrentRevisionID) {
			return nil, 0, editorCatFailure(409, "cat_revision_conflict", "This string changed after its history was loaded")
		}
	}
	saved, newRevisionID, err := applyEditorCatRestore(r.Context(), tx, actor, project, keyID, targetLocale, *before, target, "")
	if err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	noteRequest(r, "target_locale", targetLocale, "translation_status", saved.Status)
	var revisionView *string
	if newRevisionID != "" {
		revisionView = &newRevisionID
	}
	return map[string]any{"translation": saved, "revisionId": revisionView}, 200, nil
}

type editorCatLatestRevision struct {
	id, operationID string
}

func latestEditorCatRevision(ctx context.Context, db dictionaryDB, translationID string) (editorCatLatestRevision, error) {
	var latest editorCatLatestRevision
	err := db.QueryRow(ctx, `
        select id, coalesce(operation_id, '')
        from project_translation_revisions
        where translation_id=$1
        order by created_at desc, id desc
        limit 1`, translationID).Scan(&latest.id, &latest.operationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return editorCatLatestRevision{}, nil
	}
	return latest, err
}

// undoOperation puts every translation an operation (a group save, translation job, import or
// earlier undo) wrote back to its version from before the operation. Translations changed since,
// or locked, are left alone and counted; ones the operation created become untranslated again.
func (api *editorCatAPI) undoOperation(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	operationID := trimEditorCat(r.PathValue("operationId"))
	if operationID == "" || len(operationID) > editorCatMaxOperationIDLength {
		return nil, 0, editorCatFailure(404, "cat_operation_not_found", "Operation not found")
	}
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	type operationMember struct {
		translationID, keyID, targetLocale string
		firstWrittenAt                     time.Time
		firstRevisionID                    string
	}
	rows, err := tx.Query(r.Context(), `
        select distinct on (translation_id) translation_id, translation_key_id, target_locale, created_at, id
        from project_translation_revisions
        where organization_id=$1 and project_id=$2 and operation_id=$3
        order by translation_id, created_at, id
        limit $4`,
		actor.organizationID, project.ID, operationID, editorCatMaxGroupSaveOccurrences+1)
	if err != nil {
		return nil, 0, err
	}
	members := make([]operationMember, 0)
	for rows.Next() {
		var member operationMember
		if err := rows.Scan(&member.translationID, &member.keyID, &member.targetLocale, &member.firstWrittenAt, &member.firstRevisionID); err != nil {
			rows.Close()
			return nil, 0, err
		}
		members = append(members, member)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if len(members) == 0 {
		return nil, 0, editorCatFailure(404, "cat_operation_not_found", "Operation not found")
	}
	if len(members) > editorCatMaxGroupSaveOccurrences {
		return nil, 0, editorCatFailure(400, "cat_operation_too_large", "This operation changed too many strings to undo at once")
	}

	keyIDs := make([]string, 0, len(members))
	keysByLocale := map[string][]string{}
	for _, member := range members {
		keyIDs = append(keyIDs, member.keyID)
		keysByLocale[member.targetLocale] = append(keysByLocale[member.targetLocale], member.keyID)
	}
	if err := lockEditorCatKeys(r.Context(), tx, actor, project, uniqueEditorCatIDs(keyIDs, editorCatMaxGroupSaveOccurrences)); err != nil {
		return nil, 0, err
	}
	lockedByLocale := map[string]map[string]bool{}
	for locale, ids := range keysByLocale {
		locked, err := editorCatLockedKeyIDs(r, tx, actor, project, locale, ids)
		if err != nil {
			return nil, 0, err
		}
		lockedByLocale[locale] = locked
	}

	undoID := "undo:" + uuid.NewString()
	restored, skippedChanged, skippedLocked := 0, 0, 0
	for _, member := range members {
		if lockedByLocale[member.targetLocale][canonicalEditorCatID(member.keyID)] {
			skippedLocked++
			continue
		}
		before, err := lockEditorCatTranslation(r.Context(), tx, actor.organizationID, member.keyID, member.targetLocale)
		if err != nil {
			return nil, 0, err
		}
		if before == nil {
			continue
		}
		latest, err := latestEditorCatRevision(r.Context(), tx, member.translationID)
		if err != nil {
			return nil, 0, err
		}
		if latest.operationID != operationID {
			skippedChanged++
			continue
		}
		target := editorCatRestoreTarget{status: "draft", provenance: before.provenance}
		var previousID string
		err = tx.QueryRow(r.Context(), `
            select id, text, status::text, provenance::text, source_job_id
            from project_translation_revisions
            where translation_id=$1 and (created_at, id) < ($2, $3::uuid)
            order by created_at desc, id desc
            limit 1`,
			member.translationID, member.firstWrittenAt, member.firstRevisionID,
		).Scan(&previousID, &target.text, &target.status, &target.provenance, &target.sourceJobID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, err
		}
		target.restoredFromRevisionID = previousID
		_, revisionID, err := applyEditorCatRestore(r.Context(), tx, actor, project, member.keyID, member.targetLocale, *before, target, undoID)
		if err != nil {
			return nil, 0, err
		}
		if revisionID != "" {
			restored++
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	noteRequest(r, "restored", restored, "skipped_changed", skippedChanged, "skipped_locked", skippedLocked)
	return map[string]any{
		"operationId":         undoID,
		"restoredCount":       restored,
		"skippedChangedCount": skippedChanged,
		"skippedLockedCount":  skippedLocked,
	}, 200, nil
}
