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

type mockLokaliseKey struct {
	KeyID        int64               `json:"key_id"`
	KeyName      map[string]string   `json:"key_name"`
	Description  string              `json:"description,omitempty"`
	Translations []map[string]string `json:"translations"`
}

type mockLokaliseStore struct {
	mu      sync.Mutex
	keys    []mockLokaliseKey
	creates int
	lists   int
}

func startLokaliseKeysServer(t *testing.T, initial []mockLokaliseKey) (*httptest.Server, *mockLokaliseStore) {
	t.Helper()
	store := &mockLokaliseStore{keys: append([]mockLokaliseKey(nil), initial...)}
	mux := http.NewServeMux()
	handler := func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/keys") {
			t.Errorf("unexpected path %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		store.mu.Lock()
		defer store.mu.Unlock()
		switch r.Method {
		case http.MethodGet:
			store.lists++
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": store.keys})
		case http.MethodPost:
			body, _ := io.ReadAll(r.Body)
			var payload struct {
				Keys []struct {
					KeyName      json.RawMessage     `json:"key_name"`
					Description  string              `json:"description"`
					Translations []map[string]string `json:"translations"`
				} `json:"keys"`
			}
			if err := json.Unmarshal(body, &payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			created := make([]mockLokaliseKey, 0, len(payload.Keys))
			for _, key := range payload.Keys {
				store.creates++
				item := mockLokaliseKey{
					KeyID:        int64(len(store.keys) + 1),
					KeyName:      decodeMockKeyName(key.KeyName),
					Description:  key.Description,
					Translations: key.Translations,
				}
				store.keys = append(store.keys, item)
				created = append(created, item)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": created, "errors": []any{}})
		case http.MethodPut:
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": store.keys, "errors": []any{}})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
	mux.HandleFunc("/projects/", handler)
	mux.HandleFunc("/api2/projects/", handler)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, store
}

func decodeMockKeyName(raw json.RawMessage) map[string]string {
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		if strings.TrimSpace(asString) == "" {
			return map[string]string{}
		}
		return map[string]string{"web": asString}
	}
	var asMap map[string]string
	if err := json.Unmarshal(raw, &asMap); err != nil {
		return map[string]string{}
	}
	return asMap
}

func writeTMSAdapterConfig(t *testing.T, dir, extraStorageConfig string) string {
	t.Helper()
	configPath := filepath.Join(dir, "i18n.jsonc")
	content := `{
	  "locales": {"source":"en","targets":["fr"]},
	  "buckets": {"json":{"files":[{"from":"lang/{{source}}.json","to":"lang/{{target}}.json"}]}},
	  "groups": {"default":{"targets":["fr"],"buckets":["json"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate"}}},
	  "storage": {
	    "adapter": "lokalise",
	    "config": {
	      "projectID": "proj-1",
	      "apiTokenEnv": "HL652_E2E_TOKEN",
	      ` + extraStorageConfig + `
	    }
	  }
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return configPath
}

func runSyncCobra(t *testing.T, args ...string) (string, error) {
	t.Helper()
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs(args)
	err := cmd.Execute()
	return out.String(), err
}

func TestSyncTMSPullWritesLocaleAndSidecar(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	t.Setenv("LOKALISE_API_TOKEN", "")
	srv, store := startLokaliseKeysServer(t, []mockLokaliseKey{{
		KeyID:   1,
		KeyName: map[string]string{"web": "hello"},
		Translations: []map[string]string{{
			"language_iso": "fr",
			"translation":  "bonjour",
		}},
	}})

	dir := t.TempDir()
	configPath := writeTMSAdapterConfig(t, dir, `"apiBaseURL": "`+srv.URL+`"`)
	out, err := runSyncCobra(t, "sync", "pull", "--config", configPath, "--locale", "fr")
	if err != nil {
		t.Fatalf("sync pull: %v\n%s", err, out)
	}
	if !strings.Contains(out, "action=pull") || !strings.Contains(out, "creates=1") {
		t.Fatalf("unexpected report: %s", out)
	}
	if store.lists == 0 {
		t.Fatalf("expected lokalise list keys")
	}

	content, err := os.ReadFile(filepath.Join(dir, "lang", "fr.json"))
	if err != nil {
		t.Fatalf("read pulled locale: %v", err)
	}
	var values map[string]string
	if err := json.Unmarshal(content, &values); err != nil {
		t.Fatalf("decode pulled locale: %v", err)
	}
	if values["hello"] != "bonjour" {
		t.Fatalf("pulled values = %#v", values)
	}
	if _, err := os.Stat(filepath.Join(dir, "lang", "fr.meta.json")); err != nil {
		t.Fatalf("expected sidecar: %v", err)
	}
}

func TestSyncTMSPullDryRunDoesNotWriteFiles(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	t.Setenv("LOKALISE_API_TOKEN", "")
	srv, _ := startLokaliseKeysServer(t, []mockLokaliseKey{{
		KeyID:   1,
		KeyName: map[string]string{"web": "hello"},
		Translations: []map[string]string{{
			"language_iso": "fr",
			"translation":  "bonjour",
		}},
	}})

	dir := t.TempDir()
	configPath := writeTMSAdapterConfig(t, dir, `"apiBaseURL": "`+srv.URL+`"`)
	out, err := runSyncCobra(t, "sync", "pull", "--config", configPath, "--dry-run")
	if err != nil {
		t.Fatalf("sync pull --dry-run: %v\n%s", err, out)
	}
	if !strings.Contains(out, "dry_run=true") {
		t.Fatalf("unexpected report: %s", out)
	}
	if _, err := os.Stat(filepath.Join(dir, "lang", "fr.json")); !os.IsNotExist(err) {
		t.Fatalf("dry-run should not write locale file: %v", err)
	}
}

func TestSyncTMSPullFailOnConflict(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	t.Setenv("LOKALISE_API_TOKEN", "")
	srv, _ := startLokaliseKeysServer(t, []mockLokaliseKey{{
		KeyID:   1,
		KeyName: map[string]string{"web": "hello"},
		Translations: []map[string]string{{
			"language_iso": "fr",
			"translation":  "bonjour",
		}},
	}})

	dir := t.TempDir()
	langDir := filepath.Join(dir, "lang")
	if err := os.MkdirAll(langDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte("{\"hello\":\"local-curated\"}\n"), 0o644); err != nil {
		t.Fatalf("write locale: %v", err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "fr.meta.json"), []byte("{\"hello\\u001f\":{\"provenance\":{\"origin\":\"human\",\"state\":\"curated\"}}}\n"), 0o644); err != nil {
		t.Fatalf("write meta: %v", err)
	}
	configPath := writeTMSAdapterConfig(t, dir, `"apiBaseURL": "`+srv.URL+`"`)

	out, err := runSyncCobra(t, "sync", "pull", "--config", configPath, "--fail-on-conflict")
	if err == nil || !strings.Contains(err.Error(), "pull conflicts detected") {
		t.Fatalf("expected fail-on-conflict error, got %v\n%s", err, out)
	}
	if !strings.Contains(out, "conflicts=1") {
		t.Fatalf("expected conflict report: %s", out)
	}
	content, err := os.ReadFile(filepath.Join(langDir, "fr.json"))
	if err != nil {
		t.Fatalf("read locale: %v", err)
	}
	if !strings.Contains(string(content), "local-curated") {
		t.Fatalf("conflict should not overwrite local curated value: %s", content)
	}
}

func TestSyncTMSPullApplyCuratedOverDraft(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	t.Setenv("LOKALISE_API_TOKEN", "")
	srv, _ := startLokaliseKeysServer(t, []mockLokaliseKey{{
		KeyID:   1,
		KeyName: map[string]string{"web": "hello"},
		Translations: []map[string]string{{
			"language_iso": "fr",
			"translation":  "bonjour",
		}},
	}})

	dir := t.TempDir()
	langDir := filepath.Join(dir, "lang")
	if err := os.MkdirAll(langDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte("{\"hello\":\"draft-value\"}\n"), 0o644); err != nil {
		t.Fatalf("write locale: %v", err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "fr.meta.json"), []byte("{\"hello\\u001f\":{\"provenance\":{\"origin\":\"llm\",\"state\":\"draft\"}}}\n"), 0o644); err != nil {
		t.Fatalf("write meta: %v", err)
	}
	configPath := writeTMSAdapterConfig(t, dir, `"apiBaseURL": "`+srv.URL+`"`)

	out, err := runSyncCobra(t, "sync", "pull", "--config", configPath, "--apply-curated-over-draft")
	if err != nil {
		t.Fatalf("sync pull: %v\n%s", err, out)
	}
	content, err := os.ReadFile(filepath.Join(langDir, "fr.json"))
	if err != nil {
		t.Fatalf("read locale: %v", err)
	}
	var values map[string]string
	if err := json.Unmarshal(content, &values); err != nil {
		t.Fatalf("decode locale: %v", err)
	}
	if values["hello"] != "bonjour" {
		t.Fatalf("expected curated-over-draft apply, got %#v report=%s", values, out)
	}
}

func TestSyncTMSPushCreatesRemoteKey(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	t.Setenv("LOKALISE_API_TOKEN", "")
	srv, store := startLokaliseKeysServer(t, nil)

	dir := t.TempDir()
	langDir := filepath.Join(dir, "lang")
	if err := os.MkdirAll(langDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte("{\"hello\":\"salut\"}\n"), 0o644); err != nil {
		t.Fatalf("write locale: %v", err)
	}
	configPath := writeTMSAdapterConfig(t, dir, `"apiBaseURL": "`+srv.URL+`"`)

	out, err := runSyncCobra(t, "sync", "push", "--config", configPath, "--locale", "fr")
	if err != nil {
		t.Fatalf("sync push: %v\n%s", err, out)
	}
	if !strings.Contains(out, "action=push") {
		t.Fatalf("unexpected report: %s", out)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.creates != 1 {
		t.Fatalf("creates = %d, want 1; keys=%#v report=%s", store.creates, store.keys, out)
	}
	if len(store.keys) != 1 || store.keys[0].KeyName["web"] != "hello" {
		t.Fatalf("stored keys = %#v", store.keys)
	}
}

func TestSyncTMSUsesConfigDirectoryNotCwd(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	t.Setenv("LOKALISE_API_TOKEN", "")
	srv, _ := startLokaliseKeysServer(t, []mockLokaliseKey{{
		KeyID:   1,
		KeyName: map[string]string{"web": "hello"},
		Translations: []map[string]string{{
			"language_iso": "fr",
			"translation":  "bonjour",
		}},
	}})

	configDir := t.TempDir()
	t.Chdir(t.TempDir())
	configPath := writeTMSAdapterConfig(t, configDir, `"apiBaseURL": "`+srv.URL+`"`)
	out, err := runSyncCobra(t, "sync", "pull", "--config", configPath)
	if err != nil {
		t.Fatalf("sync pull: %v\n%s", err, out)
	}
	if _, err := os.Stat(filepath.Join(configDir, "lang", "fr.json")); err != nil {
		t.Fatalf("expected write under config dir: %v", err)
	}
}

func TestSyncTMSUnknownLocaleRejected(t *testing.T) {
	t.Setenv("HL652_E2E_TOKEN", "test-token")
	dir := t.TempDir()
	configPath := writeTMSAdapterConfig(t, dir, `"apiBaseURL": "http://127.0.0.1:1"`)
	_, err := runSyncCobra(t, "sync", "pull", "--config", configPath, "--locale", "de")
	if err == nil || !strings.Contains(err.Error(), "locales.source or locales.targets") {
		t.Fatalf("unexpected error: %v", err)
	}
}
