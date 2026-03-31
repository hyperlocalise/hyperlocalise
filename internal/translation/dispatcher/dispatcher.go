package dispatcher

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/translation/queue"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/store"
)

// Repository captures the persistence operations needed for durable broker delivery.
type Repository interface {
	ListDispatchableOutboxEvents(ctx context.Context, now time.Time, limit int) ([]store.OutboxEventModel, error)
	ClaimOutboxEventDelivery(ctx context.Context, eventID, dispatcherID string, now time.Time, leaseDuration time.Duration) error
	MarkOutboxEventPublished(ctx context.Context, eventID, dispatcherID string, publishedAt time.Time) error
	ScheduleOutboxEventDeliveryRetry(ctx context.Context, eventID, dispatcherID string, attemptCount int, nextAttemptAt time.Time, lastError string, now time.Time) error
	MarkOutboxEventDeliveryDeadLettered(ctx context.Context, eventID, dispatcherID string, at time.Time, attemptCount int, lastError string) error
}

// Config controls dispatcher polling, claim leases, and retry policy.
type Config struct {
	DispatcherID   string
	PollInterval   time.Duration
	BatchSize      int
	LeaseDuration  time.Duration
	MaxAttempts    int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
}

// Dispatcher polls committed outbox rows and publishes them to the configured broker.
type Dispatcher struct {
	repository Repository
	publisher  queue.Publisher
	config     Config
	clock      func() time.Time
}

// New constructs an outbox dispatcher with sane defaults.
func New(repository Repository, publisher queue.Publisher, cfg Config) *Dispatcher {
	if cfg.DispatcherID == "" {
		cfg.DispatcherID = fmt.Sprintf("dispatcher-%d", time.Now().UTC().UnixNano())
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 2 * time.Second
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 32
	}
	if cfg.LeaseDuration <= 0 {
		cfg.LeaseDuration = 30 * time.Second
	}
	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = 5
	}
	if cfg.InitialBackoff <= 0 {
		cfg.InitialBackoff = time.Second
	}
	if cfg.MaxBackoff <= 0 {
		cfg.MaxBackoff = 30 * time.Second
	}

	return &Dispatcher{
		repository: repository,
		publisher:  publisher,
		config:     cfg,
		clock: func() time.Time {
			return time.Now().UTC()
		},
	}
}

// Run drains publishable outbox rows on startup and on a fixed polling interval until shutdown.
func (d *Dispatcher) Run(ctx context.Context) error {
	dispatched, err := d.ProcessAvailable(ctx)
	if err != nil {
		return err
	}
	if dispatched > 0 {
		log.Printf("dispatcher published %d outbox events", dispatched)
	}

	ticker := time.NewTicker(d.config.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			dispatched, err := d.ProcessAvailable(ctx)
			if err != nil {
				log.Printf("dispatcher poll failed: %v", err)
				continue
			}
			if dispatched > 0 {
				log.Printf("dispatcher published %d outbox events", dispatched)
			}
		}
	}
}

// ProcessAvailable claims one batch of dispatchable rows and publishes them.
func (d *Dispatcher) ProcessAvailable(ctx context.Context) (int, error) {
	if d.repository == nil {
		return 0, fmt.Errorf("dispatcher repository is not configured")
	}
	if d.publisher == nil {
		return 0, fmt.Errorf("dispatcher publisher is not configured")
	}

	events, err := d.repository.ListDispatchableOutboxEvents(ctx, d.clock(), d.config.BatchSize)
	if err != nil {
		return 0, err
	}
	dispatched := 0
	var errs []error

	for _, event := range events {
		now := d.clock()
		if claimErr := d.repository.ClaimOutboxEventDelivery(ctx, event.ID, d.config.DispatcherID, now, d.config.LeaseDuration); claimErr != nil {
			if errors.Is(claimErr, store.ErrNotFound) {
				continue
			}
			errs = append(errs, claimErr)
			continue
		}

		msg := queue.Message{
			Topic:       event.Topic,
			AggregateID: event.AggregateID,
			Payload:     event.Payload,
			Headers:     map[string]string{},
		}
		if len(event.Headers) > 0 {
			headers, decodeErr := decodeHeaders(event.Headers)
			if decodeErr != nil {
				errs = append(errs, d.handleDeliveryFailure(ctx, event, now, decodeErr))
				continue
			}
			msg.Headers = headers
		}

		if publishErr := d.publisher.Publish(ctx, msg); publishErr != nil {
			errs = append(errs, d.handleDeliveryFailure(ctx, event, now, publishErr))
			continue
		}

		publishedAt := d.clock()
		if markErr := d.repository.MarkOutboxEventPublished(ctx, event.ID, d.config.DispatcherID, publishedAt); markErr != nil {
			errs = append(errs, markErr)
			continue
		}
		dispatched++
	}

	if len(errs) > 0 {
		return dispatched, errors.Join(errs...)
	}
	return dispatched, nil
}

func (d *Dispatcher) handleDeliveryFailure(ctx context.Context, event store.OutboxEventModel, now time.Time, cause error) error {
	attemptCount := event.DeliveryAttemptCount + 1
	if attemptCount >= d.config.MaxAttempts {
		if err := d.repository.MarkOutboxEventDeliveryDeadLettered(ctx, event.ID, d.config.DispatcherID, now, attemptCount, cause.Error()); err != nil {
			return err
		}
		return fmt.Errorf("dead-lettered outbox delivery %s after publish failure: %w", event.ID, cause)
	}

	nextAttemptAt := now.Add(backoffForAttempt(attemptCount, d.config.InitialBackoff, d.config.MaxBackoff))
	if err := d.repository.ScheduleOutboxEventDeliveryRetry(ctx, event.ID, d.config.DispatcherID, attemptCount, nextAttemptAt, cause.Error(), now); err != nil {
		return err
	}
	return fmt.Errorf("scheduled outbox delivery retry for %s: %w", event.ID, cause)
}

func backoffForAttempt(attempt int, initial, max time.Duration) time.Duration {
	if initial <= 0 {
		initial = time.Second
	}
	backoff := initial
	if attempt <= 1 {
		if max > 0 && backoff > max {
			return max
		}
		return backoff
	}
	for idx := 1; idx < attempt; idx++ {
		backoff *= 2
		if max > 0 && backoff >= max {
			return max
		}
	}
	return backoff
}
