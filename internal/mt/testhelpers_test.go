package mt

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func newTestServer(t *testing.T, handler http.HandlerFunc) Config {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return Config{
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	}
}

func TestNewTestServerServesHandler(t *testing.T) {
	var gotPath string
	cfg := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	})

	resp, err := cfg.HTTPClient.Get(cfg.BaseURL + "/ping")
	require.NoError(t, err)

	defer func() {
		require.NoError(t, resp.Body.Close())
	}()

	require.Equal(t, "/ping", gotPath)
	require.Equal(t, http.StatusOK, resp.StatusCode)
}
