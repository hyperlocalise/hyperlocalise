package runsvc

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
)

// BenchmarkSnapshotStagedOutputsForPath looks up one target among many staged outputs, which
// every target flush does while holding the staging lock.
func BenchmarkSnapshotStagedOutputsForPath(b *testing.B) {
	for _, targets := range []int{100, 10_000} {
		staged := make(map[string]stagedOutput, targets+8)
		for i := range targets {
			staged[fmt.Sprintf("locales/fr/file-%05d.json", i)] = stagedOutput{targetLocale: "fr"}
		}
		for _, locale := range []string{"de", "es", "fr", "ja"} {
			staged[stagedOutputKey("sheets/all.xlsx", locale)] = stagedOutput{}
		}
		b.Run(fmt.Sprintf("targets=%d/plain", targets), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				if len(snapshotStagedOutputsForPath(staged, "locales/fr/file-00042.json")) != 1 {
					b.Fatal("missing output")
				}
			}
		})
		b.Run(fmt.Sprintf("targets=%d/shared", targets), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				if len(snapshotStagedOutputsForPath(staged, "sheets/all.xlsx")) != 4 {
					b.Fatal("missing outputs")
				}
			}
		})
	}
}

// BenchmarkRunManyTargets runs many small target files. "slow_writes" gives each file write a
// fixed latency (a network drive, a big markdown file, a parity retry) to show how well target
// writes overlap with translation and with each other.
func BenchmarkRunManyTargets(b *testing.B) {
	for _, bm := range []struct {
		name  string
		delay time.Duration
	}{
		{name: "fast_writes"},
		{name: "slow_writes", delay: 500 * time.Microsecond},
	} {
		b.Run(bm.name, func(b *testing.B) {
			svc, _ := multiTargetService(64, 4)
			svc.writeFile = func(_ string, _ []byte) error {
				if bm.delay > 0 {
					time.Sleep(bm.delay)
				}
				return nil
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				if _, err := svc.Run(context.Background(), Input{Force: true, Workers: 4}); err != nil {
					b.Fatalf("run: %v", err)
				}
			}
		})
	}
}

// BenchmarkRunLockfileWrites runs with the real lockfile writer and reports how many bytes of
// lockfile one run writes. That grows with saves x lockfile size, so it shows how mid-run saves
// scale with run size.
func BenchmarkRunLockfileWrites(b *testing.B) {
	for _, keys := range []int{500, 2_000} {
		b.Run(fmt.Sprintf("keys=%d", keys), func(b *testing.B) {
			svc, _ := multiTargetService(keys/50, 50)
			svc.writeFile = func(_ string, _ []byte) error { return nil }
			path := filepath.Join(b.TempDir(), "bench.lock.json")
			var written atomic.Int64
			svc.saveLock = func(_ string, f lockfile.File) error {
				if err := lockfile.Save(path, f); err != nil {
					return err
				}
				if info, err := os.Stat(path); err == nil {
					written.Add(info.Size())
				}
				return nil
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				if _, err := svc.Run(context.Background(), Input{Force: true, Workers: 8}); err != nil {
					b.Fatalf("run: %v", err)
				}
			}
			b.ReportMetric(float64(written.Load())/float64(b.N)/1e6, "lockMB/op")
		})
	}
}
