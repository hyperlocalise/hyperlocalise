package worker

import (
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

	if err := p.repository.UpdateJobStatus(
		ctx,
		p.repository.DB(),
		job.ID,
		store.JobStatusQueued,
		store.JobStatusRunning,
		"",
		nil,
		nil,
	); err != nil {
		return fmt.Errorf("process translation job %s: %w", job.ID, err)
	}

	outcomeKind, outcomePayload, completedAt, outcomeErr := p.buildOutcome(ctx, job)
	if outcomeErr != nil {
		if failErr := p.failJob(ctx, job, outcomeErr); failErr != nil {
			return fmt.Errorf("process translation job %s: %w", job.ID, failErr)
		}
	} else {
		if err := p.repository.UpdateJobStatus(
			ctx,
			p.repository.DB(),
			job.ID,
			store.JobStatusRunning,
			store.JobStatusSucceeded,
			outcomeKind,
			outcomePayload,
			&completedAt,
		); err != nil {
			return fmt.Errorf("process translation job %s: %w", job.ID, err)
		}
	}

	if payload.EventID != "" {
		processedAt := p.clock()
		if err := p.repository.MarkOutboxEventProcessed(ctx, payload.EventID, processedAt); err != nil {
			return err
		}
	}

	log.Printf("processed translation job %s from outbox event %s", job.ID, payload.EventID)

	return nil
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

	if err := p.repository.UpdateJobStatus(
		ctx,
		p.repository.DB(),
		job.ID,
		store.JobStatusRunning,
		store.JobStatusFailed,
		"error",
		payload,
		&completedAt,
	); err != nil {
		return fmt.Errorf("mark job failed: %w", err)
	}

	log.Printf("translation job %s failed: %v", job.ID, outcomeErr)
	return nil
}
