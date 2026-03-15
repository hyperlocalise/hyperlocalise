package queue

import (
	"context"
	"log"
)

// StubPublisher is a transport placeholder that keeps the application cloud-agnostic.
type StubPublisher struct {
	driver string
}

// NewStubPublisher returns a placeholder publisher for the configured queue driver.
func NewStubPublisher(driver string) *StubPublisher {
	return &StubPublisher{driver: driver}
}

// Publish logs a placeholder dispatch and leaves real broker integration for later.
func (p *StubPublisher) Publish(_ context.Context, message Message) error {
	// TODO: Replace this logger-backed stub with a real broker adapter. The first
	// implementation will target Google Pub/Sub, but the interface is intentionally
	// generic so SQS or another queue can be added without changing callers.
	log.Printf("queue stub driver=%s topic=%s aggregate_id=%s", p.driver, message.Topic, message.AggregateID)

	return nil
}
