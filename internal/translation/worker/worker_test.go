package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/objectstore"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/protobuf/encoding/protojson"
)

type fakeExecutor struct {
	translate func(ctx context.Context, task TranslationTask) (string, RoutingDecision, error)
}

func (f fakeExecutor) Translate(ctx context.Context, task TranslationTask) (string, RoutingDecision, error) {
	return f.translate(ctx, task)
}

type fakeRepository struct {
	mu           sync.Mutex
	jobs         map[string]*store.TranslationJobModel
	events       map[string]*store.OutboxEventModel
	files        map[string]*store.TranslationFileModel
	variants     map[string]*store.TranslationFileVariantModel
	glossary     []store.TranslationGlossaryTermModel
	saveErr      error
	processed    []string
	retried      []string
	deadLettered []string
	claims       []string
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
		jobs:     map[string]*store.TranslationJobModel{},
		events:   map[string]*store.OutboxEventModel{},
		files:    map[string]*store.TranslationFileModel{},
		variants: map[string]*store.TranslationFileVariantModel{},
	}
}

func (r *fakeRepository) GetJob(_ context.Context, jobID, projectID string) (*store.TranslationJobModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[jobID]
	if !ok || job.ProjectID != projectID {
		return nil, store.ErrNotFound
	}
	copy := *job
	return &copy, nil
}

func (r *fakeRepository) GetOutboxEvent(_ context.Context, eventID string) (*store.OutboxEventModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	event, ok := r.events[eventID]
	if !ok {
		return nil, store.ErrNotFound
	}
	copy := *event
	return &copy, nil
}

func (r *fakeRepository) SearchGlossaryTerms(_ context.Context, params store.GlossarySearchParams) ([]store.TranslationGlossaryTermModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var terms []store.TranslationGlossaryTermModel
	query := strings.ToLower(strings.TrimSpace(params.Query))
	for _, term := range r.glossary {
		if term.ProjectID != params.ProjectID || term.SourceLocale != params.SourceLocale || term.TargetLocale != params.TargetLocale {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(term.SourceTerm), query) && !strings.Contains(query, strings.ToLower(term.SourceTerm)) {
			continue
		}
		terms = append(terms, term)
		if params.Limit > 0 && len(terms) >= params.Limit {
			break
		}
	}

	return terms, nil
}

func (r *fakeRepository) ListGlossaryTerms(_ context.Context, params store.GlossaryListParams) ([]store.TranslationGlossaryTermModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	terms := make([]store.TranslationGlossaryTermModel, 0, len(r.glossary))
	for _, term := range r.glossary {
		if term.ProjectID != params.ProjectID {
			continue
		}
		if params.SourceLocale != "" && term.SourceLocale != params.SourceLocale {
			continue
		}
		if params.TargetLocale != "" && term.TargetLocale != params.TargetLocale {
			continue
		}
		terms = append(terms, term)
	}
	if params.Limit > 0 && len(terms) > params.Limit {
		terms = terms[:params.Limit]
	}
	return terms, nil
}

func (r *fakeRepository) MarkJobRunning(_ context.Context, jobID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[jobID]
	if !ok || job.Status != store.JobStatusQueued {
		return store.ErrNotFound
	}
	job.Status = store.JobStatusRunning
	return nil
}

func (r *fakeRepository) PersistJobTerminal(_ context.Context, jobID string, newStatus string, outcomeKind string, outcomePayload []byte, completedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[jobID]
	if !ok || job.Status != store.JobStatusRunning {
		return store.ErrNotFound
	}
	job.Status = newStatus
	job.OutcomeKind = outcomeKind
	job.OutcomePayload = outcomePayload
	job.CompletedAt = &completedAt
	job.CheckpointPayload = nil
	return nil
}

func (r *fakeRepository) SaveRunningJobCheckpoint(_ context.Context, jobID, expectedStatus string, checkpointPayload []byte, lastError string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.saveErr != nil {
		return r.saveErr
	}
	job, ok := r.jobs[jobID]
	if !ok || job.Status != expectedStatus {
		return store.ErrNotFound
	}
	job.CheckpointPayload = append([]byte(nil), checkpointPayload...)
	job.LastError = lastError
	return nil
}

func (r *fakeRepository) MarkOutboxEventProcessed(_ context.Context, eventID, workerID string, processedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	if workerID != "" && event.ClaimedBy != workerID {
		return store.ErrNotFound
	}
	event.Status = store.OutboxStatusProcessed
	event.ProcessedAt = &processedAt
	event.ClaimedBy = ""
	event.ClaimedAt = nil
	event.ClaimExpiresAt = nil
	r.processed = append(r.processed, eventID)
	return nil
}

func (r *fakeRepository) ScheduleOutboxEventRetry(_ context.Context, eventID, workerID string, attemptCount int, nextAttemptAt time.Time, lastError string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	if workerID != "" && event.ClaimedBy != workerID {
		return store.ErrNotFound
	}
	event.Status = store.OutboxStatusPending
	event.AttemptCount = attemptCount
	event.NextAttemptAt = nextAttemptAt
	event.LastError = lastError
	event.ClaimedBy = ""
	event.ClaimedAt = nil
	event.ClaimExpiresAt = nil
	r.retried = append(r.retried, eventID)
	return nil
}

func (r *fakeRepository) MarkOutboxEventDeadLettered(_ context.Context, eventID, workerID string, at time.Time, attemptCount int, lastError string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	if workerID != "" && event.ClaimedBy != workerID {
		return store.ErrNotFound
	}
	event.Status = store.OutboxStatusDeadLettered
	event.AttemptCount = attemptCount
	event.LastError = lastError
	event.DeadLetteredAt = &at
	event.ClaimedBy = ""
	event.ClaimedAt = nil
	event.ClaimExpiresAt = nil
	r.deadLettered = append(r.deadLettered, eventID)
	return nil
}

func (r *fakeRepository) ListPendingOutboxEvents(_ context.Context, now time.Time, limit int) ([]store.OutboxEventModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ids := make([]string, 0, len(r.events))
	for id, event := range r.events {
		if (event.Status == store.OutboxStatusPending && !event.NextAttemptAt.After(now)) ||
			(event.Status == store.OutboxStatusProcessing && event.ClaimExpiresAt != nil && !event.ClaimExpiresAt.After(now)) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	if limit > 0 && len(ids) > limit {
		ids = ids[:limit]
	}
	result := make([]store.OutboxEventModel, 0, len(ids))
	for _, id := range ids {
		result = append(result, *r.events[id])
	}
	return result, nil
}

func (r *fakeRepository) ClaimOutboxEvent(_ context.Context, eventID, workerID string, now time.Time, leaseDuration time.Duration) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	isPendingReady := event.Status == store.OutboxStatusPending && !event.NextAttemptAt.After(now)
	isExpiredLease := event.Status == store.OutboxStatusProcessing && event.ClaimExpiresAt != nil && !event.ClaimExpiresAt.After(now)
	if !isPendingReady && !isExpiredLease {
		return store.ErrNotFound
	}
	event.Status = store.OutboxStatusProcessing
	event.ClaimedBy = workerID
	claimExpiresAt := now.Add(leaseDuration)
	event.ClaimedAt = &now
	event.ClaimExpiresAt = &claimExpiresAt
	r.claims = append(r.claims, eventID)
	return nil
}

func (r *fakeRepository) GetFile(_ context.Context, fileID, projectID string) (*store.TranslationFileModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	file, ok := r.files[fileID]
	if !ok || file.ProjectID != projectID {
		return nil, store.ErrNotFound
	}
	copy := *file
	return &copy, nil
}

func (r *fakeRepository) ListFileVariants(_ context.Context, fileID string) ([]store.TranslationFileVariantModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var variants []store.TranslationFileVariantModel
	for _, variant := range r.variants {
		if variant.FileID == fileID {
			variants = append(variants, *variant)
		}
	}
	sort.Slice(variants, func(i, j int) bool { return variants[i].Locale < variants[j].Locale })
	return variants, nil
}

func (r *fakeRepository) SaveFileVariant(_ context.Context, variant *store.TranslationFileVariantModel) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	copy := *variant
	r.variants[variant.ID] = &copy
	return nil
}

func TestBuildOutcomeStringSuccess(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{
		SourceText:    "Hello",
		TargetLocales: []string{"fr", "de"},
	})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Status: store.JobStatusRunning}
	processor := &Processor{
		repository: repo,
		executor: fakeExecutor{
			translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
				return strings.ToUpper(task.TargetLocale) + ":" + task.SourceText, RoutingDecision{Provider: "openai", Model: "gpt-4o-mini", Reasons: []string{"test route"}}, nil
			},
		},
		clock: func() time.Time { return time.Unix(1700000000, 0).UTC() },
	}

	outcomeKind, outcomePayload, completedAt, err := processor.buildOutcome(context.Background(), &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, InputPayload: payload, Status: store.JobStatusRunning})
	if err != nil {
		t.Fatalf("build outcome: %v", err)
	}
	if outcomeKind != "string_result" {
		t.Fatalf("unexpected outcome kind: %q", outcomeKind)
	}
	if completedAt.IsZero() {
		t.Fatal("expected completedAt to be set")
	}

	result := &translationv1.StringTranslationJobResult{}
	if err := protojson.Unmarshal(outcomePayload, result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if len(result.GetTranslations()) != 2 {
		t.Fatalf("unexpected translation count: %d", len(result.GetTranslations()))
	}
	if got := result.GetTranslations()[0].GetText(); got != "FR:Hello" {
		t.Fatalf("unexpected first translation: %q", got)
	}
	if got := result.GetTranslations()[1].GetText(); got != "DE:Hello" {
		t.Fatalf("unexpected second translation: %q", got)
	}
}

func TestBuildOutcomeStringInjectsGlossaryRuntimeContext(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{
		SourceText:    "Use account balance",
		SourceLocale:  "en",
		TargetLocales: []string{"fr"},
	})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Status: store.JobStatusRunning}
	repo.glossary = []store.TranslationGlossaryTermModel{{
		ID:           "term-1",
		ProjectID:    "proj",
		SourceLocale: "en",
		TargetLocale: "fr",
		SourceTerm:   "account balance",
		TargetTerm:   "solde du compte",
		Description:  "Banking UI label",
		PartOfSpeech: "noun",
	}}

	var seen TranslationTask
	processor := &Processor{
		repository: repo,
		executor: fakeExecutor{
			translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
				seen = task
				return "Utilisez le solde du compte", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
			},
		},
		clock: func() time.Time { return time.Unix(1700000000, 0).UTC() },
	}

	_, _, _, err = processor.buildOutcome(context.Background(), &store.TranslationJobModel{
		ID:           "job-1",
		ProjectID:    "proj",
		Type:         store.JobTypeString,
		Status:       store.JobStatusRunning,
		InputPayload: payload,
	})
	if err != nil {
		t.Fatalf("build outcome: %v", err)
	}
	if !strings.Contains(seen.RuntimeContext, "Glossary terms:") {
		t.Fatalf("expected glossary header in runtime context, got %q", seen.RuntimeContext)
	}
	if !strings.Contains(seen.RuntimeContext, "account balance => solde du compte [noun] - Banking UI label") {
		t.Fatalf("expected glossary term in runtime context, got %q", seen.RuntimeContext)
	}
}

func TestBuildOutcomeStringFailurePersistsCheckpoint(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: "Hello", TargetLocales: []string{"fr", "de"}})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Status: store.JobStatusRunning}
	processor := &Processor{
		repository: repo,
		executor: fakeExecutor{
			translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
				if task.TargetLocale == "de" {
					return "", RoutingDecision{Provider: "gemini", Model: "gemini-2.0-flash"}, errors.New("provider failed")
				}
				return "bonjour", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
			},
		},
		clock: func() time.Time { return time.Unix(1700000000, 0).UTC() },
	}

	job := &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, InputPayload: payload, Status: store.JobStatusRunning}
	_, _, _, err = processor.buildOutcome(context.Background(), job)
	if err == nil || !strings.Contains(err.Error(), `translate locale "de" with route gemini/gemini-2.0-flash`) {
		t.Fatalf("expected locale-specific error, got %v", err)
	}
	storedJob := repo.jobs["job-1"]
	checkpoint := &stringCheckpoint{}
	if err := json.Unmarshal(storedJob.CheckpointPayload, checkpoint); err != nil {
		t.Fatalf("unmarshal checkpoint: %v", err)
	}
	if got := checkpoint.Translations["fr"]; got != "bonjour" {
		t.Fatalf("expected persisted fr translation, got %q", got)
	}
}

func TestProcessJobQueuedEventResumesWithoutDuplicateWrites(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: "Hello", TargetLocales: []string{"fr", "de"}})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}
	checkpointBytes, err := json.Marshal(&stringCheckpoint{Translations: map[string]string{"fr": "bonjour"}})
	if err != nil {
		t.Fatalf("marshal checkpoint: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: payload, CheckpointPayload: checkpointBytes}
	repo.events["evt-1"] = &store.OutboxEventModel{ID: "evt-1", Status: store.OutboxStatusProcessing}
	calls := map[string]int{}
	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		calls[task.TargetLocale]++
		return map[string]string{"de": "hallo"}[task.TargetLocale], RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
	}})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	err = processor.ProcessJobQueuedEvent(context.Background(), translationapp.JobQueuedPayload{EventID: "evt-1", JobID: "job-1", ProjectID: "proj", AttemptCount: 1, MaxAttempts: 5})
	if err != nil {
		t.Fatalf("process queued event: %v", err)
	}
	if calls["fr"] != 0 {
		t.Fatalf("expected fr locale to be skipped, got %d calls", calls["fr"])
	}
	if calls["de"] != 1 {
		t.Fatalf("expected de locale once, got %d", calls["de"])
	}
	if repo.jobs["job-1"].Status != store.JobStatusSucceeded {
		t.Fatalf("expected job succeeded, got %s", repo.jobs["job-1"].Status)
	}
	result := &translationv1.StringTranslationJobResult{}
	if err := protojson.Unmarshal(repo.jobs["job-1"].OutcomePayload, result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if got := result.GetTranslations()[0].GetText(); got != "bonjour" {
		t.Fatalf("unexpected resumed translation for fr: %q", got)
	}
	if got := result.GetTranslations()[1].GetText(); got != "hallo" {
		t.Fatalf("unexpected translation for de: %q", got)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusProcessed {
		t.Fatalf("expected event processed, got %s", repo.events["evt-1"].Status)
	}
}

func TestProcessJobQueuedEventSchedulesRetry(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: "Hello", TargetLocales: []string{"fr"}})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: payload}
	repo.events["evt-1"] = &store.OutboxEventModel{ID: "evt-1", Status: store.OutboxStatusProcessing, MaxAttempts: 5}
	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		return "", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, errors.New("rate limited")
	}}).WithRetryPolicy(RetryPolicy{MaxAttempts: 5, InitialBackoff: 2 * time.Second, MaxBackoff: 10 * time.Second})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	err = processor.ProcessJobQueuedEvent(context.Background(), translationapp.JobQueuedPayload{EventID: "evt-1", JobID: "job-1", ProjectID: "proj", AttemptCount: 1, MaxAttempts: 5})
	if !errors.Is(err, ErrRetryScheduled) {
		t.Fatalf("expected scheduled retry signal, got %v", err)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusPending {
		t.Fatalf("expected event pending for retry, got %s", repo.events["evt-1"].Status)
	}
	if repo.events["evt-1"].AttemptCount != 2 {
		t.Fatalf("expected attempt count 2, got %d", repo.events["evt-1"].AttemptCount)
	}
	if got := repo.events["evt-1"].NextAttemptAt; !got.Equal(time.Unix(1700000004, 0).UTC()) {
		t.Fatalf("unexpected next attempt at %s", got)
	}
	if repo.jobs["job-1"].Status != store.JobStatusRunning {
		t.Fatalf("expected job to remain running, got %s", repo.jobs["job-1"].Status)
	}
}

func TestProcessJobQueuedEventDefersUntilRetryDue(t *testing.T) {
	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: mustStringInput(t, "Hello", "fr")}
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:            "evt-1",
		Status:        store.OutboxStatusPending,
		NextAttemptAt: time.Unix(1700000010, 0).UTC(),
		MaxAttempts:   5,
	}
	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		t.Fatal("translate should not be called before retry is due")
		return "", RoutingDecision{}, nil
	}})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	err := processor.ProcessJobQueuedEvent(context.Background(), translationapp.JobQueuedPayload{EventID: "evt-1", JobID: "job-1", ProjectID: "proj", AttemptCount: 1, MaxAttempts: 5})
	if !errors.Is(err, ErrRetryScheduled) {
		t.Fatalf("expected retry deferral signal, got %v", err)
	}
}

func TestProcessJobQueuedEventSkipsTerminalOutboxState(t *testing.T) {
	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusFailed, InputPayload: mustStringInput(t, "Hello", "fr")}
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:            "evt-1",
		Status:        store.OutboxStatusDeadLettered,
		NextAttemptAt: time.Unix(1700000000, 0).UTC(),
		MaxAttempts:   5,
	}
	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		t.Fatal("translate should not run for dead-lettered events")
		return "", RoutingDecision{}, nil
	}})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	err := processor.ProcessJobQueuedEvent(context.Background(), translationapp.JobQueuedPayload{EventID: "evt-1", JobID: "job-1", ProjectID: "proj", AttemptCount: 5, MaxAttempts: 5})
	if !errors.Is(err, ErrEventAlreadyHandled) {
		t.Fatalf("expected terminal event to short-circuit with handled sentinel, got %v", err)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusDeadLettered {
		t.Fatalf("expected dead-lettered event to remain unchanged, got %s", repo.events["evt-1"].Status)
	}
}

func TestBuildOutcomeCheckpointSaveErrorIsRetryable(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: "Hello", TargetLocales: []string{"fr"}})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Status: store.JobStatusRunning}
	repo.saveErr = errors.New("temporary db error")
	processor := &Processor{
		repository: repo,
		executor: fakeExecutor{
			translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
				return "bonjour", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
			},
		},
		clock: func() time.Time { return time.Unix(1700000000, 0).UTC() },
	}

	_, _, _, err = processor.buildOutcome(context.Background(), &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, InputPayload: payload, Status: store.JobStatusRunning})
	if err == nil || !strings.Contains(err.Error(), `persist checkpoint after locale "fr"`) {
		t.Fatalf("expected checkpoint save error, got %v", err)
	}
	if !isRetryableError(err) {
		t.Fatalf("expected checkpoint save error to be retryable, got %v", err)
	}
}

func TestRunnerIgnoresScheduledRetryErrors(t *testing.T) {
	repo := newFakeRepository()
	payload, err := json.Marshal(translationapp.JobQueuedPayload{JobID: "job-1", ProjectID: "proj", AttemptCount: 1, MaxAttempts: 5})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: mustStringInput(t, "Hello", "fr")}
	repo.events["evt-1"] = &store.OutboxEventModel{ID: "evt-1", Payload: payload, Status: store.OutboxStatusPending, NextAttemptAt: time.Unix(1700000000, 0).UTC(), MaxAttempts: 5}

	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		return "", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, errors.New("rate limited")
	}}).WithRetryPolicy(RetryPolicy{MaxAttempts: 5, InitialBackoff: 2 * time.Second, MaxBackoff: 10 * time.Second})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }
	runner := NewRunner(repo, processor, RunnerConfig{WorkerID: "runner-4", WorkerCount: 1, BatchSize: 1, LeaseDuration: time.Minute})
	runner.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	processed, err := runner.ProcessAvailable(context.Background())
	if err != nil {
		t.Fatalf("expected retry scheduling not to surface as runner error, got %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected 1 dispatched event, got %d", processed)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusPending {
		t.Fatalf("expected event pending for retry, got %s", repo.events["evt-1"].Status)
	}
}

func TestProcessJobQueuedEventDeadLettersAfterMaxAttempts(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: "Hello", TargetLocales: []string{"fr"}})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: payload}
	repo.events["evt-1"] = &store.OutboxEventModel{ID: "evt-1", Status: store.OutboxStatusProcessing, MaxAttempts: 3}
	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		return "", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, errors.New("rate limited")
	}}).WithRetryPolicy(RetryPolicy{MaxAttempts: 3, InitialBackoff: time.Second, MaxBackoff: 4 * time.Second})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	err = processor.ProcessJobQueuedEvent(context.Background(), translationapp.JobQueuedPayload{EventID: "evt-1", JobID: "job-1", ProjectID: "proj", AttemptCount: 2, MaxAttempts: 3})
	if err != nil {
		t.Fatalf("expected terminal dead-letter handling to ack event, got %v", err)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusDeadLettered {
		t.Fatalf("expected event dead-lettered, got %s", repo.events["evt-1"].Status)
	}
	if repo.jobs["job-1"].Status != store.JobStatusFailed {
		t.Fatalf("expected job failed, got %s", repo.jobs["job-1"].Status)
	}
}

func TestBuildOutcomeStringRequiresExecutor(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: "Hello", TargetLocales: []string{"fr"}})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}
	processor := &Processor{clock: func() time.Time { return time.Unix(1700000000, 0).UTC() }}
	_, _, _, err = processor.buildOutcome(context.Background(), &store.TranslationJobModel{Type: store.JobTypeString, InputPayload: payload})
	if err == nil || !strings.Contains(err.Error(), "executor is not configured") {
		t.Fatalf("expected missing executor error, got %v", err)
	}
}

func TestBuildOutcomeFileJSONSuccess(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.FileTranslationJobInput{
		SourceFileId:  "file-1",
		FileFormat:    translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
		SourceLocale:  "en",
		TargetLocales: []string{"fr"},
	})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	repo := newFakeRepository()
	repo.jobs["job-1"] = &store.TranslationJobModel{
		ID:        "job-1",
		ProjectID: "proj",
		Type:      store.JobTypeFile,
		Status:    store.JobStatusRunning,
	}
	repo.files["file-1"] = &store.TranslationFileModel{
		ID:            "file-1",
		ProjectID:     "proj",
		Path:          "content/messages.json",
		FileFormat:    "json",
		SourceLocale:  "en",
		ContentType:   "application/json",
		StorageDriver: "memory",
		Bucket:        "translations",
		ObjectKey:     "projects/proj/source/upload-1/content/messages.json",
	}
	memStore := objectstore.NewMemoryStore()
	if err := memStore.PutObject(context.Background(), objectstore.PutRequest{
		Object: objectstore.ObjectRef{Driver: "memory", Bucket: "translations", Key: "projects/proj/source/upload-1/content/messages.json"},
		Body:   []byte("{\"hello\":\"Hello\"}"),
	}); err != nil {
		t.Fatalf("put source object: %v", err)
	}

	processor := NewProcessor(repo, fakeExecutor{
		translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
			return task.TargetLocale + ":" + task.SourceText, RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
		},
	}).WithObjectStore(memStore)
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	outcomeKind, outcomePayload, _, err := processor.buildOutcome(context.Background(), &store.TranslationJobModel{
		ID:           "job-1",
		ProjectID:    "proj",
		Type:         store.JobTypeFile,
		Status:       store.JobStatusRunning,
		InputPayload: payload,
	})
	if err != nil {
		t.Fatalf("build file outcome: %v", err)
	}
	if outcomeKind != "file_result" {
		t.Fatalf("unexpected outcome kind: %s", outcomeKind)
	}

	result := &translationv1.FileTranslationJobResult{}
	if err := protojson.Unmarshal(outcomePayload, result); err != nil {
		t.Fatalf("decode file result: %v", err)
	}
	if len(result.GetTranslations()) != 1 {
		t.Fatalf("expected one translation, got %d", len(result.GetTranslations()))
	}
	if got := result.GetTranslations()[0].GetFileId(); got != "file-1" {
		t.Fatalf("unexpected file id: %s", got)
	}

	rendered, err := memStore.GetObject(context.Background(), objectstore.GetRequest{
		Object: objectstore.ObjectRef{Driver: "memory", Bucket: "translations", Key: "projects/proj/variants/file-1/fr/content/messages.json"},
	})
	if err != nil {
		t.Fatalf("get rendered object: %v", err)
	}
	if !strings.Contains(string(rendered), "fr:Hello") {
		t.Fatalf("expected rendered translation, got %q", string(rendered))
	}
}

func TestNewTranslatorExecutorRejectsLocalProviders(t *testing.T) {
	_, err := NewTranslatorExecutor(Config{Provider: "ollama", Model: "qwen2.5:7b"})
	if err == nil || !strings.Contains(err.Error(), `provider "ollama" is not supported`) {
		t.Fatalf("expected unsupported provider error, got %v", err)
	}
}

func TestNewTranslatorExecutorAcceptsRemoteProvider(t *testing.T) {
	executor, err := NewTranslatorExecutor(Config{Provider: "openai", Model: "gpt-4o-mini"})
	if err != nil {
		t.Fatalf("new translator executor: %v", err)
	}
	if executor == nil {
		t.Fatal("expected executor")
	}
}

func TestNewTranslatorExecutorRejectsUnknownFallbackModel(t *testing.T) {
	_, err := NewTranslatorExecutor(Config{Provider: "openai", Model: "unknown-model"})
	if err == nil || !strings.Contains(err.Error(), `fallback model "unknown-model" is not registered for provider "openai"`) {
		t.Fatalf("expected fallback model validation error, got %v", err)
	}
}

func TestRunnerProcessesClaimedEventsInParallel(t *testing.T) {
	repo := newFakeRepository()
	for idx := 0; idx < 4; idx++ {
		jobID := fmt.Sprintf("job-%d", idx)
		eventID := fmt.Sprintf("evt-%d", idx)
		payload, err := json.Marshal(translationapp.JobQueuedPayload{JobID: jobID, ProjectID: "proj", AttemptCount: 0, MaxAttempts: 5})
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		repo.jobs[jobID] = &store.TranslationJobModel{ID: jobID, ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: mustStringInput(t, "Hello", "fr")}
		repo.events[eventID] = &store.OutboxEventModel{ID: eventID, Payload: payload, Status: store.OutboxStatusPending, NextAttemptAt: time.Unix(1700000000, 0).UTC(), MaxAttempts: 5}
	}

	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		return task.TargetLocale + ":ok", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
	}})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }
	runner := NewRunner(repo, processor, RunnerConfig{WorkerID: "runner-1", WorkerCount: 2, BatchSize: 4, LeaseDuration: time.Minute})
	runner.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	processed, err := runner.ProcessAvailable(context.Background())
	if err != nil {
		t.Fatalf("process available: %v", err)
	}
	if processed != 4 {
		t.Fatalf("expected 4 processed events, got %d", processed)
	}
	if len(repo.claims) != 4 {
		t.Fatalf("expected 4 claims, got %d", len(repo.claims))
	}
	for _, event := range repo.events {
		if event.Status != store.OutboxStatusProcessed {
			t.Fatalf("expected processed event, got %s", event.Status)
		}
	}
}

func TestRunnerReclaimsExpiredLease(t *testing.T) {
	repo := newFakeRepository()
	payload, err := json.Marshal(translationapp.JobQueuedPayload{JobID: "job-1", ProjectID: "proj", AttemptCount: 1, MaxAttempts: 5})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	expiredAt := time.Unix(1699999990, 0).UTC()
	repo.jobs["job-1"] = &store.TranslationJobModel{ID: "job-1", ProjectID: "proj", Type: store.JobTypeString, Status: store.JobStatusRunning, InputPayload: mustStringInput(t, "Hello", "fr")}
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:             "evt-1",
		Payload:        payload,
		Status:         store.OutboxStatusProcessing,
		ClaimedBy:      "stale-worker",
		ClaimExpiresAt: &expiredAt,
		MaxAttempts:    5,
	}

	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		return task.TargetLocale + ":ok", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
	}})
	processor.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }
	runner := NewRunner(repo, processor, RunnerConfig{WorkerID: "runner-2", WorkerCount: 1, BatchSize: 1, LeaseDuration: time.Minute})
	runner.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	processed, err := runner.ProcessAvailable(context.Background())
	if err != nil {
		t.Fatalf("process available: %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected 1 processed event, got %d", processed)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusProcessed {
		t.Fatalf("expected reclaimed event processed, got %s", repo.events["evt-1"].Status)
	}
}

func TestRunnerJoinsWorkerErrors(t *testing.T) {
	repo := newFakeRepository()
	for idx := 0; idx < 2; idx++ {
		eventID := fmt.Sprintf("evt-%d", idx)
		repo.events[eventID] = &store.OutboxEventModel{
			ID:            eventID,
			Payload:       []byte("{"),
			Status:        store.OutboxStatusPending,
			NextAttemptAt: time.Unix(1700000000, 0).UTC(),
			MaxAttempts:   5,
		}
	}

	processor := NewProcessor(repo, fakeExecutor{translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
		return "", RoutingDecision{}, nil
	}})
	runner := NewRunner(repo, processor, RunnerConfig{WorkerID: "runner-3", WorkerCount: 2, BatchSize: 2, LeaseDuration: time.Minute})
	runner.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	processed, err := runner.ProcessAvailable(context.Background())
	if processed != 2 {
		t.Fatalf("expected 2 dispatched events, got %d", processed)
	}
	if err == nil {
		t.Fatal("expected joined error")
	}
	if !strings.Contains(err.Error(), "evt-0") || !strings.Contains(err.Error(), "evt-1") {
		t.Fatalf("expected both event errors, got %v", err)
	}
}

func TestRunnerRequiresProcessor(t *testing.T) {
	repo := newFakeRepository()
	runner := NewRunner(repo, nil, RunnerConfig{WorkerID: "runner-nil", WorkerCount: 1, BatchSize: 1, LeaseDuration: time.Minute})

	processed, err := runner.ProcessAvailable(context.Background())
	if processed != 0 {
		t.Fatalf("expected 0 processed events, got %d", processed)
	}
	if err == nil || !strings.Contains(err.Error(), "processor is not configured") {
		t.Fatalf("expected processor configuration error, got %v", err)
	}
}

func TestRunnerClaimFailureDoesNotInflateDispatchedCount(t *testing.T) {
	repo := newFakeRepository()
	payload, err := json.Marshal(translationapp.JobQueuedPayload{JobID: "job-1", ProjectID: "proj", AttemptCount: 0, MaxAttempts: 5})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:            "evt-1",
		Payload:       payload,
		Status:        store.OutboxStatusPending,
		NextAttemptAt: time.Unix(1700000000, 0).UTC(),
		MaxAttempts:   5,
	}

	runner := NewRunner(&claimFailureRepository{fakeRepository: repo, failEventID: "evt-1", err: errors.New("claim failed")}, NewProcessor(repo, fakeExecutor{
		translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
			return task.TargetLocale, RoutingDecision{}, nil
		},
	}), RunnerConfig{WorkerID: "runner-claim", WorkerCount: 1, BatchSize: 1, LeaseDuration: time.Minute})
	runner.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	processed, err := runner.ProcessAvailable(context.Background())
	if processed != 0 {
		t.Fatalf("expected 0 dispatched events, got %d", processed)
	}
	if err == nil || !strings.Contains(err.Error(), "claim failed") {
		t.Fatalf("expected claim error, got %v", err)
	}
}

type claimFailureRepository struct {
	*fakeRepository
	failEventID string
	err         error
}

func (r *claimFailureRepository) ClaimOutboxEvent(ctx context.Context, eventID, workerID string, now time.Time, leaseDuration time.Duration) error {
	if eventID == r.failEventID {
		return r.err
	}
	return r.fakeRepository.ClaimOutboxEvent(ctx, eventID, workerID, now, leaseDuration)
}

func TestIsTerminalStatus(t *testing.T) {
	if !isTerminalStatus(store.JobStatusSucceeded) {
		t.Fatal("expected succeeded to be terminal")
	}
	if !isTerminalStatus(store.JobStatusFailed) {
		t.Fatal("expected failed to be terminal")
	}
	if isTerminalStatus(store.JobStatusRunning) {
		t.Fatal("did not expect running to be terminal")
	}
}

func TestTerminalOutcomeMatches(t *testing.T) {
	job := &store.TranslationJobModel{OutcomeKind: "string_result", OutcomePayload: []byte(`{"translations":[{"locale":"fr","text":"bonjour"}]}`)}
	if !terminalOutcomeMatches(job, "string_result", []byte(`{"translations":[{"locale":"fr","text":"bonjour"}]}`)) {
		t.Fatal("expected matching terminal outcome")
	}
	if terminalOutcomeMatches(job, "error", []byte(`{}`)) {
		t.Fatal("did not expect mismatched terminal outcome")
	}
}

func mustStringInput(t *testing.T, source string, locale string) []byte {
	t.Helper()
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{SourceText: source, TargetLocales: []string{locale}})
	if err != nil {
		t.Fatalf("encode string input: %v", err)
	}
	return payload
}
