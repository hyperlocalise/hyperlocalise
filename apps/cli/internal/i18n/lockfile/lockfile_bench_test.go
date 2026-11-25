package lockfile

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func benchmarkLockFile(entries int, activeRunID string) File {
	f := File{
		ActiveRunID:   activeRunID,
		RunCompleted:  make(map[string]RunCompletion, entries),
		RunCheckpoint: make(map[string]RunCheckpoint, entries),
	}
	value := strings.Repeat("traduction ", 6)
	now := time.Date(2026, 11, 25, 10, 0, 0, 0, time.UTC)
	for i := range entries {
		target := fmt.Sprintf("locales/fr/file-%03d.json", i/100)
		key := fmt.Sprintf("section.key_%05d", i)
		id := target + "::" + key
		f.RunCompleted[id] = RunCompletion{SourceHash: strings.Repeat("a", 64), TaskHash: strings.Repeat("b", 64)}
		if activeRunID != "" {
			f.RunCheckpoint[id] = RunCheckpoint{
				RunID: activeRunID, TargetPath: target, SourcePath: "locales/en.json", TargetLocale: "fr",
				EntryKey: key, Value: value, SourceHash: "a", TaskHash: "b", UpdatedAt: now,
			}
		}
	}
	return f
}

// BenchmarkSave measures one lockfile save: "active" is a mid-run checkpoint save (compact, with
// checkpoint values), "final" is the end-of-run save projects commit (indented, no checkpoints).
func BenchmarkSave(b *testing.B) {
	for _, entries := range []int{1_000, 10_000, 50_000} {
		for _, mode := range []string{"active", "final"} {
			b.Run(fmt.Sprintf("entries=%d/%s", entries, mode), func(b *testing.B) {
				runID := ""
				if mode == "active" {
					runID = "run-1"
				}
				f := benchmarkLockFile(entries, runID)
				path := filepath.Join(b.TempDir(), "bench.lock.json")
				b.ReportAllocs()
				b.ResetTimer()
				for b.Loop() {
					if err := Save(path, f); err != nil {
						b.Fatalf("save: %v", err)
					}
				}
			})
		}
	}
}

func BenchmarkLoad(b *testing.B) {
	for _, entries := range []int{1_000, 10_000} {
		b.Run(fmt.Sprintf("entries=%d", entries), func(b *testing.B) {
			path := filepath.Join(b.TempDir(), "bench.lock.json")
			if err := Save(path, benchmarkLockFile(entries, "run-1")); err != nil {
				b.Fatalf("seed: %v", err)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				if _, err := Load(path); err != nil {
					b.Fatalf("load: %v", err)
				}
			}
		})
	}
}
