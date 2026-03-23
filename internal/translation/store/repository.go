package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/bun"
)

var ErrNotFound = errors.New("translation record not found")

// Repository persists jobs and outbox records in Postgres via Bun.
type Repository struct {
	db *bun.DB
}

type JobListCursor struct {
	CreatedAt time.Time
	ID        string
}

type JobListPage struct {
	Jobs       []TranslationJobModel
	NextCursor *JobListCursor
}

// NewRepository constructs the Postgres-backed translation repository.
func NewRepository(db *bun.DB) *Repository {
	return &Repository{db: db}
}

// DB exposes the Bun database handle for transaction orchestration.
func (r *Repository) DB() *bun.DB {
	return r.db
}

// InsertJob creates a translation job row.
func (r *Repository) InsertJob(ctx context.Context, db bun.IDB, job *TranslationJobModel) error {
	if _, err := db.NewInsert().Model(job).Exec(ctx); err != nil {
		return fmt.Errorf("insert translation job: %w", err)
	}

	return nil
}

// GetJob fetches a single translation job by project and id.
func (r *Repository) GetJob(ctx context.Context, jobID, projectID string) (*TranslationJobModel, error) {
	job := &TranslationJobModel{}
	err := r.db.NewSelect().
		Model(job).
		Where("tj.id = ?", jobID).
		Where("tj.project_id = ?", projectID).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("select translation job: %w", err)
	}

	return job, nil
}

// ListJobs lists translation jobs for a project.
func (r *Repository) ListJobs(
	ctx context.Context,
	projectID, jobType, status string,
	limit int,
) (*JobListPage, error) {
	return r.ListJobsPage(ctx, projectID, jobType, status, limit, nil)
}

func (r *Repository) ListJobsPage(
	ctx context.Context,
	projectID, jobType, status string,
	limit int,
	cursor *JobListCursor,
) (*JobListPage, error) {
	if limit <= 0 {
		limit = 50
	}

	query := r.db.NewSelect().
		Model((*TranslationJobModel)(nil)).
		Where("tj.project_id = ?", projectID).
		OrderExpr("tj.created_at DESC").
		OrderExpr("tj.id DESC").
		Limit(limit + 1)

	return r.listJobsPage(ctx, query, jobType, status, cursor, limit)
}

func (r *Repository) listJobsPage(
	ctx context.Context,
	query *bun.SelectQuery,
	jobType, status string,
	cursor *JobListCursor,
	limit int,
) (*JobListPage, error) {
	if query == nil {
		return nil, fmt.Errorf("list translation jobs: nil query")
	}

	if jobType != "" {
		query = query.Where("tj.type = ?", jobType)
	}

	if status != "" {
		query = query.Where("tj.status = ?", status)
	}

	if cursor != nil {
		query = query.Where(
			"(tj.created_at < ? OR (tj.created_at = ? AND tj.id < ?))",
			cursor.CreatedAt,
			cursor.CreatedAt,
			cursor.ID,
		)
	}

	var jobs []TranslationJobModel
	if err := query.Scan(ctx, &jobs); err != nil {
		return nil, fmt.Errorf("list translation jobs: %w", err)
	}

	page := &JobListPage{Jobs: jobs}
	if len(jobs) == 0 {
		page.Jobs = []TranslationJobModel{}
		return page, nil
	}
	maxItems := limit
	if maxItems > 0 && len(jobs) > maxItems {
		last := jobs[maxItems-1]
		page.NextCursor = &JobListCursor{CreatedAt: last.CreatedAt, ID: last.ID}
		page.Jobs = jobs[:maxItems]
	}

	return page, nil
}

// UpdateJobStatus updates a job's status and terminal payload.
func (r *Repository) UpdateJobStatus(
	ctx context.Context,
	db bun.IDB,
	jobID string,
	expectedStatus string,
	newStatus string,
	outcomeKind string,
	outcomePayload []byte,
	completedAt *time.Time,
) error {
	update := db.NewUpdate().
		Model((*TranslationJobModel)(nil)).
		Set("status = ?", newStatus).
		Set("updated_at = ?", time.Now().UTC()).
		Set("outcome_kind = ?", outcomeKind).
		Set("outcome_payload = ?", outcomePayload).
		Set("checkpoint_payload = NULL").
		Where("id = ?", jobID)

	if expectedStatus != "" {
		update = update.Where("status = ?", expectedStatus)
	}

	if completedAt != nil {
		update = update.Set("completed_at = ?", *completedAt)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		return fmt.Errorf("update translation job status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count translation job rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// SaveJobCheckpoint persists resumable job progress while the job is still running.
func (r *Repository) SaveJobCheckpoint(
	ctx context.Context,
	db bun.IDB,
	jobID string,
	expectedStatus string,
	checkpointPayload []byte,
	lastError string,
) error {
	update := db.NewUpdate().
		Model((*TranslationJobModel)(nil)).
		Set("checkpoint_payload = ?", checkpointPayload).
		Set("last_error = ?", lastError).
		Set("updated_at = ?", time.Now().UTC()).
		Where("id = ?", jobID)

	if expectedStatus != "" {
		update = update.Where("status = ?", expectedStatus)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		return fmt.Errorf("save translation job checkpoint: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count translation checkpoint rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkJobRunning advances a queued job into running state.
func (r *Repository) MarkJobRunning(ctx context.Context, jobID string) error {
	return r.UpdateJobStatus(ctx, r.db, jobID, JobStatusQueued, JobStatusRunning, "", nil, nil)
}

// PersistJobTerminal stores a terminal outcome for a running job.
func (r *Repository) PersistJobTerminal(
	ctx context.Context,
	jobID string,
	newStatus string,
	outcomeKind string,
	outcomePayload []byte,
	completedAt time.Time,
) error {
	return r.UpdateJobStatus(ctx, r.db, jobID, JobStatusRunning, newStatus, outcomeKind, outcomePayload, &completedAt)
}

// SaveRunningJobCheckpoint persists resumable progress for a running job using the repository DB handle.
func (r *Repository) SaveRunningJobCheckpoint(ctx context.Context, jobID, expectedStatus string, checkpointPayload []byte, lastError string) error {
	return r.SaveJobCheckpoint(ctx, r.db, jobID, expectedStatus, checkpointPayload, lastError)
}

// InsertOutboxEvent records an async queue message in Postgres.
func (r *Repository) InsertOutboxEvent(ctx context.Context, db bun.IDB, event *OutboxEventModel) error {
	if _, err := db.NewInsert().Model(event).Exec(ctx); err != nil {
		return fmt.Errorf("insert outbox event: %w", err)
	}

	return nil
}

// ListDispatchableOutboxEvents returns events whose broker delivery is due or whose delivery lease expired.
func (r *Repository) ListDispatchableOutboxEvents(ctx context.Context, now time.Time, limit int) ([]OutboxEventModel, error) {
	if limit <= 0 {
		limit = 10
	}

	var events []OutboxEventModel
	err := r.db.NewSelect().
		Model((*OutboxEventModel)(nil)).
		Where(
			"((oe.delivery_status = ? AND oe.delivery_next_attempt_at <= ?) OR (oe.delivery_status = ? AND oe.delivery_claim_expires_at <= ?))",
			OutboxDeliveryStatusPending, now,
			OutboxDeliveryStatusProcessing, now,
		).
		OrderExpr("oe.delivery_next_attempt_at ASC").
		OrderExpr("oe.created_at ASC").
		Limit(limit).
		Scan(ctx, &events)
	if err != nil {
		return nil, fmt.Errorf("list dispatchable outbox events: %w", err)
	}

	return events, nil
}

// ClaimOutboxEventDelivery marks an event as in-flight for broker delivery.
func (r *Repository) ClaimOutboxEventDelivery(
	ctx context.Context,
	eventID, dispatcherID string,
	now time.Time,
	leaseDuration time.Duration,
) error {
	if leaseDuration <= 0 {
		leaseDuration = 30 * time.Second
	}
	claimExpiresAt := now.Add(leaseDuration)

	result, err := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("delivery_status = ?", OutboxDeliveryStatusProcessing).
		Set("delivery_claimed_by = ?", dispatcherID).
		Set("delivery_claimed_at = ?", now).
		Set("delivery_claim_expires_at = ?", claimExpiresAt).
		Set("updated_at = ?", now).
		Where("id = ?", eventID).
		Where(
			"((delivery_status = ? AND delivery_next_attempt_at <= ?) OR (delivery_status = ? AND delivery_claim_expires_at <= ?))",
			OutboxDeliveryStatusPending, now,
			OutboxDeliveryStatusProcessing, now,
		).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("claim outbox event delivery: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox delivery claim rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkOutboxEventPublished records successful broker delivery without touching execution state.
func (r *Repository) MarkOutboxEventPublished(ctx context.Context, eventID, dispatcherID string, publishedAt time.Time) error {
	query := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("delivery_status = ?", OutboxDeliveryStatusPublished).
		Set("delivery_last_error = ''").
		Set("published_at = ?", publishedAt).
		Set("delivery_claimed_by = ''").
		Set("delivery_claimed_at = NULL").
		Set("delivery_claim_expires_at = NULL").
		Set("updated_at = ?", publishedAt).
		Where("id = ?", eventID)
	if dispatcherID != "" {
		query = query.Where("delivery_claimed_by = ?", dispatcherID)
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event published: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox published rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// ScheduleOutboxEventDeliveryRetry releases an event for a later publish retry.
func (r *Repository) ScheduleOutboxEventDeliveryRetry(
	ctx context.Context,
	eventID, dispatcherID string,
	attemptCount int,
	nextAttemptAt time.Time,
	lastError string,
	now time.Time,
) error {
	query := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("delivery_status = ?", OutboxDeliveryStatusPending).
		Set("delivery_attempt_count = ?", attemptCount).
		Set("delivery_next_attempt_at = ?", nextAttemptAt).
		Set("delivery_last_error = ?", lastError).
		Set("delivery_claimed_by = ''").
		Set("delivery_claimed_at = NULL").
		Set("delivery_claim_expires_at = NULL").
		Set("updated_at = ?", now).
		Where("id = ?", eventID)
	if dispatcherID != "" {
		query = query.Where("delivery_claimed_by = ?", dispatcherID)
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("schedule outbox event delivery retry: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox delivery retry rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkOutboxEventDeliveryDeadLettered records terminal broker delivery failure.
func (r *Repository) MarkOutboxEventDeliveryDeadLettered(
	ctx context.Context,
	eventID, dispatcherID string,
	at time.Time,
	attemptCount int,
	lastError string,
) error {
	query := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("delivery_status = ?", OutboxDeliveryStatusDeadLettered).
		Set("delivery_attempt_count = ?", attemptCount).
		Set("delivery_last_error = ?", lastError).
		Set("delivery_claimed_by = ''").
		Set("delivery_claimed_at = NULL").
		Set("delivery_claim_expires_at = NULL").
		Set("updated_at = ?", at).
		Where("id = ?", eventID)
	if dispatcherID != "" {
		query = query.Where("delivery_claimed_by = ?", dispatcherID)
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event delivery dead-lettered: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox delivery dead-letter rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// GetOutboxEvent fetches a single outbox event by id.
func (r *Repository) GetOutboxEvent(ctx context.Context, eventID string) (*OutboxEventModel, error) {
	event := &OutboxEventModel{}
	err := r.db.NewSelect().
		Model(event).
		Where("oe.id = ?", eventID).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("select outbox event: %w", err)
	}

	return event, nil
}

// ListPendingOutboxEvents returns a bounded batch of claimable outbox events.
func (r *Repository) ListPendingOutboxEvents(ctx context.Context, now time.Time, limit int) ([]OutboxEventModel, error) {
	if limit <= 0 {
		limit = 10
	}

	var events []OutboxEventModel
	err := r.db.NewSelect().
		Model((*OutboxEventModel)(nil)).
		Where(
			"((oe.status = ? AND oe.next_attempt_at <= ?) OR (oe.status = ? AND oe.claim_expires_at <= ?))",
			OutboxStatusPending, now,
			OutboxStatusProcessing, now,
		).
		OrderExpr("oe.next_attempt_at ASC").
		OrderExpr("oe.created_at ASC").
		Limit(limit).
		Scan(ctx, &events)
	if err != nil {
		return nil, fmt.Errorf("list pending outbox events: %w", err)
	}

	return events, nil
}

// ClaimOutboxEvent marks an event as processing for one worker lease.
func (r *Repository) ClaimOutboxEvent(
	ctx context.Context,
	eventID, workerID string,
	now time.Time,
	leaseDuration time.Duration,
) error {
	if leaseDuration <= 0 {
		leaseDuration = 30 * time.Second
	}
	claimExpiresAt := now.Add(leaseDuration)

	result, err := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("status = ?", OutboxStatusProcessing).
		Set("claimed_by = ?", workerID).
		Set("claimed_at = ?", now).
		Set("claim_expires_at = ?", claimExpiresAt).
		Set("updated_at = ?", now).
		Where("id = ?", eventID).
		Where(
			"((status = ? AND next_attempt_at <= ?) OR (status = ? AND claim_expires_at <= ?))",
			OutboxStatusPending, now,
			OutboxStatusProcessing, now,
		).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("claim outbox event: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox claim rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkOutboxEventProcessed marks a queued event as handled by the worker.
func (r *Repository) MarkOutboxEventProcessed(ctx context.Context, eventID, workerID string, processedAt time.Time) error {
	query := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("status = ?", OutboxStatusProcessed).
		Set("updated_at = ?", processedAt).
		Set("processed_at = ?", processedAt).
		Set("claimed_by = ''").
		Set("claimed_at = NULL").
		Set("claim_expires_at = NULL").
		Where("id = ?", eventID)
	if workerID != "" {
		query = query.Where("claimed_by = ?", workerID)
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event processed: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox processed rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// ScheduleOutboxEventRetry releases an event back to the queue with backoff metadata.
func (r *Repository) ScheduleOutboxEventRetry(
	ctx context.Context,
	eventID, workerID string,
	attemptCount int,
	nextAttemptAt time.Time,
	lastError string,
) error {
	query := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("status = ?", OutboxStatusPending).
		Set("attempt_count = ?", attemptCount).
		Set("next_attempt_at = ?", nextAttemptAt).
		Set("last_error = ?", lastError).
		Set("claimed_by = ''").
		Set("claimed_at = NULL").
		Set("claim_expires_at = NULL").
		Set("updated_at = ?", time.Now().UTC()).
		Where("id = ?", eventID)
	if workerID != "" {
		query = query.Where("claimed_by = ?", workerID)
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("schedule outbox event retry: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox retry rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkOutboxEventDeadLettered marks a queued event as exhausted and terminal.
func (r *Repository) MarkOutboxEventDeadLettered(
	ctx context.Context,
	eventID, workerID string,
	at time.Time,
	attemptCount int,
	lastError string,
) error {
	query := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("status = ?", OutboxStatusDeadLettered).
		Set("attempt_count = ?", attemptCount).
		Set("last_error = ?", lastError).
		Set("dead_lettered_at = ?", at).
		Set("processed_at = ?", at).
		Set("claimed_by = ''").
		Set("claimed_at = NULL").
		Set("claim_expires_at = NULL").
		Set("updated_at = ?", at).
		Where("id = ?", eventID)
	if workerID != "" {
		query = query.Where("claimed_by = ?", workerID)
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event dead-lettered: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count outbox dead-letter rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}
