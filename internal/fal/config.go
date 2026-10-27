package fal

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	defaultQueueBaseURL   = "https://queue.fal.run"
	defaultRequestTimeout = 30 * time.Second
	defaultPollInterval   = 750 * time.Millisecond
)

// Config holds fal.ai API credentials and transport settings.
type Config struct {
	APIKey       string
	QueueBaseURL string
	Timeout      time.Duration
	PollInterval time.Duration
	HTTPClient   *http.Client
}

func (c Config) validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("fal: API key is required")
	}
	return nil
}

func (c Config) queueBaseURL() string {
	if trimmed := strings.TrimRight(strings.TrimSpace(c.QueueBaseURL), "/"); trimmed != "" {
		return trimmed
	}
	return defaultQueueBaseURL
}

func (c Config) pollInterval() time.Duration {
	if c.PollInterval > 0 {
		return c.PollInterval
	}
	return defaultPollInterval
}

func (c Config) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = defaultRequestTimeout
	}
	return &http.Client{Timeout: timeout}
}
