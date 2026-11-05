package cmd

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type fakeSmartlingAPI struct {
	mu       sync.Mutex
	requests map[string][]byte
	forms    map[string]map[string]string
	mux      *http.ServeMux
}

func newFakeSmartlingAPI(t *testing.T) *fakeSmartlingAPI {
	t.Helper()
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	api := &fakeSmartlingAPI{
		requests: map[string][]byte{},
		forms:    map[string]map[string]string{},
		mux:      http.NewServeMux(),
	}
	api.mux.HandleFunc("POST /auth-api/v2/authenticate", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS"},
			"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
		})
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth-api/v2/authenticate" && r.Header.Get("Authorization") != "Bearer test-token" {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		api.record(t, r)
		api.mux.ServeHTTP(w, r)
	}))
	t.Cleanup(server.Close)
	redirectDefaultTransport(t, server)
	return api
}

func (a *fakeSmartlingAPI) record(t *testing.T, r *http.Request) {
	t.Helper()
	key := r.Method + " " + r.URL.Path
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart form: %v", err)
			return
		}
		fields := map[string]string{}
		for name, values := range r.MultipartForm.Value {
			fields[name] = values[0]
		}
		for name := range r.MultipartForm.File {
			fields["file:"+name] = r.MultipartForm.File[name][0].Filename
		}
		a.mu.Lock()
		a.forms[key] = fields
		a.mu.Unlock()
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		t.Errorf("read request body: %v", err)
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	a.mu.Lock()
	a.requests[key] = body
	a.mu.Unlock()
}

func (a *fakeSmartlingAPI) handle(pattern string, handler http.HandlerFunc) {
	a.mux.HandleFunc(pattern, handler)
}

func (a *fakeSmartlingAPI) jsonBody(t *testing.T, key string) map[string]any {
	t.Helper()
	a.mu.Lock()
	raw, ok := a.requests[key]
	a.mu.Unlock()
	if !ok {
		t.Fatalf("no request recorded for %s", key)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode %s body %q: %v", key, raw, err)
	}
	return out
}

func (a *fakeSmartlingAPI) form(t *testing.T, key string) map[string]string {
	t.Helper()
	a.mu.Lock()
	defer a.mu.Unlock()
	fields, ok := a.forms[key]
	if !ok {
		t.Fatalf("no multipart request recorded for %s", key)
	}
	return fields
}

func writeSmartlingJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func smartlingSuccess(data any) map[string]any {
	return map[string]any{"response": map[string]any{"code": "SUCCESS", "data": data}}
}

func executeSmartlingCLI(t *testing.T, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs(append([]string{"smartling"}, args...))
	err := root.Execute()
	return out.String(), err
}

func TestSmartlingGlossaryListTextAndJSON(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /glossary-api/v3/accounts/acc-1/glossaries/search", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{
			"totalCount": 1,
			"items": []map[string]any{
				{"glossaryUid": "g-1", "name": "Brand terms", "localeIds": []string{"en-US", "fr-FR"}},
			},
		}))
	})

	out, err := executeSmartlingCLI(t, "glossary", "list", "--account-uid", " acc-1 ", "--name", " Brand ")
	if err != nil {
		t.Fatalf("glossary list: %v", err)
	}
	if out != "glossary_uid=g-1 name=Brand terms locales=en-US,fr-FR\n" {
		t.Fatalf("text output = %q", out)
	}
	if got := api.jsonBody(t, "POST /glossary-api/v3/accounts/acc-1/glossaries/search")["query"]; got != "Brand" {
		t.Fatalf("search query = %v", got)
	}

	out, err = executeSmartlingCLI(t, "glossary", "list", "--account-uid", "acc-1", "--output", "json")
	if err != nil {
		t.Fatalf("glossary list json: %v", err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatalf("decode json output %q: %v", out, err)
	}
	if len(decoded) != 1 || decoded[0]["glossaryUid"] != "g-1" {
		t.Fatalf("json output = %s", out)
	}
}

func TestSmartlingGlossaryListEmptyJSONIsArray(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /glossary-api/v3/accounts/acc-1/glossaries/search", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{"totalCount": 0, "items": []any{}}))
	})

	out, err := executeSmartlingCLI(t, "glossary", "list", "--account-uid", "acc-1", "--output", "json")
	if err != nil {
		t.Fatalf("glossary list: %v", err)
	}
	if strings.TrimSpace(out) != "[]" {
		t.Fatalf("expected empty JSON array, got %q", out)
	}
}

func TestSmartlingGlossaryListWrapsAPIErrorOnce(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /glossary-api/v3/accounts/acc-1/glossaries/search", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})

	_, err := executeSmartlingCLI(t, "glossary", "list", "--account-uid", "acc-1")
	if err == nil || !strings.Contains(err.Error(), "status 500") {
		t.Fatalf("expected API error, got %v", err)
	}
	if strings.Count(err.Error(), "smartling glossary list:") != 1 {
		t.Fatalf("expected single action prefix, got %v", err)
	}
}

func TestSmartlingGlossaryCreateTextAndJSON(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /glossary-api/v3/accounts/acc-1/glossaries", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{
			"glossaryUid":  "g-new",
			"accountUid":   "acc-1",
			"glossaryName": "Brand terms",
		}))
	})

	out, err := executeSmartlingCLI(t, "glossary", "create", "--account-uid", "acc-1", "--name", " Brand terms ", "--description", " Product names ", "-l", "en-US", "-l", "fr-FR")
	if err != nil {
		t.Fatalf("glossary create: %v", err)
	}
	if out != "glossary_uid=g-new name=Brand terms account_uid=acc-1\n" {
		t.Fatalf("text output = %q", out)
	}
	body := api.jsonBody(t, "POST /glossary-api/v3/accounts/acc-1/glossaries")
	if body["glossaryName"] != "Brand terms" || body["description"] != "Product names" {
		t.Fatalf("create body = %v", body)
	}
	if locales, _ := body["localeIds"].([]any); len(locales) != 2 {
		t.Fatalf("create locales = %v", body["localeIds"])
	}

	out, err = executeSmartlingCLI(t, "glossary", "create", "--account-uid", "acc-1", "--name", "Brand terms", "-l", "en-US", "--output", "json")
	if err != nil {
		t.Fatalf("glossary create json: %v", err)
	}
	if !strings.Contains(out, `"glossaryUid": "g-new"`) {
		t.Fatalf("json output = %s", out)
	}
}

func TestSmartlingGlossaryCreateReportsMissingUID(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /glossary-api/v3/accounts/acc-1/glossaries", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{"name": "Brand terms"}))
	})

	_, err := executeSmartlingCLI(t, "glossary", "create", "--account-uid", "acc-1", "--name", "Brand terms", "-l", "en-US")
	if err == nil || !strings.Contains(err.Error(), "missing glossary uid") {
		t.Fatalf("expected missing uid error, got %v", err)
	}
}

func TestSmartlingGlossaryImportUploadsConfirmsAndPolls(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	base := "/glossary-api/v3/accounts/acc-1/glossaries/g-1/import"
	api.handle("POST "+base, func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{
			"glossaryImport": map[string]any{"glossaryUid": "g-1", "importUid": "imp-1", "importStatus": "PENDING"},
		}))
	})
	confirmed := false
	api.handle("POST "+base+"/imp-1/confirm", func(w http.ResponseWriter, _ *http.Request) {
		confirmed = true
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{}))
	})
	api.handle("GET "+base+"/imp-1", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{"glossaryUid": "g-1", "importUid": "imp-1", "importStatus": "SUCCESSFUL"}))
	})

	path := filepath.Join(t.TempDir(), "terms.csv")
	if err := os.WriteFile(path, []byte("term\nAcme\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := executeSmartlingCLI(t, "glossary", "import", "--account-uid", "acc-1", "--glossary-uid", "g-1", "--file", path, "--archive-mode")
	if err != nil {
		t.Fatalf("glossary import: %v", err)
	}
	if out != "import_uid=imp-1 status=SUCCESSFUL\n" {
		t.Fatalf("output = %q", out)
	}
	if !confirmed {
		t.Fatal("expected import to be confirmed")
	}
	form := api.form(t, "POST "+base)
	if form["archiveMode"] != "true" || form["importFileMediaType"] != "text/csv" || form["file:importFile"] != "terms.csv" {
		t.Fatalf("import form = %v", form)
	}
}

func TestSmartlingGlossaryImportFailedStatus(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	base := "/glossary-api/v3/accounts/acc-1/glossaries/g-1/import"
	api.handle("POST "+base, func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{"glossaryImport": map[string]any{"importUid": "imp-1"}}))
	})
	api.handle("POST "+base+"/imp-1/confirm", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{}))
	})
	api.handle("GET "+base+"/imp-1", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{"importUid": "imp-1", "importStatus": "FAILED"}))
	})

	path := filepath.Join(t.TempDir(), "terms.tbx")
	if err := os.WriteFile(path, []byte("<martif/>"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := executeSmartlingCLI(t, "glossary", "import", "--account-uid", "acc-1", "--glossary-uid", "g-1", "--file", path)
	if err == nil || !strings.Contains(err.Error(), "import imp-1 failed") {
		t.Fatalf("expected failed import error, got %v", err)
	}
	if form := api.form(t, "POST "+base); form["archiveMode"] != "false" || form["importFileMediaType"] != "text/xml" {
		t.Fatalf("import form = %v", form)
	}
}

func TestSmartlingGlossaryDownloadOfficialWritesOutputFile(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /glossary-api/v3/accounts/acc-1/glossaries/g-1/entries/download", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/x-tbx")
		_, _ = w.Write([]byte("<martif>terms</martif>"))
	})

	dir := t.TempDir()
	outputPath := filepath.Join(dir, "glossary.tbx")
	out, err := executeSmartlingCLI(t, "glossary", "download", "--account-uid", "acc-1", "--glossary-uid", "g-1", "--format", "tbx", "--tbx-version", "v2", "-l", "fr-FR", "-o", outputPath)
	if err != nil {
		t.Fatalf("glossary download: %v", err)
	}
	if out != "wrote "+outputPath+" format=tbx bytes=22\n" {
		t.Fatalf("output = %q", out)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil || string(content) != "<martif>terms</martif>" {
		t.Fatalf("output file = %q err=%v", content, err)
	}
	body := api.jsonBody(t, "POST /glossary-api/v3/accounts/acc-1/glossaries/g-1/entries/download")
	if body["format"] != "TBX" || body["tbxVersion"] != "TBXcoreStructV02" {
		t.Fatalf("export body = %v", body)
	}
	assertNoGlossaryTempFiles(t, dir)
}

func TestSmartlingGlossaryDownloadCSVToStdoutAndFile(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("GET /glossary-api/v2/accounts/acc-1/glossaries/g-1/entries", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS"},
			"data": map[string]any{"items": []map[string]any{
				{
					"entryUid": "e-1",
					"term":     "Checkout",
					"translations": []map[string]any{
						{"localeId": "fr-FR", "term": "Paiement"},
						{"localeId": "de-DE", "term": "Kasse"},
					},
				},
			}},
		})
	})

	out, err := executeSmartlingCLI(t, "glossary", "download", "--account-uid", "acc-1", "--glossary-uid", "g-1", "-l", "fr-FR")
	if err != nil {
		t.Fatalf("glossary download: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 2 || !strings.HasPrefix(lines[0], "account_uid,glossary_uid,entry_uid,term") {
		t.Fatalf("csv output = %q", out)
	}
	if !strings.Contains(lines[1], "Checkout") || !strings.Contains(lines[1], "Paiement") || strings.Contains(out, "Kasse") {
		t.Fatalf("expected only fr-FR translation row, got %q", out)
	}

	dir := t.TempDir()
	outputPath := filepath.Join(dir, "glossary.csv")
	out, err = executeSmartlingCLI(t, "glossary", "download", "--account-uid", "acc-1", "--glossary-uid", "g-1", "-o", outputPath)
	if err != nil {
		t.Fatalf("glossary download to file: %v", err)
	}
	if out != "wrote "+outputPath+" entries=2\n" {
		t.Fatalf("output = %q", out)
	}
	assertNoGlossaryTempFiles(t, dir)
}

func TestSmartlingGlossaryDownloadFailureRemovesTempFile(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("GET /glossary-api/v2/accounts/acc-1/glossaries/g-1/entries", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusForbidden)
	})

	dir := t.TempDir()
	outputPath := filepath.Join(dir, "glossary.csv")
	_, err := executeSmartlingCLI(t, "glossary", "download", "--account-uid", "acc-1", "--glossary-uid", "g-1", "-o", outputPath)
	if err == nil || !strings.HasPrefix(err.Error(), "smartling glossary download: ") || !strings.Contains(err.Error(), "status 403") {
		t.Fatalf("expected wrapped API error, got %v", err)
	}
	entries, readErr := os.ReadDir(dir)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no leftover files, got %v", entries)
	}
}

func TestSmartlingGlossaryDownloadRejectsUnsupportedFormat(t *testing.T) {
	_, err := executeSmartlingCLI(t, "glossary", "download", "--account-uid", "acc-1", "--glossary-uid", "g-1", "--format", "pdf")
	if err == nil || !strings.Contains(err.Error(), `smartling glossary download: unsupported --format "pdf"`) {
		t.Fatalf("expected unsupported format error, got %v", err)
	}
}

func TestSmartlingAdminCommandsRequireCredentials(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "")
	t.Setenv("SMARTLING_USER_SECRET", "")

	tmxPath := filepath.Join(t.TempDir(), "memory.tmx")
	tests := []struct {
		action string
		args   []string
	}{
		{action: "smartling glossary list", args: []string{"glossary", "list", "--account-uid", "acc-1"}},
		{action: "smartling glossary create", args: []string{"glossary", "create", "--account-uid", "acc-1", "--name", "n", "-l", "en-US"}},
		{action: "smartling glossary import", args: []string{"glossary", "import", "--account-uid", "acc-1", "--glossary-uid", "g-1", "--file", "terms.csv"}},
		{action: "smartling glossary download", args: []string{"glossary", "download", "--account-uid", "acc-1", "--glossary-uid", "g-1"}},
		{action: "smartling tm list", args: []string{"tm", "list", "--account-uid", "acc-1"}},
		{action: "smartling tm create", args: []string{"tm", "create", "--account-uid", "acc-1", "--name", "n", "--source-locale", "en-US"}},
		{action: "smartling tm import", args: []string{"tm", "import", "--account-uid", "acc-1", "--tm-uid", "tm-1", "--file", tmxPath}},
	}
	for _, tc := range tests {
		t.Run(tc.action, func(t *testing.T) {
			_, err := executeSmartlingCLI(t, tc.args...)
			if err == nil || !strings.Contains(err.Error(), tc.action+": credentials are required") {
				t.Fatalf("expected credentials error, got %v", err)
			}
		})
	}
}

func TestSmartlingAdminListRejectsInvalidOutput(t *testing.T) {
	for _, args := range [][]string{
		{"glossary", "list", "--account-uid", "acc-1", "--output", "xml"},
		{"tm", "list", "--account-uid", "acc-1", "--output", "xml"},
	} {
		_, err := executeSmartlingCLI(t, args...)
		if err == nil || !strings.Contains(err.Error(), `unsupported output format "xml"`) {
			t.Fatalf("%v: expected invalid output error, got %v", args, err)
		}
	}
}

func TestSmartlingTMListFiltersByNameTextAndJSON(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("GET /translation-memory-api/v2/accounts/acc-1/translation-memories", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("offset") != "0" || r.URL.Query().Get("limit") != "100" {
			t.Errorf("unexpected paging query %q", r.URL.RawQuery)
		}
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{
			"totalCount": 2,
			"items": []map[string]any{
				{"translationMemoryUid": "tm-1", "name": "Product TM", "sourceLocaleId": "en-US", "localeIds": []string{"fr-FR", "de-DE"}},
				{"uid": "tm-2", "name": "Marketing", "sourceLocaleId": "en-US"},
			},
		}))
	})

	out, err := executeSmartlingCLI(t, "tm", "list", "--account-uid", "acc-1", "--name", "product")
	if err != nil {
		t.Fatalf("tm list: %v", err)
	}
	if !strings.HasPrefix(out, "tm_uid=tm-1 name=Product TM source_locale=en-US locales=") || strings.Contains(out, "tm-2") {
		t.Fatalf("text output = %q", out)
	}

	out, err = executeSmartlingCLI(t, "translation-memory", "list", "--account-uid", "acc-1", "--output", "json")
	if err != nil {
		t.Fatalf("tm list json: %v", err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatalf("decode json output %q: %v", out, err)
	}
	if len(decoded) != 2 || decoded[1]["translationMemoryUid"] != "tm-2" {
		t.Fatalf("json output = %s", out)
	}
}

func TestSmartlingTMListWrapsAPIError(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("GET /translation-memory-api/v2/accounts/acc-1/translation-memories", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	})

	_, err := executeSmartlingCLI(t, "tm", "list", "--account-uid", "acc-1")
	if err == nil || strings.Count(err.Error(), "smartling tm list:") != 1 || !strings.Contains(err.Error(), "status 503") {
		t.Fatalf("expected single-wrapped API error, got %v", err)
	}
}

func TestSmartlingTMCreateTextAndJSON(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /tm-graphql-api/v2/accounts/acc-1/graphql", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, map[string]any{"data": map[string]any{
			"createTm": map[string]any{"tmUid": "tm-new", "name": "Product TM", "sourceLocaleId": "en-US"},
		}})
	})

	out, err := executeSmartlingCLI(t, "tm", "create", "--account-uid", "acc-1", "--name", "Product TM", "--description", "Main", "--source-locale", "en-US")
	if err != nil {
		t.Fatalf("tm create: %v", err)
	}
	if out != "tm_uid=tm-new name=Product TM source_locale=en-US\n" {
		t.Fatalf("text output = %q", out)
	}
	body := api.jsonBody(t, "POST /tm-graphql-api/v2/accounts/acc-1/graphql")
	variables, _ := body["variables"].(map[string]any)
	createTm, _ := variables["createTm"].(map[string]any)
	if createTm["name"] != "Product TM" || createTm["sourceLocaleId"] != "en-US" || createTm["description"] != "Main" {
		t.Fatalf("graphql variables = %v", body["variables"])
	}

	out, err = executeSmartlingCLI(t, "tm", "create", "--account-uid", "acc-1", "--name", "Product TM", "--source-locale", "en-US", "--output", "json")
	if err != nil {
		t.Fatalf("tm create json: %v", err)
	}
	if !strings.Contains(out, `"translationMemoryUid": "tm-new"`) {
		t.Fatalf("json output = %s", out)
	}
}

func TestSmartlingTMCreateSurfacesGraphQLErrors(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /tm-graphql-api/v2/accounts/acc-1/graphql", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, map[string]any{"errors": []map[string]any{{"message": "name already exists"}}})
	})

	_, err := executeSmartlingCLI(t, "tm", "create", "--account-uid", "acc-1", "--name", "Product TM", "--source-locale", "en-US")
	if err == nil || err.Error() != "smartling tm create: name already exists" {
		t.Fatalf("expected graphql error, got %v", err)
	}
}

func TestSmartlingTMImportUploadsTMX(t *testing.T) {
	api := newFakeSmartlingAPI(t)
	api.handle("POST /tm-tmx-api/v2/accounts/acc-1/tmx/file", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingJSON(w, smartlingSuccess(map[string]any{"jobUid": "job-1", "tmxUid": "tmx-1", "stringCount": 3, "wordCount": 9}))
	})

	path := filepath.Join(t.TempDir(), "memory.tmx")
	if err := os.WriteFile(path, []byte("<tmx/>"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := executeSmartlingCLI(t, "tm", "import", "--account-uid", "acc-1", "--tm-uid", "tm-1", "--file", path, "--timeout-seconds", "5")
	if err != nil {
		t.Fatalf("tm import: %v", err)
	}
	if out != "job_uid=job-1 tmx_uid=tmx-1 strings=3 words=9\n" {
		t.Fatalf("output = %q", out)
	}
	form := api.form(t, "POST /tm-tmx-api/v2/accounts/acc-1/tmx/file")
	if form["tmUid"] != "tm-1" || form["fileUri"] != "memory.tmx" || form["file:file"] != "memory.tmx" {
		t.Fatalf("import form = %v", form)
	}

	if _, err := executeSmartlingCLI(t, "tm", "import", "--account-uid", "acc-1", "--tm-uid", "tm-1", "--file", path, "--file-uri", "custom/uri.tmx"); err != nil {
		t.Fatalf("tm import with file uri: %v", err)
	}
	if form := api.form(t, "POST /tm-tmx-api/v2/accounts/acc-1/tmx/file"); form["fileUri"] != "custom/uri.tmx" {
		t.Fatalf("expected explicit file uri, got %v", form)
	}
}

func TestSmartlingTMImportRejectsNonTMXBeforeAPI(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	_, err := executeSmartlingCLI(t, "tm", "import", "--account-uid", "acc-1", "--tm-uid", "tm-1", "--file", "memory.csv")
	if err == nil || err.Error() != "smartling tm import: input file must be .tmx" {
		t.Fatalf("expected tmx extension error, got %v", err)
	}
}

func assertNoGlossaryTempFiles(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".tmp") {
			t.Fatalf("leftover temp file %s", entry.Name())
		}
	}
}
