package runsvc

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

const (
	srxHelloWorldJSON = `{"hello":"Hello. World."}`
	srxNumberedJSON   = `{"list":"1. First item. Second sentence."}`
)

func withMappingSRX(cfg config.I18NConfig, spec string) config.I18NConfig {
	bucket := cfg.Buckets["ui"]
	bucket.Files[0].SRX = spec
	cfg.Buckets["ui"] = bucket
	return cfg
}

func TestResolveMappingSRXSpecOverrideWins(t *testing.T) {
	if got := resolveMappingSRXSpec(" default ", "markdown"); got != "default" {
		t.Fatalf("override = %q", got)
	}
	if got := resolveMappingSRXSpec("", "markdown"); got != "markdown" {
		t.Fatalf("mapping = %q", got)
	}
	if got := resolveMappingSRXSpec("  ", ""); got != "" {
		t.Fatalf("empty = %q", got)
	}
}

func TestPlanTasksSplitsJSONWithDefaultSRX(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxHelloWorldJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, warnings, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("unexpected warnings: %#v", warnings)
	}
	if len(tasks) != 2 {
		t.Fatalf("task count=%d, want 2: %+v", len(tasks), tasks)
	}
	got := map[string]string{}
	for _, task := range tasks {
		got[task.EntryKey] = task.SourceText
		if task.SRXSpec != "default" {
			t.Fatalf("SRXSpec=%q", task.SRXSpec)
		}
		if task.SRXFingerprint == "" {
			t.Fatal("expected SRX fingerprint")
		}
	}
	want := map[string]string{
		"hello#srx.0": "Hello.",
		"hello#srx.1": " World.",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("spans mismatch\nwant %#v\ngot %#v", want, got)
	}
}

func TestPlanTasksSplitsNestedJSONKeys(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(`{"home":{"title":"Hello. World."}}`), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	got := map[string]string{}
	for _, task := range tasks {
		got[task.EntryKey] = task.SourceText
	}
	want := map[string]string{
		"home.title#srx.0": "Hello.",
		"home.title#srx.1": " World.",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("nested spans mismatch\nwant %#v\ngot %#v", want, got)
	}
}

func TestPlanTasksSplitsYAMLLeaves(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.yaml"
	targetPath := "/tmp/out.yaml"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte("hello: Hello. World.\n"), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("expected yaml to split, got %+v", tasks)
	}
}

func TestPlanTasksDoesNotSplitWithoutSRX(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := testConfig(sourcePath, targetPath)
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxHelloWorldJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 1 || tasks[0].EntryKey != "hello" || tasks[0].SourceText != "Hello. World." {
		t.Fatalf("expected one unsplit task, got %+v", tasks)
	}
	if tasks[0].SRXSpec != "" || tasks[0].SRXFingerprint != "" {
		t.Fatalf("expected empty srx fields, got spec=%q fp=%q", tasks[0].SRXSpec, tasks[0].SRXFingerprint)
	}
}

func TestPlanTasksCLIOverrideSplitsWhenMappingEmpty(t *testing.T) {
	svc := newTestService()
	svc.srxOverride = "default"
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := testConfig(sourcePath, targetPath)
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxHelloWorldJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("expected override to split, got %+v", tasks)
	}
}

func TestPlanTasksOverrideWinsOverMappingTemplate(t *testing.T) {
	svc := newTestService()
	svc.srxOverride = "default"
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "markdown")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxNumberedJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	keys := make([]string, 0, len(tasks))
	for _, task := range tasks {
		keys = append(keys, task.EntryKey)
	}
	if len(tasks) != 3 {
		t.Fatalf("override default should produce 3 numbered spans, got %d keys=%v", len(tasks), keys)
	}
}

func TestPlanTasksMarkdownTemplateKeepsNumberedListPrefix(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "markdown")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxNumberedJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	got := map[string]string{}
	for _, task := range tasks {
		got[task.EntryKey] = task.SourceText
	}
	want := map[string]string{
		"list#srx.0": "1. First item.",
		"list#srx.1": " Second sentence.",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("markdown spans mismatch\nwant %#v\ngot %#v", want, got)
	}
}

func TestPlanTasksSkipsICUPrintfAndFluentValues(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(`{
				"icu":"Hello {name}. World.",
				"plural":"{count, plural, one {# item} other {# items}}",
				"printf":"Saved %s to disk. Done.",
				"fluent":"Hello { $name }. World.",
				"plain":"Hello. World."
			}`), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	keys := map[string]string{}
	for _, task := range tasks {
		keys[task.EntryKey] = task.SourceText
	}
	for _, key := range []string{"icu", "plural", "printf", "fluent"} {
		if _, ok := keys[key]; !ok {
			t.Fatalf("expected unsplit key %q, got %#v", key, keys)
		}
	}
	if _, ok := keys["plain#srx.0"]; !ok {
		t.Fatalf("expected plain to split, got %#v", keys)
	}
}

func TestPlanTasksWarnsAndSkipsFormatJS(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(`{"hello":{"defaultMessage":"Hello. World.","description":"Greeting"}}`), nil
		}
		return nil, filepath.ErrBadPattern
	}

	tasks, warnings, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 1 || tasks[0].EntryKey != "hello" {
		t.Fatalf("expected one FormatJS key, got %+v", tasks)
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "srx ignored") {
		t.Fatalf("expected format warning, got %#v", warnings)
	}
}

func TestPlanTasksWarnsAndSkipsXLIFF(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/catalog.xliff"
	targetPath := "/tmp/catalog.fr.xliff"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
	svc.readFile = func(path string) ([]byte, error) {
		if path != sourcePath {
			return nil, filepath.ErrBadPattern
		}
		return []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="hello">
        <source>Hello. World.</source>
        <target>Hello. World.</target>
      </trans-unit>
    </body>
  </file>
</xliff>`), nil
	}

	tasks, warnings, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) == 0 {
		t.Fatal("expected xliff tasks")
	}
	for _, task := range tasks {
		if _, _, isSpan := srx.SplitSpanKey(task.EntryKey); isSpan {
			t.Fatalf("xliff should not split, got %q", task.EntryKey)
		}
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "srx ignored") {
		t.Fatalf("expected format warning, got %#v", warnings)
	}
}

func TestPlanTasksInvalidSRXFileFails(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "rules/bad.srx")
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(srxHelloWorldJSON), nil
		case "rules/bad.srx":
			return []byte("not xml"), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}

	_, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected invalid srx compile error")
	}
	if !strings.Contains(err.Error(), "srx") {
		t.Fatalf("error = %v", err)
	}
}

func TestPlanTasksMissingSRXFileFails(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := withMappingSRX(testConfig(sourcePath, targetPath), "missing.srx")
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxHelloWorldJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	_, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected missing srx file error")
	}
}

func TestRunJoinsSRXSpansToOriginalJSONKeys(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(srxHelloWorldJSON), nil
		case targetPath:
			return []byte(`{}`), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}
	var written []byte
	svc.writeFile = func(path string, content []byte) error {
		if path != targetPath {
			t.Fatalf("unexpected write path %s", path)
		}
		written = append([]byte(nil), content...)
		return nil
	}

	report, err := svc.Run(context.Background(), Input{Workers: 1})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.PlannedTotal != 2 || report.Succeeded != 2 {
		t.Fatalf("planned/succeeded = %d/%d, want 2/2", report.PlannedTotal, report.Succeeded)
	}

	var payload map[string]string
	if err := json.Unmarshal(written, &payload); err != nil {
		t.Fatalf("decode written: %v\n%s", err, written)
	}
	if _, ok := payload["hello#srx.0"]; ok {
		t.Fatalf("span key leaked into target: %#v", payload)
	}
	if payload["hello"] != "HELLO. WORLD." {
		t.Fatalf("joined hello = %q, want HELLO. WORLD.", payload["hello"])
	}
}

func TestRunSRXInputOverrideJoinsOriginalKeys(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig(sourcePath, targetPath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(srxHelloWorldJSON), nil
		case targetPath:
			return []byte(`{}`), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}
	var written []byte
	svc.writeFile = func(_ string, content []byte) error {
		written = append([]byte(nil), content...)
		return nil
	}

	report, err := svc.Run(context.Background(), Input{Workers: 1, SRX: "default"})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.PlannedTotal != 2 {
		t.Fatalf("planned = %d, want 2", report.PlannedTotal)
	}
	var payload map[string]string
	if err := json.Unmarshal(written, &payload); err != nil {
		t.Fatalf("decode written: %v", err)
	}
	if payload["hello"] != "HELLO. WORLD." {
		t.Fatalf("joined hello = %q", payload["hello"])
	}
}

func TestRunDryRunReportsSRXSpanKeys(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(srxHelloWorldJSON), nil
		}
		return nil, filepath.ErrBadPattern
	}

	report, err := svc.Run(context.Background(), Input{DryRun: true})
	if err != nil {
		t.Fatalf("dry-run: %v", err)
	}
	if report.PlannedTotal != 2 || len(report.Executable) != 2 {
		t.Fatalf("planned/executable = %d/%d", report.PlannedTotal, len(report.Executable))
	}
	keys := map[string]struct{}{}
	for _, task := range report.Executable {
		keys[task.EntryKey] = struct{}{}
	}
	if _, ok := keys["hello#srx.0"]; !ok {
		t.Fatalf("missing span keys: %+v", report.Executable)
	}
}

func TestLockTaskHashIncludesSRXFingerprint(t *testing.T) {
	base := baseLockTask()
	base.SourceText = "Hello"
	without := lockTaskHash(base)

	defaultDoc, err := srx.LoadTemplate("default")
	if err != nil {
		t.Fatalf("default template: %v", err)
	}
	markdownDoc, err := srx.LoadTemplate("markdown")
	if err != nil {
		t.Fatalf("markdown template: %v", err)
	}

	withDefault := base
	withDefault.SRXSpec = "default"
	withDefault.SRXFingerprint = defaultDoc.Fingerprint()
	withMarkdown := base
	withMarkdown.SRXSpec = "markdown"
	withMarkdown.SRXFingerprint = markdownDoc.Fingerprint()

	if lockTaskHash(withDefault) == without {
		t.Fatal("expected srx fingerprint to change lock hash")
	}
	if lockTaskHash(withDefault) == lockTaskHash(withMarkdown) {
		t.Fatal("expected different templates to produce different lock hashes")
	}
}

func TestJoinSRXStagedEntriesMergesExistingWhenSpanCountsMatch(t *testing.T) {
	doc, err := srx.LoadTemplate("default")
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	source := map[string]string{"hello": "Hello. World."}
	staged := map[string]string{"hello#srx.0": "Bonjour."}
	existing := map[string]string{"hello": "Salut. Monde."}

	got := joinSRXStagedEntries(doc, "en.json", "json", "en", "fr", source, staged, existing)
	if got["hello"] != "Bonjour. Monde." {
		t.Fatalf("joined = %#v", got)
	}
}

func TestJoinSRXStagedEntriesFallsBackToSourceWhenCountsDiverge(t *testing.T) {
	doc, err := srx.LoadTemplate("default")
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	source := map[string]string{"hello": "Hello. World."}
	staged := map[string]string{"hello#srx.0": "Bonjour."}
	existing := map[string]string{"hello": "Salut tout le monde"}

	got := joinSRXStagedEntries(doc, "en.json", "json", "en", "fr", source, staged, existing)
	if got["hello"] != "Bonjour. World." {
		t.Fatalf("joined = %#v", got)
	}
}

func TestJoinSRXStagedEntriesRestoresLeadingWhitespace(t *testing.T) {
	doc, err := srx.LoadTemplate("default")
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	source := map[string]string{"hello": "Hello. World."}
	staged := map[string]string{
		"hello#srx.0": "Bonjour.",
		"hello#srx.1": "Monde.",
	}

	got := joinSRXStagedEntries(doc, "en.json", "json", "en", "fr", source, staged, nil)
	if got["hello"] != "Bonjour. Monde." {
		t.Fatalf("joined = %q", got["hello"])
	}
}

func TestFlushOutputForTargetJoinsSRXSpans(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	targetPath := filepath.Join(dir, "fr.json")
	if err := os.WriteFile(sourcePath, []byte(srxHelloWorldJSON), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"hello":"Salut. Monde.","stale":"x"}`), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	svc := newTestService()
	svc.readFile = os.ReadFile
	var written []byte
	svc.writeFile = func(path string, content []byte) error {
		if path != targetPath {
			t.Fatalf("write path %s", path)
		}
		written = append([]byte(nil), content...)
		return nil
	}

	_, err := svc.flushOutputForTarget(targetPath, stagedOutput{
		entries:      map[string]string{"hello#srx.0": "Bonjour."},
		sourcePath:   sourcePath,
		sourceLocale: "en",
		targetLocale: "fr",
		srxSpec:      "default",
		parserMode:   "json",
	}, map[string]struct{}{"hello": {}})
	if err != nil {
		t.Fatalf("flush: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(written, &payload); err != nil {
		t.Fatalf("decode: %v\n%s", err, written)
	}
	if payload["hello"] != "Bonjour. Monde." {
		t.Fatalf("payload = %#v", payload)
	}
	if _, ok := payload["stale"]; ok {
		t.Fatalf("stale key survived prune: %#v", payload)
	}
	if _, ok := payload["hello#srx.0"]; ok {
		t.Fatalf("span key leaked: %#v", payload)
	}
}

func TestCompileSRXCachesNamedTemplates(t *testing.T) {
	svc := newTestService()
	first, fp1, err := svc.compileSRX("DEFAULT")
	if err != nil || first == nil || fp1 == "" {
		t.Fatalf("first compile: doc=%v fp=%q err=%v", first, fp1, err)
	}
	second, fp2, err := svc.compileSRX("default")
	if err != nil {
		t.Fatalf("second compile: %v", err)
	}
	if first != second || fp1 != fp2 {
		t.Fatal("expected compiled document cache hit")
	}
}

func TestCompileSRXReadsProjectFile(t *testing.T) {
	svc := newTestService()
	custom := []byte(`<srx><body><languagerules>
      <languagerule languagename="Custom">
        <rule break="yes"><beforebreak>\.</beforebreak><afterbreak>\s</afterbreak></rule>
      </languagerule>
    </languagerules></body></srx>`)
	svc.readFile = func(path string) ([]byte, error) {
		if path == "rules/custom.srx" {
			return custom, nil
		}
		return nil, filepath.ErrBadPattern
	}
	doc, fp, err := svc.compileSRX("rules/custom.srx")
	if err != nil {
		t.Fatalf("compile custom: %v", err)
	}
	if doc == nil || fp == "" {
		t.Fatal("expected compiled custom document")
	}
	spans := doc.Segment("Hello. World.", "en")
	if len(spans) != 2 {
		t.Fatalf("custom spans = %#v", spans)
	}
}

func TestApplySRXToEntriesCopiesContextToSpans(t *testing.T) {
	doc, err := srx.LoadTemplate("default")
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	entries, contextByKey, warnings := applySRXToEntries(
		doc,
		"en.json",
		"json",
		"en",
		map[string]string{"hello": "Hello. World."},
		map[string]string{"hello": "Greeting"},
	)
	if len(warnings) != 0 {
		t.Fatalf("warnings: %#v", warnings)
	}
	if contextByKey["hello#srx.0"] != "Greeting" || contextByKey["hello#srx.1"] != "Greeting" {
		t.Fatalf("context = %#v", contextByKey)
	}
	if _, ok := entries["hello"]; ok {
		t.Fatalf("original key should be replaced by spans: %#v", entries)
	}
}

func TestRunDoesNotSplitWhenTranslationUsesICUOnlyFile(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(`{"hello":"Hello {name}."}`), nil
		case targetPath:
			return []byte(`{}`), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}
	var sources []string
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		sources = append(sources, req.Source)
		return "Bonjour {name}.", nil
	}

	report, err := svc.Run(context.Background(), Input{Workers: 1})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.PlannedTotal != 1 {
		t.Fatalf("planned = %d", report.PlannedTotal)
	}
	if len(sources) != 1 || sources[0] != "Hello {name}." {
		t.Fatalf("sources = %#v", sources)
	}
}
