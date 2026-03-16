package gcppubsub

import (
	"context"
	"fmt"

	pubsub "cloud.google.com/go/pubsub/v2"
	"github.com/quiet-circles/hyperlocalise/internal/translation/queue"
)

// Config identifies the Pub/Sub project and topic used for queued job delivery.
type Config struct {
	ProjectID string
	TopicID   string
}

type client interface {
	Publisher(id string) topicHandle
	Close() error
}

type topicHandle interface {
	Publish(context.Context, *pubsub.Message) publishResult
	Stop()
}

type publishResult interface {
	Get(context.Context) (string, error)
}

type pubsubClient struct {
	client *pubsub.Client
}

func (c *pubsubClient) Publisher(id string) topicHandle {
	return &pubsubPublisher{publisher: c.client.Publisher(id)}
}

func (c *pubsubClient) Close() error {
	return c.client.Close()
}

type pubsubPublisher struct {
	publisher *pubsub.Publisher
}

func (p *pubsubPublisher) Publish(ctx context.Context, message *pubsub.Message) publishResult {
	return p.publisher.Publish(ctx, message)
}

func (p *pubsubPublisher) Stop() {
	p.publisher.Stop()
}

// Publisher publishes neutral queue messages to a configured Google Pub/Sub topic.
type Publisher struct {
	client client
	topic  topicHandle
}

// New constructs a real Google Pub/Sub publisher.
func New(ctx context.Context, cfg Config) (*Publisher, error) {
	if cfg.ProjectID == "" {
		return nil, fmt.Errorf("gcp pubsub project id is required")
	}

	if cfg.TopicID == "" {
		return nil, fmt.Errorf("gcp pubsub topic id is required")
	}

	client, err := pubsub.NewClient(ctx, cfg.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("create gcp pubsub client: %w", err)
	}

	return newWithClient(&pubsubClient{client: client}, cfg), nil
}

func newWithClient(client client, cfg Config) *Publisher {
	return &Publisher{
		client: client,
		topic:  client.Publisher(cfg.TopicID),
	}
}

// Publish sends one neutral queue message to the configured Pub/Sub topic.
func (p *Publisher) Publish(ctx context.Context, message queue.Message) error {
	attributes := make(map[string]string, len(message.Headers)+2)
	for key, value := range message.Headers {
		attributes[key] = value
	}
	attributes["event_topic"] = message.Topic
	attributes["aggregate_id"] = message.AggregateID

	result := p.topic.Publish(ctx, &pubsub.Message{
		Data:       message.Payload,
		Attributes: attributes,
	})

	if _, err := result.Get(ctx); err != nil {
		return fmt.Errorf("publish to gcp pubsub: %w", err)
	}

	return nil
}

// Close releases the underlying Pub/Sub client.
func (p *Publisher) Close() error {
	if p == nil {
		return nil
	}

	if p.topic != nil {
		p.topic.Stop()
	}

	if p.client == nil {
		return nil
	}

	return p.client.Close()
}
