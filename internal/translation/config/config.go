package config

import (
	"os"
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
	DatabaseURL     string
	QueueDriver     string
	LLMProvider     string
	LLMModel        string
	LLMSystemPrompt string
	LLMUserPrompt   string
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

// - TRANSLATION_LLM_USER_PROMPT -> LLMUserPrompt
func LoadWorkerConfig() WorkerConfig {
	return WorkerConfig{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		QueueDriver:     lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		LLMProvider:     os.Getenv("TRANSLATION_LLM_PROVIDER"),
		LLMModel:        os.Getenv("TRANSLATION_LLM_MODEL"),
		LLMSystemPrompt: os.Getenv("TRANSLATION_LLM_SYSTEM_PROMPT"),
		LLMUserPrompt:   os.Getenv("TRANSLATION_LLM_USER_PROMPT"),
	}
}

// lookupEnv returns the value of the environment variable named by key if it is non-empty; otherwise it returns fallback.
func lookupEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
