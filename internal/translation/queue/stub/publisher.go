package stub

import (
	"context"
	"log"

	"github.com/quiet-circles/hyperlocalise/internal/translation/queue"
)

// Publisher is a transport placeholder that keeps the application cloud-agnostic.
type Publisher struct{}

// New returns a placeholder publisher for local development and tests.
func New() *Publisher {
	return &Publisher{}
}

// Publish logs a placeholder dispatch and leaves real broker integration for later.
func (p *Publisher) Publish(_ context.Context, message queue.Message) error {
	log.Printf("queue stub topic=%s aggregate_id=%s", message.Topic, message.AggregateID)

	return nil
}

// Close is a no-op for the stub transport.
func (p *Publisher) Close() error {
	return nil
}
