package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type guidelineDocumentRecord struct {
	ID             string  `json:"id"`
	ProjectID      *string `json:"projectId"`
	Locale         *string `json:"locale"`
	Title          string  `json:"title"`
	Filename       string  `json:"filename"`
	ContentType    string  `json:"contentType"`
	ByteSize       int64   `json:"byteSize"`
	CharacterCount int     `json:"characterCount"`
	Truncated      bool    `json:"truncated"`
	RevisionID     string  `json:"revisionId"`
	Version        int64   `json:"version"`
	Mandatory      bool    `json:"mandatory"`
	Status         string  `json:"status"`
	ErrorCode      *string `json:"errorCode"`
	Indexed        bool    `json:"indexed"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
	Content        *string `json:"content,omitempty"`

	organizationID    string
	storageLocationID string
	storageKey        string
}

type guidelineDocumentScope struct {
	organizationID string
	projectID      string
}

type guidelineDocumentInsert struct {
	id, revisionID, title, filename, contentType string
	storageLocationID, storageKey, userID        string
	locale                                       *string
	byteSize                                     int64
	mandatory                                    bool
}

const guidelineDocumentColumns = `d.id::text, d.organization_id::text, d.project_id, d.locale, d.title, d.filename, d.content_type, d.byte_size,
	char_length(d.content), d.truncated, d.revision_id::text, d.version, d.mandatory, d.status, d.error_code,
	d.indexed_revision_id is not distinct from d.revision_id, d.created_at, d.updated_at, d.storage_location_id, d.storage_key`

func scanGuidelineDocument(row pgx.Row, withContent bool) (guidelineDocumentRecord, error) {
	var record guidelineDocumentRecord
	var projectID, locale, errorCode pgtype.Text
	var createdAt, updatedAt time.Time
	var content string
	dest := []any{
		&record.ID, &record.organizationID, &projectID, &locale, &record.Title, &record.Filename, &record.ContentType, &record.ByteSize,
		&record.CharacterCount, &record.Truncated, &record.RevisionID, &record.Version, &record.Mandatory, &record.Status, &errorCode,
		&record.Indexed, &createdAt, &updatedAt, &record.storageLocationID, &record.storageKey,
	}
	if withContent {
		dest = append(dest, &content)
	}
	if err := row.Scan(dest...); err != nil {
		return guidelineDocumentRecord{}, err
	}
	record.ProjectID = guidelineOptionalText(projectID)
	record.Locale = guidelineOptionalText(locale)
	record.ErrorCode = guidelineOptionalText(errorCode)
	record.CreatedAt = formatKnowledgeMemoryTime(createdAt)
	record.UpdatedAt = formatKnowledgeMemoryTime(updatedAt)
	if withContent {
		record.Content = &content
	}
	return record, nil
}

func guidelineOptionalText(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	return stringPointer(value.String)
}

// projectFilter matches workspace documents when projectID is empty, and only
// that project's documents otherwise.
const guidelineDocumentProjectFilter = `d.organization_id = $1 and d.project_id is not distinct from nullif($2, '')`

func insertGuidelineDocument(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, input guidelineDocumentInsert) (guidelineDocumentRecord, error) {
	return scanGuidelineDocument(db.QueryRow(ctx, `
		insert into guideline_documents as d (id, organization_id, project_id, locale, title, storage_location_id, storage_key, filename,
			content_type, byte_size, revision_id, mandatory, status, enqueued_at, created_by_user_id)
		values ($3, $1, nullif($2, ''), $4, $5, $6, $7, $8, $9, $10, $11, $12, 'processing', now(), nullif($13, '')::uuid)
		returning `+guidelineDocumentColumns,
		scope.organizationID, scope.projectID, input.id, input.locale, input.title, input.storageLocationID, input.storageKey, input.filename,
		input.contentType, input.byteSize, input.revisionID, input.mandatory, input.userID), false)
}

func listGuidelineDocuments(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope) ([]guidelineDocumentRecord, error) {
	rows, err := db.Query(ctx, `select `+guidelineDocumentColumns+` from guideline_documents d
		where `+guidelineDocumentProjectFilter+` order by d.created_at desc, d.id limit 200`, scope.organizationID, scope.projectID)
	if err != nil {
		return nil, fmt.Errorf("list guideline documents: %w", err)
	}
	defer rows.Close()
	records := make([]guidelineDocumentRecord, 0)
	for rows.Next() {
		record, err := scanGuidelineDocument(rows, false)
		if err != nil {
			return nil, fmt.Errorf("scan guideline document: %w", err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func loadGuidelineDocument(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, id string, withContent bool) (guidelineDocumentRecord, bool, error) {
	columns := guidelineDocumentColumns
	if withContent {
		columns += ", d.content"
	}
	record, err := scanGuidelineDocument(db.QueryRow(ctx, `select `+columns+` from guideline_documents d
		where `+guidelineDocumentProjectFilter+` and d.id = $3`, scope.organizationID, scope.projectID, id), withContent)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, false, fmt.Errorf("load guideline document: %w", err)
	}
	return record, true, nil
}

type guidelineDocumentMetadata struct {
	title     *string
	locale    *string
	setLocale bool
	mandatory *bool
}

// updateGuidelineDocumentMetadata bumps the revision because locale and the
// mandatory flag are part of the indexed passage scope.
func updateGuidelineDocumentMetadata(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, id, revisionID string, change guidelineDocumentMetadata) (guidelineDocumentRecord, bool, error) {
	record, err := scanGuidelineDocument(db.QueryRow(ctx, `
		update guideline_documents d set
			title = coalesce($4, d.title),
			locale = case when $5 then $6 else d.locale end,
			mandatory = coalesce($7, d.mandatory),
			revision_id = $8, version = d.version + 1, enqueued_at = now(), updated_at = now()
		where `+guidelineDocumentProjectFilter+` and d.id = $3
		returning `+guidelineDocumentColumns,
		scope.organizationID, scope.projectID, id, change.title, change.setLocale, change.locale, change.mandatory, revisionID), false)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, false, fmt.Errorf("update guideline document: %w", err)
	}
	return record, true, nil
}

type guidelineDocumentFile struct {
	revisionID, filename, contentType string
	storageLocationID, storageKey     string
	byteSize                          int64
}

// replaceGuidelineDocumentFile returns the previous object so the caller can
// delete it after the row points at the new one.
func replaceGuidelineDocumentFile(ctx context.Context, pool dictionaryPool, scope guidelineDocumentScope, id string, file guidelineDocumentFile, change guidelineDocumentMetadata) (guidelineDocumentRecord, guidelineDocumentRecord, bool, error) {
	conn, err := pool.Begin(ctx)
	if err != nil {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, fmt.Errorf("begin guideline document replace: %w", err)
	}
	defer func() { _ = conn.Rollback(ctx) }()
	previous, err := scanGuidelineDocument(conn.QueryRow(ctx, `select `+guidelineDocumentColumns+` from guideline_documents d
		where `+guidelineDocumentProjectFilter+` and d.id = $3 for update`, scope.organizationID, scope.projectID, id), false)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, fmt.Errorf("lock guideline document: %w", err)
	}
	updated, err := scanGuidelineDocument(conn.QueryRow(ctx, `
		update guideline_documents d set
			title = coalesce($4, d.title),
			locale = case when $5 then $6 else d.locale end,
			mandatory = coalesce($7, d.mandatory),
			revision_id = $8, version = d.version + 1, filename = $9, content_type = $10, byte_size = $11,
			storage_location_id = $12, storage_key = $13, content = '', truncated = false, status = 'processing',
			error_code = null, enqueued_at = now(), updated_at = now()
		where `+guidelineDocumentProjectFilter+` and d.id = $3
		returning `+guidelineDocumentColumns,
		scope.organizationID, scope.projectID, id, change.title, change.setLocale, change.locale, change.mandatory,
		file.revisionID, file.filename, file.contentType, file.byteSize, file.storageLocationID, file.storageKey), false)
	if err != nil {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, fmt.Errorf("replace guideline document: %w", err)
	}
	if err := conn.Commit(ctx); err != nil {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, fmt.Errorf("commit guideline document replace: %w", err)
	}
	return updated, previous, true, nil
}

func markGuidelineDocumentEnqueueFailed(ctx context.Context, db dictionaryDB, id, revisionID string) error {
	_, err := db.Exec(ctx, `update guideline_documents set status = 'failed', error_code = 'guideline_ingest_enqueue_failed', updated_at = now()
		where id = $1 and revision_id = $2 and status = 'processing'`, id, revisionID)
	return err
}

func deleteGuidelineDocument(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, id string) (guidelineDocumentRecord, bool, error) {
	record, err := scanGuidelineDocument(db.QueryRow(ctx, `delete from guideline_documents d
		where `+guidelineDocumentProjectFilter+` and d.id = $3 returning `+guidelineDocumentColumns,
		scope.organizationID, scope.projectID, id), false)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, false, fmt.Errorf("delete guideline document: %w", err)
	}
	return record, true, nil
}

// listGuidelineDocumentsToSweep selects rows whose ingest message may have been
// lost: processing past the grace period, or ready but not indexed at the
// current revision.
func listGuidelineDocumentsToSweep(ctx context.Context, db dictionaryDB, olderThan time.Duration, limit int) ([]guidelineDocumentRecord, error) {
	rows, err := db.Query(ctx, `select `+guidelineDocumentColumns+` from guideline_documents d
		where d.enqueued_at < now() - make_interval(secs => $1)
			and (d.status = 'processing' or (d.status = 'ready' and d.indexed_revision_id is distinct from d.revision_id))
		order by d.enqueued_at limit $2`, olderThan.Seconds(), limit)
	if err != nil {
		return nil, fmt.Errorf("list guideline documents to sweep: %w", err)
	}
	defer rows.Close()
	records := make([]guidelineDocumentRecord, 0)
	for rows.Next() {
		record, err := scanGuidelineDocument(rows, false)
		if err != nil {
			return nil, fmt.Errorf("scan guideline document: %w", err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func touchGuidelineDocumentEnqueued(ctx context.Context, db dictionaryDB, id, revisionID string) error {
	_, err := db.Exec(ctx, `update guideline_documents set enqueued_at = now() where id = $1 and revision_id = $2`, id, revisionID)
	return err
}
