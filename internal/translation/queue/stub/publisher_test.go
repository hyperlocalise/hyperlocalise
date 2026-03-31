package stub

import (
	"context"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/translation/queue"
)

func TestPublisherImplementsNoOpClose(t *testing.T) {
	t.Parallel()

	publisher := New()
	if err := publisher.Publish(context.Background(), queue.Message{Topic: queue.TopicJobQueued}); err != nil {
		t.Fatalf("Publish() error = %v", err)
	}

	if err := publisher.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}
