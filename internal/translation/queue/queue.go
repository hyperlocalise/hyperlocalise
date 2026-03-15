package queue

import "context"

const (
	TopicJobQueued = "translation.job.queued"

	DriverStub      = "stub"
	DriverGCPPubSub = "gcp-pubsub"
	DriverAWSSQS    = "aws-sqs"
)

// Message is a broker-agnostic envelope for async job notifications.
type Message struct {
	Topic       string
	AggregateID string
	Payload     []byte
	Headers     map[string]string
}

// Publisher dispatches queued job notifications to a broker.
type Publisher interface {
	Publish(context.Context, Message) error
	Close() error
}
