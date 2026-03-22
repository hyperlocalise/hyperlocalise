package dispatcher

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/translation/queue"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
)

type fakeRepository struct {
	events map[string]*store.OutboxEventModel
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{events: map[string]*store.OutboxEventModel{}}
}

func (r *fakeRepository) ListDispatchableOutboxEvents(_ context.Context, now time.Time, limit int) ([]store.OutboxEventModel, error) {
	result := make([]store.OutboxEventModel, 0, len(r.events))
	for _, event := range r.events {
		isPending := event.DeliveryStatus == store.OutboxDeliveryStatusPending && !event.DeliveryNextAttemptAt.After(now)
		isExpired := event.DeliveryStatus == store.OutboxDeliveryStatusProcessing && event.DeliveryClaimExpiresAt != nil && !event.DeliveryClaimExpiresAt.After(now)
		if isPending || isExpired {
			result = append(result, *event)
		}
	}
	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}

func (r *fakeRepository) ClaimOutboxEventDelivery(_ context.Context, eventID, dispatcherID string, now time.Time, leaseDuration time.Duration) error {
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	isPending := event.DeliveryStatus == store.OutboxDeliveryStatusPending && !event.DeliveryNextAttemptAt.After(now)
	isExpired := event.DeliveryStatus == store.OutboxDeliveryStatusProcessing && event.DeliveryClaimExpiresAt != nil && !event.DeliveryClaimExpiresAt.After(now)
	if !isPending && !isExpired {
		return store.ErrNotFound
	}
	event.DeliveryStatus = store.OutboxDeliveryStatusProcessing
	event.DeliveryClaimedBy = dispatcherID
	event.DeliveryClaimedAt = &now
	expiry := now.Add(leaseDuration)
	event.DeliveryClaimExpiresAt = &expiry
	return nil
}

func (r *fakeRepository) MarkOutboxEventPublished(_ context.Context, eventID, dispatcherID string, publishedAt time.Time) error {
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	if dispatcherID != "" && event.DeliveryClaimedBy != dispatcherID {
		return store.ErrNotFound
	}
	event.DeliveryStatus = store.OutboxDeliveryStatusPublished
	event.DeliveryLastError = ""
	event.PublishedAt = &publishedAt
	event.DeliveryClaimedBy = ""
	event.DeliveryClaimedAt = nil
	event.DeliveryClaimExpiresAt = nil
	return nil
}

func (r *fakeRepository) ScheduleOutboxEventDeliveryRetry(_ context.Context, eventID, dispatcherID string, attemptCount int, nextAttemptAt time.Time, lastError string) error {
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	if dispatcherID != "" && event.DeliveryClaimedBy != dispatcherID {
		return store.ErrNotFound
	}
	event.DeliveryStatus = store.OutboxDeliveryStatusPending
	event.DeliveryAttemptCount = attemptCount
	event.DeliveryNextAttemptAt = nextAttemptAt
	event.DeliveryLastError = lastError
	event.DeliveryClaimedBy = ""
	event.DeliveryClaimedAt = nil
	event.DeliveryClaimExpiresAt = nil
	return nil
}

func (r *fakeRepository) MarkOutboxEventDeliveryDeadLettered(_ context.Context, eventID, dispatcherID string, _ time.Time, attemptCount int, lastError string) error {
	event, ok := r.events[eventID]
	if !ok {
		return store.ErrNotFound
	}
	if dispatcherID != "" && event.DeliveryClaimedBy != dispatcherID {
		return store.ErrNotFound
	}
	event.DeliveryStatus = store.OutboxDeliveryStatusDeadLettered
	event.DeliveryAttemptCount = attemptCount
	event.DeliveryLastError = lastError
	event.DeliveryClaimedBy = ""
	event.DeliveryClaimedAt = nil
	event.DeliveryClaimExpiresAt = nil
	return nil
}

type fakePublisher struct {
	err      error
	messages []queue.Message
}

func (p *fakePublisher) Publish(_ context.Context, message queue.Message) error {
	p.messages = append(p.messages, message)
	return p.err
}

func (p *fakePublisher) Close() error { return nil }

func TestProcessAvailableMarksPublishedWithoutTouchingExecutionState(t *testing.T) {
	t.Parallel()

	now := time.Unix(1700000000, 0).UTC()
	repo := newFakeRepository()
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:                    "evt-1",
		Topic:                 queue.TopicJobQueued,
		AggregateID:           "job-1",
		Payload:               []byte(`{"job_id":"job-1"}`),
		Headers:               []byte(`{"queue_driver":"gcp-pubsub"}`),
		Status:                store.OutboxStatusPending,
		NextAttemptAt:         now,
		DeliveryStatus:        store.OutboxDeliveryStatusPending,
		DeliveryNextAttemptAt: now,
	}
	publisher := &fakePublisher{}
	dispatcher := New(repo, publisher, Config{DispatcherID: "dispatcher-1", LeaseDuration: time.Minute})
	dispatcher.clock = func() time.Time { return now }

	dispatched, err := dispatcher.ProcessAvailable(context.Background())
	if err != nil {
		t.Fatalf("ProcessAvailable returned error: %v", err)
	}
	if dispatched != 1 {
		t.Fatalf("expected 1 dispatched event, got %d", dispatched)
	}
	if len(publisher.messages) != 1 {
		t.Fatalf("expected 1 publish call, got %d", len(publisher.messages))
	}
	if repo.events["evt-1"].DeliveryStatus != store.OutboxDeliveryStatusPublished {
		t.Fatalf("expected published delivery status, got %s", repo.events["evt-1"].DeliveryStatus)
	}
	if repo.events["evt-1"].Status != store.OutboxStatusPending {
		t.Fatalf("expected execution status to remain pending, got %s", repo.events["evt-1"].Status)
	}
}

func TestProcessAvailableSchedulesRetryOnPublishFailure(t *testing.T) {
	t.Parallel()

	now := time.Unix(1700000000, 0).UTC()
	repo := newFakeRepository()
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:                    "evt-1",
		Topic:                 queue.TopicJobQueued,
		AggregateID:           "job-1",
		Payload:               []byte(`{"job_id":"job-1"}`),
		Status:                store.OutboxStatusPending,
		NextAttemptAt:         now,
		DeliveryStatus:        store.OutboxDeliveryStatusPending,
		DeliveryNextAttemptAt: now,
	}
	dispatcher := New(repo, &fakePublisher{err: errors.New("broker down")}, Config{
		DispatcherID:   "dispatcher-1",
		LeaseDuration:  time.Minute,
		MaxAttempts:    3,
		InitialBackoff: time.Second,
		MaxBackoff:     10 * time.Second,
	})
	dispatcher.clock = func() time.Time { return now }

	dispatched, err := dispatcher.ProcessAvailable(context.Background())
	if dispatched != 0 {
		t.Fatalf("expected 0 dispatched events, got %d", dispatched)
	}
	if err == nil || !strings.Contains(err.Error(), "broker down") {
		t.Fatalf("expected broker failure, got %v", err)
	}
	event := repo.events["evt-1"]
	if event.DeliveryStatus != store.OutboxDeliveryStatusPending {
		t.Fatalf("expected delivery to return to pending, got %s", event.DeliveryStatus)
	}
	if event.DeliveryAttemptCount != 1 {
		t.Fatalf("expected attempt count 1, got %d", event.DeliveryAttemptCount)
	}
	if event.DeliveryNextAttemptAt.Sub(now) != time.Second {
		t.Fatalf("expected 1s backoff, got %s", event.DeliveryNextAttemptAt.Sub(now))
	}
}

func TestProcessAvailableDeadLettersExhaustedPublishFailures(t *testing.T) {
	t.Parallel()

	now := time.Unix(1700000000, 0).UTC()
	repo := newFakeRepository()
	repo.events["evt-1"] = &store.OutboxEventModel{
		ID:                    "evt-1",
		Topic:                 queue.TopicJobQueued,
		AggregateID:           "job-1",
		Payload:               []byte(`{"job_id":"job-1"}`),
		Status:                store.OutboxStatusPending,
		NextAttemptAt:         now,
		DeliveryStatus:        store.OutboxDeliveryStatusPending,
		DeliveryAttemptCount:  1,
		DeliveryNextAttemptAt: now,
	}
	dispatcher := New(repo, &fakePublisher{err: errors.New("permanent publish error")}, Config{
		DispatcherID:   "dispatcher-1",
		LeaseDuration:  time.Minute,
		MaxAttempts:    2,
		InitialBackoff: time.Second,
		MaxBackoff:     10 * time.Second,
	})
	dispatcher.clock = func() time.Time { return now }

	_, err := dispatcher.ProcessAvailable(context.Background())
	if err == nil || !strings.Contains(err.Error(), "dead-lettered") {
		t.Fatalf("expected dead-letter error, got %v", err)
	}
	event := repo.events["evt-1"]
	if event.DeliveryStatus != store.OutboxDeliveryStatusDeadLettered {
		t.Fatalf("expected dead-lettered delivery status, got %s", event.DeliveryStatus)
	}
	if event.Status != store.OutboxStatusPending {
		t.Fatalf("expected execution status to remain pending, got %s", event.Status)
	}
}
