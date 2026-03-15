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
	DatabaseURL string
	QueueDriver string
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

// LoadWorkerConfig loads the runtime configuration for the translation worker runtime.
func LoadWorkerConfig() WorkerConfig {
	return WorkerConfig{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		QueueDriver: lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
	}
}

func lookupEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
