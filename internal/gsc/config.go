package gsc

import (
	"fmt"
	"net/http"
	"time"

	"golang.org/x/oauth2"
)

const (
	defaultWebmastersBaseURL    = "https://www.googleapis.com/webmasters/v3"
	defaultURLInspectionBaseURL = "https://searchconsole.googleapis.com/v1"
	defaultUserInfoURL          = "https://openidconnect.googleapis.com/v1/userinfo"
	defaultRequestTimeout       = 30 * time.Second
)

// Config holds transport settings and OAuth credentials for the GSC client.
type Config struct {
	TokenSource oauth2.TokenSource

	HTTPClient *http.Client

	WebmastersBaseURL    string
	URLInspectionBaseURL string
	UserInfoURL          string
	Timeout              time.Duration
}

func (c Config) validate() error {
	if c.TokenSource == nil {
		return fmt.Errorf("gsc: token source is required")
	}
	return nil
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

func (c Config) webmastersBaseURL() string {
	if trimmed := trimRightSlash(c.WebmastersBaseURL); trimmed != "" {
		return trimmed
	}
	return defaultWebmastersBaseURL
}

func (c Config) urlInspectionBaseURL() string {
	if trimmed := trimRightSlash(c.URLInspectionBaseURL); trimmed != "" {
		return trimmed
	}
	return defaultURLInspectionBaseURL
}

func (c Config) userInfoURL() string {
	if trimmed := trimRightSlash(c.UserInfoURL); trimmed != "" {
		return trimmed
	}
	return defaultUserInfoURL
}

func trimRightSlash(value string) string {
	for len(value) > 0 && value[len(value)-1] == '/' {
		value = value[:len(value)-1]
	}
	return value
}
