package translationworker

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
	"github.com/quiet-circles/hyperlocalise/services/translationsvc"
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
	translationService *translationsvc.Service
	executor           Executor
}

func New(service *translationsvc.Service, executor Executor) *Service {
	return &Service{
		translationService: service,
		executor:           executor,
	}
}

func (s *Service) HandleExecute(ctx context.Context, msg translation.ExecuteMessage) error {
	segmentMsg, _, err := s.translationService.StartSegmentAttempt(ctx, msg)
	if err != nil {
		if errors.Is(err, translationsvc.ErrSegmentNotRunnable) {
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
