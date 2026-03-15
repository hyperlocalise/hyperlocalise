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
	ListTranslationJobs(ctx context.Context, filter TranslationJobFilter) (openapi.TranslationJobListResponse, error)
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

func (b *StubBackend) ListTranslationJobs(ctx context.Context, filter TranslationJobFilter) (openapi.TranslationJobListResponse, error) {
	page, err := b.service.ListTranslationJobs(ctx, translation.JobFilter{
		ProjectID:    filter.ProjectID,
		Status:       filter.Status,
		TargetLocale: filter.TargetLocale,
		CreatedAfter: filter.CreatedAfter,
		Limit:        filter.Limit,
		Cursor:       filter.Cursor,
	})
	if err != nil {
		return openapi.TranslationJobListResponse{}, mapError(err)
	}

	items := make([]openapi.TranslationJob, 0, len(page.Items))
	for _, job := range page.Items {
		items = append(items, mapJob(job))
	}
	return openapi.TranslationJobListResponse{
		Items:      items,
		NextCursor: page.NextCursor,
	}, nil
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
	mapped := openapi.TranslationJob{
		ID:           job.ID,
		Status:       mapStatus(job.Status),
		SourceLocale: job.SourceLocale,
		TargetLocale: job.TargetLocale,
		CreatedAt:    job.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    job.UpdatedAt.Format(time.RFC3339),
	}
	if job.ErrorCode != "" || job.ErrorMessage != "" {
		mapped.Error = &openapi.TranslationJobError{
			Code:    job.ErrorCode,
			Message: job.ErrorMessage,
		}
	}
	if len(output) > 0 {
		mapped.InlineResult = &openapi.TranslationInlineResult{Items: output}
	}
	if job.OutputArtifactURI != "" {
		mapped.ArtifactResult = &openapi.TranslationArtifactResult{
			OutputArtifactURI: job.OutputArtifactURI,
		}
	}
	return mapped
}

func mapStatus(status string) string {
	switch status {
	case translation.StatusQueued:
		return "pending"
	case translation.StatusRunning, translation.StatusFinalizeQueued:
		return "running"
	case translation.StatusCompleted:
		return "succeeded"
	case translation.StatusFailed:
		return "failed"
	case translation.StatusCanceled, translation.StatusCancelRequested:
		return "canceled"
	default:
		return "pending"
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
