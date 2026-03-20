package function

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"

	cloudevent "github.com/cloudevents/sdk-go/v2/event"
	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/worker"
)

type stubProcessor struct {
	process func(context.Context, translationapp.JobQueuedPayload) error
}

func (s stubProcessor) ProcessJobQueuedEvent(ctx context.Context, payload translationapp.JobQueuedPayload) error {
	return s.process(ctx, payload)
}

func TestHandleJobQueuedAcksAlreadyHandledEvents(t *testing.T) {
	t.Cleanup(func() {
		processorLoad = func() (jobProcessor, error) {
			return getProcessor()
		}
	})
	processorLoad = func() (jobProcessor, error) {
		return stubProcessor{
			process: func(_ context.Context, payload translationapp.JobQueuedPayload) error {
				if payload.JobID != "job-1" || payload.ProjectID != "proj" {
					t.Fatalf("unexpected payload: %+v", payload)
				}
				return worker.ErrEventAlreadyHandled
			},
		}, nil
	}

	err := HandleJobQueued(context.Background(), mustCloudEvent(t, translationapp.JobQueuedPayload{
		JobID:     "job-1",
		ProjectID: "proj",
	}))
	if err != nil {
		t.Fatalf("expected duplicate delivery to be acked, got %v", err)
	}
}

func TestHandleJobQueuedPropagatesRetryableErrors(t *testing.T) {
	t.Cleanup(func() {
		processorLoad = func() (jobProcessor, error) {
			return getProcessor()
		}
	})
	processorLoad = func() (jobProcessor, error) {
		return stubProcessor{
			process: func(_ context.Context, payload translationapp.JobQueuedPayload) error {
				if payload.JobID != "job-2" || payload.ProjectID != "proj" {
					t.Fatalf("unexpected payload: %+v", payload)
				}
				return worker.ErrRetryScheduled
			},
		}, nil
	}

	err := HandleJobQueued(context.Background(), mustCloudEvent(t, translationapp.JobQueuedPayload{
		JobID:     "job-2",
		ProjectID: "proj",
	}))
	if !errors.Is(err, worker.ErrRetryScheduled) {
		t.Fatalf("expected retry signal to be returned, got %v", err)
	}
}

func mustCloudEvent(t *testing.T, payload translationapp.JobQueuedPayload) cloudevent.Event {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	envelope := pubSubCloudEvent{
		Message: pubSubMessage{
			Data: base64.StdEncoding.EncodeToString(data),
		},
	}

	event := cloudevent.New()
	event.SetID("evt-test")
	event.SetSource("test")
	event.SetType("google.cloud.pubsub.topic.v1.messagePublished")
	if err := event.SetData("application/json", envelope); err != nil {
		t.Fatalf("set cloud event data: %v", err)
	}

	return event
}
