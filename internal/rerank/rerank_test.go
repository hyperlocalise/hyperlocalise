package rerank

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := New(Config{BaseURL: server.URL + "/v1/", APIKey: " key "})
	require.NoError(t, err)
	return client
}

func TestRerankSendsRequestAndOrdersByScore(t *testing.T) {
	var captured requestBody
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/rerank", r.URL.Path)
		require.Equal(t, "Bearer key", r.Header.Get("Authorization"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&captured))
		_, _ = w.Write([]byte(`{"results":[{"index":0,"relevance_score":0.2},{"index":2,"relevance_score":0.9}]}`))
	})
	order, err := client.Rerank(t.Context(), " placeholders ", []string{"a", "b", "c"}, 5)
	require.NoError(t, err)
	require.Equal(t, []int{2, 0}, order)
	require.Equal(t, requestBody{Model: Model, Query: "placeholders", Documents: []string{"a", "b", "c"}, TopN: 3}, captured)
}

func TestRerankRejectsInvalidResponses(t *testing.T) {
	for name, body := range map[string]string{
		"malformed":    `{`,
		"empty":        `{"results":[]}`,
		"out of range": `{"results":[{"index":3,"relevance_score":1}]}`,
		"duplicate":    `{"results":[{"index":0,"relevance_score":1},{"index":0,"relevance_score":0.5}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			client := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) })
			_, err := client.Rerank(t.Context(), "query", []string{"a", "b"}, 2)
			require.ErrorIs(t, err, ErrInvalidResponse)
		})
	}
}

func TestRerankReportsHTTPErrors(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "model unavailable", http.StatusServiceUnavailable)
	})
	_, err := client.Rerank(t.Context(), "query", []string{"a"}, 1)
	require.ErrorContains(t, err, "HTTP 503: model unavailable")
}

func TestRerankValidatesInput(t *testing.T) {
	_, err := New(Config{APIKey: " "})
	require.ErrorIs(t, err, ErrInvalidInput)
	client, err := New(Config{APIKey: "key"})
	require.NoError(t, err)
	tooMany := make([]string, MaxDocuments+1)
	for i := range tooMany {
		tooMany[i] = "doc"
	}
	for name, call := range map[string]func() error{
		"empty query":    func() error { _, err := client.Rerank(t.Context(), " ", []string{"a"}, 1); return err },
		"no documents":   func() error { _, err := client.Rerank(t.Context(), "q", nil, 1); return err },
		"blank document": func() error { _, err := client.Rerank(t.Context(), "q", []string{" "}, 1); return err },
		"zero topN":      func() error { _, err := client.Rerank(t.Context(), "q", []string{"a"}, 0); return err },
		"too many":       func() error { _, err := client.Rerank(t.Context(), "q", tooMany, 1); return err },
	} {
		require.ErrorIs(t, call(), ErrInvalidInput, name)
	}
}
