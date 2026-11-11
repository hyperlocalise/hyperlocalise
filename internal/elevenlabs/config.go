package elevenlabs

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	defaultBaseURL        = "https://api.elevenlabs.io"
	defaultRequestTimeout = 2 * time.Minute
)

// Config holds ElevenLabs API credentials and transport settings.
type Config struct {
	APIKey     string
	BaseURL    string
	Timeout    time.Duration
	HTTPClient *http.Client
}

func (c Config) validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("elevenlabs: API key is required")
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
