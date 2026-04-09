package runsvc

import (
	"context"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestPlanTasksReusesParsedSourceAcrossGroups(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/shared.json"
	targetPath := "/tmp/out/{{target}}.json"

	cfg := testConfig(sourcePath, targetPath)
	cfg.Groups = map[string]config.GroupConfig{
		"docs": {
			Targets: []string{"fr"},
			Buckets: []string{"ui"},
		},
		"marketing": {
			Targets: []string{"fr"},
			Buckets: []string{"ui"},
		},
	}

	sourceReads := 0
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			sourceReads++
			return []byte(`{"hello":"Hello","bye":"Bye"}`), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("planTasks: %v", err)
	}
	if len(tasks) != 4 {
		t.Fatalf("expected 4 tasks, got %d", len(tasks))
	}
	if sourceReads != 1 {
		t.Fatalf("expected shared source to be parsed once, got %d reads", sourceReads)
	}
}

func TestPrecomputedExactCacheKeyMatchesColdComputation(t *testing.T) {
	task := baseCacheTask()
	cold := exactCacheKey(task)

	precomputeStableTaskCacheFields(&task)
	precomputeExecutionTaskCacheFields(&task)
	got := exactCacheKey(task)

	if got != cold {
		t.Fatalf("precomputed exact cache key mismatch: got %q want %q", got, cold)
	}
}

func TestPrecomputedExactCacheKeyTracksContextMemoryChanges(t *testing.T) {
	base := baseCacheTask()
	precomputeStableTaskCacheFields(&base)
	precomputeExecutionTaskCacheFields(&base)
	baseKey := exactCacheKey(base)

	changed := base
	changed.ContextMemory = "memory-B"
	precomputeExecutionTaskCacheFields(&changed)
	changedKey := exactCacheKey(changed)

	if baseKey == changedKey {
		t.Fatal("expected context-memory change to update precomputed exact cache key")
	}
}

func BenchmarkPlanTasksSharedSourceMappings(b *testing.B) {
	svc := newTestService()
	sourcePath := "/tmp/shared.json"
	targetPath := "/tmp/out/{{target}}.json"
	cfg := benchmarkPlanningConfig(sourcePath, targetPath, 6)
	sourceContent := benchmarkJSONEntries(200)

	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(sourceContent), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}

	b.ReportAllocs()

	for b.Loop() {
		if _, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil); err != nil {
			b.Fatalf("planTasks: %v", err)
		}
	}
}

func BenchmarkExactCacheKey(b *testing.B) {
	b.Run("cold", func(b *testing.B) {
		task := baseCacheTask()
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			benchmarkCacheKeySink = exactCacheKey(task)
		}
	})

	b.Run("precomputed", func(b *testing.B) {
		task := baseCacheTask()
		precomputeStableTaskCacheFields(&task)
		precomputeExecutionTaskCacheFields(&task)
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			benchmarkCacheKeySink = exactCacheKey(task)
		}
	})
}

func BenchmarkRunLargeBatch(b *testing.B) {
	benchmarks := []struct {
		name          string
		contextMemory bool
	}{
		{name: "plain"},
		{name: "context_memory", contextMemory: true},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			svc := benchmarkRunService(150, 2)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, err := svc.Run(context.Background(), Input{
					Force:                     true,
					Workers:                   4,
					ExperimentalContextMemory: bm.contextMemory,
				})
				if err != nil {
					b.Fatalf("Run: %v", err)
				}
			}
		})
	}
}

func BenchmarkBuildSelectionCatalog(b *testing.B) {
	planned := benchmarkSelectionCatalogTasks(20, 3, 100)
	b.ReportAllocs()

	for b.Loop() {
		_ = buildSelectionCatalogFromTasks("/tmp/i18n.jsonc", planned)
	}
}

var benchmarkCacheKeySink string

func benchmarkPlanningConfig(sourcePath, targetPath string, groups int) config.I18NConfig {
	cfg := testConfig(sourcePath, targetPath)
	cfg.Groups = make(map[string]config.GroupConfig, groups)
	for i := range groups {
		cfg.Groups[fmt.Sprintf("group_%02d", i)] = config.GroupConfig{
			Targets: []string{"fr"},
			Buckets: []string{"ui"},
		}
	}
	return cfg
}

func benchmarkJSONEntries(count int) string {
	var b strings.Builder
	b.WriteByte('{')
	for i := range count {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%q:%q", fmt.Sprintf("key_%03d", i), fmt.Sprintf("Value %03d", i))
	}
	b.WriteByte('}')
	return b.String()
}

func benchmarkRunService(entryCount, localeCount int) *Service {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPaths := make([]string, 0, localeCount)
	targetLocales := make([]string, 0, localeCount)
	for i := range localeCount {
		targetLocales = append(targetLocales, fmt.Sprintf("l%02d", i))
		targetPaths = append(targetPaths, fmt.Sprintf("/tmp/out-%02d.json", i))
	}
	cfg := config.I18NConfig{
		Locales: config.LocaleConfig{
			Source:  "en",
			Targets: targetLocales,
		},
		Buckets: map[string]config.BucketConfig{
			"ui": {
				Files: []config.BucketFileMapping{{
					From: sourcePath,
					To:   "/tmp/out-{{target}}.json",
				}},
			},
		},
		Groups: map[string]config.GroupConfig{
			"default": {
				Targets: targetLocales,
				Buckets: []string{"ui"},
			},
		},
		LLM: config.LLMConfig{
			Profiles: map[string]config.LLMProfile{
				"default": {
					Provider: "openai",
					Model:    "gpt-4.1-mini",
					Prompt:   "Translate {{source}} to {{target}}: {{input}}",
				},
			},
			ContextMemory: &config.LLMContextMemoryProfile{
				Provider: "openai",
				Model:    "gpt-4.1-mini",
			},
		},
	}
	sourceContent := benchmarkJSONEntries(entryCount)

	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		return &cfg, nil
	}
	svc.loadLock = func(_ string) (*lockfile.File, error) {
		return &lockfile.File{
			LocaleStates:  map[string]lockfile.LocaleCheckpoint{},
			RunCompleted:  map[string]lockfile.RunCompletion{},
			RunCheckpoint: map[string]lockfile.RunCheckpoint{},
		}, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(sourceContent), nil
		default:
			if slices.Contains(targetPaths, path) {
				return []byte(`{}`), nil
			}
			return nil, filepath.ErrBadPattern
		}
	}
	svc.writeFile = func(_ string, _ []byte) error { return nil }
	svc.saveLock = func(_ string, _ lockfile.File) error { return nil }
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		if req.TargetLanguage == "en" && strings.Contains(req.SystemPrompt, "translation memory notes") {
			return "Terminology: stable\nTone: neutral\nFormatting: preserve placeholders\nDo-not-translate: brand names", nil
		}
		return "T(" + req.Source + ")", nil
	}
	return svc
}

func benchmarkSelectionCatalogTasks(fileCount, groupCount, entriesPerFile int) []Task {
	tasks := make([]Task, 0, fileCount*groupCount*3*entriesPerFile)
	targets := []string{"fr", "de", "es"}
	for groupIndex := range groupCount {
		groupName := fmt.Sprintf("group_%02d", groupIndex)
		for fileIndex := range fileCount {
			sourcePath := filepath.ToSlash(filepath.Join("/tmp/content/en", fmt.Sprintf("file_%02d.json", fileIndex)))
			for _, target := range targets {
				for entryIndex := range entriesPerFile {
					tasks = append(tasks, Task{
						GroupName:    groupName,
						BucketName:   "ui",
						TargetLocale: target,
						SourcePath:   sourcePath,
						EntryKey:     fmt.Sprintf("key_%03d", entryIndex),
					})
				}
			}
		}
	}
	return tasks
}
