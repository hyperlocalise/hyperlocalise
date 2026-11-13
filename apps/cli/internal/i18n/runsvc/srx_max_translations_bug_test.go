package runsvc

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestApplyMaxTranslationsLimitKeepsSRXSiblingSpansAtomic(t *testing.T) {
	tasks := []Task{
		{TargetPath: "/tmp/fr.json", EntryKey: "hello#srx.0"},
		{TargetPath: "/tmp/fr.json", EntryKey: "hello#srx.1"},
		{TargetPath: "/tmp/fr.json", EntryKey: "bye"},
	}
	limited, deferred := applyMaxTranslationsLimit(tasks, 1)
	if deferred != 1 || len(limited) != 2 {
		t.Fatalf("limited=%+v deferred=%d, want both hello spans kept together", limited, deferred)
	}
	if limited[0].EntryKey != "hello#srx.0" || limited[1].EntryKey != "hello#srx.1" {
		t.Fatalf("unexpected limited keys: %+v", limited)
	}

	limited, deferred = applyMaxTranslationsLimit(tasks, 2)
	if deferred != 1 || len(limited) != 2 {
		t.Fatalf("max=2 should still stop after hello group: limited=%+v deferred=%d", limited, deferred)
	}

	limited, deferred = applyMaxTranslationsLimit(tasks, 3)
	if deferred != 0 || len(limited) != 3 {
		t.Fatalf("max=3 should take all: limited=%d deferred=%d", len(limited), deferred)
	}
}

// MaxTranslations must not flush a target after only some SRX sibling spans
// complete with source-language text substituted for the deferred siblings.
func TestSRXMaxTranslationsKeepsSiblingSpansAtomicOnWriteback(t *testing.T) {
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	files := map[string][]byte{
		sourcePath: []byte(srxHelloWorldJSON),
		targetPath: []byte(`{}`),
	}
	var lockState lockfile.File
	svc := newTestService()
	svc.loadConfig = func(string) (*config.I18NConfig, error) {
		cfg := withMappingSRX(testConfig(sourcePath, targetPath), "default")
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
	svc.loadLock = func(string) (*lockfile.File, error) {
		cloned := lockState
		if cloned.RunCompleted == nil {
			cloned.RunCompleted = map[string]lockfile.RunCompletion{}
		}
		if cloned.RunCheckpoint == nil {
			cloned.RunCheckpoint = map[string]lockfile.RunCheckpoint{}
		}
		return &cloned, nil
	}
	svc.saveLock = func(_ string, f lockfile.File) error {
		lockState = f
		return nil
	}
	var sources []string
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		sources = append(sources, req.Source)
		switch strings.TrimSpace(req.Source) {
		case "Hello.":
			return "Bonjour.", nil
		case "World.":
			return "Monde.", nil
		default:
			t.Fatalf("unexpected source %q", req.Source)
			return "", nil
		}
	}

	report, err := svc.Run(context.Background(), Input{Workers: 1, MaxTranslations: 1})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.ExecutableTotal != 2 || report.DeferredByLimit != 0 || report.Succeeded != 2 {
		t.Fatalf("expected atomic sibling group of 2, report=%+v", report)
	}
	if len(sources) != 2 {
		t.Fatalf("sources = %#v, want both spans translated", sources)
	}

	var payload map[string]string
	if err := json.Unmarshal(files[targetPath], &payload); err != nil {
		t.Fatalf("decode target %s: %v", files[targetPath], err)
	}
	if payload["hello"] != "Bonjour. Monde." {
		t.Fatalf("joined hello = %q, want Bonjour. Monde. (no source fallback)", payload["hello"])
	}
	if strings.Contains(payload["hello"], "World.") {
		t.Fatalf("target still contains source-language text: %q", payload["hello"])
	}
}
