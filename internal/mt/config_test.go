package mt

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestConfigHTTPClientDefaultsWhenUnset(t *testing.T) {
	cfg := Config{}

	client := cfg.httpClient()

	require.NotNil(t, client)
	require.Equal(t, defaultHTTPTimeout, client.Timeout)
}

func TestConfigHTTPClientReturnsConfiguredClient(t *testing.T) {
	custom := &http.Client{Timeout: 5 * time.Second}
	cfg := Config{HTTPClient: custom}

	client := cfg.httpClient()

	require.Same(t, custom, client)
}
