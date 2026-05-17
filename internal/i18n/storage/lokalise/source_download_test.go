package lokalise

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDownloadSourceFileFetchesBundle(t *testing.T) {
	var exportCalled bool
	var bundleCalled bool

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api2/projects/project-1/files/download":
			exportCalled = true
			w.Header().Set("Content-Type", "application/json")
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s, want POST", r.Method)
			}
			if got := r.Header.Get("X-Api-Token"); got != "secret" {
				t.Fatalf("unexpected auth header: %q", got)
			}
			var body struct {
				Format            string   `json:"format"`
				OriginalFilenames *bool    `json:"original_filenames"`
				AllPlatforms      bool     `json:"all_platforms"`
				FilterLangs       []string `json:"filter_langs"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode request body: %v", err)
			}
			if body.Format != "json" {
				t.Fatalf("format = %q, want json", body.Format)
			}
			if body.OriginalFilenames == nil || !*body.OriginalFilenames {
				t.Fatalf("expected original_filenames=true, got %#v", body.OriginalFilenames)
			}
			if !body.AllPlatforms {
				t.Fatalf("expected all_platforms=true")
			}
			if len(body.FilterLangs) != 1 || body.FilterLangs[0] != "en" {
				t.Fatalf("filter_langs = %#v, want [en]", body.FilterLangs)
			}
			_, _ = fmt.Fprintf(w, `{"project_id":"project-1","bundle_url":%q}`, server.URL+"/bundle/source.zip")
		case "/bundle/source.zip":
			bundleCalled = true
			_, _ = w.Write([]byte("zip-bytes"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{
		APIToken:       "secret",
		APIBaseURL:     server.URL + "/api2/",
		TimeoutSeconds: 1,
	})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}

	result, err := client.DownloadSourceFile(t.Context(), SourceDownloadInput{
		ProjectID:    " project-1 ",
		SourceLocale: " en ",
		FileFormat:   " json ",
		AllPlatforms: true,
	})
	if err != nil {
		t.Fatalf("download source file: %v", err)
	}
	if !exportCalled || !bundleCalled {
		t.Fatalf("expected export and bundle requests, export=%t bundle=%t", exportCalled, bundleCalled)
	}
	if string(result.Content) != "zip-bytes" {
		t.Fatalf("unexpected content: %q", string(result.Content))
	}
	if result.ProjectID != "project-1" || result.SourceLocale != "en" || result.Format != "json" {
		t.Fatalf("unexpected result metadata: %+v", result)
	}
	if result.BundleURL != server.URL+"/bundle/source.zip" {
		t.Fatalf("unexpected bundle URL: %q", result.BundleURL)
	}
}

func TestDownloadSourceFileDefaultsToSinglePlatform(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api2/projects/project-1/files/download":
			w.Header().Set("Content-Type", "application/json")
			var body struct {
				AllPlatforms bool `json:"all_platforms"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode request body: %v", err)
			}
			if body.AllPlatforms {
				t.Fatalf("all_platforms = true, want false by default")
			}
			_, _ = fmt.Fprintf(w, `{"project_id":"project-1","bundle_url":%q}`, server.URL+"/bundle/source.zip")
		case "/bundle/source.zip":
			_, _ = w.Write([]byte("zip-bytes"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{APIToken: "secret", APIBaseURL: server.URL + "/api2/", TimeoutSeconds: 1})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}

	_, err = client.DownloadSourceFile(t.Context(), SourceDownloadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FileFormat:   "json",
	})
	if err != nil {
		t.Fatalf("download source file: %v", err)
	}
}

func TestDownloadSourceFileValidatesRequiredFields(t *testing.T) {
	tests := []struct {
		name string
		cfg  Config
		in   SourceDownloadInput
		want string
	}{
		{name: "project", cfg: Config{APIToken: "secret", TimeoutSeconds: 1}, in: SourceDownloadInput{SourceLocale: "en", FileFormat: "json"}, want: "project id is required"},
		{name: "token", cfg: Config{TimeoutSeconds: 1}, in: SourceDownloadInput{ProjectID: "project-1", SourceLocale: "en", FileFormat: "json"}, want: "api token is required"},
		{name: "locale", cfg: Config{APIToken: "secret", TimeoutSeconds: 1}, in: SourceDownloadInput{ProjectID: "project-1", FileFormat: "json"}, want: "source locale is required"},
		{name: "format", cfg: Config{APIToken: "secret", TimeoutSeconds: 1}, in: SourceDownloadInput{ProjectID: "project-1", SourceLocale: "en"}, want: "file format is required"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewHTTPClient(tt.cfg)
			if err != nil {
				t.Fatalf("new http client: %v", err)
			}
			_, err = client.DownloadSourceFile(t.Context(), tt.in)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected %q error, got %v", tt.want, err)
			}
		})
	}
}

func TestDownloadSourceFileAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{APIToken: "secret", APIBaseURL: server.URL + "/api2/", TimeoutSeconds: 1})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}

	_, err = client.DownloadSourceFile(t.Context(), SourceDownloadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FileFormat:   "json",
	})
	if err == nil || !strings.Contains(err.Error(), "request export bundle") {
		t.Fatalf("expected API error, got %v", err)
	}
}

func TestDownloadSourceFileEmptyBundleURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"project_id":"project-1","bundle_url":""}`))
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{APIToken: "secret", APIBaseURL: server.URL + "/api2/", TimeoutSeconds: 1})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}

	_, err = client.DownloadSourceFile(t.Context(), SourceDownloadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FileFormat:   "json",
	})
	if err == nil || !strings.Contains(err.Error(), "empty bundle URL") {
		t.Fatalf("expected empty bundle URL error, got %v", err)
	}
}

func TestDownloadSourceFileBundleError(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api2/projects/project-1/files/download":
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintf(w, `{"project_id":"project-1","bundle_url":%q}`, server.URL+"/bundle/source.zip?X-Amz-Signature=secret-signature")
		case "/bundle/source.zip":
			http.Error(w, "missing bundle", http.StatusNotFound)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{APIToken: "secret", APIBaseURL: server.URL + "/api2/", TimeoutSeconds: 1})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}

	_, err = client.DownloadSourceFile(t.Context(), SourceDownloadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FileFormat:   "json",
	})
	if err == nil || !strings.Contains(err.Error(), "status 404") {
		t.Fatalf("expected bundle status error, got %v", err)
	}
	if strings.Contains(err.Error(), "X-Amz-Signature") || strings.Contains(err.Error(), "secret-signature") || strings.Contains(err.Error(), server.URL) {
		t.Fatalf("bundle error leaked signed URL: %v", err)
	}
}

func TestDownloadBundleRequestErrorRedactsBundleURL(t *testing.T) {
	client := &HTTPClient{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
				return nil, errors.New("connection failed")
			}),
		},
	}

	_, err := client.downloadBundle(t.Context(), "https://example.invalid/source.zip?X-Goog-Signature=secret-signature")
	if err == nil {
		t.Fatalf("expected request error")
	}
	if !strings.Contains(err.Error(), "GET bundle URL") {
		t.Fatalf("expected generic bundle URL label, got %v", err)
	}
	if strings.Contains(err.Error(), "example.invalid") || strings.Contains(err.Error(), "X-Goog-Signature") || strings.Contains(err.Error(), "secret-signature") {
		t.Fatalf("request error leaked signed URL: %v", err)
	}
}

func TestDownloadSourceFileLargeBundleErrorUsesSmallLimit(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api2/projects/project-1/files/download":
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintf(w, `{"project_id":"project-1","bundle_url":%q}`, server.URL+"/bundle/source.zip")
		case "/bundle/source.zip":
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(strings.Repeat("x", int(maxSourceDownloadErrorBodyBytes)+1)))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{APIToken: "secret", APIBaseURL: server.URL + "/api2/", TimeoutSeconds: 1})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}

	_, err = client.DownloadSourceFile(t.Context(), SourceDownloadInput{
		ProjectID:    "project-1",
		SourceLocale: "en",
		FileFormat:   "json",
	})
	if err == nil ||
		!strings.Contains(err.Error(), "status 403") ||
		!strings.Contains(err.Error(), fmt.Sprintf("exceeds %d byte limit", maxSourceDownloadErrorBodyBytes)) {
		t.Fatalf("expected small error body limit, got %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestReadLimitedBundleBodyRejectsOversizedResponse(t *testing.T) {
	content, err := readLimitedBundleBody(strings.NewReader("abcdef"), 5)
	if err == nil || !strings.Contains(err.Error(), "exceeds 5 byte limit") {
		t.Fatalf("expected size limit error, got content=%q err=%v", string(content), err)
	}

	content, err = readLimitedBundleBody(strings.NewReader("abcde"), 5)
	if err != nil {
		t.Fatalf("read limited body at limit: %v", err)
	}
	if string(content) != "abcde" {
		t.Fatalf("content = %q, want abcde", string(content))
	}
}
