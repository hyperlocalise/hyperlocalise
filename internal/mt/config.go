package mt

import (
	"net/http"
	"time"
)

const defaultHTTPTimeout = 30 * time.Second

type Config struct {
	// APIKey authenticates Google and DeepL.
	APIKey string

	// SubscriptionKey authenticates Microsoft.
	SubscriptionKey string

	// AccessKeyID and SecretAccessKey authenticate Amazon.
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string

	// Region is required by Microsoft and Amazon.
	Region string

	// CustomModel is an optional Microsoft custom model ID.
	CustomModel string

	BaseURL    string
	HTTPClient *http.Client
}

func (c Config) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: defaultHTTPTimeout}
}
