package tmsgrpc

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
	openapi "github.com/quiet-circles/hyperlocalise/pkg/api/openapi"
	"github.com/quiet-circles/hyperlocalise/services/translationsvc"
)

var (
	ErrNotFound   = errors.New("resource not found")
	ErrConflict   = errors.New("resource conflict")
	ErrBadRequest = errors.New("bad request")
)

type Backend interface {
	CreateTranslationJob(ctx context.Context, req openapi.CreateTranslationJobRequest, idempotencyHeader string) (openapi.TranslationJob, error)
	GetTranslationJob(ctx context.Context, id string) (openapi.TranslationJob, error)
	ListTranslationJobs(ctx context.Context, filter TranslationJobFilter) ([]openapi.TranslationJob, error)
	CancelTranslationJob(ctx context.Context, id string) (openapi.TranslationJob, error)
}

type TranslationJobFilter struct {
	ProjectID    string
	Status       string
	TargetLocale string
	CreatedAfter time.Time
	Limit        int
	Cursor       string
}

type StubBackend struct {
	service *translationsvc.Service
}

// TODO: Replace this in-memory backend with a generated gRPC client once translation.proto is wired.
func NewStubBackend() *StubBackend {
	dispatcher := &translationsvc.MemoryDispatcher{}
	artifactStore := translationsvc.NewMemoryArtifactStore()
	return &StubBackend{
		service: translationsvc.New(dispatcher, artifactStore),
	}
}

func (b *StubBackend) CreateTranslationJob(ctx context.Context, req openapi.CreateTranslationJobRequest, idempotencyHeader string) (openapi.TranslationJob, error) {
	input := translation.CreateJobInput{
		CallerScope:     "http",
		ProjectID:       req.ProjectID,
		SourceLocale:    req.SourceLocale,
		TargetLocale:    req.TargetLocale,
		ProviderProfile: req.ProviderProfile,
		GlossaryID:      req.GlossaryID,
		StyleGuideID:    req.StyleGuideID,
		IdempotencyKey:  chooseIdempotencyKey(idempotencyHeader, req.IdempotencyKey),
		Labels:          req.Labels,
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "stub",
			ModelID:                     "stub-v1",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	}
	if req.InlinePayload != nil {
		items := make([]translation.InlineItem, 0, len(req.InlinePayload.Items))
		for _, item := range req.InlinePayload.Items {
			items = append(items, translation.InlineItem{
				Key:       item.Key,
				Text:      item.Text,
				Context:   item.Context,
				MaxLength: item.MaxLength,
				Metadata:  item.Metadata,
			})
		}
		input.InlinePayload = &translation.InlinePayload{Items: items}
	}
	if req.ArtifactPayload != nil {
		input.ArtifactPayload = &translation.ArtifactPayload{
			InputURI:    req.ArtifactPayload.InputURI,
			ContentType: req.ArtifactPayload.ContentType,
			ParserHint:  req.ArtifactPayload.ParserHint,
			Path:        req.ArtifactPayload.Path,
		}
	}

	job, err := b.service.CreateTranslationJob(ctx, input)
	if err != nil {
		return openapi.TranslationJob{}, mapError(err)
	}

	return mapJob(job), nil
}

func (b *StubBackend) GetTranslationJob(ctx context.Context, id string) (openapi.TranslationJob, error) {
	job, err := b.service.GetJob(ctx, id)
	if err != nil {
		return openapi.TranslationJob{}, mapError(err)
	}
	return mapJob(job), nil
}

func (b *StubBackend) ListTranslationJobs(ctx context.Context, filter TranslationJobFilter) ([]openapi.TranslationJob, error) {
	jobs, err := b.service.ListTranslationJobs(ctx, translation.JobFilter{
		ProjectID:    filter.ProjectID,
		Status:       filter.Status,
		TargetLocale: filter.TargetLocale,
		CreatedAfter: filter.CreatedAfter,
		Limit:        filter.Limit,
		Cursor:       filter.Cursor,
	})
	if err != nil {
		return nil, mapError(err)
	}

	items := make([]openapi.TranslationJob, 0, len(jobs))
	for _, job := range jobs {
		items = append(items, mapJob(job))
	}
	return items, nil
}

func (b *StubBackend) CancelTranslationJob(ctx context.Context, id string) (openapi.TranslationJob, error) {
	job, err := b.service.CancelTranslationJob(ctx, id)
	if err != nil {
		return openapi.TranslationJob{}, mapError(err)
	}
	return mapJob(job), nil
}

func mapJob(job translation.Job) openapi.TranslationJob {
	output := make([]openapi.TranslationInlineOutput, 0, len(job.InlineOutput))
	for _, item := range job.InlineOutput {
		output = append(output, openapi.TranslationInlineOutput{
			Key:  item.Key,
			Text: item.Text,
		})
	}
	return openapi.TranslationJob{
		ID:                job.ID,
		ProjectID:         job.ProjectID,
		Status:            job.Status,
		Mode:              job.Mode,
		SourceLocale:      job.SourceLocale,
		TargetLocale:      job.TargetLocale,
		ItemCount:         job.ItemCount,
		Progress:          openapi.TranslationJobProgress(job.Progress),
		SourceArtifactURI: job.SourceArtifactURI,
		OutputArtifactURI: job.OutputArtifactURI,
		InlineOutput:      output,
		ConfigSnapshotID:  job.ConfigSnapshotID,
		ErrorCode:         job.ErrorCode,
		ErrorMessage:      job.ErrorMessage,
		CreatedAt:         job.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         job.UpdatedAt.Format(time.RFC3339),
	}
}

func chooseIdempotencyKey(header string, body string) string {
	if strings.TrimSpace(header) != "" {
		return header
	}
	return body
}

func mapError(err error) error {
	switch {
	case errors.Is(err, translationsvc.ErrNotFound):
		return fmt.Errorf("%w: %v", ErrNotFound, err)
	case errors.Is(err, translationsvc.ErrConflict):
		return fmt.Errorf("%w: %v", ErrConflict, err)
	case errors.Is(err, translationsvc.ErrInvalidArgument):
		return fmt.Errorf("%w: %v", ErrBadRequest, err)
	default:
		return err
	}
}
