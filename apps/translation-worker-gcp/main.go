package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	pubsub "cloud.google.com/go/pubsub/v2"
	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	translationconfig "github.com/quiet-circles/hyperlocalise/internal/translation/config"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	"github.com/quiet-circles/hyperlocalise/internal/translation/worker"
)

var (
	runtimeMu   sync.Mutex
	runtimeInst *handlerRuntime
	runtimeLoad = func() (*handlerRuntime, error) {
		return getRuntime()
	}
)

type outboxClaimer interface {
	ClaimOutboxEvent(ctx context.Context, eventID, workerID string, now time.Time, leaseDuration time.Duration) error
	GetOutboxEvent(ctx context.Context, eventID string) (*store.OutboxEventModel, error)
}

type handlerRuntime struct {
	processor     *worker.Processor
	executionRepo outboxClaimer
	leaseDuration time.Duration
}

func (h *handlerRuntime) Handle(ctx context.Context, invocationID string, payload translationapp.JobQueuedPayload) error {
	processor := h.processor
	if processor == nil {
		return fmt.Errorf("worker processor is not configured")
	}

	if payload.EventID != "" && h.executionRepo != nil {
		now := time.Now().UTC()
		if claimErr := h.executionRepo.ClaimOutboxEvent(ctx, payload.EventID, invocationID, now, h.leaseDuration); claimErr != nil {
			if errors.Is(claimErr, store.ErrNotFound) {
				return h.classifyClaimMiss(ctx, payload.EventID, now)
			}
			return claimErr
		}
		processor = processor.WithWorkerID(invocationID)
	}

	if err := processor.ProcessJobQueuedEvent(ctx, payload); err != nil {
		if errors.Is(err, worker.ErrEventAlreadyHandled) {
			return nil
		}
		return err
	}

	return nil
}

func (h *handlerRuntime) classifyClaimMiss(ctx context.Context, eventID string, now time.Time) error {
	if h.executionRepo == nil || eventID == "" {
		return nil
	}

	event, err := h.executionRepo.GetOutboxEvent(ctx, eventID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil
		}
		return err
	}

	switch event.Status {
	case store.OutboxStatusProcessed, store.OutboxStatusDeadLettered:
		return nil
	case store.OutboxStatusPending:
		if event.NextAttemptAt.After(now) {
			return fmt.Errorf("%w: event %s not due until %s", worker.ErrRetryScheduled, eventID, event.NextAttemptAt.Format(time.RFC3339Nano))
		}
	}

	return nil
}

func main() {
	cfg := translationconfig.LoadWorkerConfig()
	if cfg.GCPPubSubProjectID == "" {
		log.Fatal("TRANSLATION_GCP_PUBSUB_PROJECT_ID is required")
	}
	if cfg.GCPPubSubSubscriptionID == "" {
		log.Fatal("TRANSLATION_GCP_PUBSUB_SUBSCRIPTION is required")
	}

	ctx := context.Background()
	client, err := pubsub.NewClient(ctx, cfg.GCPPubSubProjectID)
	if err != nil {
		log.Fatalf("create pubsub client: %v", err)
	}
	defer func() {
		if closeErr := client.Close(); closeErr != nil {
			log.Printf("close pubsub client: %v", closeErr)
		}
	}()

	subscriber := client.Subscriber(cfg.GCPPubSubSubscriptionID)
	subscriber.ReceiveSettings.NumGoroutines = 1
	subscriber.ReceiveSettings.MaxOutstandingMessages = cfg.WorkerCount

	log.Printf(
		"translation worker pulling subscription=%s project=%s queue_driver=%s",
		cfg.GCPPubSubSubscriptionID,
		cfg.GCPPubSubProjectID,
		cfg.QueueDriver,
	)
	err = subscriber.Receive(ctx, func(ctx context.Context, message *pubsub.Message) {
		payload, invocationID, decodeErr := decodeMessage(message)
		if decodeErr != nil {
			log.Printf("decode pubsub message %s: %v", messageID(message), decodeErr)
			message.Nack()
			return
		}

		if handleErr := HandleJobQueued(ctx, invocationID, payload); handleErr != nil {
			log.Printf("handle queued job message %s: %v", messageID(message), handleErr)
			message.Nack()
			return
		}

		message.Ack()
	})
	if err != nil && !errors.Is(err, context.Canceled) {
		log.Fatalf("receive pubsub messages: %v", err)
	}
}

// HandleJobQueued handles one queued translation job message from Pub/Sub.
func HandleJobQueued(ctx context.Context, invocationID string, payload translationapp.JobQueuedPayload) error {
	runtime, err := runtimeLoad()
	if err != nil {
		return err
	}

	return runtime.Handle(ctx, invocationID, payload)
}

func getRuntime() (*handlerRuntime, error) {
	runtimeMu.Lock()
	defer runtimeMu.Unlock()

	if runtimeInst != nil {
		return runtimeInst, nil
	}

	cfg := translationconfig.LoadWorkerConfig()
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	executor, err := worker.NewTranslatorExecutor(worker.Config{
		Provider:     cfg.LLMProvider,
		Model:        cfg.LLMModel,
		SystemPrompt: cfg.LLMSystemPrompt,
		UserPrompt:   cfg.LLMUserPrompt,
	})
	if err != nil {
		return nil, err
	}

	db, err := store.OpenPostgres(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	log.Printf(
		"translation worker initialized queue_driver=%s llm_provider=%s llm_model=%s",
		cfg.QueueDriver,
		cfg.LLMProvider,
		cfg.LLMModel,
	)
	repository := store.NewRepository(db)
	runtimeInst = &handlerRuntime{
		processor: worker.NewProcessor(repository, executor).WithRetryPolicy(worker.RetryPolicy{
			MaxAttempts:    cfg.RetryMaxAttempts,
			InitialBackoff: cfg.RetryInitialBackoff,
			MaxBackoff:     cfg.RetryMaxBackoff,
		}),
		executionRepo: repository,
		leaseDuration: cfg.ClaimLeaseDuration,
	}
	return runtimeInst, nil
}

func decodeMessage(message *pubsub.Message) (translationapp.JobQueuedPayload, string, error) {
	var payload translationapp.JobQueuedPayload
	if message == nil {
		return payload, "", fmt.Errorf("pubsub message is required")
	}
	if len(message.Data) == 0 {
		return payload, "", fmt.Errorf("pubsub message data is required")
	}

	if err := json.Unmarshal(message.Data, &payload); err != nil {
		return payload, "", fmt.Errorf("decode pubsub job payload: %w", err)
	}

	if payload.JobID == "" || payload.ProjectID == "" {
		return payload, "", fmt.Errorf("pubsub payload must include job_id and project_id")
	}

	invocationID := message.ID
	if invocationID == "" {
		invocationID = fmt.Sprintf("worker-%d", time.Now().UTC().UnixNano())
	}

	return payload, invocationID, nil
}

func messageID(message *pubsub.Message) string {
	if message == nil {
		return ""
	}
	return message.ID
}
