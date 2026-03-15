package translationworker

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
)

type Executor interface {
	Translate(ctx context.Context, req Request) (Response, error)
}

type Request struct {
	JobID           string
	SegmentID       string
	SourceText      string
	Context         string
	SourceLocale    string
	TargetLocale    string
	Attempt         int
	ProviderProfile string
}

type Response struct {
	Text         string
	InputTokens  int
	OutputTokens int
}

type Service struct {
	translationService TranslationService
	executor           Executor
}

type TranslationService interface {
	StartSegmentAttempt(ctx context.Context, msg translation.ExecuteMessage) (translation.ExecuteMessage, translation.SegmentAttempt, error)
	FailSegmentAttempt(ctx context.Context, segmentID string, code string, message string, latency time.Duration) (translation.Job, error)
	CompleteSegmentAttempt(ctx context.Context, segmentID string, translatedText string, latency time.Duration) (translation.Job, bool, error)
}

func New(service TranslationService, executor Executor) *Service {
	return &Service{
		translationService: service,
		executor:           executor,
	}
}

func (s *Service) HandleExecute(ctx context.Context, msg translation.ExecuteMessage) error {
	// The worker asks the service to open an attempt before calling the provider.
	segmentMsg, _, err := s.translationService.StartSegmentAttempt(ctx, msg)
	if err != nil {
		if errors.Is(err, translation.ErrSegmentNotRunnable) {
			return nil
		}
		return fmt.Errorf("start attempt: %w", err)
	}

	started := time.Now()
	result, err := s.executor.Translate(ctx, Request{
		JobID:           segmentMsg.JobID,
		SegmentID:       segmentMsg.SegmentID,
		SourceText:      segmentMsg.SourceText,
		Context:         segmentMsg.Context,
		SourceLocale:    segmentMsg.SourceLocale,
		TargetLocale:    segmentMsg.TargetLocale,
		Attempt:         segmentMsg.Attempt,
		ProviderProfile: segmentMsg.ProviderProfileID,
	})
	latency := time.Since(started)
	if err != nil {
		// Failed executions are recorded as attempts so later retries preserve history.
		_, failErr := s.translationService.FailSegmentAttempt(ctx, segmentMsg.SegmentID, "provider_error", err.Error(), latency)
		if failErr != nil {
			return fmt.Errorf("fail segment attempt: %w", failErr)
		}
		return err
	}

	_, _, err = s.translationService.CompleteSegmentAttempt(ctx, segmentMsg.SegmentID, result.Text, latency)
	if err != nil {
		return fmt.Errorf("complete attempt: %w", err)
	}

	return nil
}
