package tmscatalog

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSupported(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"crowdin", "phrase", "smartling", "Crowdin"} {
		if !Supported(kind) {
			t.Fatalf("Supported(%q) = false", kind)
		}
	}
	if Supported("lokalise") {
		t.Fatal("lokalise is not implemented")
	}
}

func TestPhraseTMSExportDoesNotSendJSONAccept(t *testing.T) {
	t.Parallel()

	tbx := `<?xml version="1.0"?><martif type="TBX"><text><body><termEntry id="1"><langSet xml:lang="en"><tig><term>Hello</term></tig></langSet></termEntry></body></text></martif>`
	mux := http.NewServeMux()
	mux.HandleFunc("/api2/v1/termBases/tb-1/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Accept") == "application/json" {
			http.Error(w, `{"errorDescription":"not acceptable"}`, http.StatusNotAcceptable)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = io.WriteString(w, tbx)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newPhrase(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "ApiToken secret",
		AuthMode:    phraseOAuthMode,
	}, srv.Client())
	export, err := provider.ExportGlossary(context.Background(), "tb-1", 1<<20)
	if err != nil {
		t.Fatalf("ExportGlossary: %v", err)
	}
	if !strings.Contains(string(export.Content), "<termEntry") {
		t.Fatalf("content = %q", export.Content)
	}
}

func TestPhraseTMSExportRejectsJSONFile(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"errorDescription":"not a file"}`)
	}))
	t.Cleanup(srv.Close)

	provider := newPhrase(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "ApiToken secret",
		AuthMode:    phraseOAuthMode,
	}, srv.Client())
	_, err := provider.ExportGlossary(context.Background(), "tb-1", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) {
		t.Fatalf("err = %v", err)
	}
}

func TestPhraseTMSMemoryExportDownloadOmitsJSONAccept(t *testing.T) {
	t.Parallel()

	tmx := `<?xml version="1.0"?><tmx version="1.4"><body><tu tuid="1"><tuv xml:lang="en"><seg>Hi</seg></tuv><tuv xml:lang="fr"><seg>Salut</seg></tuv></tu></body></tmx>`
	mux := http.NewServeMux()
	mux.HandleFunc("/api2/v1/transMemories/tm-1", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"uid": "tm-1", "sourceLang": "en", "targetLangs": []string{"fr"}})
	})
	mux.HandleFunc("/api2/v2/transMemories/tm-1/export", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"asyncRequest": map[string]any{"id": "async-1"}})
	})
	mux.HandleFunc("/api2/v1/transMemories/downloadExport/async-1", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Accept") == "application/json" {
			http.Error(w, `{"errorDescription":"not acceptable"}`, http.StatusNotAcceptable)
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = io.WriteString(w, tmx)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newPhrase(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "ApiToken secret",
		AuthMode:    phraseOAuthMode,
	}, srv.Client()).(*phraseTMS)
	provider.pollEvery = time.Millisecond
	export, err := provider.ExportMemory(context.Background(), "tm-1", 1<<20)
	if err != nil {
		t.Fatalf("ExportMemory: %v", err)
	}
	if !strings.Contains(string(export.Content), "<tu tuid=\"1\">") {
		t.Fatalf("content = %q", export.Content)
	}
}

func TestCrowdinListsAndExports(t *testing.T) {
	t.Parallel()

	tbx := `<?xml version="1.0"?><martif type="TBX"><text><body></body></text></martif>`
	mux := http.NewServeMux()
	mux.HandleFunc("/glossaries", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"data": []map[string]any{{
				"data": map[string]any{"id": 9, "name": "Brand", "languageId": "en", "languageIds": []string{"en", "fr"}, "terms": 3},
			}},
		})
	})
	mux.HandleFunc("/glossaries/9/exports", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			writeJSON(w, map[string]any{"data": map[string]any{"identifier": "exp-1", "status": "finished"}})
			return
		}
		http.NotFound(w, r)
	})
	var fileURL string
	mux.HandleFunc("/glossaries/9/exports/exp-1/download", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"data": map[string]any{"url": fileURL}})
	})
	mux.HandleFunc("/file.tbx", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = io.WriteString(w, tbx)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	fileURL = srv.URL + "/file.tbx"

	provider := newCrowdin(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, srv.Client())
	resources, err := provider.ListGlossaries(context.Background())
	if err != nil {
		t.Fatalf("ListGlossaries: %v", err)
	}
	if len(resources) != 1 || resources[0].ExternalID != "9" || resources[0].Name != "Brand" {
		t.Fatalf("resources = %#v", resources)
	}
	export, err := provider.ExportGlossary(context.Background(), "9", 1<<20)
	if err != nil {
		t.Fatalf("ExportGlossary: %v", err)
	}
	if string(export.Content) != tbx {
		t.Fatalf("content = %q", export.Content)
	}
}

func TestCrowdinRejectsNonHTTPDownloadURL(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/glossaries/9/exports", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"data": map[string]any{"identifier": "exp-1", "status": "finished"}})
	})
	mux.HandleFunc("/glossaries/9/exports/exp-1/download", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"data": map[string]any{"url": "ftp://files.example/export.tbx"}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newCrowdin(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, srv.Client())
	_, err := provider.ExportGlossary(context.Background(), "9", 1<<20)
	if err == nil || !strings.Contains(err.Error(), "http or https") {
		t.Fatalf("err = %v", err)
	}
}

func TestSmartlingExportRejectsJSONFile(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/glossary-api/v3/accounts/acc-1/glossaries/g-1", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{
				"glossaryUid": "g-1", "localeIds": []string{"en", "fr"},
			}},
		})
	})
	mux.HandleFunc("/glossary-api/v3/accounts/acc-1/glossaries/g-1/entries/download", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		writeJSON(w, map[string]any{"response": map[string]any{"code": "SUCCESS"}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newSmartling(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
		AccountID:   "acc-1",
	}, srv.Client())
	_, err := provider.ExportGlossary(context.Background(), "g-1", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) {
		t.Fatalf("err = %v", err)
	}
}

func TestSmartlingListsMemoriesAndBuildsTMX(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/translation-memory-api/v2/accounts/acc-1/translation-memories/tm-1/entries", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{
				"items": []map[string]any{{
					"entryUid":       "e-1",
					"sourceText":     "Hello",
					"sourceLocaleId": "en",
					"translations": []map[string]any{{
						"targetLocaleId":  "fr",
						"translationText": "Bonjour",
					}},
				}},
			}},
		})
	})
	mux.HandleFunc("/translation-memory-api/v2/accounts/acc-1/translation-memories", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{
				"items": []map[string]any{{
					"translationMemoryUid": "tm-1",
					"name":                 "Memory",
					"sourceLocaleId":       "en",
					"localeIds":            []string{"en", "fr"},
				}},
			}},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newSmartling(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
		AccountID:   "acc-1",
	}, srv.Client())
	memories, err := provider.ListMemories(context.Background())
	if err != nil {
		t.Fatalf("ListMemories: %v", err)
	}
	if len(memories) != 1 || memories[0].ExternalID != "tm-1" {
		t.Fatalf("memories = %#v", memories)
	}
	export, err := provider.ExportMemory(context.Background(), "tm-1", 1<<20)
	if err != nil {
		t.Fatalf("ExportMemory: %v", err)
	}
	if !strings.Contains(string(export.Content), `xml:lang="en"`) || !strings.Contains(string(export.Content), "Bonjour") {
		t.Fatalf("content = %q", export.Content)
	}
}

func TestPhraseStringsBuildsTBX(t *testing.T) {
	t.Parallel()

	terms := []phraseStringsTerm{{
		ID:          "t-1",
		Term:        "Checkout",
		Description: "Pay now",
		Translations: []struct {
			LocaleCode string `json:"locale_code"`
			Content    string `json:"content"`
		}{{LocaleCode: "fr", Content: "Paiement"}},
	}}
	content, err := phraseTBX("en", terms, 1<<20)
	if err != nil {
		t.Fatalf("phraseTBX: %v", err)
	}
	body := string(content)
	for _, want := range []string{`xml:lang="en"`, "Checkout", "Paiement", `type="definition"`, "Pay now"} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in %s", want, body)
		}
	}
}

func TestReadExportFileEmpty(t *testing.T) {
	t.Parallel()

	res := &http.Response{
		Header: http.Header{"Content-Type": []string{"application/xml"}},
		Body:   io.NopCloser(strings.NewReader("   ")),
	}
	_, err := readExportFile(res, "Crowdin", 1024)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusUnprocessableEntity {
		t.Fatalf("err = %v", err)
	}
}

func TestPhraseTermBaseSource(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		langs []string
		want  string
	}{
		{name: "prefers en", langs: []string{"fr", "en", "de"}, want: "en"},
		{name: "prefers en-US", langs: []string{"de", "en-US"}, want: "en-US"},
		{name: "prefers EN_GB case-insensitively", langs: []string{"ja", "EN_GB"}, want: "EN_GB"},
		{name: "falls back to the first language", langs: []string{"fr-FR", "de-DE"}, want: "fr-FR"},
		{name: "empty", langs: nil, want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := phraseTermBaseSource(tt.langs); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCrowdinListsMemoriesDropsSourceLocale(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/tms", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"data": []map[string]any{{
				"data": map[string]any{
					"id": 4, "name": "Product", "languageId": "en",
					"languageIds": []string{"en", "fr", "de"}, "segmentsCount": 12,
				},
			}},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newCrowdin(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, srv.Client())
	resources, err := provider.ListMemories(context.Background())
	if err != nil {
		t.Fatalf("ListMemories: %v", err)
	}
	if len(resources) != 1 || resources[0].ExternalID != "4" || resources[0].Name != "Product" {
		t.Fatalf("resources = %#v", resources)
	}
	if resources[0].SourceLocale == nil || *resources[0].SourceLocale != "en" {
		t.Fatalf("source = %#v", resources[0].SourceLocale)
	}
	if len(resources[0].TargetLocales) != 2 || resources[0].TargetLocales[0] != "fr" || resources[0].TargetLocales[1] != "de" {
		t.Fatalf("targets = %#v", resources[0].TargetLocales)
	}
	if resources[0].Count == nil || *resources[0].Count != 12 {
		t.Fatalf("count = %#v", resources[0].Count)
	}
}

func TestCrowdinExportFailed(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/glossaries/9/exports", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, map[string]any{"data": map[string]any{"identifier": "exp-1", "status": "failed"}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newCrowdin(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, srv.Client())
	provider.pollEvery = time.Millisecond
	_, err := provider.ExportGlossary(context.Background(), "9", 1<<20)
	if err == nil || !strings.Contains(err.Error(), "the export failed") {
		t.Fatalf("err = %v", err)
	}
}

func TestCrowdinExportMissingIdentifier(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"data": map[string]any{"status": "finished"}})
	}))
	t.Cleanup(srv.Close)

	provider := newCrowdin(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, srv.Client())
	_, err := provider.ExportGlossary(context.Background(), "9", 1<<20)
	if err == nil || !strings.Contains(err.Error(), "without an identifier") {
		t.Fatalf("err = %v", err)
	}
}

func TestCrowdinErrorKeepsMessage(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"code":401,"message":"Invalid authorization"}}`)
	}))
	t.Cleanup(srv.Close)

	provider := newCrowdin(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, srv.Client())
	_, err := provider.ListGlossaries(context.Background())
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusUnauthorized || providerErr.Message != "Crowdin: Invalid authorization" {
		t.Fatalf("err = %#v (%v)", providerErr, err)
	}
}

func TestPhraseTMSExportMemoryRequiresTargetLangs(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"uid": "tm-1", "sourceLang": "en", "targetLangs": []string{}})
	}))
	t.Cleanup(srv.Close)

	provider := newPhrase(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "ApiToken secret",
		AuthMode:    phraseOAuthMode,
	}, srv.Client())
	_, err := provider.ExportMemory(context.Background(), "tm-1", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusUnprocessableEntity {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(providerErr.Message, "no target languages") {
		t.Fatalf("message = %q", providerErr.Message)
	}
}

func TestPhraseTMSListsTermBasesPreferringEnglish(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/api2/v1/termBases", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"content": []map[string]any{{
				"uid": "tb-1", "name": "Brand", "langs": []string{"fr", "en-US", "de"},
			}},
			"totalPages": 1,
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newPhrase(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "ApiToken secret",
		AuthMode:    phraseOAuthMode,
	}, srv.Client())
	resources, err := provider.ListGlossaries(context.Background())
	if err != nil {
		t.Fatalf("ListGlossaries: %v", err)
	}
	if len(resources) != 1 || resources[0].SourceLocale == nil || *resources[0].SourceLocale != "en-US" {
		t.Fatalf("resources = %#v", resources)
	}
	if len(resources[0].TargetLocales) != 2 || resources[0].TargetLocales[0] != "fr" || resources[0].TargetLocales[1] != "de" {
		t.Fatalf("targets = %#v", resources[0].TargetLocales)
	}
}

func TestPhraseStringsExportGlossaryRejectsInvalidID(t *testing.T) {
	t.Parallel()

	provider := newPhrase(Credentials{
		BaseURL:     "https://api.phrase.com/v2",
		HeaderName:  "Authorization",
		HeaderValue: "token",
	}, http.DefaultClient)
	_, err := provider.ExportGlossary(context.Background(), "glossary-only", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusBadRequest {
		t.Fatalf("err = %v", err)
	}
}

func TestPhraseStringsHasNoMemories(t *testing.T) {
	t.Parallel()

	provider := newPhrase(Credentials{
		BaseURL:     "https://api.phrase.com/v2",
		HeaderName:  "Authorization",
		HeaderValue: "token",
	}, http.DefaultClient)
	memories, err := provider.ListMemories(context.Background())
	if err != nil || len(memories) != 0 {
		t.Fatalf("ListMemories = %#v, %v", memories, err)
	}
	_, err = provider.ExportMemory(context.Background(), "tm-1", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || !strings.Contains(providerErr.Message, "no translation memories") {
		t.Fatalf("err = %v", err)
	}
}

func TestSmartlingExportGlossaryRejectsEmptyLocales(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/glossary-api/v3/accounts/acc-1/glossaries/g-1", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{
				"glossaryUid": "g-1", "localeIds": []string{},
			}},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newSmartling(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
		AccountID:   "acc-1",
	}, srv.Client())
	_, err := provider.ExportGlossary(context.Background(), "g-1", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusUnprocessableEntity || !strings.Contains(providerErr.Message, "no languages") {
		t.Fatalf("err = %v", err)
	}
}

func TestSmartlingExportMemoryNotFoundOrMissingSource(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/translation-memory-api/v2/accounts/acc-1/translation-memories", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{
				"items": []map[string]any{{
					"translationMemoryUid": "tm-empty-source",
					"name":                 "Empty",
					"sourceLocaleId":       "",
					"localeIds":            []string{"en", "fr"},
				}},
			}},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newSmartling(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
		AccountID:   "acc-1",
	}, srv.Client())
	_, err := provider.ExportMemory(context.Background(), "missing", 1<<20)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusNotFound {
		t.Fatalf("missing: %v", err)
	}
	_, err = provider.ExportMemory(context.Background(), "tm-empty-source", 1<<20)
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusUnprocessableEntity || !strings.Contains(providerErr.Message, "no source language") {
		t.Fatalf("empty source: %v", err)
	}
}

func TestSmartlingAccountFromProject(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/projects-api/v2/projects/proj-1", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{"accountUid": "acc-from-project"}},
		})
	})
	mux.HandleFunc("/glossary-api/v2/accounts/acc-from-project/glossaries", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"response": map[string]any{"code": "SUCCESS", "data": map[string]any{
				"items": []map[string]any{{"glossaryUid": "g-1", "name": "Brand", "localeIds": []string{"en", "fr"}}},
			}},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	provider := newSmartling(Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
		ProjectID:   "proj-1",
	}, srv.Client())
	resources, err := provider.ListGlossaries(context.Background())
	if err != nil {
		t.Fatalf("ListGlossaries: %v", err)
	}
	if len(resources) != 1 || resources[0].ExternalID != "g-1" {
		t.Fatalf("resources = %#v", resources)
	}
}

func TestSmartlingAccountRequired(t *testing.T) {
	t.Parallel()

	provider := newSmartling(Credentials{
		BaseURL:     "https://api.smartling.com",
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}, http.DefaultClient)
	_, err := provider.ListGlossaries(context.Background())
	if !errors.Is(err, ErrAccountRequired) {
		t.Fatalf("err = %v", err)
	}
}

func TestReadExportFileTooLarge(t *testing.T) {
	t.Parallel()

	res := &http.Response{
		Header: http.Header{"Content-Type": []string{"application/xml"}},
		Body:   io.NopCloser(strings.NewReader("<tbx>too-big</tbx>")),
	}
	_, err := readExportFile(res, "Crowdin", 4)
	var providerErr *ProviderError
	if err == nil || !asProviderError(err, &providerErr) || providerErr.Status != http.StatusRequestEntityTooLarge {
		t.Fatalf("err = %v", err)
	}
}

func TestExportDownloadURL(t *testing.T) {
	t.Parallel()

	if _, err := exportDownloadURL(""); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("empty: %v", err)
	}
	if _, err := exportDownloadURL("/relative/file.tbx"); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("relative: %v", err)
	}
	parsed, err := exportDownloadURL(" https://files.example/export.tbx ")
	if err != nil || parsed.Host != "files.example" {
		t.Fatalf("https: %v %#v", err, parsed)
	}
}

func asProviderError(err error, target **ProviderError) bool {
	if err == nil {
		return false
	}
	pe, ok := err.(*ProviderError)
	if !ok {
		return false
	}
	*target = pe
	return true
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
