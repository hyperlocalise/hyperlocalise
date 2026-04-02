package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/hyperlocalise/rain-orm/pkg/rain"
	"github.com/hyperlocalise/rain-orm/pkg/schema"
)

var (
	ErrNotFound      = errors.New("translation record not found")
	ErrAlreadyExists = errors.New("translation record already exists")
)

// Repository persists jobs and outbox records in Postgres via Rain.
type Repository struct {
	db *rain.DB
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
func NewRepository(db *rain.DB) *Repository {
	return &Repository{db: db}
}

// DB exposes the Rain database handle for transaction orchestration.
func (r *Repository) DB() *rain.DB {
	return r.db
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}

	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "unique failed")
}

// InsertJob creates a translation job row.
func (r *Repository) InsertJob(ctx context.Context, db queryExecutor, job *TranslationJobModel) error {
	if _, err := db.Insert().Table(TranslationJobs).Model(job).Exec(ctx); err != nil {
		return fmt.Errorf("insert translation job: %w", err)
	}

	return nil
}

// GetJob fetches a single translation job by project and id.
func (r *Repository) GetJob(ctx context.Context, jobID, projectID string) (*TranslationJobModel, error) {
	job := &TranslationJobModel{}
	err := r.db.Select().
		Table(TranslationJobs).
		Where(TranslationJobs.ID.Eq(jobID)).
		Where(TranslationJobs.ProjectID.Eq(projectID)).
		Limit(1).
		Scan(ctx, job)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("select translation job: %w", err)
	}

	return job, nil
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

	query := r.db.Select().
		Table(TranslationJobs).
		Where(TranslationJobs.ProjectID.Eq(projectID)).
		OrderBy(TranslationJobs.CreatedAt.Desc(), TranslationJobs.ID.Desc()).
		Limit(limit + 1)

	return r.listJobsPage(ctx, query, jobType, status, cursor, limit)
}

func (r *Repository) listJobsPage(
	ctx context.Context,
	query *rain.SelectQuery,
	jobType, status string,
	cursor *JobListCursor,
	limit int,
) (*JobListPage, error) {
	if query == nil {
		return nil, fmt.Errorf("list translation jobs: nil query")
	}

	if jobType != "" {
		query = query.Where(TranslationJobs.Type.Eq(jobType))
	}

	if status != "" {
		query = query.Where(TranslationJobs.Status.Eq(status))
	}

	if cursor != nil {
		query = query.Where(schema.Or(
			TranslationJobs.CreatedAt.Lt(cursor.CreatedAt),
			schema.And(
				TranslationJobs.CreatedAt.Eq(cursor.CreatedAt),
				TranslationJobs.ID.Lt(cursor.ID),
			),
		))
	}

	var jobs []TranslationJobModel
	if err := query.Scan(ctx, &jobs); err != nil {
		return nil, fmt.Errorf("list translation jobs: %w", err)
	}

	page := &JobListPage{}
	if len(jobs) == 0 {
		page.Jobs = []TranslationJobModel{}
		return page, nil
	}
	if len(jobs) > limit {
		last := jobs[limit-1]
		page.NextCursor = &JobListCursor{CreatedAt: last.CreatedAt, ID: last.ID}
		page.Jobs = jobs[:limit]
		return page, nil
	}
	page.Jobs = jobs

	return page, nil
}

// UpdateJobStatus updates a job's status and terminal payload.
func (r *Repository) UpdateJobStatus(
	ctx context.Context,
	db queryExecutor,
	jobID string,
	expectedStatus string,
	newStatus string,
	outcomeKind string,
	outcomePayload []byte,
	completedAt *time.Time,
) error {
	update := db.Update().
		Table(TranslationJobs).
		Set(TranslationJobs.Status, newStatus).
		Set(TranslationJobs.UpdatedAt, time.Now().UTC()).
		Set(TranslationJobs.OutcomeKind, outcomeKind).
		Set(TranslationJobs.OutcomePayload, outcomePayload).
		Set(TranslationJobs.CheckpointPayload, nil).
		Where(TranslationJobs.ID.Eq(jobID))

	if expectedStatus != "" {
		update = update.Where(TranslationJobs.Status.Eq(expectedStatus))
	}

	if completedAt != nil {
		update = update.Set(TranslationJobs.CompletedAt, *completedAt)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		return fmt.Errorf("update translation job status: %w", err)
	}

	affected, err := rowsAffected(result, "translation job status update")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

// SaveJobCheckpoint persists resumable job progress while the job is still running.
func (r *Repository) SaveJobCheckpoint(
	ctx context.Context,
	db queryExecutor,
	jobID string,
	expectedStatus string,
	checkpointPayload []byte,
	lastError string,
) error {
	update := db.Update().
		Table(TranslationJobs).
		Set(TranslationJobs.CheckpointPayload, checkpointPayload).
		Set(TranslationJobs.LastError, lastError).
		Set(TranslationJobs.UpdatedAt, time.Now().UTC()).
		Where(TranslationJobs.ID.Eq(jobID))

	if expectedStatus != "" {
		update = update.Where(TranslationJobs.Status.Eq(expectedStatus))
	}

	result, err := update.Exec(ctx)
	if err != nil {
		return fmt.Errorf("save translation job checkpoint: %w", err)
	}

	affected, err := rowsAffected(result, "translation checkpoint update")
	if err != nil {
		return err
	}
	if affected == 0 {
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
func (r *Repository) InsertOutboxEvent(ctx context.Context, db queryExecutor, event *OutboxEventModel) error {
	if _, err := db.Insert().Table(OutboxEvents).Model(event).Exec(ctx); err != nil {
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
	err := r.db.Select().
		Table(OutboxEvents).
		Where(schema.Or(
			schema.And(
				OutboxEvents.DeliveryStatus.Eq(OutboxDeliveryStatusPending),
				OutboxEvents.DeliveryNextAttemptAt.Lte(now),
			),
			schema.And(
				OutboxEvents.DeliveryStatus.Eq(OutboxDeliveryStatusProcessing),
				OutboxEvents.DeliveryClaimExpiresAt.Lte(now),
			),
		)).
		OrderBy(OutboxEvents.DeliveryNextAttemptAt.Asc(), OutboxEvents.CreatedAt.Asc()).
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

	result, err := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.DeliveryStatus, OutboxDeliveryStatusProcessing).
		Set(OutboxEvents.DeliveryClaimedBy, dispatcherID).
		Set(OutboxEvents.DeliveryClaimedAt, now).
		Set(OutboxEvents.DeliveryClaimExpiresAt, claimExpiresAt).
		Set(OutboxEvents.UpdatedAt, now).
		Where(OutboxEvents.ID.Eq(eventID)).
		Where(schema.Or(
			schema.And(
				OutboxEvents.DeliveryStatus.Eq(OutboxDeliveryStatusPending),
				OutboxEvents.DeliveryNextAttemptAt.Lte(now),
			),
			schema.And(
				OutboxEvents.DeliveryStatus.Eq(OutboxDeliveryStatusProcessing),
				OutboxEvents.DeliveryClaimExpiresAt.Lte(now),
			),
		)).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("claim outbox event delivery: %w", err)
	}

	affected, err := rowsAffected(result, "outbox delivery claim")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkOutboxEventPublished records successful broker delivery without touching execution state.
func (r *Repository) MarkOutboxEventPublished(ctx context.Context, eventID, dispatcherID string, publishedAt time.Time) error {
	query := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.DeliveryStatus, OutboxDeliveryStatusPublished).
		Set(OutboxEvents.DeliveryLastError, "").
		Set(OutboxEvents.PublishedAt, publishedAt).
		Set(OutboxEvents.DeliveryClaimedBy, "").
		Set(OutboxEvents.DeliveryClaimedAt, nil).
		Set(OutboxEvents.DeliveryClaimExpiresAt, nil).
		Set(OutboxEvents.UpdatedAt, publishedAt).
		Where(OutboxEvents.ID.Eq(eventID))
	if dispatcherID != "" {
		query = query.Where(OutboxEvents.DeliveryClaimedBy.Eq(dispatcherID))
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event published: %w", err)
	}

	affected, err := rowsAffected(result, "outbox published update")
	if err != nil {
		return err
	}
	if affected == 0 {
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
	query := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.DeliveryStatus, OutboxDeliveryStatusPending).
		Set(OutboxEvents.DeliveryAttemptCount, attemptCount).
		Set(OutboxEvents.DeliveryNextAttemptAt, nextAttemptAt).
		Set(OutboxEvents.DeliveryLastError, lastError).
		Set(OutboxEvents.DeliveryClaimedBy, "").
		Set(OutboxEvents.DeliveryClaimedAt, nil).
		Set(OutboxEvents.DeliveryClaimExpiresAt, nil).
		Set(OutboxEvents.UpdatedAt, now).
		Where(OutboxEvents.ID.Eq(eventID))
	if dispatcherID != "" {
		query = query.Where(OutboxEvents.DeliveryClaimedBy.Eq(dispatcherID))
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("schedule outbox event delivery retry: %w", err)
	}

	affected, err := rowsAffected(result, "outbox delivery retry update")
	if err != nil {
		return err
	}
	if affected == 0 {
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
	query := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.DeliveryStatus, OutboxDeliveryStatusDeadLettered).
		Set(OutboxEvents.DeliveryAttemptCount, attemptCount).
		Set(OutboxEvents.DeliveryLastError, lastError).
		Set(OutboxEvents.DeliveryClaimedBy, "").
		Set(OutboxEvents.DeliveryClaimedAt, nil).
		Set(OutboxEvents.DeliveryClaimExpiresAt, nil).
		Set(OutboxEvents.UpdatedAt, at).
		Where(OutboxEvents.ID.Eq(eventID))
	if dispatcherID != "" {
		query = query.Where(OutboxEvents.DeliveryClaimedBy.Eq(dispatcherID))
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event delivery dead-lettered: %w", err)
	}

	affected, err := rowsAffected(result, "outbox delivery dead-letter update")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

// GetOutboxEvent fetches a single outbox event by id.
func (r *Repository) GetOutboxEvent(ctx context.Context, eventID string) (*OutboxEventModel, error) {
	event := &OutboxEventModel{}
	err := r.db.Select().
		Table(OutboxEvents).
		Where(OutboxEvents.ID.Eq(eventID)).
		Limit(1).
		Scan(ctx, event)
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
	err := r.db.Select().
		Table(OutboxEvents).
		Where(schema.Or(
			schema.And(
				OutboxEvents.Status.Eq(OutboxStatusPending),
				OutboxEvents.NextAttemptAt.Lte(now),
			),
			schema.And(
				OutboxEvents.Status.Eq(OutboxStatusProcessing),
				OutboxEvents.ClaimExpiresAt.Lte(now),
			),
		)).
		OrderBy(OutboxEvents.NextAttemptAt.Asc(), OutboxEvents.CreatedAt.Asc()).
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

	result, err := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.Status, OutboxStatusProcessing).
		Set(OutboxEvents.ClaimedBy, workerID).
		Set(OutboxEvents.ClaimedAt, now).
		Set(OutboxEvents.ClaimExpiresAt, claimExpiresAt).
		Set(OutboxEvents.UpdatedAt, now).
		Where(OutboxEvents.ID.Eq(eventID)).
		Where(schema.Or(
			schema.And(
				OutboxEvents.Status.Eq(OutboxStatusPending),
				OutboxEvents.NextAttemptAt.Lte(now),
			),
			schema.And(
				OutboxEvents.Status.Eq(OutboxStatusProcessing),
				OutboxEvents.ClaimExpiresAt.Lte(now),
			),
		)).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("claim outbox event: %w", err)
	}

	affected, err := rowsAffected(result, "outbox claim")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkOutboxEventProcessed marks a queued event as handled by the worker.
func (r *Repository) MarkOutboxEventProcessed(ctx context.Context, eventID, workerID string, processedAt time.Time) error {
	query := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.Status, OutboxStatusProcessed).
		Set(OutboxEvents.UpdatedAt, processedAt).
		Set(OutboxEvents.ProcessedAt, processedAt).
		Set(OutboxEvents.ClaimedBy, "").
		Set(OutboxEvents.ClaimedAt, nil).
		Set(OutboxEvents.ClaimExpiresAt, nil).
		Where(OutboxEvents.ID.Eq(eventID))
	if workerID != "" {
		query = query.Where(OutboxEvents.ClaimedBy.Eq(workerID))
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event processed: %w", err)
	}

	affected, err := rowsAffected(result, "outbox processed update")
	if err != nil {
		return err
	}
	if affected == 0 {
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
	query := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.Status, OutboxStatusPending).
		Set(OutboxEvents.AttemptCount, attemptCount).
		Set(OutboxEvents.NextAttemptAt, nextAttemptAt).
		Set(OutboxEvents.LastError, lastError).
		Set(OutboxEvents.ClaimedBy, "").
		Set(OutboxEvents.ClaimedAt, nil).
		Set(OutboxEvents.ClaimExpiresAt, nil).
		Set(OutboxEvents.UpdatedAt, time.Now().UTC()).
		Where(OutboxEvents.ID.Eq(eventID))
	if workerID != "" {
		query = query.Where(OutboxEvents.ClaimedBy.Eq(workerID))
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("schedule outbox event retry: %w", err)
	}

	affected, err := rowsAffected(result, "outbox retry update")
	if err != nil {
		return err
	}
	if affected == 0 {
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
	query := r.db.Update().
		Table(OutboxEvents).
		Set(OutboxEvents.Status, OutboxStatusDeadLettered).
		Set(OutboxEvents.AttemptCount, attemptCount).
		Set(OutboxEvents.LastError, lastError).
		Set(OutboxEvents.DeadLetteredAt, at).
		Set(OutboxEvents.ProcessedAt, at).
		Set(OutboxEvents.ClaimedBy, "").
		Set(OutboxEvents.ClaimedAt, nil).
		Set(OutboxEvents.ClaimExpiresAt, nil).
		Set(OutboxEvents.UpdatedAt, at).
		Where(OutboxEvents.ID.Eq(eventID))
	if workerID != "" {
		query = query.Where(OutboxEvents.ClaimedBy.Eq(workerID))
	}
	result, err := query.Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark outbox event dead-lettered: %w", err)
	}

	affected, err := rowsAffected(result, "outbox dead-letter update")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}
