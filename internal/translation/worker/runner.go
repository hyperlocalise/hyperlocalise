package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
)

// EventRepository captures queue-claim operations for the background worker runner.
type EventRepository interface {
	ListPendingOutboxEvents(ctx context.Context, now time.Time, limit int) ([]store.OutboxEventModel, error)
	ClaimOutboxEvent(ctx context.Context, eventID, workerID string, now time.Time, leaseDuration time.Duration) error
}

// RunnerConfig configures parallel queue draining for background workers.
type RunnerConfig struct {
	WorkerID      string
	WorkerCount   int
	BatchSize     int
	LeaseDuration time.Duration
}

// Runner claims eligible queue events and executes them in parallel.
type Runner struct {
	repository EventRepository
	processor  *Processor
	config     RunnerConfig
	clock      func() time.Time
}

// NewRunner constructs a queue-draining runner.
func NewRunner(repository EventRepository, processor *Processor, cfg RunnerConfig) *Runner {
	if cfg.WorkerCount <= 0 {
		cfg.WorkerCount = runtime.NumCPU()
		if cfg.WorkerCount < 1 {
			cfg.WorkerCount = 1
		}
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = cfg.WorkerCount * 4
	}
	if cfg.LeaseDuration <= 0 {
		cfg.LeaseDuration = 30 * time.Second
	}
	if cfg.WorkerID == "" {
		cfg.WorkerID = fmt.Sprintf("worker-%d", time.Now().UTC().UnixNano())
	}

	return &Runner{
		repository: repository,
		processor:  processor,
		config:     cfg,
		clock: func() time.Time {
			return time.Now().UTC()
		},
	}
}

// ProcessAvailable claims one batch of available events and drains it with a worker pool.
func (r *Runner) ProcessAvailable(ctx context.Context) (int, error) {
	events, err := r.repository.ListPendingOutboxEvents(ctx, r.clock(), r.config.BatchSize)
	if err != nil {
		return 0, err
	}
	if len(events) == 0 {
		return 0, nil
	}

	claimed := make([]store.OutboxEventModel, 0, len(events))
	for _, event := range events {
		if claimErr := r.repository.ClaimOutboxEvent(ctx, event.ID, r.config.WorkerID, r.clock(), r.config.LeaseDuration); claimErr != nil {
			if errors.Is(claimErr, store.ErrNotFound) {
				continue
			}
			return len(claimed), claimErr
		}
		claimed = append(claimed, event)
	}
	if len(claimed) == 0 {
		return 0, nil
	}

	jobs := make(chan store.OutboxEventModel)
	errCh := make(chan error, len(claimed))
	var wg sync.WaitGroup
	workerCount := r.config.WorkerCount
	if workerCount > len(claimed) {
		workerCount = len(claimed)
	}
	for idx := 0; idx < workerCount; idx++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for event := range jobs {
				payload := translationapp.JobQueuedPayload{}
				if err := json.Unmarshal(event.Payload, &payload); err != nil {
					errCh <- fmt.Errorf("decode outbox event %s payload: %w", event.ID, err)
					continue
				}
				payload.EventID = event.ID
				payload.AttemptCount = event.AttemptCount
				payload.MaxAttempts = event.MaxAttempts
				if err := r.processor.ProcessJobQueuedEvent(ctx, payload); err != nil {
					errCh <- err
				}
			}
		}()
	}

	for _, event := range claimed {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			close(errCh)
			for err := range errCh {
				if err != nil {
					return len(claimed), err
				}
			}
			return len(claimed), ctx.Err()
		case jobs <- event:
		}
	}
	close(jobs)
	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return len(claimed), err
		}
	}

	return len(claimed), nil
}
