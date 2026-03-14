package runsvc

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/config"
)

func TestPlanTasksFiltersBySourcePath(t *testing.T) {
	dir := t.TempDir()
	sourceA := filepath.Join(dir, "content", "en", "a.json")
	sourceB := filepath.Join(dir, "content", "en", "b.json")

	if err := os.MkdirAll(filepath.Dir(sourceA), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(sourceA, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source A: %v", err)
	}
	if err := os.WriteFile(sourceB, []byte(`{"bye":"Bye"}`), 0o600); err != nil {
		t.Fatalf("write source B: %v", err)
	}

	cfg := &config.I18NConfig{
		Locales: config.LocaleConfig{Source: "en", Targets: []string{"fr"}},
		Buckets: map[string]config.BucketConfig{
			"ui": {
				Files: []config.BucketFileMapping{
					{From: filepath.ToSlash(filepath.Join(dir, "content", "en", "*.json")), To: filepath.ToSlash(filepath.Join(dir, "dist", "{{target}}", "*.json"))},
				},
			},
		},
		Groups: map[string]config.GroupConfig{
			"default": {Targets: []string{"fr"}, Buckets: []string{"ui"}},
		},
		LLM: config.LLMConfig{
			Profiles: map[string]config.LLMProfile{
				"default": {Provider: "openai", Model: "gpt-4.1-mini", Prompt: "Translate {{input}}"},
			},
		},
	}

	svc := New()
	tasks, err := svc.planTasks(cfg, "", "", nil, []string{sourceB})
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected one task, got %d", len(tasks))
	}
	if tasks[0].SourcePath != sourceB {
		t.Fatalf("unexpected source path: %s", tasks[0].SourcePath)
	}
}

func TestPlanTasksReturnsErrorForIgnoredExplicitSourcePath(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "content", "fr", "strings.json")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Bonjour"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	cfg := &config.I18NConfig{
		Locales: config.LocaleConfig{Source: "en", Targets: []string{"fr"}},
		Buckets: map[string]config.BucketConfig{
			"ui": {
				Files: []config.BucketFileMapping{
					{From: filepath.ToSlash(sourcePath), To: filepath.ToSlash(filepath.Join(dir, "dist", "{{target}}", "strings.json"))},
				},
			},
		},
		Groups: map[string]config.GroupConfig{
			"default": {Targets: []string{"fr"}, Buckets: []string{"ui"}},
		},
		LLM: config.LLMConfig{
			Profiles: map[string]config.LLMProfile{
				"default": {Provider: "openai", Model: "gpt-4.1-mini", Prompt: "Translate {{input}}"},
			},
		},
	}

	svc := New()
	_, err := svc.planTasks(cfg, "", "", nil, []string{sourcePath})
	if err == nil {
		t.Fatalf("expected ignored explicit source path to fail planning")
	}
	if got := err.Error(); got != `planning tasks: unknown source file "`+sourcePath+`"` {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildSelectionCatalogAggregatesGlobbedFiles(t *testing.T) {
	dir := t.TempDir()
	sourceA := filepath.Join(dir, "content", "en", "a.json")
	sourceB := filepath.Join(dir, "content", "en", "b.json")
	configPath := filepath.Join(dir, "i18n.jsonc")

	if err := os.MkdirAll(filepath.Dir(sourceA), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(sourceA, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source A: %v", err)
	}
	if err := os.WriteFile(sourceB, []byte(`{"bye":"Bye"}`), 0o600); err != nil {
		t.Fatalf("write source B: %v", err)
	}

	content := `{
	  "locales": {"source":"en","targets":["fr","de"]},
	  "buckets": {"ui":{"files":[{"from":"` + filepath.ToSlash(filepath.Join(dir, "content", "en", "*.json")) + `","to":"` + filepath.ToSlash(filepath.Join(dir, "dist", "{{target}}", "*.json")) + `"}]}},
	  "groups": {"default":{"targets":["fr","de"],"buckets":["ui"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	catalog, err := BuildSelectionCatalog(configPath)
	if err != nil {
		t.Fatalf("build catalog: %v", err)
	}
	if catalog.TotalFiles != 2 {
		t.Fatalf("expected two files, got %d", catalog.TotalFiles)
	}
	if len(catalog.Files) != 2 {
		t.Fatalf("expected two file entries, got %d", len(catalog.Files))
	}
	if len(catalog.TaskIndex) != 4 {
		t.Fatalf("expected four group/bucket/locale/file combinations, got %d", len(catalog.TaskIndex))
	}
	if catalog.Files[0].Path != sourceA {
		t.Fatalf("expected files to be sorted, got first path %q", catalog.Files[0].Path)
	}
	if catalog.TaskIndex[0].SourcePath != sourceA || catalog.TaskIndex[0].TargetLocale != "de" {
		t.Fatalf("unexpected first task index entry: %+v", catalog.TaskIndex[0])
	}
	if catalog.TaskIndex[3].SourcePath != sourceB || catalog.TaskIndex[3].TargetLocale != "fr" {
		t.Fatalf("unexpected last task index entry: %+v", catalog.TaskIndex[3])
	}
}

func TestBuildSelectionCatalogAggregatesTaskIndexCounts(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "content", "en", "strings.json")
	configPath := filepath.Join(dir, "i18n.jsonc")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello","bye":"Bye"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	content := `{
	  "locales": {"source":"en","targets":["fr"]},
	  "buckets": {"ui":{"files":[{"from":"` + filepath.ToSlash(sourcePath) + `","to":"` + filepath.ToSlash(filepath.Join(dir, "dist", "{{target}}", "strings.json")) + `"}]}},
	  "groups": {"default":{"targets":["fr"],"buckets":["ui"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	catalog, err := BuildSelectionCatalog(configPath)
	if err != nil {
		t.Fatalf("build catalog: %v", err)
	}
	if len(catalog.TaskIndex) != 1 {
		t.Fatalf("expected one aggregated task index row, got %d", len(catalog.TaskIndex))
	}
	if catalog.TaskIndex[0].TaskCount != 2 {
		t.Fatalf("expected aggregated task count 2, got %d", catalog.TaskIndex[0].TaskCount)
	}
}
