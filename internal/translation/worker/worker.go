package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"github.com/uptrace/bun"
)

// Processor advances a single queued job event through the stub workflow.
type Processor struct {
	repository *store.Repository
	clock      func() time.Time
}

// NewProcessor constructs a translation worker processor.
func NewProcessor(repository *store.Repository) *Processor {
	return &Processor{
		repository: repository,
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

	err = p.repository.DB().RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if updateErr := p.repository.UpdateJobStatus(
			ctx,
			tx,
			job.ID,
			store.JobStatusQueued,
			store.JobStatusRunning,
			"",
			nil,
			nil,
		); updateErr != nil {
			return updateErr
		}

		outcomeKind, outcomePayload, completedAt, outcomeErr := p.buildStubOutcome(job)
		if outcomeErr != nil {
			return outcomeErr
		}

		if updateErr := p.repository.UpdateJobStatus(
			ctx,
			tx,
			job.ID,
			store.JobStatusRunning,
			store.JobStatusSucceeded,
			outcomeKind,
			outcomePayload,
			&completedAt,
		); updateErr != nil {
			return updateErr
		}

		return nil
	})
	if err != nil {
		return fmt.Errorf("process translation job %s: %w", job.ID, err)
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

func (p *Processor) buildStubOutcome(job *store.TranslationJobModel) (string, []byte, time.Time, error) {
	completedAt := p.clock()

	switch job.Type {
	case store.JobTypeString:
		input, err := translationapp.DecodeStringInput(job.InputPayload)
		if err != nil {
			return "", nil, time.Time{}, err
		}

		translations := make([]*translationv1.StringTranslation, 0, len(input.GetTargetLocales()))
		for _, locale := range input.GetTargetLocales() {
			translations = append(translations, &translationv1.StringTranslation{
				Locale: locale,
				Text:   fmt.Sprintf("TODO(%s): translate %q", locale, input.GetSourceText()),
			})
		}

		payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobResult{
			Translations: translations,
		})
		if err != nil {
			return "", nil, time.Time{}, err
		}

		// TODO: Replace the placeholder result builder with a real translation executor
		// once provider selection, retries, and model prompting are defined.
		return "string_result", payload, completedAt, nil
	case store.JobTypeFile:
		input, err := translationapp.DecodeFileInput(job.InputPayload)
		if err != nil {
			return "", nil, time.Time{}, err
		}

		translations := make([]*translationv1.FileTranslation, 0, len(input.GetTargetLocales()))
		for _, locale := range input.GetTargetLocales() {
			translations = append(translations, &translationv1.FileTranslation{
				Locale:  locale,
				FileUri: fmt.Sprintf("%s.%s.todo", input.GetFileUri(), locale),
			})
		}

		payload, err := translationapp.EncodeProto(&translationv1.FileTranslationJobResult{
			Translations: translations,
		})
		if err != nil {
			return "", nil, time.Time{}, err
		}

		return "file_result", payload, completedAt, nil
	default:
		return "", nil, time.Time{}, fmt.Errorf("unsupported job type %q", job.Type)
	}
}
