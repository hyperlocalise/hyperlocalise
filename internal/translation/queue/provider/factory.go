package provider

import (
	"context"
	"fmt"

	"github.com/quiet-circles/hyperlocalise/internal/translation/queue"
	"github.com/quiet-circles/hyperlocalise/internal/translation/queue/gcppubsub"
	stubqueue "github.com/quiet-circles/hyperlocalise/internal/translation/queue/stub"
)

// Config selects and configures a queue provider at the deployment edge.
type Config struct {
	Driver             string
	GCPPubSubProjectID string
	GCPPubSubTopicID   string
}

// NewPublisher constructs the configured broker adapter.
func NewPublisher(ctx context.Context, cfg Config) (queue.Publisher, error) {
	switch cfg.Driver {
	case "", queue.DriverStub:
		return stubqueue.New(), nil
	case queue.DriverGCPPubSub:
		return gcppubsub.New(ctx, gcppubsub.Config{
			ProjectID: cfg.GCPPubSubProjectID,
			TopicID:   cfg.GCPPubSubTopicID,
		})
	case queue.DriverAWSSQS:
		return nil, fmt.Errorf("queue driver %q is reserved for a future AWS adapter", cfg.Driver)
	default:
		return nil, fmt.Errorf("unsupported queue driver %q", cfg.Driver)
	}
}
