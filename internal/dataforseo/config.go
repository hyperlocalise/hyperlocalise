package dataforseo

import (
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

const (
	defaultBaseURL        = "https://api.dataforseo.com"
	defaultRequestTimeout = 60 * time.Second
	defaultMaxRetries     = 2
)

// Config holds DataForSEO API credentials and transport settings.
//
// Prefer APIKey: a base64-encoded "login:password" string from the DataForSEO
// dashboard (the value emailed as API credentials, exposed as DATAFORSEO_API_KEY
// in go-svc). Login and Password are an alternative for programmatic setup
// only — do not use separate env vars in deployment.
type Config struct {
	APIKey     string
	Login      string
	Password   string
	BaseURL    string
	Timeout    time.Duration
	MaxRetries int
}

func (c Config) validate() error {
	if strings.TrimSpace(c.authorizationValue()) == "" {
		return fmt.Errorf("dataforseo: API key or login and password are required")
	}
	return nil
}

func (c Config) baseURL() string {
	if strings.TrimSpace(c.BaseURL) == "" {
		return defaultBaseURL
	}
	return strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
}

func (c Config) timeout() time.Duration {
	if c.Timeout <= 0 {
		return defaultRequestTimeout
	}
	return c.Timeout
}

func (c Config) maxRetries() int {
	if c.MaxRetries < 0 {
		return 0
	}
	if c.MaxRetries == 0 {
		return defaultMaxRetries
	}
	return c.MaxRetries
}

func (c Config) authorizationValue() string {
	if trimmed := strings.TrimSpace(c.APIKey); trimmed != "" {
		return trimmed
	}
	login := strings.TrimSpace(c.Login)
	password := strings.TrimSpace(c.Password)
	if login == "" || password == "" {
		return ""
	}
	return base64.StdEncoding.EncodeToString([]byte(login + ":" + password))
}
