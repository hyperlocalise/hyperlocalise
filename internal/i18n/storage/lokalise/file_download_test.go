package lokalise

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestDownloadTranslationFilesExtractsRequestedLocales(t *testing.T) {
	client, mux, baseURL, teardown := newLokaliseTranslationDownloadClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api2/projects/project-1/files/download", func(w http.ResponseWriter, r *http.Request) {
		assertLokaliseDownloadRequest(t, r)
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if got, want := body["format"], "json"; got != want {
			t.Fatalf("format = %#v, want %#v", got, want)
		}
		if got, want := body["original_filenames"], false; got != want {
			t.Fatalf("original_filenames = %#v, want %#v", got, want)
		}
		if got, want := body["bundle_structure"], "%LANG_ISO%.%FORMAT%"; got != want {
			t.Fatalf("bundle_structure = %#v, want %#v", got, want)
		}
		gotLangs := stringSliceFromJSON(t, body["filter_langs"])
		if want := []string{"fr", "de"}; !reflect.DeepEqual(gotLangs, want) {
			t.Fatalf("filter_langs = %#v, want %#v", gotLangs, want)
		}
		writeLokaliseJSON(t, w, map[string]any{
			"project_id": "project-1",
			"bundle_url": baseURL + "/bundle.zip",
		})
	})
	mux.HandleFunc("/bundle.zip", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/zip")
		_, _ = w.Write(lokaliseZipFixture(t, map[string]string{
			"fr.json": `{"hello":"Bonjour"}`,
			"de.json": `{"hello":"Hallo"}`,
		}))
	})

	result, err := client.DownloadTranslationFiles(context.Background(), TranslationFileDownloadRequest{
		ProjectID:       "project-1",
		TargetLanguages: []string{"fr", "de"},
		Format:          "json",
	})
	if err != nil {
		t.Fatalf("download translations: %v", err)
	}
	if result.BundleURL != baseURL+"/bundle.zip" {
		t.Fatalf("bundle URL = %q", result.BundleURL)
	}
	if len(result.Files) != 2 {
		t.Fatalf("files = %#v, want 2", result.Files)
	}
	if got, want := result.Files[0].Locale, "fr"; got != want {
		t.Fatalf("first locale = %q, want %q", got, want)
	}
	if got, want := string(result.Files[0].Content), `{"hello":"Bonjour"}`; got != want {
		t.Fatalf("first content = %q, want %q", got, want)
	}
	if got, want := result.Files[1].Locale, "de"; got != want {
		t.Fatalf("second locale = %q, want %q", got, want)
	}
}

func TestDownloadTranslationFilesUsesCustomBundleStructure(t *testing.T) {
	client, mux, baseURL, teardown := newLokaliseTranslationDownloadClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api2/projects/project-1/files/download", func(w http.ResponseWriter, r *http.Request) {
		assertLokaliseDownloadRequest(t, r)
		writeLokaliseJSON(t, w, map[string]any{
			"project_id": "project-1",
			"bundle_url": baseURL + "/bundle.zip",
		})
	})
	mux.HandleFunc("/bundle.zip", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(lokaliseZipFixture(t, map[string]string{
			"locales/fr/messages.yaml": "hello: Bonjour\n",
		}))
	})

	result, err := client.DownloadTranslationFiles(context.Background(), TranslationFileDownloadRequest{
		ProjectID:       "project-1",
		TargetLanguages: []string{"fr"},
		Format:          ".yml",
		BundleStructure: "locales/%LANG_ISO%/messages.%FORMAT%",
	})
	if err != nil {
		t.Fatalf("download translations: %v", err)
	}
	if got, want := result.Files[0].Name, "locales/fr/messages.yaml"; got != want {
		t.Fatalf("bundle path = %q, want %q", got, want)
	}
}

func TestDownloadTranslationFilesReturnsAPIError(t *testing.T) {
	client, mux, _, teardown := newLokaliseTranslationDownloadClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api2/projects/project-1/files/download", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"message":"unauthorized"}}`, http.StatusUnauthorized)
	})

	_, err := client.DownloadTranslationFiles(context.Background(), TranslationFileDownloadRequest{
		ProjectID:       "project-1",
		TargetLanguages: []string{"fr"},
		Format:          "json",
	})
	if err == nil || !strings.Contains(err.Error(), "request lokalise translation download") {
		t.Fatalf("error = %v, want wrapped download request error", err)
	}
}

func TestDownloadTranslationFilesErrorsWhenLocaleMissingFromBundle(t *testing.T) {
	client, mux, baseURL, teardown := newLokaliseTranslationDownloadClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api2/projects/project-1/files/download", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"project_id": "project-1",
			"bundle_url": baseURL + "/bundle.zip",
		})
	})
	mux.HandleFunc("/bundle.zip", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(lokaliseZipFixture(t, map[string]string{
			"de.json": `{"hello":"Hallo"}`,
		}))
	})

	_, err := client.DownloadTranslationFiles(context.Background(), TranslationFileDownloadRequest{
		ProjectID:       "project-1",
		TargetLanguages: []string{"fr"},
		Format:          "json",
	})
	if err == nil || !strings.Contains(err.Error(), `did not include locale "fr"`) {
		t.Fatalf("error = %v, want missing locale error", err)
	}
}

func TestDownloadTranslationFilesErrorsWhenBundleTooLarge(t *testing.T) {
	client, mux, baseURL, teardown := newLokaliseTranslationDownloadClientForTest(t)
	defer teardown()

	oldLimit := maxTranslationBundleBytes
	maxTranslationBundleBytes = 4
	defer func() {
		maxTranslationBundleBytes = oldLimit
	}()

	mux.HandleFunc("/api2/projects/project-1/files/download", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"project_id": "project-1",
			"bundle_url": baseURL + "/bundle.zip",
		})
	})
	mux.HandleFunc("/bundle.zip", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("12345"))
	})

	_, err := client.DownloadTranslationFiles(context.Background(), TranslationFileDownloadRequest{
		ProjectID:       "project-1",
		TargetLanguages: []string{"fr"},
		Format:          "json",
	})
	if err == nil || !strings.Contains(err.Error(), "bundle too large") {
		t.Fatalf("error = %v, want bundle too large", err)
	}
}

func TestExtractTranslationBundleErrorsWhenEntryTooLarge(t *testing.T) {
	oldLimit := maxTranslationBundleBytes
	maxTranslationBundleBytes = 4
	defer func() {
		maxTranslationBundleBytes = oldLimit
	}()

	payload := lokaliseZipFixture(t, map[string]string{
		"fr.json": "12345",
	})

	_, err := extractLokaliseTranslationBundle(payload, []string{"fr"}, "json", defaultTranslationBundleStructure)
	if err == nil || !strings.Contains(err.Error(), "file too large") {
		t.Fatalf("error = %v, want file too large", err)
	}
}

func newLokaliseTranslationDownloadClientForTest(t *testing.T) (*HTTPClient, *http.ServeMux, string, func()) {
	t.Helper()
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	client, err := NewHTTPClient(Config{
		APIToken:       "token",
		APIBaseURL:     server.URL + "/api2",
		TimeoutSeconds: 1,
	})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}
	return client, mux, server.URL, server.Close
}

func assertLokaliseDownloadRequest(t *testing.T, r *http.Request) {
	t.Helper()
	if r.Method != http.MethodPost {
		t.Fatalf("method = %s, want POST", r.Method)
	}
	if token := r.Header.Get("X-Api-Token"); token != "token" {
		t.Fatalf("X-Api-Token = %q, want token", token)
	}
}

func stringSliceFromJSON(t *testing.T, value any) []string {
	t.Helper()
	raw, ok := value.([]any)
	if !ok {
		t.Fatalf("value = %#v, want JSON array", value)
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		itemString, ok := item.(string)
		if !ok {
			t.Fatalf("array item = %#v, want string", item)
		}
		out = append(out, itemString)
	}
	return out
}

func lokaliseZipFixture(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zipWriter := zip.NewWriter(&buf)
	for name, content := range files {
		file, err := zipWriter.Create(name)
		if err != nil {
			t.Fatalf("create zip file %q: %v", name, err)
		}
		if _, err := fmt.Fprint(file, content); err != nil {
			t.Fatalf("write zip file %q: %v", name, err)
		}
	}
	if err := zipWriter.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return buf.Bytes()
}
