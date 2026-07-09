package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestHyperlocaliseDownloadTranslationExportRejectsOversizedResponse(t *testing.T) {
	oldMaxDownloadBytes := hyperlocaliseMaxDownloadBytes
	hyperlocaliseMaxDownloadBytes = 5
	t.Cleanup(func() {
		hyperlocaliseMaxDownloadBytes = oldMaxDownloadBytes
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("123456"))
	}))
	t.Cleanup(server.Close)

	client := &hyperlocaliseAPIClient{
		apiKey:     "test-key",
		baseURL:    server.URL,
		httpClient: server.Client(),
	}

	content, err := client.downloadTranslationExport(context.Background(), "project-1", "locales/en.json", "fr")
	if err == nil {
		t.Fatalf("expected oversized download error")
	}
	if content != nil {
		t.Fatalf("content = %q, want nil on oversized response", string(content))
	}
	if !strings.Contains(err.Error(), "exceeds maximum size of 5 bytes") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHyperlocalisePushUploadsSourceFileMultipart(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	sourceContent := `{"hello":"Hello"}`
	writePushSourceFile(t, "locales/en.json", sourceContent)
	t.Setenv("GITHUB_SHA", "commit-123")
	t.Setenv("GITHUB_RUN_ID", "run-456")

	expectedHash := fmt.Sprintf("%x", sha256.Sum256([]byte(sourceContent)))
	var requestedUpload atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("x-api-key"); got != "test-key" {
			t.Fatalf("x-api-key = %q, want test-key", got)
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatalf("parse multipart form: %v", err)
		}
		requestedUpload.Store(true)
		if got := r.FormValue("projectId"); got != "project-1" {
			t.Fatalf("projectId = %q, want project-1", got)
		}
		if got := r.FormValue("sourcePath"); got != "locales/en.json" {
			t.Fatalf("sourcePath = %q, want locales/en.json", got)
		}
		if got := r.FormValue("sourceHash"); got != expectedHash {
			t.Fatalf("sourceHash = %q, want %q", got, expectedHash)
		}
		if got := r.FormValue("commitSha"); got != "commit-123" {
			t.Fatalf("commitSha = %q, want commit-123", got)
		}
		if got := r.FormValue("workflowRunId"); got != "run-456" {
			t.Fatalf("workflowRunId = %q, want run-456", got)
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("file part: %v", err)
		}
		defer func() { _ = file.Close() }()
		if header.Filename != "en.json" {
			t.Fatalf("filename = %q, want en.json", header.Filename)
		}
		content, err := io.ReadAll(file)
		if err != nil {
			t.Fatalf("read file part: %v", err)
		}
		if string(content) != sourceContent {
			t.Fatalf("file content = %q, want %q", string(content), sourceContent)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"file":{"id":"file-1"}}`))
	}))
	t.Cleanup(server.Close)

	rt := newHyperlocalisePushTestRuntime(server, nil)

	report, err := runHyperlocalisePush(context.Background(), rt, syncCommonOptions{})
	if err != nil {
		t.Fatalf("push source file: %v", err)
	}
	if !requestedUpload.Load() {
		t.Fatalf("expected sync push to upload source file")
	}
	if !report.Complete || report.PlannedFiles != 1 || report.UploadedFiles != 1 || report.FailedItems != 0 {
		t.Fatalf("report = %#v, want one complete upload", report)
	}
}

func TestHyperlocalisePushDryRunPlansGlobSourcePaths(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writePushSourceFile(t, "docs/getting-started/quickstart.mdx", "# Quickstart")
	writePushSourceFile(t, "docs/zh-CN/getting-started/quickstart.mdx", "# 快速开始")

	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		t.Fail()
	}))
	t.Cleanup(server.Close)

	rt := &hyperlocaliseSyncRuntime{
		cfg: &config.I18NConfig{
			Locales: config.LocaleConfig{
				Source:  "en-US",
				Targets: []string{"zh-CN"},
			},
			Buckets: map[string]config.BucketConfig{
				"docs": {
					Files: []config.BucketFileMapping{{
						From: "docs/**/*.mdx",
						To:   "docs/{{localeDir}}/**/*.mdx",
					}},
				},
			},
		},
		projectID: "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}

	report, err := runHyperlocalisePush(context.Background(), rt, syncCommonOptions{dryRun: true})
	if err != nil {
		t.Fatalf("dry-run push with glob sources: %v", err)
	}
	if requestCount.Load() != 0 {
		t.Fatalf("requestCount = %d, want no upload requests", requestCount.Load())
	}
	if !report.Complete || !report.DryRun || report.PlannedFiles != 1 || report.UploadedFiles != 1 {
		t.Fatalf("report = %#v, want one complete dry-run plan for English docs source", report)
	}
}

func TestPlanHyperlocaliseFilesExpandsBlogMarkdownGlob(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writePushSourceFile(t, "_posts/en/what-is-translation-intelligence.md", "# What is translation intelligence")
	writePushSourceFile(t, "_posts/en/how-to-add-ai-translation.md", "# How to add AI translation")
	writePushSourceFile(t, "_posts/zh-CN/what-is-translation-intelligence.md", "# 什么是翻译智能")

	cfg := &config.I18NConfig{
		Locales: config.LocaleConfig{
			Source:  "en-US",
			Targets: []string{"zh-CN", "de-DE"},
		},
		Buckets: map[string]config.BucketConfig{
			"blog": {
				Files: []config.BucketFileMapping{{
					From: "_posts/en/**/*.md",
					To:   "_posts/{{target}}/**/*.md",
				}},
			},
		},
	}

	plans, err := planHyperlocaliseFiles(cfg, nil)
	if err != nil {
		t.Fatalf("planHyperlocaliseFiles: %v", err)
	}
	if len(plans) != 2 {
		t.Fatalf("len(plans) = %d, want 2 expanded English markdown sources", len(plans))
	}

	bySource := make(map[string]hyperlocaliseFilePlan, len(plans))
	for _, plan := range plans {
		if strings.Contains(plan.SourcePath, "*") {
			t.Fatalf("source path still contains glob tokens: %q", plan.SourcePath)
		}
		if plan.SourceHash == "" {
			t.Fatalf("source hash empty for %q", plan.SourcePath)
		}
		if plan.FileFormat != "markdown" {
			t.Fatalf("fileFormat = %q, want markdown for %q", plan.FileFormat, plan.SourcePath)
		}
		bySource[filepath.ToSlash(plan.SourcePath)] = plan
	}

	first, ok := bySource["_posts/en/how-to-add-ai-translation.md"]
	if !ok {
		t.Fatalf("missing plan for _posts/en/how-to-add-ai-translation.md, got %#v", bySource)
	}
	if got := filepath.ToSlash(first.TargetPaths["zh-CN"]); got != "_posts/zh-CN/how-to-add-ai-translation.md" {
		t.Fatalf("zh-CN target = %q, want _posts/zh-CN/how-to-add-ai-translation.md", got)
	}
	if got := filepath.ToSlash(first.TargetPaths["de-DE"]); got != "_posts/de-DE/how-to-add-ai-translation.md" {
		t.Fatalf("de-DE target = %q, want _posts/de-DE/how-to-add-ai-translation.md", got)
	}

	second, ok := bySource["_posts/en/what-is-translation-intelligence.md"]
	if !ok {
		t.Fatalf("missing plan for _posts/en/what-is-translation-intelligence.md, got %#v", bySource)
	}
	if got := filepath.ToSlash(second.TargetPaths["zh-CN"]); got != "_posts/zh-CN/what-is-translation-intelligence.md" {
		t.Fatalf("zh-CN target = %q, want _posts/zh-CN/what-is-translation-intelligence.md", got)
	}
}

func TestHyperlocalisePushDryRunPlansWithoutUploading(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writePushSourceFile(t, "locales/en.json", `{"hello":"Hello"}`)

	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		t.Fail()
	}))
	t.Cleanup(server.Close)

	rt := newHyperlocalisePushTestRuntime(server, nil)

	report, err := runHyperlocalisePush(context.Background(), rt, syncCommonOptions{dryRun: true})
	if err != nil {
		t.Fatalf("dry-run push: %v", err)
	}
	if requestCount.Load() != 0 {
		t.Fatalf("requestCount = %d, want no upload requests", requestCount.Load())
	}
	if !report.Complete || !report.DryRun || report.PlannedFiles != 1 || report.UploadedFiles != 1 || report.FailedItems != 0 {
		t.Fatalf("report = %#v, want complete dry-run plan", report)
	}
}

func TestHyperlocalisePushReportsPartialUploadFailure(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writePushSourceFile(t, "locales/en.json", `{"hello":"Hello"}`)
	writePushSourceFile(t, "marketing/en.md", "# Hello")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatalf("parse multipart form: %v", err)
		}
		if got := r.FormValue("projectId"); got != "project-1" {
			t.Fatalf("projectId = %q, want project-1", got)
		}
		switch sourcePath := r.FormValue("sourcePath"); sourcePath {
		case "locales/en.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"file":{"id":"file-json"}}`))
		case "marketing/en.md":
			http.Error(w, "upload failed", http.StatusInternalServerError)
		default:
			t.Fatalf("unexpected sourcePath: %s", sourcePath)
		}
	}))
	t.Cleanup(server.Close)

	rt := newHyperlocalisePushTestRuntime(server, []config.BucketFileMapping{{
		From: "marketing/{{source}}.md",
		To:   "marketing/{{target}}.md",
	}})

	report, err := runHyperlocalisePush(context.Background(), rt, syncCommonOptions{})
	if err == nil {
		t.Fatalf("expected partial upload failure")
	}
	if !strings.Contains(err.Error(), "hyperlocalise push failed for 1 item(s)") {
		t.Fatalf("error = %v, want failed item count", err)
	}
	if !strings.Contains(err.Error(), "marketing/en.md") {
		t.Fatalf("error = %v, want failed source path", err)
	}
	if report.Complete || report.PlannedFiles != 2 || report.UploadedFiles != 1 || report.FailedItems != 1 {
		t.Fatalf("report = %#v, want one upload and one failed item", report)
	}
}

func TestHyperlocalisePullReconstructsMarkdownExport(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	sourceMarkdown := "# Hello\n\nWorld.\n"
	writePushSourceFile(t, "_posts/en/hello.md", sourceMarkdown)

	entries, err := (translationfileparser.MarkdownParser{}).Parse([]byte(sourceMarkdown))
	if err != nil {
		t.Fatalf("parse markdown source: %v", err)
	}
	prefilled := map[string]string{}
	for key, value := range entries {
		prefilled[key] = strings.ReplaceAll(value, "World", "Welt")
	}
	prefilledJSON, err := json.Marshal(prefilled)
	if err != nil {
		t.Fatalf("marshal prefilled entries: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("sourcePath"); got != "_posts/en/hello.md" {
			t.Fatalf("sourcePath = %q, want _posts/en/hello.md", got)
		}
		if got := r.URL.Query().Get("locale"); got != "de-DE" {
			t.Fatalf("locale = %q, want de-DE", got)
		}
		_, _ = w.Write(prefilledJSON)
	}))
	t.Cleanup(server.Close)

	rt := &hyperlocaliseSyncRuntime{
		cfg: &config.I18NConfig{
			Locales: config.LocaleConfig{
				Source:  "en-US",
				Targets: []string{"de-DE"},
			},
			Buckets: map[string]config.BucketConfig{
				"blog": {
					Files: []config.BucketFileMapping{{
						From: "_posts/en/**/*.md",
						To:   "_posts/{{target}}/**/*.md",
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
		t.Fatalf("pull markdown export: %v", err)
	}
	if report.Downloaded != 1 {
		t.Fatalf("report = %#v, want one downloaded export", report)
	}

	targetContent, err := os.ReadFile("_posts/de-DE/hello.md")
	if err != nil {
		t.Fatalf("read markdown target: %v", err)
	}
	if strings.Contains(string(targetContent), `"md.`) {
		t.Fatalf("target should be markdown, got JSON-like content: %q", string(targetContent))
	}
	if !strings.Contains(string(targetContent), "Welt") {
		t.Fatalf("target content = %q, want translated markdown body", string(targetContent))
	}
	if !strings.HasPrefix(string(targetContent), "# Hello") {
		t.Fatalf("target content = %q, want markdown heading preserved", string(targetContent))
	}
}

func newHyperlocalisePushTestRuntime(server *httptest.Server, extraFiles []config.BucketFileMapping) *hyperlocaliseSyncRuntime {
	files := []config.BucketFileMapping{{
		From: "locales/{{source}}.json",
		To:   "locales/{{target}}.json",
	}}
	files = append(files, extraFiles...)

	return &hyperlocaliseSyncRuntime{
		cfg: &config.I18NConfig{
			Locales: config.LocaleConfig{
				Source:  "en",
				Targets: []string{"fr"},
			},
			Buckets: map[string]config.BucketConfig{
				"source": {
					Files: files,
				},
			},
		},
		projectID: "project-1",
		client: &hyperlocaliseAPIClient{
			baseURL:    server.URL,
			apiKey:     "test-key",
			httpClient: server.Client(),
		},
	}
}

func writePushSourceFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
}
