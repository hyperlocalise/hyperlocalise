package fal

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNewClientRequiresAPIKey(t *testing.T) {
	_, err := NewClient(Config{})
	require.Error(t, err)
}

func TestRunSubmitsPollsAndFetchesResult(t *testing.T) {
	var submitted map[string]any
	polls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Key test-key", r.Header.Get("Authorization"))
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/fal-ai/flux-2-pro":
			require.NoError(t, json.NewDecoder(r.Body).Decode(&submitted))
			_ = json.NewEncoder(w).Encode(map[string]any{
				"request_id":   "req_1",
				"status_url":   "http://" + r.Host + "/fal-ai/flux/requests/req_1/status",
				"response_url": "http://" + r.Host + "/fal-ai/flux/requests/req_1",
			})
		case r.URL.Path == "/fal-ai/flux/requests/req_1/status":
			polls++
			status := "IN_PROGRESS"
			if polls > 1 {
				status = "COMPLETED"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "request_id": "req_1"})
		case r.URL.Path == "/fal-ai/flux/requests/req_1":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"images": []map[string]any{{"url": "https://cdn.fal.ai/out.png"}},
			})
		default:
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{
		APIKey:       "test-key",
		QueueBaseURL: server.URL,
		PollInterval: time.Millisecond,
	}, server.Client())
	require.NoError(t, err)

	result, err := client.Run(t.Context(), "fal-ai/flux-2-pro", map[string]any{"prompt": "a cat"})
	require.NoError(t, err)
	require.Equal(t, "a cat", submitted["prompt"])
	require.GreaterOrEqual(t, polls, 2)
	require.Equal(t, []string{"https://cdn.fal.ai/out.png"}, MediaURLs(result))
}

func TestRunRejectsPollURLOnAnotherHost(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"request_id": "req_1",
			"status_url": "https://evil.example/status",
		})
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "key", QueueBaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	_, err = client.Run(t.Context(), "fal-ai/flux-2-pro", map[string]any{"prompt": "x"})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestRunSurfacesCompletedError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"request_id": "req_1",
				"status_url": "http://" + r.Host + "/status",
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "COMPLETED", "error": "content policy"})
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "key", QueueBaseURL: server.URL, PollInterval: time.Millisecond}, server.Client())
	require.NoError(t, err)
	_, err = client.Run(t.Context(), "fal-ai/flux-2-pro", map[string]any{"prompt": "x"})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
	require.Contains(t, typed.Message, "content policy")
}

func TestClientMapsHTTPErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"detail":"invalid key"}`))
	}))
	t.Cleanup(server.Close)
	client, err := NewClientWithHTTPClient(Config{APIKey: "key", QueueBaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	_, err = client.Submit(t.Context(), "fal-ai/flux-2-pro", map[string]any{"prompt": "x"})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeAuthFailed, typed.Code)
}

func TestSubmitRequiresEndpoint(t *testing.T) {
	client, err := NewClient(Config{APIKey: "key"})
	require.NoError(t, err)
	_, err = client.Submit(t.Context(), "  ", nil)
	require.Equal(t, ErrorCodeValidation, mustFalError(t, err).Code)
}

func TestMediaURLsExtractsNestedHTTPS(t *testing.T) {
	raw := json.RawMessage(`{
		"image": {"url": "https://cdn.fal.ai/a.png"},
		"video": {"url": "https://cdn.fal.ai/b.mp4"},
		"ignored": {"url": "http://insecure.example/c.png"},
		"audio_url": "https://cdn.fal.ai/c.mp3"
	}`)
	require.ElementsMatch(t, []string{
		"https://cdn.fal.ai/a.png",
		"https://cdn.fal.ai/b.mp4",
		"https://cdn.fal.ai/c.mp3",
	}, MediaURLs(raw))
}

func mustFalError(t *testing.T, err error) *Error {
	t.Helper()
	typed, ok := AsError(err)
	require.True(t, ok)
	return typed
}
