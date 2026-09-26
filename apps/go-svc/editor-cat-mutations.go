package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type editorCatTranslation struct {
	Revision              *string `json:"revision,omitempty"`
	Text                  string  `json:"text"`
	ExternalTranslationID *string `json:"externalTranslationId"`
	IsApproved            bool    `json:"isApproved"`
	ContentKind           *string `json:"contentKind,omitempty"`
	TargetAssetURL        *string `json:"targetAssetUrl,omitempty"`
	ImageVariantID        *string `json:"imageVariantId,omitempty"`
	Status                string  `json:"status,omitempty"`
}

type editorCatComment struct {
	ExternalCommentID string  `json:"externalCommentId"`
	Type              string  `json:"type"`
	Status            *string `json:"status"`
	Text              string  `json:"text"`
	CreatedAt         *string `json:"createdAt"`
	Locale            *string `json:"locale"`
	Author            *string `json:"author,omitempty"`
}

func (api *editorCatAPI) getSegmentTarget(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	query := r.URL.Query()
	sourcePath, err := requireEditorCatQuery(query, "sourcePath", 2048)
	if err != nil {
		return nil, 0, err
	}
	targetLocale, err := requireEditorCatQuery(query, "targetLocale", 32)
	if err != nil {
		return nil, 0, err
	}
	externalStringID := trimEditorCat(r.PathValue("externalStringId"))
	if isEditorCatWholeFile(sourcePath) && !isEditorCatAllFiles(sourcePath) {
		target, err := api.wholeFileTarget(r, actor, project, sourcePath, targetLocale)
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{"target": target}, 200, nil
	}
	translation, err := api.loadTextTarget(r, actor, project, sourcePath, targetLocale, externalStringID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"target": translation}, 200, nil
}

func (api *editorCatAPI) wholeFileTarget(r *http.Request, actor editorCatActor, project editorCatProject, sourcePath, targetLocale string) (*editorCatTranslation, error) {
	kind := editorCatSourceKind(sourcePath)
	table := "project_image_variants"
	if kind == editorCatKindVideo {
		table = "project_video_variants"
	}
	var id, status string
	var storedFileID *string
	err := api.pool.QueryRow(r.Context(), `
        select id, status, stored_file_id from `+table+`
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4
        limit 1`, actor.organizationID, project.ID, sourcePath, targetLocale).Scan(&id, &status, &storedFileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	contentKind := string(kind)
	var asset *string
	if storedFileID != nil && *storedFileID != "" {
		url := editorCatAssetPath(actor.organizationSlug, project.ID, *storedFileID)
		asset = &url
	}
	return &editorCatTranslation{
		Text:                  "",
		ExternalTranslationID: &id,
		IsApproved:            status == "approved",
		ContentKind:           &contentKind,
		TargetAssetURL:        asset,
		ImageVariantID:        &id,
		Status:                status,
	}, nil
}

func (api *editorCatAPI) loadTextTarget(r *http.Request, actor editorCatActor, project editorCatProject, sourcePath, targetLocale, externalStringID string) (*editorCatTranslation, error) {
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, externalStringID)
	if err != nil {
		return nil, err
	}
	var id, text, status string
	err = api.pool.QueryRow(r.Context(), `
        select id, text, status from project_translations
        where organization_id=$1 and project_id=$2 and translation_key_id=$3 and target_locale=$4
        limit 1`, actor.organizationID, project.ID, keyID, targetLocale).Scan(&id, &text, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &editorCatTranslation{
		Text:                  text,
		ExternalTranslationID: &id,
		IsApproved:            status == "approved",
		Status:                status,
	}, nil
}

func (api *editorCatAPI) requireTranslationKey(r *http.Request, actor editorCatActor, project editorCatProject, sourcePath, externalStringID string) (string, error) {
	keyID, err := parseEditorCatUUID(externalStringID)
	if err != nil {
		return "", editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
	}
	sql := `select k.id from project_translation_keys k
        where k.id=$1 and k.organization_id=$2 and k.project_id=$3`
	args := []any{keyID, actor.organizationID, project.ID}
	if !isEditorCatAllFiles(sourcePath) {
		sourceFileID, err := api.sourceFileID(r, actor, project, sourcePath)
		if err != nil {
			if catErr, ok := err.(*editorCatError); ok && catErr.code == "source_file_not_found" {
				return "", editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
			}
			return "", err
		}
		sql += ` and k.repository_source_file_id=$4`
		args = append(args, sourceFileID)
	}
	var found string
	err = api.pool.QueryRow(r.Context(), sql, args...).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
	}
	return found, err
}

func (api *editorCatAPI) getSegmentComments(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	query := r.URL.Query()
	sourcePath, err := requireEditorCatQuery(query, "sourcePath", 2048)
	if err != nil {
		return nil, 0, err
	}
	targetLocale, err := requireEditorCatQuery(query, "targetLocale", 32)
	if err != nil {
		return nil, 0, err
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, r.PathValue("externalStringId"))
	if err != nil {
		return nil, 0, err
	}
	comments, err := api.listCommentsForKeys(r, actor, project, targetLocale, []string{keyID})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"comments": comments[keyID]}, 200, nil
}

func (api *editorCatAPI) listCommentsForKeys(r *http.Request, actor editorCatActor, project editorCatProject, targetLocale string, keyIDs []string) (map[string][]editorCatComment, error) {
	result := map[string][]editorCatComment{}
	for _, id := range keyIDs {
		result[id] = []editorCatComment{}
	}
	if len(keyIDs) == 0 {
		return result, nil
	}
	rows, err := api.pool.Query(r.Context(), `
        select c.id, c.translation_key_id, c.type, c.status, c.text, c.created_at, c.target_locale,
               u.first_name, u.last_name, u.email
        from project_translation_comments c
        left join users u on u.id = c.author_user_id
        where c.organization_id=$1 and c.project_id=$2 and c.target_locale=$3
          and c.translation_key_id = any($4::uuid[])
          and (
            c.type='comment'
            or (c.type='issue' and not exists (
                select 1 from issue_sheet_issues i where i.linked_comment_id = c.id
            ))
          )
        order by c.created_at`, actor.organizationID, project.ID, targetLocale, keyIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var keyID, commentType, text, locale string
		var status, first, last, email *string
		var created time.Time
		var comment editorCatComment
		if err := rows.Scan(&comment.ExternalCommentID, &keyID, &commentType, &status, &text, &created, &locale, &first, &last, &email); err != nil {
			return nil, err
		}
		createdAt := formatGlossaryTime(created)
		comment.Type = commentType
		comment.Status = status
		comment.Text = text
		comment.CreatedAt = &createdAt
		comment.Locale = &locale
		comment.Author = formatEditorCatAuthor(first, last, email)
		result[keyID] = append(result[keyID], comment)
	}
	return result, rows.Err()
}

func formatEditorCatAuthor(first, last, email *string) *string {
	parts := make([]string, 0, 2)
	if first != nil && trimEditorCat(*first) != "" {
		parts = append(parts, trimEditorCat(*first))
	}
	if last != nil && trimEditorCat(*last) != "" {
		parts = append(parts, trimEditorCat(*last))
	}
	name := strings.TrimSpace(strings.Join(parts, " "))
	if name == "" && email != nil {
		name = trimEditorCat(*email)
	}
	if name == "" {
		return nil
	}
	return &name
}

func (api *editorCatAPI) saveTranslation(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath       string `json:"sourcePath"`
		TargetLocale     string `json:"targetLocale"`
		ExternalStringID string `json:"externalStringId"`
		Text             string `json:"text"`
		Approve          *bool  `json:"approve"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	if sourcePath == "" || targetLocale == "" || len(body.Text) > 100_000 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if err := api.rejectIfLocked(r, actor, project, targetLocale, []string{trimEditorCat(body.ExternalStringID)}); err != nil {
		return nil, 0, err
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, body.ExternalStringID)
	if err != nil {
		if catErr, ok := err.(*editorCatError); ok && catErr.code == "cat_segment_not_found" {
			return nil, 0, editorCatFailure(400, "translation_key_not_found", "Translation key not found")
		}
		return nil, 0, err
	}
	status := "draft"
	var reviewedAt *time.Time
	var reviewedBy *string
	if body.Approve != nil && *body.Approve {
		status = "approved"
		now := time.Now().UTC()
		reviewedAt = &now
		reviewedBy = &actor.userID
	}
	var id, text, savedStatus string
	err = api.pool.QueryRow(r.Context(), `
        insert into project_translations (
            organization_id, project_id, translation_key_id, target_locale, text, status, provenance,
            reviewed_by_user_id, reviewed_at
        ) values ($1,$2,$3,$4,$5,$6,'manual',$7,$8)
        on conflict (translation_key_id, target_locale) do update set
            text=excluded.text,
            status=excluded.status,
            provenance=excluded.provenance,
            reviewed_by_user_id=excluded.reviewed_by_user_id,
            reviewed_at=excluded.reviewed_at,
            updated_at=now()
        returning id, text, status`,
		actor.organizationID, project.ID, keyID, targetLocale, body.Text, status, reviewedBy, reviewedAt,
	).Scan(&id, &text, &savedStatus)
	if err != nil {
		return nil, 0, err
	}
	if body.Approve != nil && *body.Approve {
		api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
			eventType:    "string_segment_approved",
			segmentID:    keyID,
			sourcePath:   sourcePath,
			targetLocale: targetLocale,
		})
	}
	noteRequest(r, "target_locale", targetLocale, "translation_status", savedStatus)
	return map[string]any{"translation": editorCatTranslation{
		Text:                  text,
		ExternalTranslationID: &id,
		IsApproved:            savedStatus == "approved",
		Status:                savedStatus,
	}}, 200, nil
}

func (api *editorCatAPI) updateTranslationStatus(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath       string `json:"sourcePath"`
		TargetLocale     string `json:"targetLocale"`
		ExternalStringID string `json:"externalStringId"`
		Status           string `json:"status"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	switch body.Status {
	case "needs_review", "approved", "rejected":
	default:
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if err := api.rejectIfLocked(r, actor, project, trimEditorCat(body.TargetLocale), []string{trimEditorCat(body.ExternalStringID)}); err != nil {
		return nil, 0, err
	}
	keyID, err := api.requireTranslationKey(r, actor, project, trimEditorCat(body.SourcePath), body.ExternalStringID)
	if err != nil {
		return nil, 0, err
	}
	var reviewedAt *time.Time
	var reviewedBy *string
	if body.Status == "approved" || body.Status == "rejected" {
		now := time.Now().UTC()
		reviewedAt = &now
		reviewedBy = &actor.userID
	}
	var id, text, status string
	err = api.pool.QueryRow(r.Context(), `
        update project_translations
        set status=$5, reviewed_at=$6, reviewed_by_user_id=$7, updated_at=now()
        where organization_id=$1 and project_id=$2 and translation_key_id=$3 and target_locale=$4
        returning id, text, status`,
		actor.organizationID, project.ID, keyID, trimEditorCat(body.TargetLocale), body.Status, reviewedAt, reviewedBy,
	).Scan(&id, &text, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(400, "translation_key_not_found", "Translation key not found")
	}
	if err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	if status == "approved" {
		api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
			eventType:    "string_segment_approved",
			segmentID:    keyID,
			sourcePath:   sourcePath,
			targetLocale: targetLocale,
		})
	} else {
		api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
			eventType:    "string_segment_status_changed",
			segmentID:    keyID,
			sourcePath:   sourcePath,
			targetLocale: targetLocale,
			extra:        map[string]any{"nextStatus": status},
		})
	}
	noteRequest(r, "target_locale", targetLocale, "translation_status", status)
	return map[string]any{"translation": editorCatTranslation{
		Text:                  text,
		ExternalTranslationID: &id,
		IsApproved:            status == "approved",
		Status:                status,
	}}, 200, nil
}

func (api *editorCatAPI) saveComment(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath       string  `json:"sourcePath"`
		TargetLocale     string  `json:"targetLocale"`
		ExternalStringID string  `json:"externalStringId"`
		Text             string  `json:"text"`
		Type             *string `json:"type"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if body.Type != nil && *body.Type == "issue" {
		return nil, 0, editorCatFailure(400, "native_cat_issue_unsupported", "Native CAT issues are tracked in Issues.")
	}
	text := trimEditorCat(body.Text)
	if text == "" || len(text) > 16384 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	keyID, err := api.requireTranslationKey(r, actor, project, trimEditorCat(body.SourcePath), body.ExternalStringID)
	if err != nil {
		return nil, 0, err
	}
	var comment editorCatComment
	var created time.Time
	var locale string
	err = api.pool.QueryRow(r.Context(), `
        insert into project_translation_comments (
            organization_id, project_id, translation_key_id, target_locale, type, status, text, author_user_id
        ) values ($1,$2,$3,$4,'comment',null,$5,$6)
        returning id, type, status, text, created_at, target_locale`,
		actor.organizationID, project.ID, keyID, trimEditorCat(body.TargetLocale), text, actor.userID,
	).Scan(&comment.ExternalCommentID, &comment.Type, &comment.Status, &comment.Text, &created, &locale)
	if err != nil {
		return nil, 0, err
	}
	createdAt := formatGlossaryTime(created)
	comment.CreatedAt = &createdAt
	comment.Locale = &locale
	var first, last, email *string
	_ = api.pool.QueryRow(r.Context(), `select first_name, last_name, email from users where id=$1`, actor.userID).Scan(&first, &last, &email)
	comment.Author = formatEditorCatAuthor(first, last, email)
	api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
		eventType:    "string_segment_commented",
		segmentID:    keyID,
		sourcePath:   trimEditorCat(body.SourcePath),
		targetLocale: trimEditorCat(body.TargetLocale),
	})
	return map[string]any{"comment": comment}, 200, nil
}

func (api *editorCatAPI) resolveComment(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	commentID, err := parseEditorCatUUID(r.PathValue("commentId"))
	if err != nil {
		return nil, 0, editorCatFailure(400, "native_cat_issue_unsupported", "Native CAT issues are tracked in Issues. Resolve them from the Issues section.")
	}
	var existingType, status string
	var authorID *string
	err = api.pool.QueryRow(r.Context(), `
        select type, coalesce(status,''), author_user_id
        from project_translation_comments
        where id=$1 and organization_id=$2 and project_id=$3`, commentID, actor.organizationID, project.ID,
	).Scan(&existingType, &status, &authorID)
	if errors.Is(err, pgx.ErrNoRows) || existingType != "issue" || status == "resolved" {
		return nil, 0, editorCatFailure(400, "native_cat_issue_unsupported", "Native CAT issues are tracked in Issues. Resolve them from the Issues section.")
	}
	if err != nil {
		return nil, 0, err
	}
	if authorID != nil && *authorID != actor.userID && !actor.canReviewApprove() {
		return nil, 0, editorCatFailure(400, "native_cat_issue_unsupported", "Native CAT issues are tracked in Issues. Resolve them from the Issues section.")
	}
	var comment editorCatComment
	var created time.Time
	var locale string
	var first, last, email *string
	err = api.pool.QueryRow(r.Context(), `
        update project_translation_comments
        set status='resolved', updated_at=now()
        where id=$1
        returning id, type, status, text, created_at, target_locale`, commentID,
	).Scan(&comment.ExternalCommentID, &comment.Type, &comment.Status, &comment.Text, &created, &locale)
	if err != nil {
		return nil, 0, err
	}
	createdAt := formatGlossaryTime(created)
	comment.CreatedAt = &createdAt
	comment.Locale = &locale
	_ = api.pool.QueryRow(r.Context(), `
        select u.first_name, u.last_name, u.email
        from project_translation_comments c
        left join users u on u.id = c.author_user_id
        where c.id=$1`, commentID).Scan(&first, &last, &email)
	comment.Author = formatEditorCatAuthor(first, last, email)
	return map[string]any{"comment": comment}, 200, nil
}

func (api *editorCatAPI) setHidden(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath        string   `json:"sourcePath"`
		ExternalStringIDs []string `json:"externalStringIds"`
		IsHidden          bool     `json:"isHidden"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	ids := uniqueEditorCatIDs(body.ExternalStringIDs, editorCatMaxHiddenBatch)
	if len(ids) == 0 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	sql := `update project_translation_keys set is_hidden=$4, updated_at=now()
        where organization_id=$1 and project_id=$2 and id = any($3::uuid[])`
	args := []any{actor.organizationID, project.ID, ids, body.IsHidden}
	if !isEditorCatAllFiles(body.SourcePath) {
		sourceFileID, err := api.sourceFileID(r, actor, project, trimEditorCat(body.SourcePath))
		if err != nil {
			return nil, 0, err
		}
		sql += ` and repository_source_file_id=$5`
		args = append(args, sourceFileID)
	}
	tag, err := api.pool.Exec(r.Context(), sql, args...)
	if err != nil {
		return nil, 0, err
	}
	eventType := "string_segment_unhidden"
	if body.IsHidden {
		eventType = "string_segment_hidden"
	}
	api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
		eventType:  eventType,
		segmentID:  ids[0],
		sourcePath: trimEditorCat(body.SourcePath),
		itemCount:  int(tag.RowsAffected()),
	})
	return map[string]any{"updatedCount": tag.RowsAffected(), "isHidden": body.IsHidden}, 200, nil
}

func (api *editorCatAPI) setLocked(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	var body struct {
		SourcePath        string   `json:"sourcePath"`
		TargetLocale      string   `json:"targetLocale"`
		ExternalStringIDs []string `json:"externalStringIds"`
		IsLocked          bool     `json:"isLocked"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	targetLocale := trimEditorCat(body.TargetLocale)
	ids := uniqueEditorCatIDs(body.ExternalStringIDs, editorCatMaxHiddenBatch)
	if targetLocale == "" || len(ids) == 0 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if !body.IsLocked {
		tag, err := api.pool.Exec(r.Context(), `
            delete from project_cat_segment_locks
            where organization_id=$1 and project_id=$2 and target_locale=$3 and external_string_id = any($4::text[])`,
			actor.organizationID, project.ID, targetLocale, ids)
		if err != nil {
			return nil, 0, err
		}
		api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
			eventType:    "string_segment_unlocked",
			segmentID:    ids[0],
			sourcePath:   trimEditorCat(body.SourcePath),
			targetLocale: targetLocale,
			itemCount:    int(tag.RowsAffected()),
		})
		return map[string]any{"contentEditorSegmentLock": map[string]any{"updatedCount": tag.RowsAffected(), "isLocked": false}}, 200, nil
	}
	_, err := api.pool.Exec(r.Context(), `
        insert into project_cat_segment_locks (
            organization_id, project_id, target_locale, external_string_id, locked_by_user_id
        )
        select $1, $2, $3, id, $5
        from unnest($4::text[]) as id
        on conflict (organization_id, project_id, target_locale, external_string_id)
        do update set locked_by_user_id=excluded.locked_by_user_id, updated_at=now()`,
		actor.organizationID, project.ID, targetLocale, ids, actor.userID)
	if err != nil {
		return nil, 0, err
	}
	api.recordEditorCatSegmentActivity(r, actor, project, editorCatSegmentActivity{
		eventType:    "string_segment_locked",
		segmentID:    ids[0],
		sourcePath:   trimEditorCat(body.SourcePath),
		targetLocale: targetLocale,
		itemCount:    len(ids),
	})
	return map[string]any{"contentEditorSegmentLock": map[string]any{"updatedCount": len(ids), "isLocked": true}}, 200, nil
}

func (api *editorCatAPI) setMaxLength(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath       string `json:"sourcePath"`
		ExternalStringID string `json:"externalStringId"`
		MaxLength        *int   `json:"maxLength"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if r.PathValue("externalStringId") != trimEditorCat(body.ExternalStringID) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if body.MaxLength != nil && (*body.MaxLength < 1 || *body.MaxLength > 100_000) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	keyID, err := api.requireTranslationKey(r, actor, project, trimEditorCat(body.SourcePath), body.ExternalStringID)
	if err != nil {
		return nil, 0, editorCatFailure(404, "translation_key_not_found", "Translation key not found")
	}
	var saved *int
	err = api.pool.QueryRow(r.Context(), `
        update project_translation_keys set max_length=$2, updated_at=now()
        where id=$1 returning max_length`, keyID, body.MaxLength).Scan(&saved)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "translation_key_not_found", "Translation key not found")
	}
	if err != nil {
		return nil, 0, err
	}
	segment := map[string]any{"externalStringId": keyID}
	if saved != nil && *saved > 0 {
		segment["maxLength"] = *saved
	}
	return map[string]any{"segment": segment}, 200, nil
}

func (api *editorCatAPI) treatAsImage(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	return api.setContentKind(r, actor, project, "treatAsImage", "image_url")
}

func (api *editorCatAPI) treatAsVideo(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	return api.setContentKind(r, actor, project, "treatAsVideo", "video_url")
}

func (api *editorCatAPI) setContentKind(r *http.Request, actor editorCatActor, project editorCatProject, flagField, kind string) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	raw, err := ioReadAllLimited(r)
	if err != nil {
		return nil, 0, err
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	externalStringID, _ := payload["externalStringId"].(string)
	sourcePath, _ := payload["sourcePath"].(string)
	flag, _ := payload[flagField].(bool)
	if r.PathValue("externalStringId") != trimEditorCat(externalStringID) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	keyID, err := api.requireTranslationKey(r, actor, project, trimEditorCat(sourcePath), externalStringID)
	if err != nil {
		return nil, 0, editorCatFailure(400, "key_not_found", "Translation key not found")
	}
	var metadata []byte
	var key, sourceText string
	err = api.pool.QueryRow(r.Context(), `
        select key, source_text, metadata from project_translation_keys where id=$1`, keyID,
	).Scan(&key, &sourceText, &metadata)
	if err != nil {
		return nil, 0, err
	}
	meta := map[string]any{}
	if len(metadata) > 0 {
		_ = json.Unmarshal(metadata, &meta)
	}
	if flag {
		meta["contentKind"] = kind
	} else if meta["contentKind"] == kind {
		delete(meta, "contentKind")
	}
	encoded, err := json.Marshal(meta)
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.pool.Exec(r.Context(), `update project_translation_keys set metadata=$2::jsonb, updated_at=now() where id=$1`, keyID, encoded); err != nil {
		return nil, 0, err
	}
	contentKind := "text"
	if flag {
		contentKind = kind
	}
	segment := map[string]any{
		"externalStringId": keyID,
		"key":              key,
		"sourceText":       sourceText,
		"contentKind":      contentKind,
	}
	if kind == "image_url" {
		segment["looksLikeImageUrl"] = flag || looksLikeEditorCatImageURL(sourceText)
		if flag {
			segment["sourceAssetUrl"] = sourceText
		}
	}
	if kind == "video_url" {
		segment["looksLikeVideoUrl"] = flag || looksLikeEditorCatVideoURL(sourceText)
		if flag {
			segment["sourceAssetUrl"] = sourceText
		}
	}
	return map[string]any{"segment": segment}, 200, nil
}

func (api *editorCatAPI) updateImageStatus(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath   string `json:"sourcePath"`
		TargetLocale string `json:"targetLocale"`
		Status       string `json:"status"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	switch body.Status {
	case "draft", "needs_review", "approved", "rejected":
	default:
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	sourceFile, _ := api.sourceFileID(r, actor, project, sourcePath)
	ids := []string{binaryEditorCatStringID(sourceFile, sourcePath), "binary:" + sourcePath, "image:" + sourcePath, "video:" + sourcePath}
	if err := api.rejectIfLocked(r, actor, project, targetLocale, ids); err != nil {
		return nil, 0, err
	}
	table := "project_image_variants"
	if editorCatSourceKind(sourcePath) == editorCatKindVideo {
		table = "project_video_variants"
	}
	var reviewedAt *time.Time
	var reviewedBy *string
	if body.Status == "approved" || body.Status == "rejected" {
		now := time.Now().UTC()
		reviewedAt = &now
		reviewedBy = &actor.userID
	}
	var id, status string
	var storedFileID *string
	err := api.pool.QueryRow(r.Context(), `
        update `+table+`
        set status=$5, reviewed_at=$6, reviewed_by_user_id=$7, updated_at=now()
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4
        returning id, status, stored_file_id`,
		actor.organizationID, project.ID, sourcePath, targetLocale, body.Status, reviewedAt, reviewedBy,
	).Scan(&id, &status, &storedFileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(400, "variant_not_found", "File variant not found")
	}
	if err != nil {
		return nil, 0, err
	}
	var asset *string
	if storedFileID != nil && *storedFileID != "" {
		url := editorCatAssetPath(actor.organizationSlug, project.ID, *storedFileID)
		asset = &url
	}
	return map[string]any{"imageVariant": map[string]any{
		"id":             id,
		"status":         status,
		"targetAssetUrl": asset,
		"storedFileId":   storedFileID,
	}}, 200, nil
}

func (api *editorCatAPI) rejectIfLocked(r *http.Request, actor editorCatActor, project editorCatProject, targetLocale string, ids []string) error {
	ids = uniqueEditorCatIDs(ids, editorCatMaxHiddenBatch)
	if targetLocale == "" || len(ids) == 0 {
		return nil
	}
	var count int
	err := api.pool.QueryRow(r.Context(), `
        select count(*) from project_cat_segment_locks
        where organization_id=$1 and project_id=$2 and target_locale=$3 and external_string_id = any($4::text[])`,
		actor.organizationID, project.ID, targetLocale, ids).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return editorCatFailure(409, "cat_segment_locked", "This string is locked")
	}
	return nil
}

type editorCatSegmentActivity struct {
	eventType    string
	segmentID    string
	sourcePath   string
	targetLocale string
	itemCount    int
	extra        map[string]any
}

func (api *editorCatAPI) recordEditorCatSegmentActivity(r *http.Request, actor editorCatActor, project editorCatProject, activity editorCatSegmentActivity) {
	sourcePath := trimEditorCat(activity.sourcePath)
	fileName := filenameFromSourcePath(sourcePath)
	payload := map[string]any{
		"fileName":   fileName,
		"name":       fileName,
		"projectId":  project.ID,
		"segmentId":  activity.segmentID,
		"sourcePath": sourcePath,
	}
	if locale := trimEditorCat(activity.targetLocale); locale != "" {
		payload["targetLocale"] = locale
	}
	if activity.itemCount > 1 {
		payload["itemCount"] = activity.itemCount
	}
	for key, value := range activity.extra {
		payload[key] = value
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		slog.ErrorContext(r.Context(), "editor_cat_activity_encode_failed", "event_type", activity.eventType)
		return
	}
	_, err = api.pool.Exec(r.Context(), `
        insert into organization_activity_events (
            organization_id, actor_kind, actor_user_id, event_type, target_kind, target_id, payload
        ) values ($1,'user',$2,$3,'string_segment',$4,$5::jsonb)`,
		actor.organizationID, actor.userID, activity.eventType, activity.segmentID, encoded,
	)
	if err != nil {
		slog.ErrorContext(r.Context(), "editor_cat_activity_insert_failed", "event_type", activity.eventType)
	}
}

func uniqueEditorCatIDs(values []string, max int) []string {
	seen := map[string]bool{}
	ids := make([]string, 0, len(values))
	for _, value := range values {
		id := trimEditorCat(value)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
		if len(ids) >= max {
			break
		}
	}
	return ids
}

func ioReadAllLimited(r *http.Request) ([]byte, error) {
	decoder := json.NewDecoder(r.Body)
	var payload json.RawMessage
	if err := decoder.Decode(&payload); err != nil {
		if isRequestBodyTooLarge(err) {
			return nil, editorCatFailure(413, "payload_too_large", "request body exceeds maximum allowed size")
		}
		return nil, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	return payload, nil
}
