package gcppubsub

import (
	"context"
	"errors"
	"testing"

	pubsub "cloud.google.com/go/pubsub/v2"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/queue"
)

func TestPublishAddsStandardAttributes(t *testing.T) {
	t.Parallel()

	topic := &fakeTopic{}
	publisher := newWithClient(&fakeClient{topic: topic}, Config{TopicID: "jobs"})

	err := publisher.Publish(context.Background(), queue.Message{
		Topic:       queue.TopicJobQueued,
		AggregateID: "job-123",
		Payload:     []byte(`{"job_id":"job-123"}`),
		Headers: map[string]string{
			"queue_driver": queue.DriverGCPPubSub,
		},
	})
	if err != nil {
		t.Fatalf("Publish() error = %v", err)
	}

	if topic.message == nil {
		t.Fatal("expected published message")
	}

	if got := topic.message.Attributes["event_topic"]; got != queue.TopicJobQueued {
		t.Fatalf("event_topic = %q, want %q", got, queue.TopicJobQueued)
	}

	if got := topic.message.Attributes["aggregate_id"]; got != "job-123" {
		t.Fatalf("aggregate_id = %q, want %q", got, "job-123")
	}

	if got := topic.message.Attributes["queue_driver"]; got != queue.DriverGCPPubSub {
		t.Fatalf("queue_driver = %q, want %q", got, queue.DriverGCPPubSub)
	}
}

func TestPublishReturnsBrokerError(t *testing.T) {
	t.Parallel()

	publisher := newWithClient(&fakeClient{
		topic: &fakeTopic{
			result: fakePublishResult{err: errors.New("boom")},
		},
	}, Config{TopicID: "jobs"})

	err := publisher.Publish(context.Background(), queue.Message{Payload: []byte("x")})
	if err == nil {
		t.Fatal("Publish() error = nil, want error")
	}
}

func TestCloseDelegatesToClient(t *testing.T) {
	t.Parallel()

	topic := &fakeTopic{}
	client := &fakeClient{topic: topic}
	publisher := newWithClient(client, Config{TopicID: "jobs"})

	if err := publisher.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	if !topic.stopped {
		t.Fatal("expected topic.Stop to be called")
	}

	if !client.closed {
		t.Fatal("expected client.Close to be called")
	}
}

type fakeClient struct {
	topic  *fakeTopic
	closed bool
}

func (c *fakeClient) Publisher(_ string) topicHandle {
	return c.topic
}

func (c *fakeClient) Close() error {
	c.closed = true

	return nil
}

type fakeTopic struct {
	message *pubsub.Message
	result  fakePublishResult
	stopped bool
}

func (t *fakeTopic) Publish(_ context.Context, message *pubsub.Message) publishResult {
	t.message = message

	return t.result
}

func (t *fakeTopic) Stop() {
	t.stopped = true
}

type fakePublishResult struct {
	err error
}

func (r fakePublishResult) Get(context.Context) (string, error) {
	return "message-id", r.err
}
