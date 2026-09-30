package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type knowledgeMemoryScope struct {
	organizationID string
	projectID      string
}

func (scope knowledgeMemoryScope) workspace() bool { return scope.projectID == "" }

func (scope knowledgeMemoryScope) key() string {
	if scope.workspace() {
		return scope.organizationID
	}
	return scope.projectID
}

func (scope knowledgeMemoryScope) headTable() string {
	if scope.workspace() {
		return "knowledge_memories"
	}
	return "project_knowledge_memories"
}

func (scope knowledgeMemoryScope) revisionTable() string {
	if scope.workspace() {
		return "knowledge_memory_revisions"
	}
	return "project_knowledge_memory_revisions"
}

func (scope knowledgeMemoryScope) keyColumn() string {
	if scope.workspace() {
		return "organization_id"
	}
	return "project_id"
}

func stringPointer(value string) *string { return &value }

func (api *knowledgeMemoryAPI) getCurrent(ctx context.Context, scope knowledgeMemoryScope) (knowledgeMemoryRecord, error) {
	record, found, err := loadKnowledgeMemoryHead(ctx, api.workspace.pool, scope, false)
	if err != nil {
		return knowledgeMemoryRecord{}, fmt.Errorf("load knowledge memory: %w", err)
	}
	if !found {
		return knowledgeMemoryRecord{Version: 0, Content: ""}, nil
	}
	return record, nil
}

func loadKnowledgeMemoryHead(ctx context.Context, db dictionaryDB, scope knowledgeMemoryScope, lock bool) (knowledgeMemoryRecord, bool, error) {
	statement := `select h.revision_id, h.version, h.content, h.summary, h.updated_at, h.updated_by_user_id, u.first_name, u.last_name
		from ` + scope.headTable() + ` h left join users u on u.id=h.updated_by_user_id where h.` + scope.keyColumn() + `=$1`
	if lock {
		statement += " for update of h"
	}
	var revisionID uuid.UUID
	var version int
	var content, summary string
	var updatedAt time.Time
	var updatedBy pgtype.UUID
	var firstName, lastName pgtype.Text
	err := db.QueryRow(ctx, statement, scope.key()).Scan(&revisionID, &version, &content, &summary, &updatedAt, &updatedBy, &firstName, &lastName)
	if errors.Is(err, pgx.ErrNoRows) {
		return knowledgeMemoryRecord{}, false, nil
	}
	if err != nil {
		return knowledgeMemoryRecord{}, false, err
	}
	var updatedByUserID *string
	if updatedBy.Valid {
		updatedByUserID = stringPointer(uuid.UUID(updatedBy.Bytes).String())
	}
	updatedByName := knowledgeMemoryAuthorName(firstName, lastName)
	return knowledgeMemoryRecord{
		RevisionID:      stringPointer(revisionID.String()),
		Version:         version,
		Content:         content,
		Summary:         stringPointer(summary),
		UpdatedAt:       stringPointer(formatKnowledgeMemoryTime(updatedAt)),
		UpdatedByUserID: updatedByUserID,
		UpdatedByName:   updatedByName,
	}, true, nil
}

func knowledgeMemoryAuthorName(firstName, lastName pgtype.Text) *string {
	combined := strings.TrimSpace(strings.TrimSpace(firstName.String) + " " + strings.TrimSpace(lastName.String))
	if (firstName.Valid || lastName.Valid) && combined != "" {
		return &combined
	}
	return nil
}

type knowledgeMemoryConflict struct{ current knowledgeMemoryRecord }

func (e *knowledgeMemoryConflict) Error() string { return "knowledge_memory_precondition_failed" }

func (api *knowledgeMemoryAPI) commit(
	ctx context.Context,
	scope knowledgeMemoryScope,
	userID, content string,
	summary *string,
	expectedRevisionID *string,
	forceNewRevision bool,
) (knowledgeMemoryRecord, error) {
	content = normalizeKnowledgeMemoryContent(content)
	tx, err := api.workspace.pool.Begin(ctx)
	if err != nil {
		return knowledgeMemoryRecord{}, fmt.Errorf("begin knowledge memory commit: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	current, found, err := loadKnowledgeMemoryHead(ctx, tx, scope, true)
	if err != nil {
		return knowledgeMemoryRecord{}, fmt.Errorf("lock knowledge memory head: %w", err)
	}
	if !found {
		if expectedRevisionID != nil {
			return knowledgeMemoryRecord{}, &knowledgeMemoryConflict{current: knowledgeMemoryRecord{Version: 0, Content: ""}}
		}
		if content == "" && !forceNewRevision {
			return knowledgeMemoryRecord{Version: 0, Content: ""}, nil
		}
		newRecord, inserted, err := insertKnowledgeMemoryHead(ctx, tx, scope, userID, content, normalizeKnowledgeMemorySummary(summary, "Initial version"))
		if err != nil {
			return knowledgeMemoryRecord{}, fmt.Errorf("insert knowledge memory head: %w", err)
		}
		if !inserted {
			latest, _, loadErr := loadKnowledgeMemoryHead(ctx, tx, scope, false)
			if loadErr != nil {
				return knowledgeMemoryRecord{}, fmt.Errorf("reload knowledge memory head: %w", loadErr)
			}
			return knowledgeMemoryRecord{}, &knowledgeMemoryConflict{current: latest}
		}
		if err := tx.Commit(ctx); err != nil {
			return knowledgeMemoryRecord{}, fmt.Errorf("commit initial knowledge memory: %w", err)
		}
		return newRecord, nil
	}

	if current.RevisionID == nil || expectedRevisionID == nil || *current.RevisionID != *expectedRevisionID {
		return knowledgeMemoryRecord{}, &knowledgeMemoryConflict{current: current}
	}
	if current.Content == content && !forceNewRevision {
		return current, nil
	}

	newID := uuid.NewString()
	newVersion := current.Version + 1
	now := time.Now().UTC()
	newSummary := normalizeKnowledgeMemorySummary(summary, "Updated memory")
	if forceNewRevision && summary != nil {
		newSummary = normalizeKnowledgeMemorySummary(summary, "Updated memory")
	}
	if err := archiveKnowledgeMemoryRevision(ctx, tx, scope, current); err != nil {
		return knowledgeMemoryRecord{}, fmt.Errorf("archive knowledge memory revision: %w", err)
	}
	updated, err := updateKnowledgeMemoryHead(ctx, tx, scope, userID, newID, newVersion, content, newSummary, *current.RevisionID, now)
	if err != nil {
		return knowledgeMemoryRecord{}, fmt.Errorf("update knowledge memory head: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return knowledgeMemoryRecord{}, fmt.Errorf("commit knowledge memory revision: %w", err)
	}
	return updated, nil
}

func normalizeKnowledgeMemorySummary(summary *string, fallback string) string {
	if summary == nil {
		return fallback
	}
	if trimmed := javascriptTrim(*summary); trimmed != "" {
		return trimmed
	}
	return fallback
}

func insertKnowledgeMemoryHead(ctx context.Context, tx pgx.Tx, scope knowledgeMemoryScope, userID, content, summary string) (knowledgeMemoryRecord, bool, error) {
	id := uuid.NewString()
	var revisionID uuid.UUID
	var version int
	var storedContent, storedSummary string
	var updatedAt time.Time
	var updatedBy pgtype.UUID
	var statement string
	if scope.workspace() {
		statement = `insert into knowledge_memories (organization_id, revision_id, version, content, summary, updated_by_user_id, created_at, updated_at)
			values ($1, $2, 1, $3, $4, $5, now(), now()) on conflict (organization_id) do nothing
			returning revision_id, version, content, summary, updated_at, updated_by_user_id`
	} else {
		statement = `insert into project_knowledge_memories (project_id, revision_id, version, content, summary, updated_by_user_id, created_at, updated_at)
			values ($1, $2, 1, $3, $4, $5, now(), now()) on conflict (project_id) do nothing
			returning revision_id, version, content, summary, updated_at, updated_by_user_id`
	}
	err := tx.QueryRow(ctx, statement, scope.key(), id, content, summary, userID).Scan(&revisionID, &version, &storedContent, &storedSummary, &updatedAt, &updatedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return knowledgeMemoryRecord{}, false, nil
	}
	if err != nil {
		return knowledgeMemoryRecord{}, false, err
	}
	var updatedByUserID *string
	if updatedBy.Valid {
		updatedByUserID = stringPointer(uuid.UUID(updatedBy.Bytes).String())
	}
	return knowledgeMemoryRecord{
		RevisionID:      stringPointer(revisionID.String()),
		Version:         version,
		Content:         storedContent,
		Summary:         stringPointer(storedSummary),
		UpdatedAt:       stringPointer(formatKnowledgeMemoryTime(updatedAt)),
		UpdatedByUserID: updatedByUserID,
	}, true, nil
}

func archiveKnowledgeMemoryRevision(ctx context.Context, tx pgx.Tx, scope knowledgeMemoryScope, current knowledgeMemoryRecord) error {
	var createdBy any
	if current.UpdatedByUserID != nil {
		createdBy = *current.UpdatedByUserID
	}
	var createdAt any
	if current.UpdatedAt != nil {
		parsed, err := time.Parse(time.RFC3339Nano, *current.UpdatedAt)
		if err != nil {
			return err
		}
		createdAt = parsed
	}
	if scope.workspace() {
		_, err := tx.Exec(ctx, `insert into knowledge_memory_revisions (id, organization_id, version, content, summary, created_by_user_id, created_at)
			values ($1, $2, $3, $4, $5, $6, $7)`, *current.RevisionID, scope.organizationID, current.Version, current.Content, dereferenceString(current.Summary), createdBy, createdAt)
		return err
	}
	_, err := tx.Exec(ctx, `insert into project_knowledge_memory_revisions (id, project_id, version, content, summary, created_by_user_id, created_at)
		values ($1, $2, $3, $4, $5, $6, $7)`, *current.RevisionID, scope.projectID, current.Version, current.Content, dereferenceString(current.Summary), createdBy, createdAt)
	return err
}

func updateKnowledgeMemoryHead(ctx context.Context, tx pgx.Tx, scope knowledgeMemoryScope, userID, revisionID string, version int, content, summary, expectedRevisionID string, now time.Time) (knowledgeMemoryRecord, error) {
	var rowRevisionID uuid.UUID
	var storedVersion int
	var storedContent, storedSummary string
	var updatedAt time.Time
	var updatedBy pgtype.UUID
	statement := `update ` + scope.headTable() + ` set revision_id=$2, version=$3, content=$4, summary=$5, updated_by_user_id=$6, updated_at=$7 where ` + scope.keyColumn() + `=$1 and revision_id=$8
		returning revision_id, version, content, summary, updated_at, updated_by_user_id`
	err := tx.QueryRow(ctx, statement, scope.key(), revisionID, version, content, summary, userID, now, expectedRevisionID).Scan(&rowRevisionID, &storedVersion, &storedContent, &storedSummary, &updatedAt, &updatedBy)
	if err != nil {
		return knowledgeMemoryRecord{}, err
	}
	var updatedByUserID *string
	if updatedBy.Valid {
		updatedByUserID = stringPointer(uuid.UUID(updatedBy.Bytes).String())
	}
	return knowledgeMemoryRecord{
		RevisionID:      stringPointer(rowRevisionID.String()),
		Version:         storedVersion,
		Content:         storedContent,
		Summary:         stringPointer(storedSummary),
		UpdatedAt:       stringPointer(formatKnowledgeMemoryTime(updatedAt)),
		UpdatedByUserID: updatedByUserID,
	}, nil
}

func dereferenceString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

type knowledgeMemoryRevisionWithContent struct {
	knowledgeMemoryRevisionMetadata
	Content string `json:"content"`
}

func (api *knowledgeMemoryAPI) listRevisions(ctx context.Context, scope knowledgeMemoryScope, limit int, cursor *int) (map[string]any, error) {
	current, found, err := loadKnowledgeMemoryHead(ctx, api.workspace.pool, scope, false)
	if err != nil {
		return nil, fmt.Errorf("load current knowledge memory revision: %w", err)
	}
	currentRevisions := make([]knowledgeMemoryRevisionMetadata, 0, 1)
	if found && (cursor == nil || current.Version < *cursor) {
		currentRevisions = append(currentRevisions, knowledgeMemoryRevisionMetadataForHead(current))
	}
	archivedRevisions, err := api.listArchivedRevisionMetadata(ctx, scope, limit+1, cursor)
	if err != nil {
		return nil, fmt.Errorf("list archived knowledge memory revisions: %w", err)
	}
	byID := make(map[string]knowledgeMemoryRevisionMetadata, len(archivedRevisions)+len(currentRevisions))
	for _, revision := range archivedRevisions {
		byID[revision.RevisionID] = revision
	}
	for _, revision := range currentRevisions {
		byID[revision.RevisionID] = revision
	}
	revisions := make([]knowledgeMemoryRevisionMetadata, 0, len(byID))
	for _, revision := range byID {
		revisions = append(revisions, revision)
	}
	sort.Slice(revisions, func(i, j int) bool { return revisions[i].Version > revisions[j].Version })
	page := revisions
	var nextCursor *int
	if len(page) > limit {
		page = page[:limit]
		value := page[len(page)-1].Version
		nextCursor = &value
	}
	if page == nil {
		page = []knowledgeMemoryRevisionMetadata{}
	}
	return map[string]any{"knowledgeMemoryRevisions": page, "nextCursor": nextCursor}, nil
}

func knowledgeMemoryRevisionMetadataForHead(record knowledgeMemoryRecord) knowledgeMemoryRevisionMetadata {
	return knowledgeMemoryRevisionMetadata{
		RevisionID:      dereferenceString(record.RevisionID),
		Version:         record.Version,
		Summary:         dereferenceString(record.Summary),
		CreatedAt:       dereferenceString(record.UpdatedAt),
		CreatedByUserID: record.UpdatedByUserID,
		CreatedByName:   record.UpdatedByName,
		IsCurrent:       true,
	}
}

func (api *knowledgeMemoryAPI) listArchivedRevisionMetadata(ctx context.Context, scope knowledgeMemoryScope, limit int, cursor *int) ([]knowledgeMemoryRevisionMetadata, error) {
	keyColumn := "project_id"
	if scope.workspace() {
		keyColumn = "organization_id"
	}
	statement := `select r.id, r.version, r.summary, r.created_at, r.created_by_user_id, u.first_name, u.last_name
		from ` + scope.revisionTable() + ` r left join users u on u.id=r.created_by_user_id
		where r.` + keyColumn + `=$1`
	args := []any{scope.key()}
	if cursor != nil {
		statement += " and r.version < $2"
		args = append(args, *cursor)
	}
	statement += fmt.Sprintf(" order by r.version desc limit $%d", len(args)+1)
	args = append(args, limit)
	rows, err := api.workspace.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	revisions := make([]knowledgeMemoryRevisionMetadata, 0, limit)
	for rows.Next() {
		var id uuid.UUID
		var version int
		var summary string
		var createdAt time.Time
		var createdBy pgtype.UUID
		var firstName, lastName pgtype.Text
		if err := rows.Scan(&id, &version, &summary, &createdAt, &createdBy, &firstName, &lastName); err != nil {
			return nil, err
		}
		var createdByUserID *string
		if createdBy.Valid {
			createdByUserID = stringPointer(uuid.UUID(createdBy.Bytes).String())
		}
		name := knowledgeMemoryAuthorName(firstName, lastName)
		revisions = append(revisions, knowledgeMemoryRevisionMetadata{
			RevisionID:      id.String(),
			Version:         version,
			Summary:         summary,
			CreatedAt:       formatKnowledgeMemoryTime(createdAt),
			CreatedByUserID: createdByUserID,
			CreatedByName:   name,
			IsCurrent:       false,
		})
	}
	return revisions, rows.Err()
}

func (api *knowledgeMemoryAPI) getRevision(ctx context.Context, scope knowledgeMemoryScope, revisionID string) (map[string]any, error) {
	revision, err := api.findRevision(ctx, scope, revisionID)
	if err != nil {
		return nil, err
	}
	if revision == nil {
		return nil, knowledgeMemoryFailure(404, "knowledge_memory_revision_not_found", "Knowledge Memory revision was not found")
	}
	var previous *knowledgeMemoryRevisionWithContent
	if revision.Version > 1 {
		previous, err = api.findArchivedRevisionByVersion(ctx, scope, revision.Version-1)
		if err != nil {
			return nil, fmt.Errorf("load previous knowledge memory revision: %w", err)
		}
	}
	return map[string]any{
		"knowledgeMemoryRevision":         revision,
		"previousKnowledgeMemoryRevision": previous,
	}, nil
}

func (api *knowledgeMemoryAPI) findRevision(ctx context.Context, scope knowledgeMemoryScope, revisionID string) (*knowledgeMemoryRevisionWithContent, error) {
	current, found, err := loadKnowledgeMemoryHead(ctx, api.workspace.pool, scope, false)
	if err != nil {
		return nil, err
	}
	if found && current.RevisionID != nil && *current.RevisionID == revisionID {
		metadata := knowledgeMemoryRevisionMetadataForHead(current)
		return &knowledgeMemoryRevisionWithContent{knowledgeMemoryRevisionMetadata: metadata, Content: current.Content}, nil
	}
	return api.findArchivedRevision(ctx, scope, revisionID)
}

func (api *knowledgeMemoryAPI) findArchivedRevision(ctx context.Context, scope knowledgeMemoryScope, revisionID string) (*knowledgeMemoryRevisionWithContent, error) {
	keyColumn := scope.keyColumn()
	statement := `select r.id, r.version, r.content, r.summary, r.created_at, r.created_by_user_id, u.first_name, u.last_name
		from ` + scope.revisionTable() + ` r left join users u on u.id=r.created_by_user_id
		where r.` + keyColumn + `=$1 and r.id=$2 limit 1`
	return scanKnowledgeMemoryRevision(api.workspace.pool.QueryRow(ctx, statement, scope.key(), revisionID), false)
}

func (api *knowledgeMemoryAPI) findArchivedRevisionByVersion(ctx context.Context, scope knowledgeMemoryScope, version int) (*knowledgeMemoryRevisionWithContent, error) {
	statement := `select r.id, r.version, r.content, r.summary, r.created_at, r.created_by_user_id, u.first_name, u.last_name
		from ` + scope.revisionTable() + ` r left join users u on u.id=r.created_by_user_id
		where r.` + scope.keyColumn() + `=$1 and r.version=$2 limit 1`
	return scanKnowledgeMemoryRevision(api.workspace.pool.QueryRow(ctx, statement, scope.key(), version), false)
}

func scanKnowledgeMemoryRevision(row pgx.Row, current bool) (*knowledgeMemoryRevisionWithContent, error) {
	var id uuid.UUID
	var version int
	var content, summary string
	var createdAt time.Time
	var createdBy pgtype.UUID
	var firstName, lastName pgtype.Text
	err := row.Scan(&id, &version, &content, &summary, &createdAt, &createdBy, &firstName, &lastName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var createdByUserID *string
	if createdBy.Valid {
		createdByUserID = stringPointer(uuid.UUID(createdBy.Bytes).String())
	}
	name := knowledgeMemoryAuthorName(firstName, lastName)
	return &knowledgeMemoryRevisionWithContent{
		knowledgeMemoryRevisionMetadata: knowledgeMemoryRevisionMetadata{
			RevisionID:      id.String(),
			Version:         version,
			Summary:         summary,
			CreatedAt:       formatKnowledgeMemoryTime(createdAt),
			CreatedByUserID: createdByUserID,
			CreatedByName:   name,
			IsCurrent:       current,
		},
		Content: content,
	}, nil
}
