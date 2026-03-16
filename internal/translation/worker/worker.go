package worker

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
)

// ErrFileJobsNotImplemented reports that async file translation is not implemented yet.
var ErrFileJobsNotImplemented = errors.New("file translation jobs are not implemented yet")

// Processor advances a single queued job event through the stub workflow.
type Processor struct {
	repository *store.Repository
	executor   stringExecutor
	clock      func() time.Time
}

// NewProcessor constructs a translation worker Processor that uses the provided
// repository and string executor. The returned Processor has its clock initialized
// to the current UTC time.
func NewProcessor(repository *store.Repository, executor stringExecutor) *Processor {
	return &Processor{
		repository: repository,
		executor:   executor,
		clock: func() time.Time {
			return time.Now().UTC()
		},
	}
}

// ProcessJobQueuedEvent handles a single queued translation job notification.
func (p *Processor) ProcessJobQueuedEvent(ctx context.Context, payload translationapp.JobQueuedPayload) error {
	job, err := p.repository.GetJob(ctx, payload.JobID, payload.ProjectID)
	if err != nil {
		return fmt.Errorf("load queued translation job %s: %w", payload.JobID, err)
	}

	job, err = p.ensureJobRunning(ctx, job)
	if err != nil {
		return fmt.Errorf("process translation job %s: %w", job.ID, err)
	}
	if isTerminalStatus(job.Status) {
		return p.finishProcessedEvent(ctx, job.ID, payload.EventID)
	}

	outcomeKind, outcomePayload, completedAt, outcomeErr := p.buildOutcome(ctx, job)
	if outcomeErr != nil {
		if failErr := p.failJob(ctx, job, outcomeErr); failErr != nil {
			return fmt.Errorf("process translation job %s: %w", job.ID, failErr)
		}
	} else {
		if err := p.completeJobSuccess(ctx, job, outcomeKind, outcomePayload, completedAt); err != nil {
			return fmt.Errorf("process translation job %s: %w", job.ID, err)
		}
	}

	return p.finishProcessedEvent(ctx, job.ID, payload.EventID)
}

// buildOutcome executes the job payload and returns the terminal outcome payload.
func (p *Processor) buildOutcome(
	ctx context.Context,
	job *store.TranslationJobModel,
) (string, []byte, time.Time, error) {
	completedAt := p.clock()

	switch job.Type {
	case store.JobTypeString:
		if p.executor == nil {
			return "", nil, time.Time{}, fmt.Errorf("string translation executor is not configured")
		}

		input, err := translationapp.DecodeStringInput(job.InputPayload)
		if err != nil {
			return "", nil, time.Time{}, err
		}

		translations := make([]*translationv1.StringTranslation, 0, len(input.GetTargetLocales()))
		for _, locale := range input.GetTargetLocales() {
			text, err := p.executor.Translate(ctx, input.GetSourceText(), locale)
			if err != nil {
				return "", nil, time.Time{}, fmt.Errorf("translate locale %q: %w", locale, err)
			}

			translations = append(translations, &translationv1.StringTranslation{
				Locale: locale,
				Text:   text,
			})
		}

		payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobResult{
			Translations: translations,
		})
		if err != nil {
			return "", nil, time.Time{}, err
		}

		return "string_result", payload, completedAt, nil
	case store.JobTypeFile:
		return "", nil, time.Time{}, ErrFileJobsNotImplemented
	default:
		return "", nil, time.Time{}, fmt.Errorf("unsupported job type %q", job.Type)
	}
}

// failJob stores a terminal error payload for a job that could not complete.
func (p *Processor) failJob(ctx context.Context, job *store.TranslationJobModel, outcomeErr error) error {
	completedAt := p.clock()
	payload, err := translationapp.EncodeProto(&translationv1.TranslationJobError{
		// TODO(adr-2026-03-16-worker-llm-execution): Map worker failures to richer
		// TranslationJobError codes instead of hardcoding CODE_INTERNAL. See
		// docs/adr/2026-03-16-translation-worker-llm-execution-design.md.
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
		err := p.repository.UpdateJobStatus(
			ctx,
			p.repository.DB(),
			current.ID,
			store.JobStatusQueued,
			store.JobStatusRunning,
			"",
			nil,
			nil,
		)
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
	err := p.repository.UpdateJobStatus(
		ctx,
		p.repository.DB(),
		job.ID,
		store.JobStatusRunning,
		newStatus,
		outcomeKind,
		outcomePayload,
		&completedAt,
	)
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

	return p.repository.UpdateJobStatus(
		ctx,
		p.repository.DB(),
		job.ID,
		store.JobStatusRunning,
		newStatus,
		outcomeKind,
		outcomePayload,
		&completedAt,
	)
}

// finishProcessedEvent marks the queue event processed after the job is terminal.
func (p *Processor) finishProcessedEvent(ctx context.Context, jobID, eventID string) error {
	if eventID != "" {
		processedAt := p.clock()
		if err := p.repository.MarkOutboxEventProcessed(ctx, eventID, processedAt); err != nil {
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
