package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
)

// ErrFileJobsNotImplemented reports that async file translation is not implemented yet.
var ErrFileJobsNotImplemented = errors.New("file translation jobs are not implemented yet")

// JobRepository captures the persistence operations needed by the worker processor.
type JobRepository interface {
	GetJob(ctx context.Context, jobID, projectID string) (*store.TranslationJobModel, error)
	MarkJobRunning(ctx context.Context, jobID string) error
	PersistJobTerminal(ctx context.Context, jobID string, newStatus string, outcomeKind string, outcomePayload []byte, completedAt time.Time) error
	SaveRunningJobCheckpoint(ctx context.Context, jobID, expectedStatus string, checkpointPayload []byte, lastError string) error
	MarkOutboxEventProcessed(ctx context.Context, eventID, workerID string, processedAt time.Time) error
	ScheduleOutboxEventRetry(ctx context.Context, eventID, workerID string, attemptCount int, nextAttemptAt time.Time, lastError string) error
	MarkOutboxEventDeadLettered(ctx context.Context, eventID, workerID string, at time.Time, attemptCount int, lastError string) error
}

// RetryPolicy defines retry scheduling for transient worker failures.
type RetryPolicy struct {
	MaxAttempts    int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
}

// Processor advances a single queued job event through the translation workflow.
type Processor struct {
	repository  JobRepository
	executor    stringExecutor
	retryPolicy RetryPolicy
	workerID    string
	clock       func() time.Time
}

// NewProcessor constructs a translation worker Processor.
func NewProcessor(repository JobRepository, executor stringExecutor) *Processor {
	return &Processor{
		repository: repository,
		executor:   executor,
		retryPolicy: RetryPolicy{
			MaxAttempts:    5,
			InitialBackoff: time.Second,
			MaxBackoff:     30 * time.Second,
		},
		clock: func() time.Time {
			return time.Now().UTC()
		},
	}
}

// WithRetryPolicy overrides the retry policy used for transient failures.
func (p *Processor) WithRetryPolicy(policy RetryPolicy) *Processor {
	if policy.MaxAttempts > 0 {
		p.retryPolicy.MaxAttempts = policy.MaxAttempts
	}
	if policy.InitialBackoff > 0 {
		p.retryPolicy.InitialBackoff = policy.InitialBackoff
	}
	if policy.MaxBackoff > 0 {
		p.retryPolicy.MaxBackoff = policy.MaxBackoff
	}
	return p
}

// ProcessJobQueuedEvent handles a single queued translation job notification.
func (p *Processor) ProcessJobQueuedEvent(ctx context.Context, payload translationapp.JobQueuedPayload) error {
	job, err := p.ensureJobRunning(ctx, &store.TranslationJobModel{
		ID:        payload.JobID,
		ProjectID: payload.ProjectID,
	})
	if err != nil {
		return fmt.Errorf("process translation job %s: %w", payload.JobID, err)
	}
	if isTerminalStatus(job.Status) {
		return p.finishProcessedEvent(ctx, job.ID, payload.EventID)
	}

	outcomeKind, outcomePayload, completedAt, execErr := p.buildOutcome(ctx, job)
	if execErr != nil {
		if handleErr := p.handleExecutionError(ctx, job, payload, execErr); handleErr != nil {
			return fmt.Errorf("process translation job %s: %w", job.ID, handleErr)
		}
		return nil
	}

	if err := p.completeJobSuccess(ctx, job, outcomeKind, outcomePayload, completedAt); err != nil {
		return fmt.Errorf("process translation job %s: %w", job.ID, err)
	}

	return p.finishProcessedEvent(ctx, job.ID, payload.EventID)
}

type executionError struct {
	err       error
	retryable bool
}

func (e *executionError) Error() string { return e.err.Error() }
func (e *executionError) Unwrap() error { return e.err }

func retryableErrorf(format string, args ...any) error {
	return &executionError{err: fmt.Errorf(format, args...), retryable: true}
}

func permanentErrorf(format string, args ...any) error {
	return &executionError{err: fmt.Errorf(format, args...), retryable: false}
}

func isRetryableError(err error) bool {
	var execErr *executionError
	if errors.As(err, &execErr) {
		return execErr.retryable
	}
	return false
}

type stringCheckpoint struct {
	Translations map[string]string `json:"translations"`
}

// buildOutcome executes the job payload and returns the terminal outcome payload.
func (p *Processor) buildOutcome(
	ctx context.Context,
	job *store.TranslationJobModel,
) (string, []byte, time.Time, error) {
	switch job.Type {
	case store.JobTypeString:
		if p.executor == nil {
			return "", nil, time.Time{}, permanentErrorf("string translation executor is not configured")
		}

		input, err := translationapp.DecodeStringInput(job.InputPayload)
		if err != nil {
			return "", nil, time.Time{}, permanentErrorf("decode string input: %w", err)
		}

		checkpoint, err := decodeCheckpoint(job.CheckpointPayload)
		if err != nil {
			return "", nil, time.Time{}, permanentErrorf("decode checkpoint: %w", err)
		}

		for _, locale := range input.GetTargetLocales() {
			if _, ok := checkpoint.Translations[locale]; ok {
				continue
			}

			task := TranslationTask{
				SourceText:   input.GetSourceText(),
				SourceLocale: input.GetSourceLocale(),
				TargetLocale: locale,
				Metadata:     input.GetMetadata(),
			}
			text, route, execErr := p.executor.Translate(ctx, task)
			if execErr != nil {
				if saveErr := p.persistCheckpoint(ctx, job, checkpoint, execErr.Error()); saveErr != nil {
					return "", nil, time.Time{}, fmt.Errorf("persist checkpoint after translation failure: %w", saveErr)
				}
				return "", nil, time.Time{}, retryableErrorf("translate locale %q with route %s/%s: %w", locale, route.Provider, route.Model, execErr)
			}

			log.Printf("translation task route source=%s target=%s provider=%s model=%s reasons=%s", task.SourceLocale, task.TargetLocale, route.Provider, route.Model, strings.Join(route.Reasons, " | "))
			checkpoint.Translations[locale] = text
			if saveErr := p.persistCheckpoint(ctx, job, checkpoint, ""); saveErr != nil {
				return "", nil, time.Time{}, fmt.Errorf("persist checkpoint after locale %q: %w", locale, saveErr)
			}
		}

		completedAt := p.clock()
		translations := make([]*translationv1.StringTranslation, 0, len(input.GetTargetLocales()))
		for _, locale := range input.GetTargetLocales() {
			translations = append(translations, &translationv1.StringTranslation{
				Locale: locale,
				Text:   checkpoint.Translations[locale],
			})
		}

		payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobResult{Translations: translations})
		if err != nil {
			return "", nil, time.Time{}, permanentErrorf("encode string result: %w", err)
		}

		return "string_result", payload, completedAt, nil
	case store.JobTypeFile:
		return "", nil, time.Time{}, permanentErrorf("%w", ErrFileJobsNotImplemented)
	default:
		return "", nil, time.Time{}, permanentErrorf("unsupported job type %q", job.Type)
	}
}

func decodeCheckpoint(payload []byte) (*stringCheckpoint, error) {
	checkpoint := &stringCheckpoint{Translations: map[string]string{}}
	if len(payload) == 0 {
		return checkpoint, nil
	}
	if err := json.Unmarshal(payload, checkpoint); err != nil {
		return nil, err
	}
	if checkpoint.Translations == nil {
		checkpoint.Translations = map[string]string{}
	}
	return checkpoint, nil
}

func (p *Processor) persistCheckpoint(
	ctx context.Context,
	job *store.TranslationJobModel,
	checkpoint *stringCheckpoint,
	lastError string,
) error {
	payload, err := json.Marshal(checkpoint)
	if err != nil {
		return fmt.Errorf("marshal checkpoint: %w", err)
	}
	if err := p.repository.SaveRunningJobCheckpoint(ctx, job.ID, store.JobStatusRunning, payload, lastError); err != nil {
		return err
	}
	job.CheckpointPayload = payload
	job.LastError = lastError
	return nil
}

func (p *Processor) handleExecutionError(ctx context.Context, job *store.TranslationJobModel, payload translationapp.JobQueuedPayload, execErr error) error {
	eventID := payload.EventID
	if !isRetryableError(execErr) {
		if failErr := p.failJob(ctx, job, execErr); failErr != nil {
			return failErr
		}
		if eventID != "" {
			if err := p.repository.MarkOutboxEventDeadLettered(ctx, eventID, p.workerID, p.clock(), payload.AttemptCount+1, execErr.Error()); err != nil {
				return err
			}
		}
		return nil
	}

	if eventID == "" {
		return execErr
	}

	attemptCount := payload.AttemptCount + 1
	if attemptCount >= resolveMaxAttempts(payload.MaxAttempts, p.retryPolicy) {
		if failErr := p.failJob(ctx, job, execErr); failErr != nil {
			return failErr
		}
		if err := p.repository.MarkOutboxEventDeadLettered(ctx, eventID, p.workerID, p.clock(), attemptCount, execErr.Error()); err != nil {
			return err
		}
		return nil
	}

	nextAttemptAt := p.clock().Add(backoffForAttempt(attemptCount, p.retryPolicy))
	if err := p.repository.ScheduleOutboxEventRetry(ctx, eventID, p.workerID, attemptCount, nextAttemptAt, execErr.Error()); err != nil {
		return err
	}
	return execErr
}

func resolveMaxAttempts(payloadMaxAttempts int, policy RetryPolicy) int {
	if payloadMaxAttempts > 0 {
		return payloadMaxAttempts
	}

	if policy.MaxAttempts > 0 {
		return policy.MaxAttempts
	}
	return 1
}

func backoffForAttempt(attempt int, policy RetryPolicy) time.Duration {
	backoff := policy.InitialBackoff
	if backoff <= 0 {
		backoff = time.Second
	}
	if attempt <= 1 {
		if policy.MaxBackoff > 0 && backoff > policy.MaxBackoff {
			return policy.MaxBackoff
		}
		return backoff
	}
	for idx := 1; idx < attempt; idx++ {
		backoff *= 2
		if policy.MaxBackoff > 0 && backoff >= policy.MaxBackoff {
			return policy.MaxBackoff
		}
	}
	return backoff
}

// failJob stores a terminal error payload for a job that could not complete.
func (p *Processor) failJob(ctx context.Context, job *store.TranslationJobModel, outcomeErr error) error {
	completedAt := p.clock()
	payload, err := translationapp.EncodeProto(&translationv1.TranslationJobError{
		Code:    translationv1.TranslationJobError_CODE_INTERNAL,
		Message: outcomeErr.Error(),
	})
	if err != nil {
		return fmt.Errorf("encode failed job payload: %w", err)
	}

	if err := p.persistTerminalStatus(
		ctx,
		job,
		store.JobStatusFailed,
		"error",
		payload,
		completedAt,
	); err != nil {
		return fmt.Errorf("mark job failed: %w", err)
	}

	log.Printf("translation job %s failed: %v", job.ID, outcomeErr)
	return nil
}

// ensureJobRunning advances a queued job to running or accepts an already-running job.
func (p *Processor) ensureJobRunning(
	ctx context.Context,
	job *store.TranslationJobModel,
) (*store.TranslationJobModel, error) {
	current, err := p.repository.GetJob(ctx, job.ID, job.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("refresh translation job: %w", err)
	}

	switch current.Status {
	case store.JobStatusRunning, store.JobStatusSucceeded, store.JobStatusFailed:
		return current, nil
	case store.JobStatusQueued:
		err := p.repository.MarkJobRunning(ctx, current.ID)
		if err == nil {
			current.Status = store.JobStatusRunning
			return current, nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return nil, err
		}

		current, refreshErr := p.repository.GetJob(ctx, job.ID, job.ProjectID)
		if refreshErr != nil {
			return nil, fmt.Errorf("refresh translation job after queued transition: %w", refreshErr)
		}
		if current.Status == store.JobStatusRunning || isTerminalStatus(current.Status) {
			return current, nil
		}
		return nil, err
	default:
		return nil, fmt.Errorf("unsupported translation job status %q", current.Status)
	}
}

// completeJobSuccess stores the success outcome while tolerating retry races.
func (p *Processor) completeJobSuccess(
	ctx context.Context,
	job *store.TranslationJobModel,
	outcomeKind string,
	outcomePayload []byte,
	completedAt time.Time,
) error {
	return p.persistTerminalStatus(ctx, job, store.JobStatusSucceeded, outcomeKind, outcomePayload, completedAt)
}

// persistTerminalStatus writes a terminal job outcome and tolerates replay races.
func (p *Processor) persistTerminalStatus(
	ctx context.Context,
	job *store.TranslationJobModel,
	newStatus string,
	outcomeKind string,
	outcomePayload []byte,
	completedAt time.Time,
) error {
	err := p.repository.PersistJobTerminal(ctx, job.ID, newStatus, outcomeKind, outcomePayload, completedAt)
	if err == nil {
		return nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return err
	}

	current, refreshErr := p.repository.GetJob(ctx, job.ID, job.ProjectID)
	if refreshErr != nil {
		return fmt.Errorf("refresh translation job after terminal transition: %w", refreshErr)
	}
	if current.Status == newStatus && terminalOutcomeMatches(current, outcomeKind, outcomePayload) {
		return nil
	}
	if current.Status != store.JobStatusRunning {
		return err
	}

	return p.repository.PersistJobTerminal(ctx, job.ID, newStatus, outcomeKind, outcomePayload, completedAt)
}

// finishProcessedEvent marks the queue event processed after the job is terminal.
func (p *Processor) finishProcessedEvent(ctx context.Context, jobID, eventID string) error {
	if eventID != "" {
		processedAt := p.clock()
		if err := p.repository.MarkOutboxEventProcessed(ctx, eventID, p.workerID, processedAt); err != nil {
			return err
		}
	}

	log.Printf("processed translation job %s from outbox event %s", jobID, eventID)
	return nil
}

// isTerminalStatus reports whether a persisted job status is terminal.
func isTerminalStatus(status string) bool {
	return status == store.JobStatusSucceeded || status == store.JobStatusFailed
}

// terminalOutcomeMatches checks whether a persisted terminal outcome matches the expected value.
func terminalOutcomeMatches(job *store.TranslationJobModel, outcomeKind string, outcomePayload []byte) bool {
	if job == nil {
		return false
	}

	return job.OutcomeKind == outcomeKind && bytes.Equal(job.OutcomePayload, outcomePayload)
}
