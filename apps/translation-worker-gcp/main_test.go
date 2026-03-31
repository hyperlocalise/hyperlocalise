package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	pubsub "cloud.google.com/go/pubsub/v2"
	translationapp "github.com/hyperlocalise/hyperlocalise/internal/translation/app"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/store"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/worker"
)

type fakeExecutor struct{}

func (fakeExecutor) Translate(_ context.Context, _ worker.TranslationTask) (string, worker.RoutingDecision, error) {
	return "bonjour", worker.RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
}

type fakeRepository struct {
	claimErr  error
	claims    []string
	processed []string
	event     *store.OutboxEventModel
}

func (r *fakeRepository) ClaimOutboxEvent(_ context.Context, eventID, workerID string, _ time.Time, _ time.Duration) error {
	if r.claimErr != nil {
		return r.claimErr
	}
	r.claims = append(r.claims, eventID+":"+workerID)
	return nil
}

func (r *fakeRepository) GetOutboxEvent(_ context.Context, eventID string) (*store.OutboxEventModel, error) {
	if r.event == nil {
		return &store.OutboxEventModel{
			ID:     eventID,
			Status: store.OutboxStatusProcessing,
		}, nil
	}
	if r.event.ID != eventID {
		return nil, store.ErrNotFound
	}

	copy := *r.event
	return &copy, nil
}

func (r *fakeRepository) ListGlossaryTerms(_ context.Context, _ store.GlossaryListParams) ([]store.TranslationGlossaryTermModel, error) {
	return nil, nil
}

func (r *fakeRepository) SearchGlossaryTerms(_ context.Context, _ store.GlossarySearchParams) ([]store.TranslationGlossaryTermModel, error) {
	return nil, nil
}

func (r *fakeRepository) GetJob(_ context.Context, jobID, projectID string) (*store.TranslationJobModel, error) {
	return &store.TranslationJobModel{
		ID:        jobID,
		ProjectID: projectID,
		Status:    store.JobStatusSucceeded,
	}, nil
}

func (r *fakeRepository) MarkJobRunning(_ context.Context, _ string) error { return nil }

func (r *fakeRepository) PersistJobTerminal(_ context.Context, _ string, _ string, _ string, _ []byte, _ time.Time) error {
	return nil
}

func (r *fakeRepository) SaveRunningJobCheckpoint(_ context.Context, _, _ string, _ []byte, _ string) error {
	return nil
}

func (r *fakeRepository) MarkOutboxEventProcessed(_ context.Context, eventID, workerID string, _ time.Time) error {
	r.processed = append(r.processed, eventID+":"+workerID)
	return nil
}

func (r *fakeRepository) ScheduleOutboxEventRetry(_ context.Context, _, _ string, _ int, _ time.Time, _ string) error {
	return nil
}

func (r *fakeRepository) MarkOutboxEventDeadLettered(_ context.Context, _, _ string, _ time.Time, _ int, _ string) error {
	return nil
}

func (r *fakeRepository) GetFile(_ context.Context, _, _ string) (*store.TranslationFileModel, error) {
	return nil, store.ErrNotFound
}

func (r *fakeRepository) ListFileVariants(_ context.Context, _ string) ([]store.TranslationFileVariantModel, error) {
	return nil, nil
}

func (r *fakeRepository) SaveFileVariant(_ context.Context, _ *store.TranslationFileVariantModel) error {
	return nil
}

func TestHandleJobQueuedAcksAlreadyHandledEvents(t *testing.T) {
	t.Cleanup(func() {
		runtimeLoad = func() (*handlerRuntime, error) {
			return getRuntime()
		}
	})
	repo := &fakeRepository{}
	runtimeLoad = func() (*handlerRuntime, error) {
		return &handlerRuntime{
			processor:     worker.NewProcessor(repo, fakeExecutor{}),
			executionRepo: repo,
			leaseDuration: time.Minute,
		}, nil
	}

	err := HandleJobQueued(context.Background(), "evt-test", translationapp.JobQueuedPayload{
		JobID:     "job-1",
		ProjectID: "proj",
		EventID:   "evt-1",
	})
	if err != nil {
		t.Fatalf("expected duplicate delivery to be acked, got %v", err)
	}
	if len(repo.claims) != 1 {
		t.Fatalf("expected claim attempt, got %d", len(repo.claims))
	}
	if len(repo.processed) != 1 {
		t.Fatalf("expected processed event mark, got %d", len(repo.processed))
	}
	if repo.processed[0] != "evt-1:evt-test" {
		t.Fatalf("unexpected processed marker: %s", repo.processed[0])
	}
}

func TestHandleJobQueuedReturnsNilWhenClaimLosesRace(t *testing.T) {
	t.Cleanup(func() {
		runtimeLoad = func() (*handlerRuntime, error) {
			return getRuntime()
		}
	})
	repo := &fakeRepository{claimErr: store.ErrNotFound}
	runtimeLoad = func() (*handlerRuntime, error) {
		return &handlerRuntime{
			processor:     worker.NewProcessor(repo, fakeExecutor{}),
			executionRepo: repo,
			leaseDuration: time.Minute,
		}, nil
	}

	err := HandleJobQueued(context.Background(), "evt-test", translationapp.JobQueuedPayload{
		JobID:     "job-2",
		ProjectID: "proj",
		EventID:   "evt-2",
	})
	if err != nil {
		t.Fatalf("expected duplicate claim loss to be acked, got %v", err)
	}
	if len(repo.processed) != 0 {
		t.Fatalf("expected no processing after lost claim, got %d", len(repo.processed))
	}
}

func TestHandleJobQueuedReturnsRetryScheduledWhenEventIsNotDueYet(t *testing.T) {
	t.Cleanup(func() {
		runtimeLoad = func() (*handlerRuntime, error) {
			return getRuntime()
		}
	})
	repo := &fakeRepository{
		claimErr: store.ErrNotFound,
		event: &store.OutboxEventModel{
			ID:            "evt-3",
			Status:        store.OutboxStatusPending,
			NextAttemptAt: time.Now().UTC().Add(time.Minute),
		},
	}
	runtimeLoad = func() (*handlerRuntime, error) {
		return &handlerRuntime{
			processor:     worker.NewProcessor(repo, fakeExecutor{}),
			executionRepo: repo,
			leaseDuration: time.Minute,
		}, nil
	}

	err := HandleJobQueued(context.Background(), "evt-test", translationapp.JobQueuedPayload{
		JobID:     "job-3",
		ProjectID: "proj",
		EventID:   "evt-3",
	})
	if !errors.Is(err, worker.ErrRetryScheduled) {
		t.Fatalf("expected retry signal when event is not due, got %v", err)
	}
}

func TestDecodeMessageReturnsPayloadAndMessageID(t *testing.T) {
	payload := translationapp.JobQueuedPayload{
		JobID:     "job-3",
		ProjectID: "proj",
		EventID:   "evt-3",
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	msg := &pubsub.Message{ID: "msg-1", Data: data}
	decoded, invocationID, err := decodeMessage(msg)
	if err != nil {
		t.Fatalf("decodeMessage returned error: %v", err)
	}
	if invocationID != "msg-1" {
		t.Fatalf("expected invocation id msg-1, got %s", invocationID)
	}
	if decoded.JobID != payload.JobID || decoded.ProjectID != payload.ProjectID || decoded.EventID != payload.EventID {
		t.Fatalf("unexpected decoded payload: %+v", decoded)
	}
}
