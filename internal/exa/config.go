package exa

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	defaultBaseURL        = "https://api.exa.ai"
	defaultRequestTimeout = 60 * time.Second
)

// Config holds Exa API credentials and transport settings.
type Config struct {
	APIKey     string
	BaseURL    string
	Timeout    time.Duration
	HTTPClient *http.Client
}

func (c Config) validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("exa: API key is required")
	}
	return nil
}

func (c Config) baseURL() string {
	if trimmed := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/"); trimmed != "" {
		return trimmed
	}
	return defaultBaseURL
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
