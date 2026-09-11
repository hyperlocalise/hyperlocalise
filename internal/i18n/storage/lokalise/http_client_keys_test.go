package lokalise

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
)

func TestListKeysFiltersRequestedLocales(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api2/projects/proj-1/keys", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		writeLokaliseJSON(t, w, map[string]any{
			"keys": []map[string]any{
				{
					"key_id":  1,
					"key_name": map[string]string{"web": "hello"},
					"translations": []map[string]string{
						{"language_iso": "en_US", "translation": "Hello"},
						{"language_iso": "fr", "translation": "Bonjour"},
					},
				},
			},
		})
	})

	keys, _, err := client.ListKeys(context.Background(), ListKeysInput{
		ProjectID: "proj-1",
		Locales:   []string{"en-US"},
	})
	if err != nil {
		t.Fatalf("list keys: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("expected 1 key translation, got %d", len(keys))
	}
	if keys[0].Locale != "en-US" || keys[0].Value != "Hello" {
		t.Fatalf("unexpected key translation: %+v", keys[0])
	}
}

func TestListKeysReturnsAllLanguagesWhenLocalesEmpty(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api2/projects/proj-1/keys", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"keys": []map[string]any{
				{
					"key_id":  1,
					"key_name": map[string]string{"web": "hello"},
					"translations": []map[string]string{
						{"language_iso": "en_US", "translation": "Hello"},
						{"language_iso": "fr", "translation": "Bonjour"},
					},
				},
			},
		})
	})

	keys, _, err := client.ListKeys(context.Background(), ListKeysInput{ProjectID: "proj-1"})
	if err != nil {
		t.Fatalf("list keys: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("expected 2 key translations, got %d", len(keys))
	}
}

func TestUpsertTranslationsChunksCreates(t *testing.T) {
	oldLimit := keysPerUpsertRequest
	keysPerUpsertRequest = 2
	t.Cleanup(func() { keysPerUpsertRequest = oldLimit })

	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	var createCalls int
	mux.HandleFunc("/api2/projects/proj-1/keys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		case http.MethodPost:
			createCalls++
			var body struct {
				Keys []map[string]any `json:"keys"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create body: %v", err)
			}
			if len(body.Keys) > 2 {
				t.Fatalf("create chunk size = %d, want at most 2", len(body.Keys))
			}
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	entries := make([]KeyTranslation, 0, 5)
	for i := 1; i <= 5; i++ {
		entries = append(entries, KeyTranslation{
			Key:    fmt.Sprintf("key.%d", i),
			Locale: "en-US",
			Value:  fmt.Sprintf("value %d", i),
		})
	}

	if _, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "proj-1",
		Entries:   entries,
	}); err != nil {
		t.Fatalf("upsert translations: %v", err)
	}
	if createCalls != 3 {
		t.Fatalf("create calls = %d, want 3", createCalls)
	}
}

func TestUpsertTranslationsChunksUpdates(t *testing.T) {
	oldLimit := keysPerUpsertRequest
	keysPerUpsertRequest = 2
	t.Cleanup(func() { keysPerUpsertRequest = oldLimit })

	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	existing := make([]map[string]any, 0, 5)
	for i := 1; i <= 5; i++ {
		existing = append(existing, map[string]any{
			"key_id":   int64(i),
			"key_name": map[string]string{"web": fmt.Sprintf("key.%d", i)},
		})
	}

	var updateCalls int
	mux.HandleFunc("/api2/projects/proj-1/keys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeLokaliseJSON(t, w, map[string]any{"keys": existing})
		case http.MethodPut:
			updateCalls++
			var body struct {
				Keys []map[string]any `json:"keys"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode update body: %v", err)
			}
			if len(body.Keys) > 2 {
				t.Fatalf("update chunk size = %d, want at most 2", len(body.Keys))
			}
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	entries := make([]KeyTranslation, 0, 5)
	for i := 1; i <= 5; i++ {
		entries = append(entries, KeyTranslation{
			Key:    fmt.Sprintf("key.%d", i),
			Locale: "en-US",
			Value:  fmt.Sprintf("value %d", i),
		})
	}

	if _, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "proj-1",
		Entries:   entries,
	}); err != nil {
		t.Fatalf("upsert translations: %v", err)
	}
	if updateCalls != 3 {
		t.Fatalf("update calls = %d, want 3", updateCalls)
	}
}

func TestUpsertTranslationsMapsPushLocaleToUnderscore(t *testing.T) {
	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	var capturedISO string
	mux.HandleFunc("/api2/projects/proj-1/keys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		case http.MethodPost:
			var body struct {
				Keys []struct {
					Translations []struct {
						LanguageISO string `json:"language_iso"`
					} `json:"translations"`
				} `json:"keys"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create body: %v", err)
			}
			if len(body.Keys) != 1 || len(body.Keys[0].Translations) != 1 {
				t.Fatalf("unexpected create body: %#v", body)
			}
			capturedISO = body.Keys[0].Translations[0].LanguageISO
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	if _, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "proj-1",
		Entries: []KeyTranslation{{
			Key:    "hello",
			Locale: "en-US",
			Value:  "Hello",
		}},
	}); err != nil {
		t.Fatalf("upsert translations: %v", err)
	}
	if capturedISO != "en_US" {
		t.Fatalf("language_iso = %q, want en_US", capturedISO)
	}
}

func TestGroupEntriesByKeySkipsEmptyValuesAndDeduplicatesLocales(t *testing.T) {
	result := groupEntriesByKey([]KeyTranslation{
		{Key: "hello", Locale: "en-US", Value: "Hello"},
		{Key: "hello", Locale: "en_US", Value: "Updated"},
		{Key: "hello", Locale: "fr", Value: "   "},
		{Key: "empty", Locale: "de", Value: ""},
	})

	group := groupedKey{Key: "hello"}
	translations, ok := result[group]
	if !ok {
		t.Fatalf("expected grouped key hello")
	}
	if len(translations) != 1 {
		t.Fatalf("expected 1 translation after dedupe, got %d", len(translations))
	}
	if translations[0].LanguageISO != "en_US" || translations[0].Translation != "Updated" {
		t.Fatalf("unexpected translation: %+v", translations[0])
	}
	if _, ok := result[groupedKey{Key: "empty"}]; ok {
		t.Fatalf("expected empty-value group to be omitted")
	}
}

func TestUpsertTranslationsStopsOnChunkFailure(t *testing.T) {
	oldLimit := keysPerUpsertRequest
	keysPerUpsertRequest = 2
	t.Cleanup(func() { keysPerUpsertRequest = oldLimit })

	client, mux, teardown := newLokaliseUploadClientForTest(t)
	defer teardown()

	var mu sync.Mutex
	createCalls := 0
	mux.HandleFunc("/api2/projects/proj-1/keys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		case http.MethodPost:
			mu.Lock()
			createCalls++
			call := createCalls
			mu.Unlock()
			if call == 2 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":{"code":400,"message":"bad chunk"}}`))
				return
			}
			writeLokaliseJSON(t, w, map[string]any{"keys": []any{}})
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	entries := make([]KeyTranslation, 0, 5)
	for i := 1; i <= 5; i++ {
		entries = append(entries, KeyTranslation{
			Key:    fmt.Sprintf("key.%d", i),
			Locale: "en-US",
			Value:  fmt.Sprintf("value %d", i),
		})
	}

	_, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "proj-1",
		Entries:   entries,
	})
	if err == nil || !strings.Contains(err.Error(), "create keys") {
		t.Fatalf("expected create keys error, got %v", err)
	}
	mu.Lock()
	gotCalls := createCalls
	mu.Unlock()
	if gotCalls != 2 {
		t.Fatalf("create calls = %d, want 2 before failure", gotCalls)
	}
}
