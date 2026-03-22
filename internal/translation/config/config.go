package config

import (
	"os"
	"strconv"
	"time"
)

const defaultServiceListenAddr = ":8080"

// ServiceConfig configures the translation gRPC service.
type ServiceConfig struct {
	ListenAddr           string
	DatabaseURL          string
	QueueDriver          string
	ObjectStoreDriver    string
	GCPPubSubProjectID   string
	GCPPubSubTopicID     string
	GCPBucket            string
	GCPSigningAccount    string
	GCPSigningPrivateKey string
	AWSBucket            string
	AWSRegion            string
	AWSAccessKeyID       string
	AWSSecretAccessKey   string
	AWSSessionToken      string
	AWSEndpoint          string
}

// GCPWorkerConfig configures the GCP translation worker process.
type GCPWorkerConfig struct {
	DatabaseURL             string
	QueueDriver             string
	ObjectStoreDriver       string
	GCPPubSubProjectID      string
	GCPPubSubTopicID        string
	GCPPubSubSubscriptionID string
	GCPBucket               string
	GCPSigningAccount       string
	GCPSigningPrivateKey    string
	LLMProvider             string
	LLMModel                string
	LLMSystemPrompt         string
	LLMUserPrompt           string
	WorkerCount             int
	ClaimBatchSize          int
	ClaimLeaseDuration      time.Duration
	RetryMaxAttempts        int
	RetryInitialBackoff     time.Duration
	RetryMaxBackoff         time.Duration
}

// DispatcherConfig configures the outbox-to-broker delivery process.
type DispatcherConfig struct {
	DatabaseURL        string
	QueueDriver        string
	GCPPubSubProjectID string
	GCPPubSubTopicID   string
	PollInterval       time.Duration
	BatchSize          int
	LeaseDuration      time.Duration
	MaxAttempts        int
	InitialBackoff     time.Duration
	MaxBackoff         time.Duration
}

// LoadServiceConfig loads the runtime configuration for translation-service.
func LoadServiceConfig() ServiceConfig {
	return ServiceConfig{
		ListenAddr:           lookupEnv("LISTEN_ADDR", defaultServiceListenAddr),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		QueueDriver:          lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		ObjectStoreDriver:    lookupEnv("TRANSLATION_OBJECT_STORE_DRIVER", "gcp"),
		GCPPubSubProjectID:   os.Getenv("TRANSLATION_GCP_PUBSUB_PROJECT_ID"),
		GCPPubSubTopicID:     os.Getenv("TRANSLATION_GCP_PUBSUB_TOPIC"),
		GCPBucket:            os.Getenv("TRANSLATION_GCP_STORAGE_BUCKET"),
		GCPSigningAccount:    os.Getenv("TRANSLATION_GCP_STORAGE_SIGNING_ACCOUNT"),
		GCPSigningPrivateKey: os.Getenv("TRANSLATION_GCP_STORAGE_SIGNING_PRIVATE_KEY"),
		AWSBucket:            os.Getenv("TRANSLATION_AWS_STORAGE_BUCKET"),
		AWSRegion:            os.Getenv("TRANSLATION_AWS_STORAGE_REGION"),
		AWSAccessKeyID:       os.Getenv("TRANSLATION_AWS_STORAGE_ACCESS_KEY_ID"),
		AWSSecretAccessKey:   os.Getenv("TRANSLATION_AWS_STORAGE_SECRET_ACCESS_KEY"),
		AWSSessionToken:      os.Getenv("TRANSLATION_AWS_STORAGE_SESSION_TOKEN"),
		AWSEndpoint:          os.Getenv("TRANSLATION_AWS_STORAGE_ENDPOINT"),
	}
}

// LoadGCPWorkerConfig loads GCP worker configuration from environment variables.
func LoadGCPWorkerConfig() GCPWorkerConfig {
	return GCPWorkerConfig{
		DatabaseURL:             os.Getenv("DATABASE_URL"),
		QueueDriver:             lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		ObjectStoreDriver:       lookupEnv("TRANSLATION_OBJECT_STORE_DRIVER", "gcp"),
		GCPPubSubProjectID:      os.Getenv("TRANSLATION_GCP_PUBSUB_PROJECT_ID"),
		GCPPubSubTopicID:        os.Getenv("TRANSLATION_GCP_PUBSUB_TOPIC"),
		GCPPubSubSubscriptionID: os.Getenv("TRANSLATION_GCP_PUBSUB_SUBSCRIPTION"),
		GCPBucket:               os.Getenv("TRANSLATION_GCP_STORAGE_BUCKET"),
		GCPSigningAccount:       os.Getenv("TRANSLATION_GCP_STORAGE_SIGNING_ACCOUNT"),
		GCPSigningPrivateKey:    os.Getenv("TRANSLATION_GCP_STORAGE_SIGNING_PRIVATE_KEY"),
		LLMProvider:             os.Getenv("TRANSLATION_LLM_PROVIDER"),
		LLMModel:                os.Getenv("TRANSLATION_LLM_MODEL"),
		LLMSystemPrompt:         os.Getenv("TRANSLATION_LLM_SYSTEM_PROMPT"),
		LLMUserPrompt:           os.Getenv("TRANSLATION_LLM_USER_PROMPT"),
		WorkerCount:             lookupEnvInt("TRANSLATION_WORKER_COUNT", 8),
		ClaimBatchSize:          lookupEnvInt("TRANSLATION_WORKER_BATCH_SIZE", 32),
		ClaimLeaseDuration:      lookupEnvDuration("TRANSLATION_WORKER_LEASE_DURATION", 10*time.Minute),
		RetryMaxAttempts:        lookupEnvInt("TRANSLATION_WORKER_MAX_ATTEMPTS", 5),
		RetryInitialBackoff:     lookupEnvDuration("TRANSLATION_WORKER_INITIAL_BACKOFF", 1*time.Second),
		RetryMaxBackoff:         lookupEnvDuration("TRANSLATION_WORKER_MAX_BACKOFF", 30*time.Second),
	}
}

// LoadDispatcherConfig loads dispatcher configuration from environment variables.
func LoadDispatcherConfig() DispatcherConfig {
	return DispatcherConfig{
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		QueueDriver:        lookupEnv("TRANSLATION_QUEUE_DRIVER", "gcp-pubsub"),
		GCPPubSubProjectID: os.Getenv("TRANSLATION_GCP_PUBSUB_PROJECT_ID"),
		GCPPubSubTopicID:   os.Getenv("TRANSLATION_GCP_PUBSUB_TOPIC"),
		PollInterval:       lookupEnvDuration("TRANSLATION_DISPATCHER_POLL_INTERVAL", 2*time.Second),
		BatchSize:          lookupEnvInt("TRANSLATION_DISPATCHER_BATCH_SIZE", 32),
		LeaseDuration:      lookupEnvDuration("TRANSLATION_DISPATCHER_LEASE_DURATION", 30*time.Second),
		MaxAttempts:        lookupEnvInt("TRANSLATION_DISPATCHER_MAX_ATTEMPTS", 5),
		InitialBackoff:     lookupEnvDuration("TRANSLATION_DISPATCHER_INITIAL_BACKOFF", 1*time.Second),
		MaxBackoff:         lookupEnvDuration("TRANSLATION_DISPATCHER_MAX_BACKOFF", 30*time.Second),
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
