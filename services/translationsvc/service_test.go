package translationsvc_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
	"github.com/quiet-circles/hyperlocalise/services/translationsvc"
	"github.com/quiet-circles/hyperlocalise/services/translationworker"
)

func TestCreateInlineJobPlansSegmentsAndDispatches(t *testing.T) {
	t.Parallel()

	svc, dispatcher, _ := newTestService()
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{
				{Key: "hero.title", Text: "Hello"},
				{Key: "hero.body", Text: "World"},
			},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	if job.ItemCount != 2 {
		t.Fatalf("expected 2 items, got %d", job.ItemCount)
	}
	if len(dispatcher.ExecuteMessages) != 2 {
		t.Fatalf("expected 2 execute messages, got %d", len(dispatcher.ExecuteMessages))
	}

	segments, err := svc.Segments(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("segments: %v", err)
	}
	if segments[0].SegmentKey != "hero.title" || segments[1].SegmentKey != "hero.body" {
		t.Fatalf("unexpected segment ordering: %+v", segments)
	}
}

func TestCreateArtifactJobParsesAndSortsSegments(t *testing.T) {
	t.Parallel()

	svc, dispatcher, store := newTestService()
	store.Seed("memory://inputs/messages.json", "application/json", []byte(`{"b":"World","a":"Hello"}`))

	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "de",
		ArtifactPayload: &translation.ArtifactPayload{
			InputURI:    "memory://inputs/messages.json",
			ContentType: "application/json",
			Path:        "messages.json",
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "anthropic",
			ModelID:                     "claude",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create artifact job: %v", err)
	}

	segments, err := svc.Segments(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("segments: %v", err)
	}
	if got := []string{segments[0].SegmentKey, segments[1].SegmentKey}; got[0] != "a" || got[1] != "b" {
		t.Fatalf("unexpected segment order: %v", got)
	}
	if len(dispatcher.ExecuteMessages) != 2 {
		t.Fatalf("expected 2 execute messages, got %d", len(dispatcher.ExecuteMessages))
	}
}

func TestIdempotencySamePayloadReturnsSameJob(t *testing.T) {
	t.Parallel()

	svc, _, _ := newTestService()
	input := translation.CreateJobInput{
		CallerScope:    "api",
		ProjectID:      "proj_1",
		SourceLocale:   "en",
		TargetLocale:   "fr",
		IdempotencyKey: "idem_1",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{{Key: "hero.title", Text: "Hello"}},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	}

	first, err := svc.CreateTranslationJob(context.Background(), input)
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	second, err := svc.CreateTranslationJob(context.Background(), input)
	if err != nil {
		t.Fatalf("second create: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("expected same job ID, got %q and %q", first.ID, second.ID)
	}
}

func TestIdempotencyDifferentPayloadConflicts(t *testing.T) {
	t.Parallel()

	svc, _, _ := newTestService()
	base := translation.CreateJobInput{
		CallerScope:    "api",
		ProjectID:      "proj_1",
		SourceLocale:   "en",
		TargetLocale:   "fr",
		IdempotencyKey: "idem_1",
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	}
	_, err := svc.CreateTranslationJob(context.Background(), withInline(base, "Hello"))
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	_, err = svc.CreateTranslationJob(context.Background(), withInline(base, "Bonjour"))
	if !errors.Is(err, translationsvc.ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
}

func TestWorkerSuccessAndFinalizeInline(t *testing.T) {
	t.Parallel()

	svc, dispatcher, _ := newTestService()
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{{Key: "hero.title", Text: "Hello"}},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := translationworker.New(svc, fakeExecutor{response: "Bonjour"})
	if err := worker.HandleExecute(context.Background(), dispatcher.ExecuteMessages[0]); err != nil {
		t.Fatalf("handle execute: %v", err)
	}

	if len(dispatcher.FinalizeMessages) != 1 {
		t.Fatalf("expected finalize message, got %d", len(dispatcher.FinalizeMessages))
	}

	job, err = svc.FinalizeJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("finalize job: %v", err)
	}
	if job.Status != translation.StatusCompleted {
		t.Fatalf("expected completed, got %q", job.Status)
	}
	if len(job.InlineOutput) != 1 || job.InlineOutput[0].Text != "Bonjour" {
		t.Fatalf("unexpected inline output: %+v", job.InlineOutput)
	}
}

func TestRetryCreatesDistinctAttempts(t *testing.T) {
	t.Parallel()

	svc, dispatcher, _ := newTestService()
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{{Key: "hero.title", Text: "Hello"}},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := translationworker.New(svc, fakeExecutor{err: errors.New("temporary upstream failure")})
	err = worker.HandleExecute(context.Background(), dispatcher.ExecuteMessages[0])
	if err == nil {
		t.Fatal("expected provider error")
	}

	job, err = svc.RetryTranslationJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("retry job: %v", err)
	}
	if job.Status != translation.StatusRunning {
		t.Fatalf("expected running after retry, got %q", job.Status)
	}

	worker = translationworker.New(svc, fakeExecutor{response: "Bonjour"})
	latest := dispatcher.ExecuteMessages[len(dispatcher.ExecuteMessages)-1]
	if err := worker.HandleExecute(context.Background(), latest); err != nil {
		t.Fatalf("retry execute: %v", err)
	}

	segments, err := svc.Segments(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("segments: %v", err)
	}
	attempts, err := svc.Attempts(context.Background(), segments[0].ID)
	if err != nil {
		t.Fatalf("attempts: %v", err)
	}
	if len(attempts) != 2 {
		t.Fatalf("expected 2 attempts, got %d", len(attempts))
	}
	if attempts[0].Status != translation.AttemptStatusFailed || attempts[1].Status != translation.AttemptStatusSucceeded {
		t.Fatalf("unexpected attempts: %+v", attempts)
	}
}

func TestReplayExecuteMessageDoesNotDuplicateSuccess(t *testing.T) {
	t.Parallel()

	svc, dispatcher, _ := newTestService()
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{{Key: "hero.title", Text: "Hello"}},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	msg := dispatcher.ExecuteMessages[0]
	worker := translationworker.New(svc, fakeExecutor{response: "Bonjour"})
	if err := worker.HandleExecute(context.Background(), msg); err != nil {
		t.Fatalf("first execute: %v", err)
	}
	if err := worker.HandleExecute(context.Background(), msg); err != nil {
		t.Fatalf("replay execute: %v", err)
	}

	segments, err := svc.Segments(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("segments: %v", err)
	}
	attempts, err := svc.Attempts(context.Background(), segments[0].ID)
	if err != nil {
		t.Fatalf("attempts: %v", err)
	}
	if len(attempts) != 1 {
		t.Fatalf("expected 1 attempt after replay, got %d", len(attempts))
	}
}

func TestFinalizeArtifactProducesOutputURI(t *testing.T) {
	t.Parallel()

	svc, dispatcher, store := newTestService()
	store.Seed("memory://inputs/messages.json", "application/json", []byte(`{"hero.title":"Hello"}`))
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "de",
		ArtifactPayload: &translation.ArtifactPayload{
			InputURI:    "memory://inputs/messages.json",
			ContentType: "application/json",
			Path:        "messages.json",
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := translationworker.New(svc, fakeExecutor{response: "Hallo"})
	if err := worker.HandleExecute(context.Background(), dispatcher.ExecuteMessages[0]); err != nil {
		t.Fatalf("execute artifact segment: %v", err)
	}
	job, err = svc.FinalizeJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("finalize artifact job: %v", err)
	}
	if job.OutputArtifactURI == "" {
		t.Fatal("expected outputArtifactUri")
	}
}

func TestCancellationStopsUndispatchedSegments(t *testing.T) {
	t.Parallel()

	svc, dispatcher, _ := newTestService()
	svc.WithDispatchLimit(1)
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{
				{Key: "a", Text: "One"},
				{Key: "b", Text: "Two"},
			},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if len(dispatcher.ExecuteMessages) != 1 {
		t.Fatalf("expected 1 dispatched message, got %d", len(dispatcher.ExecuteMessages))
	}

	if _, err := svc.CancelTranslationJob(context.Background(), job.ID); err != nil {
		t.Fatalf("cancel job: %v", err)
	}
	if err := svc.DispatchPendingSegments(context.Background(), job.ID); err != nil {
		t.Fatalf("dispatch pending: %v", err)
	}
	if len(dispatcher.ExecuteMessages) != 1 {
		t.Fatalf("expected cancellation to block more dispatches, got %d", len(dispatcher.ExecuteMessages))
	}
}

func TestTerminalJobStatusDerivedFromPersistedSegments(t *testing.T) {
	t.Parallel()

	svc, dispatcher, _ := newTestService()
	job, err := svc.CreateTranslationJob(context.Background(), translation.CreateJobInput{
		ProjectID:    "proj_1",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &translation.InlinePayload{
			Items: []translation.InlineItem{{Key: "hero.title", Text: "Hello"}},
		},
		ConfigSnapshotInput: translation.ConfigSnapshotInput{
			ProviderFamily:              "openai",
			ModelID:                     "gpt-5-mini",
			PromptTemplateVersion:       "v1",
			SegmentationStrategyVersion: "v1",
			ValidationPolicyVersion:     "v1",
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := translationworker.New(svc, fakeExecutor{err: errors.New("bad request")})
	if err := worker.HandleExecute(context.Background(), dispatcher.ExecuteMessages[0]); err == nil {
		t.Fatal("expected provider error")
	}
	job, err = svc.FinalizeJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("finalize failed job: %v", err)
	}
	if job.Status != translation.StatusFailed {
		t.Fatalf("expected failed status, got %q", job.Status)
	}
}

type fakeExecutor struct {
	response string
	err      error
}

func (f fakeExecutor) Translate(ctx context.Context, req translationworker.Request) (translationworker.Response, error) {
	_ = ctx
	_ = req
	if f.err != nil {
		return translationworker.Response{}, f.err
	}
	return translationworker.Response{Text: f.response}, nil
}

type fixedClock struct {
	current time.Time
}

func (c fixedClock) Now() time.Time {
	return c.current
}

func newTestService() (*translationsvc.Service, *translationsvc.MemoryDispatcher, *translationsvc.MemoryArtifactStore) {
	dispatcher := &translationsvc.MemoryDispatcher{}
	store := translationsvc.NewMemoryArtifactStore()
	svc := translationsvc.New(dispatcher, store).WithClock(fixedClock{current: time.Date(2026, 3, 15, 10, 0, 0, 0, time.UTC)})
	return svc, dispatcher, store
}

func withInline(input translation.CreateJobInput, text string) translation.CreateJobInput {
	input.InlinePayload = &translation.InlinePayload{
		Items: []translation.InlineItem{{Key: "hero.title", Text: text}},
	}
	return input
}
