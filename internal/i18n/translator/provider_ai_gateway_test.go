package translator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAIGatewayProviderTranslateRequiresAPIKey(t *testing.T) {
	t.Setenv(defaultAIGatewayAPIKeyEnv, "")

	_, err := NewAIGatewayProvider().Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		Model:          "openai/gpt-5.6-luna",
		SystemPrompt:   "system",
		UserPrompt:     "user",
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "AI_GATEWAY_API_KEY") {
		t.Fatalf("expected API key error, got %v", err)
	}
}

func TestAIGatewayProviderTranslateSendsBearerAuthAndUnchangedModel(t *testing.T) {
	var gotAuth string
	var gotModel string
	var gotPath string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path

		var body struct {
			Model string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		gotModel = body.Model

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id": "chatcmpl-1",
			"object": "chat.completion",
			"model": "anthropic/claude-opus-5",
			"choices": [{"index": 0, "message": {"role": "assistant", "content": "bonjour"}, "finish_reason": "stop"}]
		}`))
	}))
	defer srv.Close()

	t.Setenv(defaultAIGatewayBaseURLEnv, srv.URL)
	t.Setenv(defaultAIGatewayAPIKeyEnv, "vck_test_key")

	got, err := NewAIGatewayProvider().Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		Model:          "anthropic/claude-opus-5",
		SystemPrompt:   "system",
		UserPrompt:     "user",
	})
	if err != nil {
		t.Fatalf("translate: %v", err)
	}
	if got != "bonjour" {
		t.Fatalf("translate result = %q, want %q", got, "bonjour")
	}
	if gotAuth != "Bearer vck_test_key" {
		t.Fatalf("Authorization header = %q, want %q", gotAuth, "Bearer vck_test_key")
	}
	// Gateway model IDs (e.g. "anthropic/claude-opus-5") must pass through unchanged.
	if gotModel != "anthropic/claude-opus-5" {
		t.Fatalf("request model = %q, want unchanged %q", gotModel, "anthropic/claude-opus-5")
	}
	if gotPath != "/chat/completions" {
		t.Fatalf("request path = %q, want %q", gotPath, "/chat/completions")
	}
}

func TestAIGatewayProviderDefaultBaseURL(t *testing.T) {
	const want = "https://ai-gateway.vercel.sh/v1"
	if defaultAIGatewayBaseURL != want {
		t.Fatalf("defaultAIGatewayBaseURL = %q, want %q", defaultAIGatewayBaseURL, want)
	}
}

func TestAIGatewayProviderTranslatePreservesUpstreamErrors(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		body        string
		wantStatus  string
		wantMessage string
	}{
		{
			name:        "401 invalid api key",
			status:      http.StatusUnauthorized,
			body:        `{"error":{"message":"Invalid API key","type":"invalid_request_error","code":"invalid_api_key"}}`,
			wantStatus:  "401",
			wantMessage: "Invalid API key",
		},
		{
			name:        "400 invalid model",
			status:      http.StatusBadRequest,
			body:        `{"error":{"message":"not-a-real-model is not a valid model ID","type":"invalid_request_error","code":"model_not_found"}}`,
			wantStatus:  "400",
			wantMessage: "not a valid model ID",
		},
		{
			name:        "429 rate limited",
			status:      http.StatusTooManyRequests,
			body:        `{"error":{"message":"Rate limit exceeded","type":"rate_limit_error","code":"rate_limit_exceeded"}}`,
			wantStatus:  "429",
			wantMessage: "Rate limit exceeded",
		},
	}

	for _, tt := range tests {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			t.Setenv(defaultAIGatewayBaseURLEnv, srv.URL)
			t.Setenv(defaultAIGatewayAPIKeyEnv, "vck_test_key")

			_, err := NewAIGatewayProvider().Translate(context.Background(), Request{
				Source:         "hello",
				TargetLanguage: "fr",
				Model:          "not-a-real-model",
			})
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tc.wantStatus) {
				t.Fatalf("error %q does not contain status %q", err.Error(), tc.wantStatus)
			}
			if !strings.Contains(err.Error(), tc.wantMessage) {
				t.Fatalf("error %q does not contain message %q", err.Error(), tc.wantMessage)
			}
		})
	}
}
