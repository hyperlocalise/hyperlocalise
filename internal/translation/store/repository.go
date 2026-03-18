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
) ([]TranslationJobModel, error) {
	if limit <= 0 {
		limit = 50
	}

	query := r.db.NewSelect().
		Model((*TranslationJobModel)(nil)).
		Where("tj.project_id = ?", projectID).
		OrderExpr("tj.created_at DESC").
		Limit(limit)

	if jobType != "" {
		query = query.Where("tj.type = ?", jobType)
	}

	if status != "" {
		query = query.Where("tj.status = ?", status)
	}

	var jobs []TranslationJobModel
	if err := query.Scan(ctx, &jobs); err != nil {
		return nil, fmt.Errorf("list translation jobs: %w", err)
	}

	return jobs, nil
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
