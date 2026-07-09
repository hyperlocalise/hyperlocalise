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

func TestSyncPullHelpDoesNotExposeManifestFlag(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"sync", "pull", "--help"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("sync pull help: %v", err)
	}
	help := out.String()
	if strings.Contains(help, "--manifest") {
		t.Fatalf("sync pull help should not expose --manifest flag:\n%s", help)
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

func TestHyperlocaliseSyncRecognizesFluentFiles(t *testing.T) {
	if got := inferHyperlocaliseFileFormat("locales/en.ftl"); got != "fluent" {
		t.Fatalf("inferHyperlocaliseFileFormat(.ftl) = %q, want fluent", got)
	}
	if got := contentTypeForPath("locales/en.ftl"); got != "text/plain" {
		t.Fatalf("contentTypeForPath(.ftl) = %q, want text/plain", got)
	}
}

func TestHyperlocalisePullDownloadsTranslationExports(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "locales", "en.json")
	targetPattern := filepath.Join(dir, "locales", "{{target}}.json")
	targetPath := filepath.Join(dir, "locales", "fr.json")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	requestedExport := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		requestedExport = true
		if got := r.URL.Query().Get("sourcePath"); got != "locales/en.json" {
			t.Fatalf("sourcePath = %q, want locales/en.json", got)
		}
		if got := r.URL.Query().Get("locale"); got != "fr" {
			t.Fatalf("locale = %q, want fr", got)
		}
		_, _ = w.Write([]byte("{\n  \"hello\": \"Bonjour\"\n}\n"))
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
		configRoot: dir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePull(context.Background(), rt, syncCommonOptions{})
	if err != nil {
		t.Fatalf("pull translation export: %v", err)
	}
	if !requestedExport {
		t.Fatalf("expected sync pull to request translation export download")
	}
	if report.PlannedFiles != 1 || report.Downloaded != 1 {
		t.Fatalf("report = %#v, want one downloaded export", report)
	}
	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != "{\n  \"hello\": \"Bonjour\"\n}\n" {
		t.Fatalf("target content = %q, want reconstructed JSON locale file", string(content))
	}
}

func TestHyperlocalisePullWritesEmptyExport(t *testing.T) {
	dir := t.TempDir()
	targetPattern := filepath.Join(dir, "locales", "{{target}}.json")
	targetPath := filepath.Join(dir, "locales", "fr.json")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir target dir: %v", err)
	}
	sourcePath := filepath.Join(dir, "locales", "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			_, _ = w.Write([]byte("{}\n"))
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
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
		configRoot: dir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePull(context.Background(), rt, syncCommonOptions{})
	if err != nil {
		t.Fatalf("pull empty export: %v", err)
	}
	if report.Downloaded != 1 {
		t.Fatalf("report = %#v, want one downloaded export", report)
	}

	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != "{}\n" {
		t.Fatalf("target content = %q, want empty export written as-is", string(content))
	}
}

func TestHyperlocalisePullFallsBackToExportWithoutLocalSource(t *testing.T) {
	dir := t.TempDir()
	targetPattern := filepath.Join(dir, "locales", "{{target}}.json")
	targetPath := filepath.Join(dir, "locales", "fr.json")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir target dir: %v", err)
	}

	exportBody := []byte("{\n  \"hello\": \"Bonjour\"\n}\n")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			_, _ = w.Write(exportBody)
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
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
		configRoot: dir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePull(context.Background(), rt, syncCommonOptions{})
	if err != nil {
		t.Fatalf("pull without local source: %v", err)
	}
	if report.Downloaded != 1 {
		t.Fatalf("report = %#v, want one downloaded export", report)
	}

	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != string(exportBody) {
		t.Fatalf("target content = %q, want downloaded export fallback", string(content))
	}
}

func TestHyperlocalisePullSkipsMissingTranslationExport(t *testing.T) {
	dir := t.TempDir()
	targetPattern := filepath.Join(dir, "locales", "{{target}}.json")
	targetPath := filepath.Join(dir, "locales", "fr.json")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir target dir: %v", err)
	}
	existingContent := []byte(`{"hello":"Existing"}`)
	if err := os.WriteFile(targetPath, existingContent, 0o644); err != nil {
		t.Fatalf("write existing target: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			http.NotFound(w, r)
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
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
		configRoot: dir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePull(context.Background(), rt, syncCommonOptions{})
	if err != nil {
		t.Fatalf("pull with missing export source: %v", err)
	}
	if report.Downloaded != 0 || report.Skipped != 1 {
		t.Fatalf("report = %#v, want skipped export without download", report)
	}
	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != string(existingContent) {
		t.Fatalf("target content = %q, want existing file preserved", string(content))
	}
}

func TestHyperlocalisePullResolvesRelativeTargetAgainstConfigRoot(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	projectDir := t.TempDir()
	otherCWD := t.TempDir()
	if err := os.MkdirAll(filepath.Join(projectDir, "locales"), 0o755); err != nil {
		t.Fatalf("mkdir locales: %v", err)
	}
	sourcePath := filepath.Join(projectDir, "locales", "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.Chdir(otherCWD); err != nil {
		t.Fatalf("chdir away from project: %v", err)
	}

	relativeTarget := filepath.Join("locales", "fr.json")
	writtenPath := filepath.Join(projectDir, relativeTarget)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
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
						To:   "locales/{{target}}.json",
					}},
				},
			},
		},
		configRoot: projectDir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePull(context.Background(), rt, syncCommonOptions{})
	if err != nil {
		t.Fatalf("pull with relative target: %v", err)
	}
	if report.Downloaded != 1 {
		t.Fatalf("report = %#v, want one downloaded file", report)
	}
	content, err := os.ReadFile(writtenPath)
	if err != nil {
		t.Fatalf("read resolved target: %v", err)
	}
	if string(content) != "{\n  \"hello\": \"Bonjour\"\n}\n" {
		t.Fatalf("target content = %q, want reconstructed JSON locale file", string(content))
	}
}

func TestHyperlocalisePullRejectsTargetOutsideConfigRoot(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	outsideTarget := filepath.Join(outside, "fr.json")

	rt := &hyperlocaliseSyncRuntime{
		configRoot: dir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    "http://example.invalid",
			apiKey:     "test-key",
			httpClient: &http.Client{},
		},
	}

	_, err := rt.resolveTargetPath(outsideTarget)
	if err == nil {
		t.Fatalf("expected target path outside config root to be rejected")
	}
	if !strings.Contains(err.Error(), "escapes root") {
		t.Fatalf("error = %v, want root escape rejection", err)
	}
}

func TestHyperlocalisePullReportMarksIncompleteOnFailure(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	outsideTarget := filepath.Join(outside, "fr.json")

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
						To:   outsideTarget,
					}},
				},
			},
		},
		configRoot: dir,
		projectID:  "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    "http://example.invalid",
			apiKey:     "test-key",
			httpClient: &http.Client{},
		},
	}

	report, err := runHyperlocalisePull(context.Background(), rt, syncCommonOptions{})
	if err == nil {
		t.Fatalf("expected pull to fail")
	}
	if report.Complete {
		t.Fatalf("report.Complete = true, want false on failure")
	}
}
