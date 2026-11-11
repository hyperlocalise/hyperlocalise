package main

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type guidelineDocumentRecord struct {
	ID        string  `json:"id"`
	ProjectID *string `json:"projectId,omitempty"`
	// Deprecated: single-locale reads are retired. Locales carries the
	// per-document locales (empty means all locales); Locale only mirrors
	// Locales when exactly one locale is set.
	Locale          *string  `json:"locale,omitempty"`
	Locales         []string `json:"locales"`
	IsGlobal        bool     `json:"isGlobal"`
	Title           string   `json:"title"`
	Filename        string   `json:"filename"`
	ContentType     string   `json:"contentType"`
	ByteSize        int64    `json:"byteSize"`
	CharacterCount  int      `json:"characterCount"`
	Truncated       bool     `json:"truncated"`
	RevisionID      string   `json:"revisionId"`
	Version         int64    `json:"version"`
	Mandatory       bool     `json:"mandatory"`
	Status          string   `json:"status"`
	ErrorCode       *string  `json:"errorCode"`
	Indexed         bool     `json:"indexed"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
	createdAtCursor string   `json:"-"`
	Content         *string  `json:"content,omitempty"`

	organizationID    string
	storageLocationID string
	storageKey        string
}

type guidelineDocumentScope struct {
	organizationID string
}

type guidelineDocumentInsert struct {
	id, revisionID, title, filename, contentType string
	storageLocationID, storageKey, userID        string
	locale                                       *string
	locales                                      []string
	isGlobal                                     bool
	byteSize                                     int64
	mandatory                                    bool
}

const guidelineDocumentColumns = `d.id::text, d.organization_id::text, d.project_id, d.locale, d.locales, d.is_global, d.title, d.filename, d.content_type, d.byte_size,
	char_length(d.content), d.truncated, d.revision_id::text, d.version, d.mandatory, d.status, d.error_code,
	d.indexed_revision_id is not distinct from d.revision_id, d.created_at, d.updated_at, d.storage_location_id, d.storage_key`

func scanGuidelineDocument(row pgx.Row, withContent bool) (guidelineDocumentRecord, error) {
	var record guidelineDocumentRecord
	var projectID, locale, errorCode pgtype.Text
	var locales pgtype.Array[string]
	var createdAt, updatedAt time.Time
	var content string
	dest := []any{
		&record.ID, &record.organizationID, &projectID, &locale, &locales, &record.IsGlobal, &record.Title, &record.Filename, &record.ContentType, &record.ByteSize,
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
	if locales.Valid {
		record.Locales = append([]string{}, locales.Elements...)
	} else {
		record.Locales = []string{}
	}
	record.ErrorCode = guidelineOptionalText(errorCode)
	record.CreatedAt = formatKnowledgeMemoryTime(createdAt)
	record.UpdatedAt = formatKnowledgeMemoryTime(updatedAt)
	record.createdAtCursor = formatKnowledgeMemoryCursorTime(createdAt)
	// Legacy single-locale compat: mirror the first entry when set.
	if record.Locale == nil && len(record.Locales) == 1 {
		first := record.Locales[0]
		record.Locale = &first
	}
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

// projectFilter matches org-scoped documents. project_id is deprecated and
// always NULL for new rows; project targeting uses guideline_document_projects.
const guidelineDocumentProjectFilter = `d.organization_id = $1 and d.project_id is null`

// byIDFilter matches any guideline in the organization, including legacy
// project-owned rows that predate the org-scope migration.
const guidelineDocumentByIDFilter = `d.organization_id = $1`

func insertGuidelineDocument(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, input guidelineDocumentInsert) (guidelineDocumentRecord, error) {
	locales := append([]string{}, input.locales...)
	record, err := scanGuidelineDocument(db.QueryRow(ctx, `
		insert into guideline_documents as d (id, organization_id, project_id, locale, locales, is_global, title, storage_location_id, storage_key, filename,
			content_type, byte_size, revision_id, mandatory, status, enqueued_at, created_by_user_id)
		values ($2, $1, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'processing', now(), nullif($14, '')::uuid)
		returning `+guidelineDocumentColumns,
		scope.organizationID, input.id, input.locale, locales, input.isGlobal, input.title, input.storageLocationID, input.storageKey, input.filename,
		input.contentType, input.byteSize, input.revisionID, input.mandatory, input.userID), false)
	if err != nil {
		return guidelineDocumentRecord{}, err
	}
	return record, nil
}

type guidelineDocumentListPage struct {
	Records []guidelineDocumentRecord
	HasMore bool
}

// guidelineDocumentListFilter scopes the org document list. Project keeps the
// assignment semantics (global or assigned to the project); locale matches
// documents applying to every locale or to the requested one.
type guidelineDocumentListFilter struct {
	projectID string
	locale    string
}

func listGuidelineDocumentsPage(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, filter guidelineDocumentListFilter, limit int, cursorCreatedAt, cursorID string) (guidelineDocumentListPage, error) {
	where := guidelineDocumentProjectFilter
	args := []any{scope.organizationID}
	if filter.projectID != "" {
		args = append(args, filter.projectID)
		where += ` and (d.is_global or exists (select 1 from guideline_document_projects g
			where g.document_id = d.id and g.project_id = $` + strconv.Itoa(len(args)) + `))`
	}
	if filter.locale != "" {
		args = append(args, filter.locale)
		where += ` and (coalesce(cardinality(d.locales), 0) = 0 or $` + strconv.Itoa(len(args)) + ` = any(d.locales)
			or (d.locale is not null and d.locale = $` + strconv.Itoa(len(args)) + `))`
	}
	if cursorCreatedAt != "" || cursorID != "" {
		args = append(args, cursorCreatedAt, cursorID)
		pos := len(args)
		where += ` and (d.created_at, d.id) < ($` + strconv.Itoa(pos-1) + `::timestamptz, $` + strconv.Itoa(pos) + `::uuid)`
	}
	args = append(args, limit+1)
	limitPos := len(args)
	rows, err := db.Query(ctx, `select `+guidelineDocumentColumns+` from guideline_documents d
		where `+where+` order by d.created_at desc, d.id desc limit $`+strconv.Itoa(limitPos), args...)
	if err != nil {
		return guidelineDocumentListPage{}, fmt.Errorf("list guideline documents: %w", err)
	}
	defer rows.Close()
	records := make([]guidelineDocumentRecord, 0, limit+1)
	for rows.Next() {
		record, err := scanGuidelineDocument(rows, false)
		if err != nil {
			return guidelineDocumentListPage{}, fmt.Errorf("scan guideline document: %w", err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return guidelineDocumentListPage{}, err
	}
	hasMore := len(records) > limit
	if hasMore {
		records = records[:limit]
	}
	return guidelineDocumentListPage{Records: records, HasMore: hasMore}, nil
}

func loadGuidelineDocument(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, id string, withContent bool) (guidelineDocumentRecord, bool, error) {
	columns := guidelineDocumentColumns
	if withContent {
		columns += ", d.content"
	}
	record, err := scanGuidelineDocument(db.QueryRow(ctx, `select `+columns+` from guideline_documents d
		where `+guidelineDocumentByIDFilter+` and d.id = $2`, scope.organizationID, id), withContent)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, false, fmt.Errorf("load guideline document: %w", err)
	}
	return record, true, nil
}

type guidelineDocumentMetadata struct {
	title      *string
	locale     *string
	setLocale  bool
	locales    []string
	setLocales bool
	isGlobal   *bool
	mandatory  *bool
}

// updateGuidelineDocumentMetadata bumps the revision because locales and the
// mandatory flag are part of the indexed passage scope.
func updateGuidelineDocumentMetadata(ctx context.Context, db dictionaryDB, scope guidelineDocumentScope, id, revisionID string, change guidelineDocumentMetadata) (guidelineDocumentRecord, bool, error) {
	locales := append([]string{}, change.locales...)
	record, err := scanGuidelineDocument(db.QueryRow(ctx, `
		update guideline_documents d set
			title = coalesce($3, d.title),
			locale = case when $4 then $5 else d.locale end,
			locales = case when $6 then $7 else d.locales end,
			is_global = coalesce($8, d.is_global),
			mandatory = coalesce($9, d.mandatory),
			revision_id = $10, version = d.version + 1, enqueued_at = now(), updated_at = now()
		where `+guidelineDocumentProjectFilter+` and d.id = $2
		returning `+guidelineDocumentColumns,
		scope.organizationID, id, change.title, change.setLocale, change.locale, change.setLocales, locales,
		change.isGlobal, change.mandatory, revisionID), false)
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
		where `+guidelineDocumentProjectFilter+` and d.id = $2 for update`, scope.organizationID, id), false)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, guidelineDocumentRecord{}, false, fmt.Errorf("lock guideline document: %w", err)
	}
	updated, err := scanGuidelineDocument(conn.QueryRow(ctx, `
		update guideline_documents d set
			title = coalesce($3, d.title),
			locale = case when $4 then $5 else d.locale end,
			locales = case when $6 then $7 else d.locales end,
			is_global = coalesce($8, d.is_global),
			mandatory = coalesce($9, d.mandatory),
			revision_id = $10, version = d.version + 1, filename = $11, content_type = $12, byte_size = $13,
			storage_location_id = $14, storage_key = $15, content = '', truncated = false, status = 'processing',
			error_code = null, enqueued_at = now(), updated_at = now()
		where `+guidelineDocumentProjectFilter+` and d.id = $2
		returning `+guidelineDocumentColumns,
		scope.organizationID, id, change.title, change.setLocale, change.locale, change.setLocales, append([]string{}, change.locales...),
		change.isGlobal, change.mandatory,
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
		where `+guidelineDocumentProjectFilter+` and d.id = $2 returning `+guidelineDocumentColumns,
		scope.organizationID, id), false)
	if errors.Is(err, pgx.ErrNoRows) {
		return guidelineDocumentRecord{}, false, nil
	}
	if err != nil {
		return guidelineDocumentRecord{}, false, fmt.Errorf("delete guideline document: %w", err)
	}
	return record, true, nil
}

// listGuidelineDocumentsToSweep selects rows whose ingest message may have been
// lost: processing past the grace period, ready but not indexed at the current
// revision, or failed after a transient enqueue error.
func listGuidelineDocumentsToSweep(ctx context.Context, db dictionaryDB, olderThan time.Duration, limit int) ([]guidelineDocumentRecord, error) {
	rows, err := db.Query(ctx, `select `+guidelineDocumentColumns+` from guideline_documents d
		where d.enqueued_at < now() - make_interval(secs => $1)
			and (d.status = 'processing'
				or (d.status = 'ready' and d.indexed_revision_id is distinct from d.revision_id)
				or (d.status = 'failed' and d.error_code = 'guideline_ingest_enqueue_failed'))
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
	_, err := db.Exec(ctx, `update guideline_documents set
			enqueued_at = now(),
			status = case when status = 'failed' and error_code = 'guideline_ingest_enqueue_failed' then 'processing' else status end,
			error_code = case when status = 'failed' and error_code = 'guideline_ingest_enqueue_failed' then null else error_code end,
			updated_at = now()
		where id = $1 and revision_id = $2`, id, revisionID)
	return err
}
