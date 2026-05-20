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

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
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

func TestHyperlocalisePullUsesLatestCompletedJobForSourcePath(t *testing.T) {
	dir := t.TempDir()
	targetPattern := filepath.Join(dir, "locales", "{{target}}.json")
	targetPath := filepath.Join(dir, "locales", "fr.json")
	requestedLatest := false
	requestedJobByID := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/jobs/latest":
			requestedLatest = true
			if got := r.URL.Query().Get("projectId"); got != "project-1" {
				t.Fatalf("projectId query = %q, want project-1", got)
			}
			if got := r.URL.Query().Get("sourcePath"); got != "locales/en.json" {
				t.Fatalf("sourcePath query = %q, want locales/en.json", got)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"job":{"id":"job-previous","status":"succeeded","outputFiles":[{"fileId":"file-fr","locale":"fr","filename":"fr.json"}]}}`))
		case "/v1/files/file-fr/download":
			_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
		default:
			if strings.HasPrefix(r.URL.Path, "/v1/jobs/job-") {
				requestedJobByID = true
			}
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	rt := &hyperlocaliseSyncRuntime{
		cfg: &config.I18NConfig{
			Locales: config.LocaleConfig{
				Source:  "en",
				Targets: []string{"fr"},
			},
			Buckets: map[string]config.BucketConfig{
				"json": {
					Files: []config.BucketFileMapping{{
						From: "locales/{{source}}.json",
						To:   targetPattern,
					}},
				},
			},
		},
		projectID:    "project-1",
		manifestPath: filepath.Join(dir, "unused-jobs.json"),
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePull(
		context.Background(),
		rt,
		syncCommonOptions{},
		0,
	)
	if err != nil {
		t.Fatalf("pull latest completed job: %v", err)
	}
	if !requestedLatest {
		t.Fatalf("expected sync pull to request latest completed job")
	}
	if requestedJobByID {
		t.Fatalf("sync pull should not request manifest job IDs")
	}
	if report.Jobs != 1 || report.Downloaded != 1 || report.Skipped != 0 {
		t.Fatalf("report = %#v, want one downloaded job output", report)
	}
	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != `{"hello":"Bonjour"}` {
		t.Fatalf("target content = %q", string(content))
	}
}

func TestParseHyperlocaliseFileOutcomeUsesPublicOutputFiles(t *testing.T) {
	outcome, err := parseHyperlocaliseFileOutcome(hyperlocaliseJob{
		ID: "job-1",
		OutputFiles: jsonRaw(`[
			{"fileId":"file-fr","locale":"fr-FR","filename":"messages.fr-FR.json"}
		]`),
	})
	if err != nil {
		t.Fatalf("parse outcome: %v", err)
	}

	if len(outcome.OutputFiles) != 1 {
		t.Fatalf("output files = %d, want 1", len(outcome.OutputFiles))
	}
	got := outcome.OutputFiles[0]
	if got.FileID != "file-fr" || got.Locale != "fr-FR" || got.Filename != "messages.fr-FR.json" {
		t.Fatalf("output file = %#v", got)
	}
}

func TestParseHyperlocaliseFileOutcomeReportsMissingPayload(t *testing.T) {
	_, err := parseHyperlocaliseFileOutcome(hyperlocaliseJob{ID: "job-1"})
	if err == nil {
		t.Fatalf("expected missing payload error")
	}
	if !strings.Contains(err.Error(), "job-1 has no output payload") {
		t.Fatalf("error = %q", err)
	}
}

func TestParseHyperlocaliseFileOutcomeReportsEmptyOutputFiles(t *testing.T) {
	_, err := parseHyperlocaliseFileOutcome(hyperlocaliseJob{
		ID:             "job-1",
		OutcomePayload: jsonRaw(`{"outputFiles":[]}`),
	})
	if err == nil {
		t.Fatalf("expected empty output files error")
	}
	if !strings.Contains(err.Error(), "job-1 has no output files") {
		t.Fatalf("error = %q", err)
	}
}

func TestParseHyperlocaliseFileOutcomeReportsMalformedOutputPayload(t *testing.T) {
	_, err := parseHyperlocaliseFileOutcome(hyperlocaliseJob{
		ID:             "job-1",
		OutcomePayload: jsonRaw(`{"outputFiles":[{"fileId":"file-fr","locale":"fr-FR"}]}`),
	})
	if err == nil {
		t.Fatalf("expected malformed output payload error")
	}
	if !strings.Contains(err.Error(), "output file 1 is missing filename") {
		t.Fatalf("error = %q", err)
	}
}

func jsonRaw(value string) []byte {
	return []byte(value)
}
