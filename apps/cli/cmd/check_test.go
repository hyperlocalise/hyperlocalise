package cmd

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func TestCheckCommandNoFindings(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "strings.json")
	targetPath := filepath.Join(dir, "dist", "fr", "strings.json")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello {name}"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"hello":"Bonjour {name}"}`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}

	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"check", "--config", configPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("check command without findings: %v", err)
	}
	if !strings.Contains(out.String(), "No findings.") {
		t.Fatalf("expected no-findings output, got %q", out.String())
	}
	if !strings.Contains(out.String(), "Checks: ") {
		t.Fatalf("expected checks header, got %q", out.String())
	}
}

func TestCheckCommandJSONReportIncludesDefaultFindings(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "strings.json")
	frTargetPath := filepath.Join(dir, "dist", "fr", "strings.json")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(frTargetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{
	  "hello": "Hello {name}",
	  "html": "<strong>Hello</strong>",
	  "same": "Keep me",
	  "icu": "{count, plural, one {# file} other {# files}}",
	  "trim": "Needs text"
	}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(frTargetPath, []byte(`{
	  "hello": "Bonjour",
	  "html": "<em>Bonjour</em>",
	  "same": "Keep me",
	  "icu": "{count, select, one {# file}}",
	  "trim": "   ",
	  "extra": "orphan"
	}`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}

	writeCheckConfig(t, configPath, sourcePath, filepath.Join(dir, "dist", "[locale]", "strings.json"), []string{"fr", "de"})

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"check", "--config", configPath, "--format", "json", "--no-fail"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("check command: %v", err)
	}

	var report checkReport
	if err := json.Unmarshal(out.Bytes(), &report); err != nil {
		t.Fatalf("parse json output: %v\noutput=%s", err, out.String())
	}
	if report.Summary.Total == 0 {
		t.Fatalf("expected findings, got none")
	}
	assertFindingType(t, report.Findings, checkMissingTargetFile)
	assertFindingType(t, report.Findings, checkNotLocalized)
	assertFindingType(t, report.Findings, checkOrphanedKey)
	assertFindingType(t, report.Findings, checkPlaceholder)
	assertFindingType(t, report.Findings, checkHTMLTag)
	assertFindingType(t, report.Findings, checkICUShape)
	if report.Summary.ByCheck[checkMissingTargetFile] != 1 {
		t.Fatalf("expected one missing target file finding, got %+v", report.Summary.ByCheck)
	}
	if report.Summary.BySeverity[checkSeverityError] == 0 {
		t.Fatalf("expected error severity counts, got %+v", report.Summary.BySeverity)
	}
	for _, finding := range report.Findings {
		if finding.Severity == "" {
			t.Fatalf("expected severity on finding: %+v", finding)
		}
		if finding.AnnotationFile == "" || finding.AnnotationLine == 0 {
			t.Fatalf("expected annotation location on finding: %+v", finding)
		}
	}
}

func TestCollectEntryCheckFindingsSkipsRedundantChecksForWhitespaceOnlyNotLocalizedValues(t *testing.T) {
	findings := collectEntryCheckFindings(
		&checkLocationResolver{},
		"ui",
		"fr",
		"source.json",
		"target.json",
		map[string]string{"html": "<strong>Hello</strong>"},
		map[string]string{"html": "   "},
		map[string]struct{}{
			checkNotLocalized:   {},
			checkWhitespaceOnly: {},
			checkHTMLTag:        {},
		},
	)

	if len(findings) != 1 {
		t.Fatalf("expected 1 finding, got %+v", findings)
	}
	if findings[0].Type != checkNotLocalized {
		t.Fatalf("expected %q finding, got %+v", checkNotLocalized, findings)
	}
}

func TestCheckCommandJSONOutputFileMatchesStdout(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "strings.json")
	targetPath := filepath.Join(dir, "dist", "fr", "strings.json")
	outputPath := filepath.Join(dir, "report.json")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}

	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"check", "--config", configPath, "--format", "json", "--no-fail", "--output-file", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("check command json output-file: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if got, want := string(content), out.String(); got != want {
		t.Fatalf("output file mismatch\n got: %s\nwant: %s", got, want)
	}
	var report checkReport
	if err := json.Unmarshal(content, &report); err != nil {
		t.Fatalf("parse output file json: %v", err)
	}
	assertFindingType(t, report.Findings, checkNotLocalized)
	if report.Findings[0].AnnotationLine == 0 || report.Findings[0].AnnotationFile == "" {
		t.Fatalf("expected annotation location in output file report: %+v", report.Findings[0])
	}
}

func TestCheckCommandWritesTextReportAndCanSkipFailure(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "strings.json")
	targetPath := filepath.Join(dir, "dist", "fr", "strings.json")
	reportPath := filepath.Join(dir, "report.txt")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}

	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"check", "--config", configPath, "--no-fail", "--output-file", reportPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("check command with no-fail: %v", err)
	}
	content, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("read report file: %v", err)
	}
	if got := string(content); !strings.Contains(got, "[not_localized]") {
		t.Fatalf("expected not_localized section, got %q", got)
	}
	if !strings.Contains(out.String(), "Summary: total=1") {
		t.Fatalf("expected summary in stdout, got %q", out.String())
	}
}

func TestCheckCommandFailsWithoutNoFailWhenFindingsExist(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "strings.json")
	targetPath := filepath.Join(dir, "dist", "fr", "strings.json")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}

	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"check", "--config", configPath})
	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected findings to fail command")
	}
	if !strings.Contains(err.Error(), errCheckFindings.Error()) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCheckCommandFiltersByBucketAndLocale(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	uiSourcePath := filepath.Join(dir, "content", "en", "ui.json")
	docsSourcePath := filepath.Join(dir, "content", "en", "docs.json")
	uiFrTargetPath := filepath.Join(dir, "dist", "fr", "ui.json")
	uiDeTargetPath := filepath.Join(dir, "dist", "de", "ui.json")
	docsFrTargetPath := filepath.Join(dir, "dist", "fr", "docs.json")
	docsDeTargetPath := filepath.Join(dir, "dist", "de", "docs.json")

	for _, path := range []string{uiSourcePath, docsSourcePath, uiFrTargetPath, uiDeTargetPath, docsFrTargetPath, docsDeTargetPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("create dir for %s: %v", path, err)
		}
	}
	if err := os.WriteFile(uiSourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write ui source: %v", err)
	}
	if err := os.WriteFile(docsSourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write docs source: %v", err)
	}
	if err := os.WriteFile(uiDeTargetPath, []byte(`{"hello":"Hallo"}`), 0o600); err != nil {
		t.Fatalf("write ui de target: %v", err)
	}
	if err := os.WriteFile(docsFrTargetPath, []byte(`{"hello":"Bonjour"}`), 0o600); err != nil {
		t.Fatalf("write docs fr target: %v", err)
	}
	if err := os.WriteFile(docsDeTargetPath, []byte(`{"hello":"Hallo"}`), 0o600); err != nil {
		t.Fatalf("write docs de target: %v", err)
	}

	content := `{
	  "locales": {"source":"en","targets":["fr","de"]},
	  "buckets": {
	    "ui":{"files":[{"from":"` + filepath.ToSlash(uiSourcePath) + `","to":"` + filepath.ToSlash(filepath.Join(dir, "dist", "[locale]", "ui.json")) + `"}]},
	    "docs":{"files":[{"from":"` + filepath.ToSlash(docsSourcePath) + `","to":"` + filepath.ToSlash(filepath.Join(dir, "dist", "[locale]", "docs.json")) + `"}]}
	  },
	  "groups": {"default":{"targets":["fr","de"],"buckets":["ui","docs"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"check", "--config", configPath, "--bucket", "ui", "--locale", "fr", "--check", checkMissingTargetFile, "--format", "json", "--no-fail"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("check command with filters: %v", err)
	}
	var report checkReport
	if err := json.Unmarshal(out.Bytes(), &report); err != nil {
		t.Fatalf("parse filtered json output: %v", err)
	}
	if report.Summary.Total != 1 {
		t.Fatalf("expected one finding, got %+v", report)
	}
	finding := report.Findings[0]
	if finding.Bucket != "ui" || finding.Locale != "fr" || finding.Type != checkMissingTargetFile {
		t.Fatalf("unexpected finding: %+v", finding)
	}
	if finding.AnnotationFile == "" || finding.AnnotationLine == 0 {
		t.Fatalf("expected annotation location: %+v", finding)
	}
}

func TestCheckCommandChecksMDXContent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "page.mdx")
	targetPath := filepath.Join(dir, "dist", "fr", "page.mdx")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`# Welcome

Hello {name}
`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`# Welcome

Bonjour
`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}

	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"check", "--config", configPath, "--format", "json", "--no-fail"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("check command mdx: %v", err)
	}

	var report checkReport
	if err := json.Unmarshal(out.Bytes(), &report); err != nil {
		t.Fatalf("parse mdx json output: %v\noutput=%s", err, out.String())
	}
	assertFindingType(t, report.Findings, checkNotLocalized)

	hasMDXFinding := false
	for _, finding := range report.Findings {
		if finding.SourceFile == sourcePath && finding.TargetFile == targetPath {
			hasMDXFinding = true
			break
		}
	}
	if !hasMDXFinding {
		t.Fatalf("expected mdx findings for source=%q target=%q, got %+v", sourcePath, targetPath, report.Findings)
	}
	for _, finding := range report.Findings {
		if finding.AnnotationFile == "" || finding.AnnotationLine == 0 {
			t.Fatalf("expected mdx annotation location: %+v", finding)
		}
	}
}

func TestCheckCommandMDXSkipsICUParityAndUsesASTParity(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	sourcePath := filepath.Join(dir, "content", "en", "page.mdx")
	targetPath := filepath.Join(dir, "dist", "fr", "page.mdx")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}

	t.Run("same markdown ast does not emit icu parity findings", func(t *testing.T) {
		if err := os.WriteFile(sourcePath, []byte(`# Welcome

Hello {name}
`), 0o600); err != nil {
			t.Fatalf("write source file: %v", err)
		}
		if err := os.WriteFile(targetPath, []byte(`# Bienvenue

Bonjour
`), 0o600); err != nil {
			t.Fatalf("write target file: %v", err)
		}
		writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

		cmd := newRootCmd("")
		out := bytes.NewBuffer(nil)
		cmd.SetOut(out)
		cmd.SetErr(out)
		cmd.SetArgs([]string{"check", "--config", configPath, "--check", checkICUShape, "--format", "json", "--no-fail"})

		if err := cmd.Execute(); err != nil {
			t.Fatalf("check command mdx same ast: %v", err)
		}
		var report checkReport
		if err := json.Unmarshal(out.Bytes(), &report); err != nil {
			t.Fatalf("parse json output: %v\noutput=%s", err, out.String())
		}
		if len(report.Findings) != 0 {
			t.Fatalf("expected no icu_shape findings for mdx ast match, got %+v", report.Findings)
		}
	})

	t.Run("ast drift emits icu_shape finding with annotation", func(t *testing.T) {
		if err := os.WriteFile(sourcePath, []byte(`# Welcome

Hello world.
`), 0o600); err != nil {
			t.Fatalf("write source file: %v", err)
		}
		if err := os.WriteFile(targetPath, []byte(`Bonjour monde.
`), 0o600); err != nil {
			t.Fatalf("write target file: %v", err)
		}
		writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr"})

		cmd := newRootCmd("")
		out := bytes.NewBuffer(nil)
		cmd.SetOut(out)
		cmd.SetErr(out)
		cmd.SetArgs([]string{"check", "--config", configPath, "--check", checkICUShape, "--format", "json", "--no-fail"})

		if err := cmd.Execute(); err != nil {
			t.Fatalf("check command mdx ast drift: %v", err)
		}
		var report checkReport
		if err := json.Unmarshal(out.Bytes(), &report); err != nil {
			t.Fatalf("parse json output: %v\noutput=%s", err, out.String())
		}
		if len(report.Findings) == 0 {
			t.Fatalf("expected ast parity finding")
		}
		if report.Findings[0].Type != checkICUShape || !strings.Contains(report.Findings[0].Message, "markdown AST parity mismatch") {
			t.Fatalf("unexpected finding: %+v", report.Findings[0])
		}
		if report.Findings[0].AnnotationFile == "" || report.Findings[0].AnnotationLine == 0 {
			t.Fatalf("expected annotation on ast parity finding: %+v", report.Findings[0])
		}
	})
}

func TestResolveEnabledChecks(t *testing.T) {
	t.Run("includes override excludes", func(t *testing.T) {
		stderr := os.Stderr
		r, w, err := os.Pipe()
		if err != nil {
			t.Fatalf("os.Pipe: %v", err)
		}
		os.Stderr = w
		defer func() {
			os.Stderr = stderr
		}()

		got, err := resolveEnabledChecks([]string{checkOrphanedKey, checkMissingTargetFile}, []string{checkOrphanedKey})
		if err != nil {
			t.Fatalf("resolveEnabledChecks: %v", err)
		}
		if err := w.Close(); err != nil {
			t.Fatalf("close stderr writer: %v", err)
		}
		warning, err := io.ReadAll(r)
		if err != nil {
			t.Fatalf("read warning: %v", err)
		}
		want := []string{checkOrphanedKey, checkMissingTargetFile}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("resolveEnabledChecks() = %v, want %v", got, want)
		}
		if !strings.Contains(string(warning), "--exclude-check is ignored when --check is provided") {
			t.Fatalf("expected warning, got %q", string(warning))
		}
	})

	t.Run("exclude removes defaults", func(t *testing.T) {
		got, err := resolveEnabledChecks(nil, []string{checkHTMLTag, checkICUShape})
		if err != nil {
			t.Fatalf("resolveEnabledChecks: %v", err)
		}
		if slices.Contains(got, checkHTMLTag) || slices.Contains(got, checkICUShape) {
			t.Fatalf("excluded checks still enabled: %v", got)
		}
	})

	t.Run("unknown include errors", func(t *testing.T) {
		_, err := resolveEnabledChecks([]string{"unknown"}, nil)
		if err == nil || !strings.Contains(err.Error(), `unknown check "unknown"`) {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("unknown exclude errors", func(t *testing.T) {
		_, err := resolveEnabledChecks(nil, []string{"unknown"})
		if err == nil || !strings.Contains(err.Error(), `unknown exclude-check "unknown"`) {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("all excluded errors", func(t *testing.T) {
		_, err := resolveEnabledChecks(nil, slices.Clone(allCheckTypes))
		if err == nil || !strings.Contains(err.Error(), "no checks enabled") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestReadCheckTargetEntries(t *testing.T) {
	parser := translationfileparser.NewDefaultStrategy()
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "source.json")
	missingTargetPath := filepath.Join(dir, "missing.json")
	invalidTargetPath := filepath.Join(dir, "invalid.json")

	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(invalidTargetPath, []byte(`{"hello":1}`), 0o600); err != nil {
		t.Fatalf("write invalid target file: %v", err)
	}

	t.Run("missing target returns false without error", func(t *testing.T) {
		entries, exists, err := readCheckTargetEntries(parser, sourcePath, missingTargetPath)
		if err != nil {
			t.Fatalf("readCheckTargetEntries: %v", err)
		}
		if exists {
			t.Fatalf("expected target to be missing")
		}
		if entries != nil {
			t.Fatalf("expected nil entries for missing target, got %+v", entries)
		}
	})

	t.Run("parse error is returned", func(t *testing.T) {
		_, _, err := readCheckTargetEntries(parser, sourcePath, invalidTargetPath)
		if err == nil {
			t.Fatalf("expected parse error")
		}
	})
}

func TestCheckHelperFunctions(t *testing.T) {
	t.Run("hasCheck", func(t *testing.T) {
		checks := map[string]struct{}{checkICUShape: {}}
		if !hasCheck(checks, checkICUShape) {
			t.Fatalf("expected hasCheck true")
		}
		if hasCheck(checks, checkPlaceholder) {
			t.Fatalf("expected hasCheck false")
		}
	})

	t.Run("validateCheckInvariant", func(t *testing.T) {
		candidate := storage.Entry{Value: "Hello"}
		baseline := storage.Entry{Value: "Hello {name}"}
		diags := validateCheckInvariant(candidate, baseline)
		if len(diags) == 0 || !strings.Contains(diags[0], "placeholder parity mismatch") {
			t.Fatalf("expected placeholder mismatch, got %v", diags)
		}

		candidate = storage.Entry{Value: "{count, plural, one {# file} other {# files}"}
		baseline = storage.Entry{Value: "Hello"}
		diags = validateCheckInvariant(candidate, baseline)
		if len(diags) == 0 || !strings.Contains(diags[0], "invalid ICU/braces structure") {
			t.Fatalf("expected invalid ICU diagnostic, got %v", diags)
		}
	})

	t.Run("not localized helpers", func(t *testing.T) {
		cases := []struct {
			name       string
			source     string
			target     string
			hasTarget  bool
			want       bool
			wantReason string
		}{
			{name: "missing key", source: "Hello", hasTarget: false, want: true, wantReason: "target key is missing"},
			{name: "empty value", source: "Hello", target: "", hasTarget: true, want: true, wantReason: "target value is empty"},
			{name: "source match", source: "Hello", target: "Hello", hasTarget: true, want: true, wantReason: "target value matches source"},
			{name: "localized", source: "Hello", target: "Bonjour", hasTarget: true, want: false, wantReason: "target is not localized"},
		}
		for _, tt := range cases {
			t.Run(tt.name, func(t *testing.T) {
				if got := isNotLocalized(tt.source, tt.target, tt.hasTarget); got != tt.want {
					t.Fatalf("isNotLocalized() = %v, want %v", got, tt.want)
				}
				if got := describeNotLocalized(tt.source, tt.target, tt.hasTarget); got != tt.wantReason {
					t.Fatalf("describeNotLocalized() = %q, want %q", got, tt.wantReason)
				}
			})
		}
	})

	t.Run("normalize html tags", func(t *testing.T) {
		got := normalizeHTMLTags([]string{"<Strong class=\"x\">", "</Strong>", "<Badge text=\"x\" />"})
		want := []string{"strong", "/strong", "badge"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("normalizeHTMLTags() = %v, want %v", got, want)
		}
	})
}

func TestSortAndRenderCheckReportHelpers(t *testing.T) {
	findings := []checkFinding{
		{Type: checkWhitespaceOnly, Severity: checkSeverityWarning, Bucket: "b", Locale: "fr", SourceFile: "z", TargetFile: "z", Key: "b", AnnotationFile: "z", AnnotationLine: 3},
		{Type: checkNotLocalized, Severity: checkSeverityError, Bucket: "a", Locale: "de", SourceFile: "a", TargetFile: "a", Key: "a", AnnotationFile: "a", AnnotationLine: 2},
		{Type: checkNotLocalized, Severity: checkSeverityError, Bucket: "a", Locale: "de", SourceFile: "a", TargetFile: "a", Key: "0", AnnotationFile: "a", AnnotationLine: 1},
	}
	sortCheckFindings(findings)
	if findings[0].Type != checkNotLocalized || findings[0].Key != "0" {
		t.Fatalf("unexpected sort order: %+v", findings)
	}

	report := checkReport{Checks: []string{checkNotLocalized, checkWhitespaceOnly}, Findings: findings, Summary: summarizeCheckFindings(findings)}
	textPayload, err := renderCheckReport(report, "text")
	if err != nil {
		t.Fatalf("renderCheckReport(text): %v", err)
	}
	if !strings.Contains(string(textPayload), "[not_localized]") || !strings.Contains(string(textPayload), "By severity:") {
		t.Fatalf("unexpected text payload: %q", string(textPayload))
	}

	jsonPayload, err := renderCheckReport(report, "json")
	if err != nil {
		t.Fatalf("renderCheckReport(json): %v", err)
	}
	var decoded checkReport
	if err := json.Unmarshal(jsonPayload, &decoded); err != nil {
		t.Fatalf("json payload should decode: %v", err)
	}

	if _, err := renderCheckReport(report, "yaml"); err == nil || !strings.Contains(err.Error(), "unsupported output format") {
		t.Fatalf("expected unsupported format error, got %v", err)
	}
}

func TestWriteCheckTextAndSummaryMapErrors(t *testing.T) {
	writer := failingWriter{}
	report := checkReport{Checks: []string{checkNotLocalized}, Summary: checkSummary{}}
	if err := writeCheckText(writer, report); err == nil {
		t.Fatalf("expected writeCheckText error")
	}
	if err := writeCheckSummaryMap(writer, "By check", map[string]int{"a": 1}); err == nil {
		t.Fatalf("expected writeCheckSummaryMap error")
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, io.ErrClosedPipe
}

func writeCheckConfig(t *testing.T, configPath, sourcePath, targetPath string, locales []string) {
	t.Helper()
	quotedLocales := make([]string, 0, len(locales))
	for _, locale := range locales {
		quotedLocales = append(quotedLocales, `"`+locale+`"`)
	}
	content := `{
	  "locales": {"source":"en","targets":[` + strings.Join(quotedLocales, ",") + `]},
	  "buckets": {"ui":{"files":[{"from":"` + filepath.ToSlash(sourcePath) + `","to":"` + filepath.ToSlash(targetPath) + `"}]}},
	  "groups": {"default":{"targets":[` + strings.Join(quotedLocales, ",") + `],"buckets":["ui"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
}

func assertFindingType(t *testing.T, findings []checkFinding, want string) {
	t.Helper()
	for _, finding := range findings {
		if finding.Type == want {
			return
		}
	}
	t.Fatalf("expected finding type %q in %+v", want, findings)
}
