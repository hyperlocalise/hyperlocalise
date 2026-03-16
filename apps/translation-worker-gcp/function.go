package function

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevent "github.com/cloudevents/sdk-go/v2/event"
	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	translationconfig "github.com/quiet-circles/hyperlocalise/internal/translation/config"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	"github.com/quiet-circles/hyperlocalise/internal/translation/worker"
)

type pubSubCloudEvent struct {
	Message      pubSubMessage `json:"message"`
	Subscription string        `json:"subscription"`
}

type pubSubMessage struct {
	Data       string            `json:"data"`
	Attributes map[string]string `json:"attributes"`
	MessageID  string            `json:"messageId"`
}

var (
	processorMu   sync.Mutex
	processorInst *worker.Processor
)

func init() {
	functions.CloudEvent("HandleJobQueued", HandleJobQueued)
}

// HandleJobQueued processes one Pub/Sub CloudEvent for a queued translation job.
func HandleJobQueued(ctx context.Context, cloudEvent cloudevent.Event) error {
	processor, err := getProcessor()
	if err != nil {
		return err
	}

	payload, err := decodePayload(cloudEvent)
	if err != nil {
		return err
	}

	return processor.ProcessJobQueuedEvent(ctx, payload)
}

// getProcessor initializes and memoizes the shared worker processor instance.
func getProcessor() (*worker.Processor, error) {
	processorMu.Lock()
	defer processorMu.Unlock()

	if processorInst != nil {
		return processorInst, nil
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

	// TODO: Add a closer hook for local development once the Cloud Function is wrapped
	// with a local runner. In the deployed function runtime the shared DB handle should
	// stay warm across invocations.
	log.Printf(
		"translation worker function initialized queue_driver=%s llm_provider=%s llm_model=%s",
		cfg.QueueDriver,
		cfg.LLMProvider,
		cfg.LLMModel,
	)
	processorInst = worker.NewProcessor(store.NewRepository(db), executor)
	return processorInst, nil
}

// decodePayload unmarshals the queued job payload from the Pub/Sub envelope.
func decodePayload(cloudEvent cloudevent.Event) (translationapp.JobQueuedPayload, error) {
	var payload translationapp.JobQueuedPayload

	var envelope pubSubCloudEvent
	if err := cloudEvent.DataAs(&envelope); err != nil {
		return payload, fmt.Errorf("decode pubsub cloud event: %w", err)
	}

	if envelope.Message.Data == "" {
		return payload, fmt.Errorf("pubsub message data is required")
	}

	decodedData, err := base64.StdEncoding.DecodeString(envelope.Message.Data)
	if err != nil {
		return payload, fmt.Errorf("decode pubsub message data: %w", err)
	}

	if err := json.Unmarshal(decodedData, &payload); err != nil {
		return payload, fmt.Errorf("decode pubsub job payload: %w", err)
	}

	if payload.JobID == "" || payload.ProjectID == "" {
		return payload, fmt.Errorf("pubsub payload must include job_id and project_id")
	}

	return payload, nil
}
