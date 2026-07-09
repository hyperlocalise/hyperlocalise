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

func TestHyperlocalisePullReconstructsNativeFormats(t *testing.T) {
	cases := []struct {
		name          string
		sourceLocale  string
		targetLocale  string
		sourcePath    string
		targetPath    string
		fromPattern   string
		toPattern     string
		sourceContent string
		translate     func(key, value string) string
		assertNative  func(t *testing.T, content string)
	}{
		{
			name:         "markdown",
			sourceLocale: "en-US",
			targetLocale: "de-DE",
			sourcePath:   "_posts/en/hello.md",
			targetPath:   "_posts/de-DE/hello.md",
			fromPattern:  "_posts/en/**/*.md",
			toPattern:    "_posts/{{target}}/**/*.md",
			sourceContent: "# Hello\n\nWorld.\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "World", "Welt")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if strings.Contains(content, `"md.`) {
					t.Fatalf("target should be markdown, got JSON-like content: %q", content)
				}
				if !strings.Contains(content, "Welt") || !strings.HasPrefix(content, "# Hello") {
					t.Fatalf("target content = %q, want translated markdown", content)
				}
			},
		},
		{
			name:         "json",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "locales/en.json",
			targetPath:   "locales/fr.json",
			fromPattern:  "locales/{{source}}.json",
			toPattern:    "locales/{{target}}.json",
			sourceContent: `{"hello":"Hello","bye":"Bye"}`,
			translate: func(key, value string) string {
				switch key {
				case "hello":
					return "Bonjour"
				case "bye":
					return "Au revoir"
				default:
					return value
				}
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, `"hello": "Bonjour"`) || !strings.Contains(content, `"bye": "Au revoir"`) {
					t.Fatalf("target content = %q, want reconstructed JSON locale file", content)
				}
			},
		},
		{
			name:         "arb",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "lib/l10n/app_en.arb",
			targetPath:   "lib/l10n/app_fr.arb",
			fromPattern:  "lib/l10n/app_{{source}}.arb",
			toPattern:    "lib/l10n/app_{{target}}.arb",
			sourceContent: `{"@@locale":"en","hello":"Hello","@hello":{"description":"Greeting"}}`,
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, `"hello": "Bonjour"`) {
					t.Fatalf("target content = %q, want translated ARB entry", content)
				}
				if strings.Contains(content, `"md.`) {
					t.Fatalf("target should be ARB, got segment JSON: %q", content)
				}
			},
		},
		{
			name:         "po",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "locales/messages.po",
			targetPath:   "locales/messages.fr.po",
			fromPattern:  "locales/messages.po",
			toPattern:    "locales/messages.{{target}}.po",
			sourceContent: "msgid \"hello\"\nmsgstr \"Hello\"\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, `msgstr "Bonjour"`) {
					t.Fatalf("target content = %q, want translated PO msgstr", content)
				}
				if strings.Contains(content, `"md.`) {
					t.Fatalf("target should be PO, got segment JSON: %q", content)
				}
			},
		},
		{
			name:         "html",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "public/page.html",
			targetPath:   "public/page.fr.html",
			fromPattern:  "public/page.html",
			toPattern:    "public/page.{{target}}.html",
			sourceContent: "<!DOCTYPE html><html><body><p>Hello</p></body></html>",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, ">Bonjour<") {
					t.Fatalf("target content = %q, want translated HTML body", content)
				}
				if strings.Contains(content, `"md.`) {
					t.Fatalf("target should be HTML, got segment JSON: %q", content)
				}
			},
		},
		{
			name:         "fluent",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "locales/en.ftl",
			targetPath:   "locales/fr.ftl",
			fromPattern:  "locales/{{source}}.ftl",
			toPattern:    "locales/{{target}}.ftl",
			sourceContent: "hello = Hello\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, "hello = Bonjour") {
					t.Fatalf("target content = %q, want translated Fluent message", content)
				}
			},
		},
		{
			name:         "properties",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "locales/messages_en.properties",
			targetPath:   "locales/messages_fr.properties",
			fromPattern:  "locales/messages_{{source}}.properties",
			toPattern:    "locales/messages_{{target}}.properties",
			sourceContent: "hello=Hello\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, "hello=Bonjour") {
					t.Fatalf("target content = %q, want translated Java properties entry", content)
				}
			},
		},
		{
			name:         "strings",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "ios/en.lproj/Localizable.strings",
			targetPath:   "ios/fr.lproj/Localizable.strings",
			fromPattern:  "ios/{{source}}.lproj/Localizable.strings",
			toPattern:    "ios/{{target}}.lproj/Localizable.strings",
			sourceContent: "\"hello\" = \"Hello\";\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, `"hello" = "Bonjour"`) {
					t.Fatalf("target content = %q, want translated Apple strings entry", content)
				}
			},
		},
		{
			name:         "mdx",
			sourceLocale: "en",
			targetLocale: "fr-FR",
			sourcePath:   "docs/en/guide.mdx",
			targetPath:   "docs/fr-FR/guide.mdx",
			fromPattern:  "docs/en/**/*.mdx",
			toPattern:    "docs/{{target}}/**/*.mdx",
			sourceContent: "# Guide\n\nWelcome.\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Welcome", "Bienvenue")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if strings.Contains(content, `"md.`) {
					t.Fatalf("target should be MDX, got JSON-like content: %q", content)
				}
				if !strings.Contains(content, "Bienvenue") || !strings.HasPrefix(content, "# Guide") {
					t.Fatalf("target content = %q, want translated MDX", content)
				}
			},
		},
		{
			name:         "xliff",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "locales/messages.xlf",
			targetPath:   "locales/messages.fr.xlf",
			fromPattern:  "locales/messages.xlf",
			toPattern:    "locales/messages.{{target}}.xlf",
			sourceContent: `<?xml version="1.0" encoding="UTF-8"?><xliff version="1.2"><file source-language="en" target-language="en"><body><trans-unit id="hello"><source>Hello</source><target>Hello</target></trans-unit></body></file></xliff>`,
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, "<target>Bonjour</target>") {
					t.Fatalf("target content = %q, want translated XLIFF target", content)
				}
				if strings.Contains(content, `"md.`) {
					t.Fatalf("target should be XLIFF, got segment JSON: %q", content)
				}
			},
		},
		{
			name:         "csv",
			sourceLocale: "en",
			targetLocale: "fr",
			sourcePath:   "locales/messages.csv",
			targetPath:   "locales/messages.fr.csv",
			fromPattern:  "locales/messages.csv",
			toPattern:    "locales/messages.{{target}}.csv",
			sourceContent: "key,value\nhello,Hello\n",
			translate: func(_, value string) string {
				return strings.ReplaceAll(value, "Hello", "Bonjour")
			},
			assertNative: func(t *testing.T, content string) {
				t.Helper()
				if !strings.Contains(content, "hello,Bonjour") {
					t.Fatalf("target content = %q, want translated CSV row", content)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			runHyperlocalisePullReconstructCase(t, tc)
		})
	}
}

type hyperlocalisePullReconstructCase struct {
	name          string
	sourceLocale  string
	targetLocale  string
	sourcePath    string
	targetPath    string
	fromPattern   string
	toPattern     string
	sourceContent string
	translate     func(key, value string) string
	assertNative  func(t *testing.T, content string)
}

func runHyperlocalisePullReconstructCase(t *testing.T, tc hyperlocalisePullReconstructCase) {
	t.Helper()

	dir := t.TempDir()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir project dir: %v", err)
	}

	writePullSourceFile(t, filepath.FromSlash(tc.sourcePath), tc.sourceContent)

	strategy := translationfileparser.NewDefaultStrategy()
	entries, err := strategy.Parse(tc.sourcePath, []byte(tc.sourceContent))
	if err != nil {
		t.Fatalf("parse %s source: %v", tc.name, err)
	}
	prefilled := make(map[string]string, len(entries))
	for key, value := range entries {
		prefilled[key] = tc.translate(key, value)
	}
	prefilledJSON, err := json.Marshal(prefilled)
	if err != nil {
		t.Fatalf("marshal prefilled entries: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v1/projects/project-1/translations/download") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("sourcePath"); got != filepath.ToSlash(tc.sourcePath) {
			t.Fatalf("sourcePath = %q, want %q", got, tc.sourcePath)
		}
		if got := r.URL.Query().Get("locale"); got != tc.targetLocale {
			t.Fatalf("locale = %q, want %q", got, tc.targetLocale)
		}
		_, _ = w.Write(prefilledJSON)
	}))
	t.Cleanup(server.Close)

	rt := &hyperlocaliseSyncRuntime{
		cfg: &config.I18NConfig{
			Locales: config.LocaleConfig{
				Source:  tc.sourceLocale,
				Targets: []string{tc.targetLocale},
			},
			Buckets: map[string]config.BucketConfig{
				tc.name: {
					Files: []config.BucketFileMapping{{
						From: tc.fromPattern,
						To:   tc.toPattern,
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
		t.Fatalf("pull %s export: %v", tc.name, err)
	}
	if report.Downloaded != 1 {
		t.Fatalf("report = %#v, want one downloaded export", report)
	}

	targetContent, err := os.ReadFile(filepath.FromSlash(tc.targetPath))
	if err != nil {
		t.Fatalf("read %s target: %v", tc.name, err)
	}
	tc.assertNative(t, string(targetContent))
}

func writePullSourceFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
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
