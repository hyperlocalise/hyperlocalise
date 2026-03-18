package config

import (
	"os"
	"strconv"
	"time"
)

const defaultServiceListenAddr = ":8080"

// ServiceConfig configures the translation gRPC service.
type ServiceConfig struct {
	ListenAddr         string
	DatabaseURL        string
	QueueDriver        string
	GCPPubSubProjectID string
	GCPPubSubTopicID   string
}

// WorkerConfig configures the translation worker process.
type WorkerConfig struct {
	DatabaseURL         string
	QueueDriver         string
	LLMProvider         string
	LLMModel            string
	LLMSystemPrompt     string
	LLMUserPrompt       string
	WorkerCount         int
	ClaimBatchSize      int
	ClaimLeaseDuration  time.Duration
	RetryMaxAttempts    int
	RetryInitialBackoff time.Duration
	RetryMaxBackoff     time.Duration
}

// LoadServiceConfig loads the runtime configuration for translation-service.
func LoadServiceConfig() ServiceConfig {
	return ServiceConfig{
		ListenAddr:         lookupEnv("LISTEN_ADDR", defaultServiceListenAddr),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		QueueDriver:        lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		GCPPubSubProjectID: os.Getenv("TRANSLATION_GCP_PUBSUB_PROJECT_ID"),
		GCPPubSubTopicID:   os.Getenv("TRANSLATION_GCP_PUBSUB_TOPIC"),
	}
}

// LoadWorkerConfig loads worker configuration from environment variables.
func LoadWorkerConfig() WorkerConfig {
	return WorkerConfig{
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		QueueDriver:         lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		LLMProvider:         os.Getenv("TRANSLATION_LLM_PROVIDER"),
		LLMModel:            os.Getenv("TRANSLATION_LLM_MODEL"),
		LLMSystemPrompt:     os.Getenv("TRANSLATION_LLM_SYSTEM_PROMPT"),
		LLMUserPrompt:       os.Getenv("TRANSLATION_LLM_USER_PROMPT"),
		WorkerCount:         lookupEnvInt("TRANSLATION_WORKER_COUNT", 8),
		ClaimBatchSize:      lookupEnvInt("TRANSLATION_WORKER_BATCH_SIZE", 32),
		ClaimLeaseDuration:  lookupEnvDuration("TRANSLATION_WORKER_LEASE_DURATION", 30*time.Second),
		RetryMaxAttempts:    lookupEnvInt("TRANSLATION_WORKER_MAX_ATTEMPTS", 5),
		RetryInitialBackoff: lookupEnvDuration("TRANSLATION_WORKER_INITIAL_BACKOFF", 1*time.Second),
		RetryMaxBackoff:     lookupEnvDuration("TRANSLATION_WORKER_MAX_BACKOFF", 30*time.Second),
	}
}

// lookupEnv returns the value of the environment variable named by key if it is non-empty; otherwise it returns fallback.
func lookupEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func lookupEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func lookupEnvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}
