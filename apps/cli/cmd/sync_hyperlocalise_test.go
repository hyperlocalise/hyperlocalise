package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHyperlocaliseDownloadTranslationExportRejectsOversizedResponse(t *testing.T) {
	oldMaxDownloadBytes := hyperlocaliseMaxDownloadBytes
	hyperlocaliseMaxDownloadBytes = 5
	t.Cleanup(func() {
		hyperlocaliseMaxDownloadBytes = oldMaxDownloadBytes
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("123456"))
	}))
	t.Cleanup(server.Close)

	client := &hyperlocaliseAPIClient{
		apiKey:     "test-key",
		baseURL:    server.URL,
		httpClient: server.Client(),
	}

	content, err := client.downloadTranslationExport(context.Background(), "project-1", "locales/en.json", "fr")
	if err == nil {
		t.Fatalf("expected oversized download error")
	}
	if content != nil {
		t.Fatalf("content = %q, want nil on oversized response", string(content))
	}
	if !strings.Contains(err.Error(), "exceeds maximum size of 5 bytes") {
		t.Fatalf("unexpected error: %v", err)
	}
}
