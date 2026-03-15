package config

import (
	"os"
	"strconv"
	"time"
)

const (
	defaultServiceListenAddr  = ":8080"
	defaultWorkerPollInterval = 2 * time.Second
	defaultWorkerBatchSize    = 10
)

// ServiceConfig configures the translation gRPC service.
type ServiceConfig struct {
	ListenAddr  string
	DatabaseURL string
	QueueDriver string
}

// WorkerConfig configures the translation worker process.
type WorkerConfig struct {
	DatabaseURL  string
	QueueDriver  string
	PollInterval time.Duration
	BatchSize    int
}

// LoadServiceConfig loads the runtime configuration for translation-service.
func LoadServiceConfig() ServiceConfig {
	return ServiceConfig{
		ListenAddr:  lookupEnv("LISTEN_ADDR", defaultServiceListenAddr),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		QueueDriver: lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
	}
}

// LoadWorkerConfig loads the runtime configuration for translation-worker.
func LoadWorkerConfig() WorkerConfig {
	return WorkerConfig{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		QueueDriver:  lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		PollInterval: lookupEnvDuration("TRANSLATION_WORKER_POLL_INTERVAL", defaultWorkerPollInterval),
		BatchSize:    lookupEnvInt("TRANSLATION_WORKER_BATCH_SIZE", defaultWorkerBatchSize),
	}
}

func lookupEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func lookupEnvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func lookupEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err == nil {
		return parsed
	}

	return fallback
}
