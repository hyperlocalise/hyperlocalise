package embedding

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var pngHeader = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00")

type capturedRequest struct {
	Model           string         `json:"model"`
	Input           string         `json:"input"`
	Dimensions      int            `json:"dimensions"`
	ProviderOptions map[string]any `json:"providerOptions"`
}

func embeddingServer(t *testing.T, vector []float64, captured *capturedRequest) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/embeddings" || r.Header.Get("Authorization") != "Bearer test-key" {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal(body, captured); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"object": "list",
			"model":  captured.Model,
			"data":   []map[string]any{{"object": "embedding", "index": 0, "embedding": vector}},
			"usage":  map[string]any{"prompt_tokens": 4, "total_tokens": 4},
		})
	}))
	t.Cleanup(server.Close)
	return server
}

func newTestClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	client, err := New(Config{BaseURL: baseURL, APIKey: "test-key", MaxBytes: 1 << 10})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func testVector() []float64 {
	vector := make([]float64, Dimensions)
	vector[0] = 0.5
	vector[1] = -0.25
	return vector
}

func TestNewRequiresAPIKey(t *testing.T) {
	if _, err := New(Config{}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("err = %v", err)
	}
}

func TestEmbedQueryPrefixesText(t *testing.T) {
	var captured capturedRequest
	server := embeddingServer(t, testVector(), &captured)
	result, err := newTestClient(t, server.URL).EmbedQuery(context.Background(), "  keep placeholders  ")
	if err != nil {
		t.Fatal(err)
	}
	if captured.Model != Model || captured.Dimensions != Dimensions || captured.Input != "task: search result | query: keep placeholders" {
		t.Fatalf("request %+v", captured)
	}
	if captured.ProviderOptions != nil {
		t.Fatalf("providerOptions = %#v", captured.ProviderOptions)
	}
	if len(result.Vector) != Dimensions || result.Vector[0] != 0.5 || result.Vector[1] != -0.25 || result.Tokens != 4 {
		t.Fatalf("result %+v", result)
	}
}

func TestEmbedDocumentPrefixesText(t *testing.T) {
	var captured capturedRequest
	server := embeddingServer(t, testVector(), &captured)
	if _, err := newTestClient(t, server.URL).EmbedDocument(context.Background(), Document{Title: "Brand", Text: "Use informal tone."}); err != nil {
		t.Fatal(err)
	}
	if captured.Input != "title: Brand | text: Use informal tone." {
		t.Fatalf("input = %q", captured.Input)
	}
}

func TestEmbedDocumentUsesNoneTitle(t *testing.T) {
	var captured capturedRequest
	server := embeddingServer(t, testVector(), &captured)
	if _, err := newTestClient(t, server.URL).EmbedDocument(context.Background(), Document{Text: "Keep ICU."}); err != nil {
		t.Fatal(err)
	}
	if captured.Input != "title: none | text: Keep ICU." {
		t.Fatalf("input = %q", captured.Input)
	}
}

func TestEmbedDocumentSendsPDFInlineData(t *testing.T) {
	var captured capturedRequest
	server := embeddingServer(t, testVector(), &captured)
	data := []byte("%PDF-1.4 hello")
	if _, err := newTestClient(t, server.URL).EmbedDocument(context.Background(), Document{Data: data, Text: "Cover sheet"}); err != nil {
		t.Fatal(err)
	}
	if captured.Input != "Cover sheet" {
		t.Fatalf("input = %q", captured.Input)
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	body, err := json.Marshal(captured.ProviderOptions)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"mimeType":"application/pdf"`) || !strings.Contains(string(body), encoded) {
		t.Fatalf("providerOptions = %s", body)
	}
}

func TestEmbedDocumentFileOnlyUsesPlaceholderInput(t *testing.T) {
	var captured capturedRequest
	server := embeddingServer(t, testVector(), &captured)
	if _, err := newTestClient(t, server.URL).EmbedDocument(context.Background(), Document{Data: pngHeader}); err != nil {
		t.Fatal(err)
	}
	if captured.Input != fileOnlyInput {
		t.Fatalf("input = %q", captured.Input)
	}
	body, err := json.Marshal(captured.ProviderOptions)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"mimeType":"image/png"`) {
		t.Fatalf("providerOptions = %s", body)
	}
}

func TestEmbedDocumentRejectsUnsupportedBytes(t *testing.T) {
	client := newTestClient(t, "http://127.0.0.1:0")
	if _, err := client.EmbedDocument(context.Background(), Document{Data: []byte("PK\x03\x04")}); !errors.Is(err, ErrUnsupportedFormat) {
		t.Fatalf("err = %v", err)
	}
}

func TestEmbedValidation(t *testing.T) {
	client := newTestClient(t, "http://127.0.0.1:0")
	cases := []struct {
		name string
		fn   func() error
		want error
	}{
		{name: "empty query", fn: func() error { _, err := client.EmbedQuery(context.Background(), "  "); return err }, want: ErrInvalidInput},
		{name: "empty document", fn: func() error { _, err := client.EmbedDocument(context.Background(), Document{}); return err }, want: ErrInvalidInput},
		{name: "too large", fn: func() error {
			_, err := client.EmbedDocument(context.Background(), Document{Data: append(pngHeader, make([]byte, 2<<10)...)})
			return err
		}, want: ErrTooLarge},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if err := test.fn(); !errors.Is(err, test.want) {
				t.Fatalf("err = %v, want %v", err, test.want)
			}
		})
	}
}

func TestEmbedRejectsWrongVectorLength(t *testing.T) {
	var captured capturedRequest
	server := embeddingServer(t, []float64{0.1, 0.2}, &captured)
	if _, err := newTestClient(t, server.URL).EmbedQuery(context.Background(), "query"); !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v", err)
	}
}

func TestEmbedRetriesTransientStatus(t *testing.T) {
	vector := testVector()
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			http.Error(w, "try again", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data":  []map[string]any{{"embedding": vector}},
			"usage": map[string]any{"total_tokens": 2},
		})
	}))
	t.Cleanup(server.Close)
	result, err := newTestClient(t, server.URL).EmbedQuery(context.Background(), "query")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || result.Tokens != 2 {
		t.Fatalf("calls=%d result=%+v", calls, result)
	}
}

func TestEmbedQueryCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := newTestClient(t, "http://127.0.0.1:0").EmbedQuery(ctx, "query"); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
}
