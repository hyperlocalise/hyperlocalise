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

// InsertOutboxEvent records an async queue message in Postgres.
func (r *Repository) InsertOutboxEvent(ctx context.Context, db bun.IDB, event *OutboxEventModel) error {
	if _, err := db.NewInsert().Model(event).Exec(ctx); err != nil {
		return fmt.Errorf("insert outbox event: %w", err)
	}

	return nil
}

// ListPendingOutboxEvents returns a bounded batch of unprocessed outbox events.
func (r *Repository) ListPendingOutboxEvents(ctx context.Context, limit int) ([]OutboxEventModel, error) {
	if limit <= 0 {
		limit = 10
	}

	var events []OutboxEventModel
	err := r.db.NewSelect().
		Model((*OutboxEventModel)(nil)).
		Where("oe.status = ?", OutboxStatusPending).
		OrderExpr("oe.created_at ASC").
		Limit(limit).
		Scan(ctx, &events)
	if err != nil {
		return nil, fmt.Errorf("list pending outbox events: %w", err)
	}

	return events, nil
}

// MarkOutboxEventProcessed marks a queued event as handled by the worker.
func (r *Repository) MarkOutboxEventProcessed(ctx context.Context, eventID string, processedAt time.Time) error {
	_, err := r.db.NewUpdate().
		Model((*OutboxEventModel)(nil)).
		Set("status = ?", OutboxStatusProcessed).
		Set("updated_at = ?", processedAt).
		Set("processed_at = ?", processedAt).
		Where("id = ?", eventID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event processed: %w", err)
	}

	return nil
}
