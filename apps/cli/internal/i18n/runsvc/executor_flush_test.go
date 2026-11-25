package runsvc

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

// multiTargetService plans one target file per source file, each with keysPerTarget keys, so
// tests can exercise many target flushes in one run.
func multiTargetService(targets, keysPerTarget int) (*Service, []string) {
	svc := newTestService()
	sources := map[string]string{}
	targetPaths := make([]string, 0, targets)
	files := make([]config.BucketFileMapping, 0, targets)
	for i := range targets {
		sourcePath := fmt.Sprintf("/tmp/multi/src-%03d.json", i)
		targetPath := fmt.Sprintf("/tmp/multi/out-%03d.json", i)
		var b strings.Builder
		b.WriteString("{")
		for k := range keysPerTarget {
			if k > 0 {
				b.WriteString(",")
			}
			fmt.Fprintf(&b, `"k%02d":"value %d-%d"`, k, i, k)
		}
		b.WriteString("}")
		sources[sourcePath] = b.String()
		targetPaths = append(targetPaths, targetPath)
		files = append(files, config.BucketFileMapping{From: sourcePath, To: targetPath})
	}
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig("unused", "unused")
		cfg.Buckets["ui"] = config.BucketConfig{Files: files}
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		if content, ok := sources[path]; ok {
			return []byte(content), nil
		}
		if strings.HasPrefix(path, "/tmp/multi/out-") {
			return []byte(`{}`), nil
		}
		return nil, errors.New("unexpected read " + path)
	}
	return svc, targetPaths
}

func TestRunWritesEachTargetExactlyOnce(t *testing.T) {
	for _, workers := range []int{1, 3, 16} {
		t.Run(fmt.Sprintf("workers=%d", workers), func(t *testing.T) {
			svc, targetPaths := multiTargetService(40, 3)
			var mu sync.Mutex
			writes := map[string]int{}
			svc.writeFile = func(path string, _ []byte) error {
				mu.Lock()
				writes[path]++
				mu.Unlock()
				return nil
			}

			report, err := svc.Run(context.Background(), Input{Workers: workers})
			if err != nil {
				t.Fatalf("run: %v", err)
			}
			if report.Succeeded != 120 || report.Failed != 0 || report.PersistedToLock != 120 {
				t.Fatalf("unexpected report totals: succeeded=%d failed=%d persisted=%d", report.Succeeded, report.Failed, report.PersistedToLock)
			}
			mu.Lock()
			defer mu.Unlock()
			if len(writes) != len(targetPaths) {
				t.Fatalf("expected %d targets written, got %d", len(targetPaths), len(writes))
			}
			for _, path := range targetPaths {
				if writes[path] != 1 {
					t.Fatalf("expected %s written once, got %d", path, writes[path])
				}
			}
		})
	}
}

func TestRunRollsBackOnlyTheTargetWhoseWriteFails(t *testing.T) {
	svc, targetPaths := multiTargetService(3, 2)
	failing := targetPaths[1]
	svc.writeFile = serialWriteFile(func(path string, _ []byte) error {
		if path == failing {
			return errors.New("disk full")
		}
		return nil
	})
	var lastLock lockfile.File
	svc.saveLock = func(_ string, f lockfile.File) error {
		lastLock = f
		return nil
	}

	report, err := svc.Run(context.Background(), Input{Workers: 2})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Failed == 0 {
		t.Fatalf("expected the failed write to be reported, got %+v", report.Failures)
	}
	foundFailure := false
	for _, failure := range report.Failures {
		if failure.TargetPath == failing && strings.Contains(failure.Reason, "disk full") {
			foundFailure = true
		}
	}
	if !foundFailure {
		t.Fatalf("expected a failure for %s, got %+v", failing, report.Failures)
	}
	for i, path := range targetPaths {
		for _, key := range []string{"k00", "k01"} {
			_, persisted := lastLock.RunCompleted[taskLockIdentity(svc.projectRoot, path, "fr", key)]
			if i == 1 && persisted {
				t.Fatalf("expected %s/%s rolled back after its write failed", path, key)
			}
			if i != 1 && !persisted {
				t.Fatalf("expected %s/%s kept in the lockfile", path, key)
			}
		}
	}
}

// Cancelling while a target is being written must not let Run return before that write ends,
// or the write would race with whatever the caller does next.
func TestRunWaitsForInFlightTargetWritesOnCancel(t *testing.T) {
	svc, _ := multiTargetService(4, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var started, finished atomic.Int32
	svc.writeFile = func(_ string, _ []byte) error {
		if started.Add(1) == 1 {
			cancel()
			time.Sleep(50 * time.Millisecond)
		}
		finished.Add(1)
		return nil
	}

	_, _ = svc.Run(ctx, Input{Workers: 1})
	if started.Load() == 0 {
		t.Fatal("expected at least one target write")
	}
	if got, want := finished.Load(), started.Load(); got != want {
		t.Fatalf("Run returned with %d of %d target writes still running", want-got, want)
	}
}

// A failed lock save while target writes are in flight must still end the run cleanly.
func TestRunSurfacesLockSaveErrorWithWritesInFlight(t *testing.T) {
	svc, _ := multiTargetService(8, 2)
	svc.lockPersistBatchSize = 1
	release := make(chan struct{})
	var once sync.Once
	svc.writeFile = func(_ string, _ []byte) error {
		<-release
		return nil
	}
	svc.saveLock = func(_ string, f lockfile.File) error {
		if len(f.RunCompleted) > 0 {
			once.Do(func() { close(release) })
			return errors.New("lockfile is read-only")
		}
		return nil
	}

	done := make(chan error, 1)
	go func() {
		_, err := svc.Run(context.Background(), Input{Workers: 2})
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "lockfile is read-only") {
			t.Fatalf("expected the lock save error, got %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run hung after a lock save error with target writes in flight")
	}
}

func TestExecutePoolSharesTranslateBudgetWithParityRetry(t *testing.T) {
	svc, _ := multiTargetService(1, 1)
	cfg, err := svc.loadConfig("")
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	tasks, _, err := svc.planTasks(cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	parity := &markdownParityRetryInput{cfg: cfg}
	lockState := &lockfile.File{RunCompleted: map[string]lockfile.RunCompletion{}, RunCheckpoint: map[string]lockfile.RunCheckpoint{}}
	if _, _, _, err := svc.executePool(context.Background(), tasks, nil, nil, "", lockState, 2, "run-1", nil, contextMemoryPlan{}, nil, newEventEmitter(nil), false, parity, false); err != nil {
		t.Fatalf("execute pool: %v", err)
	}
	if parity.translateSem == nil || cap(parity.translateSem) != 2 {
		t.Fatalf("expected parity retry to use the pool's translate budget of 2, got %v", parity.translateSem)
	}
}
