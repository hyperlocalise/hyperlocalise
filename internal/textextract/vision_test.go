package textextract

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type capturedRequest struct {
	Model    string `json:"model"`
	Messages []struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	} `json:"messages"`
}

func visionServer(t *testing.T, reply string, captured *capturedRequest) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, captured); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "c1", "object": "chat.completion", "created": 1, "model": captured.Model,
			"choices": []map[string]any{{"index": 0, "finish_reason": "stop", "message": map[string]any{"role": "assistant", "content": reply}}},
		})
	}))
	t.Cleanup(server.Close)
	return server
}

func newTestRecognizer(t *testing.T, baseURL string) *OpenAIRecognizer {
	t.Helper()
	recognizer, err := NewOpenAIRecognizer(OpenAIRecognizerConfig{BaseURL: baseURL, APIKey: "test-key", Model: "openai/gpt-5-mini", MaxBytes: 1 << 10})
	if err != nil {
		t.Fatal(err)
	}
	return recognizer
}

func TestOpenAIRecognizerSendsImagePart(t *testing.T) {
	var captured capturedRequest
	server := visionServer(t, "Heading\n\nBody", &captured)
	text, err := newTestRecognizer(t, server.URL).Recognize(context.Background(), Media{Filename: "a.png", MediaType: "image/png", Data: pngHeader})
	if err != nil {
		t.Fatal(err)
	}
	if text != "Heading\n\nBody" || captured.Model != "openai/gpt-5-mini" || len(captured.Messages) != 2 || captured.Messages[0].Role != "system" {
		t.Fatalf("text %q, request %+v", text, captured)
	}
	user := string(captured.Messages[1].Content)
	if !strings.Contains(user, `"type":"image_url"`) || !strings.Contains(user, "data:image/png;base64,") {
		t.Fatalf("user content = %s", user)
	}
}

func TestOpenAIRecognizerSendsPDFFilePart(t *testing.T) {
	var captured capturedRequest
	server := visionServer(t, "text", &captured)
	if _, err := newTestRecognizer(t, server.URL).Recognize(context.Background(), Media{Filename: ".", MediaType: "application/pdf", Data: []byte("%PDF-1.4")}); err != nil {
		t.Fatal(err)
	}
	user := string(captured.Messages[1].Content)
	if !strings.Contains(user, `"type":"file"`) || !strings.Contains(user, "data:application/pdf;base64,") || !strings.Contains(user, `"filename":"document.pdf"`) {
		t.Fatalf("user content = %s", user)
	}
}

func TestOpenAIRecognizerValidation(t *testing.T) {
	if _, err := NewOpenAIRecognizer(OpenAIRecognizerConfig{APIKey: "k"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("missing model err = %v", err)
	}
	recognizer := newTestRecognizer(t, "http://127.0.0.1:0")
	for name, media := range map[string]Media{
		"empty":       {MediaType: "image/png"},
		"too large":   {MediaType: "image/png", Data: make([]byte, 2<<10)},
		"unsupported": {MediaType: "text/plain", Data: []byte("x")},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := recognizer.Recognize(context.Background(), media); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
