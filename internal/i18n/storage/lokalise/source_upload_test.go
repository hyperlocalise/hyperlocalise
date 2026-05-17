package lokalise

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUploadSourceFilePostsBase64Payload(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	sourcePath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	mux.HandleFunc("/api2/projects/project-1:feature%2Fnew-release/files/upload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("X-Api-Token"); got != "secret" {
			t.Fatalf("X-Api-Token = %q, want secret", got)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		encoded, ok := body["data"].(string)
		if !ok {
			t.Fatalf("data missing from body: %#v", body)
		}
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			t.Fatalf("decode data: %v", err)
		}
		if got, want := string(decoded), `{"hello":"Hello"}`; got != want {
			t.Fatalf("data = %q, want %q", got, want)
		}
		if body["filename"] != "en.json" || body["lang_iso"] != "en" || body["format"] != "json" {
			t.Fatalf("unexpected body identity fields: %#v", body)
		}
		if body["convert_placeholders"] != true || body["replace_modified"] != true || body["apply_tm"] != true {
			t.Fatalf("unexpected upload options: %#v", body)
		}
		tags, ok := body["tags"].([]any)
		if !ok || len(tags) != 2 || tags[0] != "app" || tags[1] != "source" {
			t.Fatalf("tags = %#v, want app/source", body["tags"])
		}
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"project_id": "project-1",
			"process": map[string]any{
				"process_id": "proc-1",
				"type":       "file-import",
				"status":     "queued",
			},
		})
	})

	result, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:           "project-1",
		Branch:              "feature/new-release",
		SourceLocale:        "en",
		FilePath:            sourcePath,
		Tags:                []string{"app,source", "app"},
		ConvertPlaceholders: true,
		ReplaceModified:     true,
		ApplyTM:             true,
	})
	if err != nil {
		t.Fatalf("upload source file: %v", err)
	}
	if result.ProcessID != "proc-1" || result.Status != "queued" || result.Type != "file-import" {
		t.Fatalf("result = %#v, want queued proc-1", result)
	}
}

func TestUploadSourceFileUsesFormatOverride(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	sourcePath := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(sourcePath, []byte(`hello=Hello`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	mux.HandleFunc("/api2/projects/project-1/files/upload", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["format"] != "properties" {
			t.Fatalf("format = %#v, want properties", body["format"])
		}
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{"process": map[string]any{"process_id": "proc-2", "status": "queued"}})
	})

	_, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FilePath:     sourcePath,
		FileFormat:   "properties",
	})
	if err != nil {
		t.Fatalf("upload source file: %v", err)
	}
}

func TestUploadSourceFileAcceptsAlreadyQueuedResponse(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	sourcePath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	mux.HandleFunc("/api2/projects/project-1/files/upload", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"process": map[string]any{"process_id": "proc-queued", "status": "queued"}})
	})

	result, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FilePath:     sourcePath,
	})
	if err != nil {
		t.Fatalf("upload source file: %v", err)
	}
	if result.ProcessID != "proc-queued" {
		t.Fatalf("process id = %q, want proc-queued", result.ProcessID)
	}
}

func TestUploadSourceFileReportsRedirectWithoutProcessBody(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	sourcePath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	mux.HandleFunc("/api2/projects/project-1/files/upload", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "/api2/projects/project-1/processes/proc-queued")
		w.WriteHeader(http.StatusFound)
	})

	_, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FilePath:     sourcePath,
	})
	if err == nil || !strings.Contains(err.Error(), "302") || !strings.Contains(err.Error(), "location=/api2/projects/project-1/processes/proc-queued") {
		t.Fatalf("error = %v, want 302 redirect location", err)
	}
}

func TestUploadSourceFileReturnsAPIError(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	sourcePath := filepath.Join(t.TempDir(), "en.bad")
	if err := os.WriteFile(sourcePath, []byte(`bad`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	mux.HandleFunc("/api2/projects/project-1/files/upload", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"message":"unsupported format"}}`, http.StatusBadRequest)
	})

	_, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FilePath:     sourcePath,
	})
	if err == nil || !strings.Contains(err.Error(), "status=400") || !strings.Contains(err.Error(), "unsupported format") {
		t.Fatalf("error = %v, want unsupported format API error", err)
	}
}

func TestUploadSourceFileRequiresFormatWhenExtensionMissing(t *testing.T) {
	client, _, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	sourcePath := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(sourcePath, []byte(`hello=Hello`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	_, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FilePath:     sourcePath,
	})
	if err == nil || !strings.Contains(err.Error(), "use --format") {
		t.Fatalf("error = %v, want format hint", err)
	}
}

func newLokaliseUploadClientForTest(t *testing.T) (*HTTPClient, *http.ServeMux, func()) {
	t.Helper()
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	client, err := NewHTTPClient(Config{
		APIToken:       "secret",
		APIBaseURL:     server.URL + "/api2",
		TimeoutSeconds: 1,
	})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}
	return client, mux, server.Close
}
