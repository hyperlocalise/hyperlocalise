package smartling

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestNewHTTPClientUsesDefaultTimeout(t *testing.T) {
	for _, secs := range []int{0, -1} {
		t.Run(fmt.Sprintf("timeoutSeconds_%d", secs), func(t *testing.T) {
			c, err := NewHTTPClient(Config{
				TimeoutSeconds: secs,
				UserIdentifier: "id",
				UserSecret:     "secret",
			})
			if err != nil {
				t.Fatalf("NewHTTPClient: %v", err)
			}
			if got := c.http.Timeout; got != 30*time.Second {
				t.Fatalf("default timeout: got %v want %v", got, 30*time.Second)
			}
		})
	}
}

func TestHTTPClientDoHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "upstream failure", http.StatusBadGateway)
	}))
	defer srv.Close()

	client := &HTTPClient{
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
	}
	var out struct{}
	err := client.getJSON(context.Background(), srv.URL+"/projects/x/translations", "token", &out)
	if err == nil {
		t.Fatal("expected non-2xx error, got nil")
	}
	if !strings.Contains(err.Error(), "status 502") {
		t.Fatalf("expected status in error, got: %v", err)
	}
	if !strings.Contains(err.Error(), "upstream failure") {
		t.Fatalf("expected response body in error, got: %v", err)
	}
}

func TestHTTPClientDoDecodeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `not-json`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
	}
	var out struct{}
	err := client.getJSON(context.Background(), srv.URL+"/ok", "token", &out)
	if err == nil {
		t.Fatal("expected decode error, got nil")
	}
	if !strings.Contains(err.Error(), "decode response") {
		t.Fatalf("expected decode error, got: %v", err)
	}
}

func TestHTTPClientAuthenticate(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/authenticate" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
	}))
	defer srv.Close()

	client := &HTTPClient{authBaseURL: srv.URL, http: srv.Client(), userIdentifier: "id", userSecret: "secret"}
	token, err := client.authenticate(context.Background())
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if token != "token" {
		t.Fatalf("unexpected token: %q", token)
	}
}

func TestHTTPClientListTranslationsUsesProjectTranslationsEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/translations":
			assertTranslationsQuery(t, r.URL.Query(), "fr", 500, 0)
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"items":[{"parsedStringText":"welcome.title","stringText":"welcome.title","translation":"  Bienvenue  ","instruction":"home","targetLocaleId":"fr"}]}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	items, _, err := client.ListTranslations(context.Background(), ListTranslationsInput{
		ProjectID: "123",
		Locales:   []string{"fr"},
	})
	if err != nil {
		t.Fatalf("list translations: %v", err)
	}
	if got := len(items); got != 1 {
		t.Fatalf("expected 1 item, got %d", got)
	}
	if items[0].Key != "welcome.title" || items[0].Locale != "fr" || items[0].Value != "  Bienvenue  " || items[0].Context != "home" {
		t.Fatalf("unexpected mapping: %+v", items[0])
	}
}

func TestHTTPClientListTranslationsPaginates(t *testing.T) {
	requestedOffsets := make([]int, 0, 2)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/translations":
			offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
			if err != nil {
				t.Fatalf("offset query: %v", err)
			}
			requestedOffsets = append(requestedOffsets, offset)
			if offset == 0 {
				assertTranslationsQuery(t, r.URL.Query(), "fr", 500, 0)
				writeTranslationsItemsResponse(w, 500, 0, "fr")
				return
			}
			if offset == 500 {
				assertTranslationsQuery(t, r.URL.Query(), "fr", 500, 500)
				writeTranslationsItemsResponse(w, 1, 500, "fr")
				return
			}
			t.Fatalf("unexpected offset: %d", offset)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	items, _, err := client.ListTranslations(context.Background(), ListTranslationsInput{
		ProjectID: "123",
		Locales:   []string{"fr"},
	})
	if err != nil {
		t.Fatalf("list translations: %v", err)
	}
	if got := len(items); got != 501 {
		t.Fatalf("expected 501 items, got %d", got)
	}
	if got := len(requestedOffsets); got != 2 {
		t.Fatalf("expected 2 paged requests, got %d (%v)", got, requestedOffsets)
	}
}

func TestHTTPClientListTranslationsAttemptsAllLocalesAndJoinsErrors(t *testing.T) {
	requestedLocales := make([]string, 0, 2)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token","expiresIn":3600}}`)
		case "/projects/123/translations":
			locale := r.URL.Query().Get("targetLocaleId")
			requestedLocales = append(requestedLocales, locale)
			if locale == "fr" {
				http.Error(w, "fr unavailable", http.StatusInternalServerError)
				return
			}
			if locale == "de" {
				_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"items":[{"stringText":"k1","translation":"hallo","targetLocaleId":"de"}]}}`)
				return
			}
			t.Fatalf("unexpected locale: %s", locale)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	items, _, err := client.ListTranslations(context.Background(), ListTranslationsInput{
		ProjectID: "123",
		Locales:   []string{"fr", "de"},
	})
	if err == nil {
		t.Fatal("expected aggregated locale error, got nil")
	}
	if !strings.Contains(err.Error(), "list translations fr") {
		t.Fatalf("expected fr locale error, got %v", err)
	}
	if got := len(requestedLocales); got != 2 {
		t.Fatalf("expected both locales to be attempted, got %d (%v)", got, requestedLocales)
	}
	if got := len(items); got != 1 {
		t.Fatalf("expected successful locale entries to be returned, got %d", got)
	}
	if items[0].Locale != "de" || items[0].Value != "hallo" {
		t.Fatalf("unexpected successful locale item: %+v", items[0])
	}
}

func TestHTTPClientListTranslationsReusesAuthTokenBeforeExpiry(t *testing.T) {
	authenticateCalls := 0
	translationsCalls := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			authenticateCalls++
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token","expiresIn":3600}}`)
		case "/projects/123/translations":
			translationsCalls++
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"items":[{"stringText":"k1","translation":"bonjour","targetLocaleId":"fr"}]}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}

	_, _, err := client.ListTranslations(context.Background(), ListTranslationsInput{
		ProjectID: "123",
		Locales:   []string{"fr"},
	})
	if err != nil {
		t.Fatalf("first list translations: %v", err)
	}
	_, _, err = client.ListTranslations(context.Background(), ListTranslationsInput{
		ProjectID: "123",
		Locales:   []string{"fr"},
	})
	if err != nil {
		t.Fatalf("second list translations: %v", err)
	}

	if authenticateCalls != 1 {
		t.Fatalf("expected one authenticate call with cached token, got %d", authenticateCalls)
	}
	if translationsCalls != 2 {
		t.Fatalf("expected two translation calls, got %d", translationsCalls)
	}
}

func TestHTTPClientUpsertLocaleTranslationsAllowsNoContent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/123/locales/fr/translations" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPut {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	client := &HTTPClient{
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
	}
	err := client.upsertLocaleTranslations(context.Background(), "token", "123", "fr", []StringTranslation{
		{Key: "welcome.title", Locale: "fr", Value: "Bienvenue"},
	})
	if err != nil {
		t.Fatalf("upsert locale translations: %v", err)
	}
}

func TestHTTPClientUpsertTranslationsPreservesWhitespace(t *testing.T) {
	var putBody struct {
		Items []StringTranslation `json:"items"`
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/locales/fr/translations":
			if r.Method != http.MethodPut {
				t.Fatalf("unexpected method: %s", r.Method)
			}
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			if err := json.Unmarshal(body, &putBody); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		stringsBaseURL: srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	value := "  Bonjour  "
	_, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "123",
		Entries: []StringTranslation{
			{Key: "welcome.title", Locale: "fr", Value: value},
		},
	})
	if err != nil {
		t.Fatalf("upsert translations: %v", err)
	}
	if got := len(putBody.Items); got != 1 {
		t.Fatalf("expected 1 item in PUT payload, got %d", got)
	}
	if got := putBody.Items[0].Value; got != value {
		t.Fatalf("unexpected payload value: got %q want %q", got, value)
	}
}

func TestHTTPClientUploadSourceFile(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/file":
			if r.Method != http.MethodPost {
				t.Fatalf("unexpected method: %s", r.Method)
			}
			if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
				t.Fatalf("unexpected content type: %s", r.Header.Get("Content-Type"))
			}

			err := r.ParseMultipartForm(10 << 20)
			if err != nil {
				t.Fatalf("parse multipart form: %v", err)
			}

			if got := r.FormValue("fileUri"); got != "test.json" {
				t.Fatalf("unexpected fileUri: %q", got)
			}
			if got := r.FormValue("fileType"); got != "json" {
				t.Fatalf("unexpected fileType: %q", got)
			}
			if got := r.FormValue("authorize"); got != "true" {
				t.Fatalf("unexpected authorize: %q", got)
			}

			file, header, err := r.FormFile("file")
			if err != nil {
				t.Fatalf("get file part: %v", err)
			}
			defer func() { _ = file.Close() }()

			if !strings.HasPrefix(header.Filename, "test-") {
				t.Errorf("unexpected filename: %q", header.Filename)
				return
			}

			content, _ := io.ReadAll(file)
			if string(content) != `{"k":"v"}` {
				t.Fatalf("unexpected content: %q", string(content))
			}

			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"overWritten":true,"stringCount":10,"wordCount":50}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		filesBaseURL:   srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}

	tempFile, err := os.CreateTemp("", "test-*.json")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer func() { _ = os.Remove(tempFile.Name()) }()
	_, _ = tempFile.WriteString(`{"k":"v"}`)
	_ = tempFile.Close()

	result, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID: "123",
		FileURI:   "test.json",
		FilePath:  tempFile.Name(),
		FileType:  "json",
		Authorize: true,
	})
	if err != nil {
		t.Fatalf("upload source file: %v", err)
	}

	if !result.OverWritten || result.StringCount != 10 || result.WordCount != 50 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestHTTPClientExportFileDownloadsPerLocale(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/locales/fr/file":
			if r.URL.Query().Get("fileUri") != "translations.json" {
				t.Fatalf("unexpected fileUri: %s", r.URL.Query().Get("fileUri"))
			}
			_, _ = fmt.Fprint(w, `{"hello":"Bonjour"}`)
		case "/projects/123/locales/de/file":
			if r.URL.Query().Get("fileUri") != "translations.json" {
				t.Fatalf("unexpected fileUri: %s", r.URL.Query().Get("fileUri"))
			}
			_, _ = fmt.Fprint(w, `{"hello":"Hallo"}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		filesBaseURL:   srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	entries, _, err := client.ExportFile(context.Background(), ExportFileInput{
		ProjectID: "123",
		FileURI:   "translations.json",
		FileType:  "json",
		Locales:   []string{"fr", "de"},
	})
	if err != nil {
		t.Fatalf("export file: %v", err)
	}
	if got := len(entries); got != 2 {
		t.Fatalf("expected 2 entries, got %d", got)
	}
}

func TestHTTPClientExportFileReturnsPartialOnLocaleError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/locales/fr/file":
			http.Error(w, "not found", http.StatusNotFound)
		case "/projects/123/locales/de/file":
			_, _ = fmt.Fprint(w, `{"hello":"Hallo"}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		filesBaseURL:   srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	entries, _, err := client.ExportFile(context.Background(), ExportFileInput{
		ProjectID: "123",
		FileURI:   "translations.json",
		FileType:  "json",
		Locales:   []string{"fr", "de"},
	})
	if err == nil {
		t.Fatal("expected error for failed locale")
	}
	if got := len(entries); got != 1 {
		t.Fatalf("expected 1 entry from successful locale, got %d", got)
	}
}

func TestHTTPClientImportFileUploadsMultipart(t *testing.T) {
	var receivedFileURI, receivedFileType string
	var receivedBody []byte

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/projects/123/file":
			if r.Method != http.MethodPost {
				t.Fatalf("unexpected method: %s", r.Method)
			}
			file, header, err := r.FormFile("file")
			if err != nil {
				t.Fatalf("form file: %v", err)
			}
			defer func() { _ = file.Close() }()
			receivedBody, _ = io.ReadAll(file)
			receivedFileURI = r.FormValue("fileUri")
			receivedFileType = r.FormValue("fileType")
			if header.Filename != "translations.json" {
				t.Fatalf("unexpected filename: %s", header.Filename)
			}
			w.WriteHeader(http.StatusOK)
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"wordCount":1,"stringCount":1}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL:    srv.URL,
		filesBaseURL:   srv.URL,
		http:           srv.Client(),
		userIdentifier: "id",
		userSecret:     "secret",
	}
	_, err := client.ImportFile(context.Background(), ImportFileInput{
		ProjectID: "123",
		FileURI:   "translations.json",
		FileType:  "json",
		Entries:   []storage.Entry{{Key: "hello", Locale: "fr", Value: "bonjour"}},
	})
	if err != nil {
		t.Fatalf("import file: %v", err)
	}
	if receivedFileURI != "translations.json" {
		t.Fatalf("unexpected fileUri: %q", receivedFileURI)
	}
	if receivedFileType != "json" {
		t.Fatalf("unexpected fileType: %q", receivedFileType)
	}
	var parsed map[string]map[string]string
	if err := json.Unmarshal(receivedBody, &parsed); err != nil {
		t.Fatalf("decode uploaded body: %v", err)
	}
	if parsed["fr"]["hello"] != "bonjour" {
		t.Fatalf("unexpected uploaded content: %s", string(receivedBody))
	}
}

func assertTranslationsQuery(t *testing.T, values url.Values, locale string, limit int, offset int) {
	t.Helper()
	if got := values.Get("targetLocaleId"); got != locale {
		t.Fatalf("unexpected targetLocaleId: got %q want %q", got, locale)
	}
	if got := values.Get("limit"); got != strconv.Itoa(limit) {
		t.Fatalf("unexpected limit: got %q want %d", got, limit)
	}
	if got := values.Get("offset"); got != strconv.Itoa(offset) {
		t.Fatalf("unexpected offset: got %q want %d", got, offset)
	}
}

func writeTranslationsItemsResponse(w http.ResponseWriter, count int, start int, locale string) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"items":[`)
	for i := 0; i < count; i++ {
		if i > 0 {
			_, _ = fmt.Fprint(w, ",")
		}
		idx := start + i
		_, _ = fmt.Fprintf(
			w,
			`{"stringText":"k%d","translation":"v%d","targetLocaleId":"%s"}`,
			idx,
			idx,
			locale,
		)
	}
	_, _ = fmt.Fprint(w, `]}}`)
}

func TestDecodeFileContentNestedMap(t *testing.T) {
	content := []byte(`{"fr":{"hello":"bonjour","goodbye":"au revoir"},"de":{"hello":"Hallo"}}`)
	entries, err := decodeFileContent(content, "fr", "json")
	if err != nil {
		t.Fatalf("decode nested map: %v", err)
	}
	if got := len(entries); got != 2 {
		t.Fatalf("expected 2 entries, got %d", got)
	}
	m := make(map[string]string, len(entries))
	for _, e := range entries {
		m[e.Key] = e.Value
	}
	if m["hello"] != "bonjour" || m["goodbye"] != "au revoir" {
		t.Fatalf("unexpected decoded values: %v", m)
	}
}

func TestDecodeFileContentUnsupportedFileType(t *testing.T) {
	_, err := decodeFileContent([]byte("<xml></xml>"), "fr", "xliff")
	if err == nil {
		t.Fatal("expected error for unsupported file type")
	}
	if !strings.Contains(err.Error(), "unsupported file type") {
		t.Fatalf("expected unsupported file type error, got: %v", err)
	}
}
