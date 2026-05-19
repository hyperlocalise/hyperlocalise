package cmd

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSyncCommonOptionsDefaultToApplyMode(t *testing.T) {
	o := defaultSyncCommonOptions()
	if o.dryRun {
		t.Fatalf("expected sync dry-run default to be false")
	}
}

func TestSyncPullHelpDoesNotExposeWaitFlag(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"sync", "pull", "--help"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("sync pull help: %v", err)
	}
	help := out.String()
	if strings.Contains(help, "--wait") {
		t.Fatalf("sync pull help should not expose --wait flag:\n%s", help)
	}
	if !strings.Contains(help, "--dry-run") {
		t.Fatalf("sync pull help should keep --dry-run flag:\n%s", help)
	}
}

func TestSyncPullRequiresHyperlocaliseConfig(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	content := `{
	  "locales": {"source":"en","targets":["fr"]},
	  "buckets": {"json":{"files":[{"from":"lang/{{source}}.json","to":"lang/{{target}}.json"}]}},
	  "groups": {"default":{"targets":["fr"],"buckets":["json"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate"}}}
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"sync", "pull", "--config", configPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected sync pull error without hyperlocalise config")
	}
	if !strings.Contains(err.Error(), "hyperlocalise config is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHyperlocalisePullTimeoutIncludesPendingJobDetails(t *testing.T) {
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "jobs.json")
	manifest := hyperlocaliseSyncManifest{
		Version:     hyperlocaliseManifestVersion,
		Complete:    true,
		GeneratedAt: time.Now().UTC(),
		ProjectID:   "project-1",
		Jobs: []hyperlocaliseManifestJob{{
			JobID:         "job-1",
			SourcePath:    "locales/en.json",
			TargetLocales: []string{"fr-FR", "de-DE"},
			TargetPaths: map[string]string{
				"fr-FR": "locales/fr-FR.json",
				"de-DE": "locales/de-DE.json",
			},
		}, {
			JobID:         "job-2",
			SourcePath:    "content/en.json",
			TargetLocales: []string{"fr-FR"},
			TargetPaths: map[string]string{
				"fr-FR": "content/fr-FR.json",
			},
		}},
	}
	if err := writeHyperlocaliseManifest(manifestPath, manifest); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/jobs/job-1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"job":{"id":"job-1","status":"queued"}}`))
	}))
	defer server.Close()

	rt := &hyperlocaliseSyncRuntime{
		projectID:    "project-1",
		manifestPath: manifestPath,
		timeout:      time.Nanosecond,
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	_, err := runHyperlocalisePull(
		context.Background(),
		rt,
		syncCommonOptions{},
		time.Nanosecond,
	)
	if err == nil {
		t.Fatalf("expected timeout error")
	}
	got := err.Error()
	for _, want := range []string{
		"timed out waiting for hyperlocalise jobs",
		"job_id=job-1",
		"source_path=locales/en.json",
		"target_locales=fr-FR,de-DE",
		"status=queued",
		"job_id=job-2",
		"source_path=content/en.json",
		"target_locales=fr-FR",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("timeout error = %q, want %q", got, want)
		}
	}
}
