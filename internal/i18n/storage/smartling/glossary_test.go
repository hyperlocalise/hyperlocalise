package smartling

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPClientWriteGlossaryCSV(t *testing.T) {
	entries := []smartlingGlossaryEntry{
		{
			EntryUID:     "entry-1",
			Term:         "Term 1",
			Definition:   "Def 1",
			PartOfSpeech: "noun",
			LabelUIDs:    []string{"label-1", "label-2"},
			Translations: []smartlingGlossaryTranslation{
				{LocaleID: "fr-FR", Term: "Terme 1", Notes: "Note 1", Definition: "Def Fr 1"},
				{LocaleID: "de-DE", Term: "Begriff 1", Notes: "Note De 1", Definition: "Def De 1"},
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var resp any
		if strings.Contains(r.URL.Path, "/authenticate") {
			resp = map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			}
		} else if strings.Contains(r.URL.Path, "/entries") {
			resp = map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"items": entries},
			}
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.glossaryBaseURL = server.URL

	var buf bytes.Buffer
	_, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadRequest{
		AccountUID:  "acc",
		GlossaryUID: "gloss",
	}, &buf)
	if err != nil {
		t.Fatalf("WriteGlossaryCSV failed: %v", err)
	}

	output := buf.String()
	if !strings.Contains(output, "acc,gloss,entry-1,Term 1,Def 1,noun,\"label-1,label-2\",de-DE,Begriff 1,Note De 1,Def De 1") {
		t.Errorf("Unexpected CSV output: %s", output)
	}
	if !strings.Contains(output, "acc,gloss,entry-1,Term 1,Def 1,noun,\"label-1,label-2\",fr-FR,Terme 1,Note 1,Def Fr 1") {
		t.Errorf("Unexpected CSV output: %s", output)
	}
}

func TestHTTPClientWriteGlossaryCSVEscapesFormulaPrefixes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var resp any
		if strings.Contains(r.URL.Path, "/authenticate") {
			resp = map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			}
		} else if strings.Contains(r.URL.Path, "/entries") {
			resp = map[string]any{
				"response": map[string]any{"code": "success"},
				"data": map[string]any{
					"items": []smartlingGlossaryEntry{{
						EntryUID:     "entry-1",
						Term:         "=evil",
						Definition:   "+bad",
						PartOfSpeech: "noun",
						LabelUIDs:    []string{"@x"},
					}},
				},
			}
		} else {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.glossaryBaseURL = server.URL

	var buf bytes.Buffer
	if _, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadRequest{
		AccountUID: "acc", GlossaryUID: "gloss",
	}, &buf); err != nil {
		t.Fatalf("WriteGlossaryCSV failed: %v", err)
	}
	output := buf.String()
	if !strings.Contains(output, "'=evil") || !strings.Contains(output, "'+bad") || !strings.Contains(output, "'@x") {
		t.Fatalf("expected formula-prefixed cells to be escaped, got: %s", output)
	}
}
