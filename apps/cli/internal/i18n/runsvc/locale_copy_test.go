package runsvc

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestSplitCopyTasks(t *testing.T) {
	t.Parallel()
	llm := Task{EntryKey: "a", TranslationType: config.TranslationTypeLLM}
	mt := Task{EntryKey: "b", TranslationType: config.TranslationTypeMT}
	copyTask := Task{EntryKey: "c", TranslationType: config.TranslationTypeCopy, CopyFrom: "en-GB"}

	copyTasks, other := splitCopyTasks([]Task{llm, copyTask, mt})
	if len(copyTasks) != 1 || copyTasks[0].EntryKey != "c" {
		t.Fatalf("copy tasks=%+v", copyTasks)
	}
	if len(other) != 2 || other[0].EntryKey != "a" || other[1].EntryKey != "b" {
		t.Fatalf("other tasks=%+v", other)
	}
}

func TestPartitionMTTasksOmitsCopyTasks(t *testing.T) {
	t.Parallel()
	tasks := []Task{
		{EntryKey: "llm-0", TranslationType: config.TranslationTypeLLM},
		{EntryKey: "copy-0", TranslationType: config.TranslationTypeCopy, CopyFrom: "en-GB"},
		{EntryKey: "mt-0", TranslationType: config.TranslationTypeMT},
	}
	llmTasks, mtTasks := partitionMTTasks(tasks)
	if got := entryKeys(llmTasks); len(got) != 1 || got[0] != "llm-0" {
		t.Fatalf("llmTasks=%v, want [llm-0]", got)
	}
	if got := entryKeys(mtTasks); len(got) != 1 || got[0] != "mt-0" {
		t.Fatalf("mtTasks=%v, want [mt-0]", got)
	}
}

func TestLockTaskHashIncludesCopyFrom(t *testing.T) {
	t.Parallel()
	base := Task{
		SourceLocale:    "en-US",
		TargetLocale:    "en-AU",
		SourceText:      "Hello",
		TranslationType: config.TranslationTypeCopy,
		CopyFrom:        "en-GB",
		ParserMode:      "json",
	}
	withGB := lockTaskHash(base)
	base.CopyFrom = "en-US"
	withUS := lockTaskHash(base)
	if withGB == withUS {
		t.Fatal("lock hash should change when copy origin changes")
	}
}

func TestLockTaskHashCandidatesOmitLegacyForCopy(t *testing.T) {
	t.Parallel()
	task := Task{
		SourceLocale:    "en-US",
		TargetLocale:    "en-AU",
		SourceText:      "Hello",
		TranslationType: config.TranslationTypeCopy,
		CopyFrom:        "en-GB",
		ParserMode:      "json",
	}
	got := lockTaskHashCandidates(task)
	if len(got) != 1 {
		t.Fatalf("candidates=%d, want 1 canonical hash", len(got))
	}
	if got[0] != lockTaskHash(task) {
		t.Fatal("canonical copy lock hash mismatch")
	}
}

func TestPlanTasksMarksCopyLocales(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en-US.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello","bye":"Bye"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	configPath := filepath.Join(dir, "i18n.yml")
	content := `
locales:
  source: en-US
  targets:
    - en-GB
    - en-AU
  copies:
    en-AU: en-GB
buckets:
  ui:
    files:
      - from: ` + sourcePath + `
        to: ` + filepath.Join(dir, "{{target}}.json") + `
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
`
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	svc := newTestService()
	svc.readFile = os.ReadFile

	tasks, _, err := svc.planTasks(cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("planTasks: %v", err)
	}
	if len(tasks) != 4 {
		t.Fatalf("task count=%d, want 4", len(tasks))
	}

	var gb, au int
	for _, task := range tasks {
		switch task.TargetLocale {
		case "en-GB":
			gb++
			if task.TranslationType != config.TranslationTypeLLM {
				t.Fatalf("en-GB type=%q, want llm", task.TranslationType)
			}
			if task.CopyFrom != "" {
				t.Fatalf("en-GB copyFrom=%q, want empty", task.CopyFrom)
			}
		case "en-AU":
			au++
			if task.TranslationType != config.TranslationTypeCopy {
				t.Fatalf("en-AU type=%q, want copy", task.TranslationType)
			}
			if task.CopyFrom != "en-GB" {
				t.Fatalf("en-AU copyFrom=%q, want en-GB", task.CopyFrom)
			}
			if task.copyFromTargetPath != filepath.Join(dir, "en-GB.json") {
				t.Fatalf("en-AU origin path=%q", task.copyFromTargetPath)
			}
			if task.Provider != "" || task.Model != "" || task.ProfileName != "" {
				t.Fatalf("copy task should not keep translation profile fields: %+v", task)
			}
		default:
			t.Fatalf("unexpected locale %q", task.TargetLocale)
		}
	}
	if gb != 2 || au != 2 {
		t.Fatalf("gb=%d au=%d, want 2 each", gb, au)
	}
}

func TestPlanTasksRejectsCopySharingTargetPath(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en-US.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	sharedPath := filepath.Join(dir, "catalog.json")
	configPath := filepath.Join(dir, "i18n.yml")
	content := `
locales:
  source: en-US
  targets:
    - en-GB
    - en-AU
  copies:
    en-AU: en-GB
buckets:
  ui:
    files:
      - from: ` + sourcePath + `
        to: ` + sharedPath + `
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
`
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	svc := newTestService()
	svc.readFile = os.ReadFile
	_, _, err = svc.planTasks(cfg, "", "", nil, nil, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "cannot share target path") {
		t.Fatalf("expected shared path error, got %v", err)
	}
}

func TestRunCopiesLocaleWithoutTranslating(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	gbPath := "/tmp/en-GB.json"
	auPath := "/tmp/en-AU.json"
	files := map[string][]byte{
		sourcePath: []byte(`{"hello":"Hello","bye":"Bye"}`),
	}
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testLocaleCopyConfig(sourcePath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		content, ok := files[path]
		if !ok {
			return nil, os.ErrNotExist
		}
		return content, nil
	}
	svc.writeFile = func(path string, content []byte) error {
		files[path] = append([]byte(nil), content...)
		return nil
	}
	var translateCalls atomic.Int32
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		translateCalls.Add(1)
		if req.TargetLanguage != "en-GB" {
			t.Errorf("unexpected translate target %q", req.TargetLanguage)
		}
		return "GB:" + req.Source, nil
	}

	report, err := svc.Run(context.Background(), Input{})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if translateCalls.Load() != 2 {
		t.Fatalf("translate calls=%d, want 2", translateCalls.Load())
	}
	if report.PlannedTotal != 4 {
		t.Fatalf("planned=%d, want 4", report.PlannedTotal)
	}
	if report.ExecutableTotal != 4 {
		t.Fatalf("executable=%d, want 4", report.ExecutableTotal)
	}
	if report.Succeeded < 4 {
		t.Fatalf("succeeded=%d, want >= 4", report.Succeeded)
	}

	assertJSONFile(t, files[gbPath], map[string]string{"hello": "GB:Hello", "bye": "GB:Bye"})
	assertJSONFile(t, files[auPath], map[string]string{"hello": "GB:Hello", "bye": "GB:Bye"})
}

func TestRunCopyLocaleFromExistingOriginWithoutTranslating(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	gbPath := "/tmp/en-GB.json"
	auPath := "/tmp/en-AU.json"
	files := map[string][]byte{
		sourcePath: []byte(`{"hello":"Hello"}`),
		gbPath:     []byte(`{"hello":"Colour"}`),
	}
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testLocaleCopyConfig(sourcePath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		content, ok := files[path]
		if !ok {
			return nil, os.ErrNotExist
		}
		return content, nil
	}
	svc.writeFile = func(path string, content []byte) error {
		files[path] = append([]byte(nil), content...)
		return nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		t.Fatalf("translate should not run for copy-only locale, got target %q", req.TargetLanguage)
		return "", nil
	}

	report, err := svc.Run(context.Background(), Input{TargetLocales: []string{"en-AU"}})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.PlannedTotal != 1 {
		t.Fatalf("planned=%d, want 1", report.PlannedTotal)
	}
	if report.ExecutableTotal != 1 {
		t.Fatalf("executable=%d, want 1", report.ExecutableTotal)
	}
	assertJSONFile(t, files[auPath], map[string]string{"hello": "Colour"})
	assertJSONFile(t, files[gbPath], map[string]string{"hello": "Colour"})
}

func TestRunCopyLocaleFailsWhenOriginMissing(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	files := map[string][]byte{
		sourcePath: []byte(`{"hello":"Hello"}`),
	}
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testLocaleCopyConfig(sourcePath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		content, ok := files[path]
		if !ok {
			return nil, os.ErrNotExist
		}
		return content, nil
	}
	svc.writeFile = func(path string, content []byte) error {
		files[path] = append([]byte(nil), content...)
		return nil
	}
	svc.translate = func(_ context.Context, _ translator.Request) (string, error) {
		t.Fatal("translate should not run")
		return "", nil
	}

	_, err := svc.Run(context.Background(), Input{TargetLocales: []string{"en-AU"}})
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("expected missing origin error, got %v", err)
	}
}

func TestRunCopyLocaleIgnoresMaxTranslations(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	gbPath := "/tmp/en-GB.json"
	auPath := "/tmp/en-AU.json"
	files := map[string][]byte{
		sourcePath: []byte(`{"bye":"Bye","hello":"Hello"}`),
		gbPath:     []byte(`{"bye":"Organise","hello":"Colour"}`),
	}
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testLocaleCopyConfig(sourcePath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		content, ok := files[path]
		if !ok {
			return nil, os.ErrNotExist
		}
		return content, nil
	}
	svc.writeFile = func(path string, content []byte) error {
		files[path] = append([]byte(nil), content...)
		return nil
	}
	var translateCalls atomic.Int32
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		translateCalls.Add(1)
		if req.TargetLanguage != "en-GB" {
			t.Errorf("unexpected translate target %q", req.TargetLanguage)
		}
		return "GB:" + req.Source, nil
	}

	report, err := svc.Run(context.Background(), Input{MaxTranslations: 1})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if translateCalls.Load() != 1 {
		t.Fatalf("translate calls=%d, want 1", translateCalls.Load())
	}
	if report.DeferredByLimit != 1 {
		t.Fatalf("deferred=%d, want 1 origin task", report.DeferredByLimit)
	}
	if report.PlannedTotal != 4 {
		t.Fatalf("planned=%d, want 4", report.PlannedTotal)
	}
	if report.ExecutableTotal != 3 {
		t.Fatalf("executable=%d, want 1 origin + 2 copy tasks", report.ExecutableTotal)
	}
	assertJSONFile(t, files[gbPath], map[string]string{"bye": "GB:Bye", "hello": "Colour"})
	assertJSONFile(t, files[auPath], map[string]string{"bye": "GB:Bye", "hello": "Colour"})
}

func TestRunCopyLocaleFromSource(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	auPath := "/tmp/en-AU.json"
	files := map[string][]byte{
		sourcePath: []byte(`{"hello":"Hello"}`),
	}
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig(sourcePath, auPath)
		cfg.Locales.Targets = []string{"en-AU"}
		cfg.Locales.Copies = map[string]string{"en-AU": "en"}
		cfg.Groups["default"] = config.GroupConfig{Targets: []string{"en-AU"}, Buckets: []string{"ui"}}
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		content, ok := files[path]
		if !ok {
			return nil, os.ErrNotExist
		}
		return content, nil
	}
	svc.writeFile = func(path string, content []byte) error {
		files[path] = append([]byte(nil), content...)
		return nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		t.Fatalf("translate should not run when copying from source, got target %q", req.TargetLanguage)
		return "", nil
	}

	report, err := svc.Run(context.Background(), Input{})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Succeeded != 1 {
		t.Fatalf("succeeded=%d, want 1", report.Succeeded)
	}
	assertJSONFile(t, files[auPath], map[string]string{"hello": "Hello"})
}

func testLocaleCopyConfig(sourcePath string) config.I18NConfig {
	cfg := testConfig(sourcePath, "/tmp/{{target}}.json")
	cfg.Locales.Source = "en-US"
	cfg.Locales.Targets = []string{"en-GB", "en-AU"}
	cfg.Locales.Copies = map[string]string{"en-AU": "en-GB"}
	cfg.Buckets["ui"] = config.BucketConfig{
		Files: []config.BucketFileMapping{{
			From: sourcePath,
			To:   "/tmp/{{target}}.json",
		}},
	}
	cfg.Groups["default"] = config.GroupConfig{
		Targets: []string{"en-GB", "en-AU"},
		Buckets: []string{"ui"},
	}
	return cfg
}

func assertJSONFile(t *testing.T, content []byte, want map[string]string) {
	t.Helper()
	if len(content) == 0 {
		t.Fatal("expected file content")
	}
	var payload map[string]string
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode json %q: %v", content, err)
	}
	for key, value := range want {
		if payload[key] != value {
			t.Fatalf("key %q=%q, want %q in %v", key, payload[key], value, payload)
		}
	}
}
