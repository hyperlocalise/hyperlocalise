package smartling

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPClientWriteTranslationMemoryCSV(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/accounts/acc1/translation-memories/tm1/entries":
			if r.URL.Query().Get("sourceLocaleId") != "en-US" {
				t.Errorf("unexpected sourceLocaleId: %s", r.URL.Query().Get("sourceLocaleId"))
			}
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"items":[
				{"entryUid":"e1","sourceText":"Hello","sourceLocaleId":"en-US","translations":[{"targetLocaleId":"fr-FR","translationText":"Bonjour"}]},
				{"entryUid":"e2","sourceText":"Goodbye","sourceLocaleId":"en-US","translations":[{"targetLocaleId":"fr-FR","translationText":"Au revoir"}]}
			]}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL: srv.URL,
		tmBaseURL:   srv.URL,
		http:        srv.Client(),
	}

	out := &bytes.Buffer{}
	result, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadRequest{
		AccountUID:           "acc1",
		TranslationMemoryUID: "tm1",
		SourceLanguage:       "en-US",
	}, out)

	if err != nil {
		t.Fatalf("WriteTranslationMemoryCSV: %v", err)
	}
	if result.Rows != 2 || result.Segments != 2 {
		t.Errorf("unexpected result: %+v", result)
	}

	got := out.String()
	if !strings.Contains(got, "tm1,e1,en-US,fr-FR,Hello,Bonjour") ||
		!strings.Contains(got, "tm1,e2,en-US,fr-FR,Goodbye,Au revoir") {
		t.Errorf("unexpected csv output: %s", got)
	}
}

func TestHTTPClientWriteTranslationMemoryTMX(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authenticate":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"accessToken":"token"}}`)
		case "/accounts/acc1/translation-memories/tm1/entries":
			_, _ = fmt.Fprint(w, `{"response":{"code":"SUCCESS"},"data":{"items":[
				{"entryUid":"e1","sourceText":"Hello","sourceLocaleId":"en-US","translations":[{"targetLocaleId":"fr-FR","translationText":"Bonjour"}]}
			]}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		authBaseURL: srv.URL,
		tmBaseURL:   srv.URL,
		http:        srv.Client(),
	}

	out := &bytes.Buffer{}
	result, err := client.WriteTranslationMemoryTMX(context.Background(), TranslationMemoryDownloadRequest{
		AccountUID:           "acc1",
		TranslationMemoryUID: "tm1",
		SourceLanguage:       "en-US",
	}, out)

	if err != nil {
		t.Fatalf("WriteTranslationMemoryTMX: %v", err)
	}
	if result.Rows != 2 || result.Segments != 1 {
		t.Errorf("unexpected result: %+v", result)
	}

	got := out.String()
	if !strings.Contains(got, `<tmx version="1.4">`) ||
		!strings.Contains(got, `<tu tuid="e1">`) ||
		!strings.Contains(got, `<tuv xml:lang="en-US">`) ||
		!strings.Contains(got, `<seg>Hello</seg>`) ||
		!strings.Contains(got, `<tuv xml:lang="fr-FR">`) ||
		!strings.Contains(got, `<seg>Bonjour</seg>`) {
		t.Errorf("unexpected tmx output: %s", got)
	}
}
