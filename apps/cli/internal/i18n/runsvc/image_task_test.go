package runsvc

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func imageTestConfig(sourcePath, targetPath string) config.I18NConfig {
	cfg := testConfig(sourcePath, targetPath)
	cfg.Locales.Targets = []string{"fr", "de"}
	cfg.Groups["default"] = config.GroupConfig{Targets: []string{"fr", "de"}, Buckets: []string{"ui"}}
	profile := cfg.LLM.Profiles["default"]
	profile.Model = "ignored-text-model"
	cfg.LLM.Profiles["default"] = profile
	return cfg
}

func TestRunImageDryRunPlansOneTaskPerTargetLocale(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.png"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := imageTestConfig(sourcePath, "/tmp/[locale]/image.png")
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte("source-image"), nil
		}
		return nil, filepath.ErrBadPattern
	}
	svc.editImage = func(_ context.Context, _ translator.ImageEditRequest) ([]byte, error) {
		t.Fatal("editImage should not be called during dry-run")
		return nil, nil
	}

	report, err := svc.Run(context.Background(), Input{DryRun: true})
	if err != nil {
		t.Fatalf("run dry-run: %v", err)
	}
	if report.PlannedTotal != 2 || report.ExecutableTotal != 2 {
		t.Fatalf("planned/executable = %d/%d, want 2/2", report.PlannedTotal, report.ExecutableTotal)
	}
	for _, task := range report.Executable {
		if task.Kind != taskKindImage {
			t.Fatalf("task kind = %q, want image", task.Kind)
		}
		if task.Model != translator.OpenAIImageModel {
			t.Fatalf("task model = %q, want %q", task.Model, translator.OpenAIImageModel)
		}
		if task.EntryKey != imageEntryKey {
			t.Fatalf("task entry key = %q, want %q", task.EntryKey, imageEntryKey)
		}
	}
}

func TestRunImageRejectsNonOpenAIProvider(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.png"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := imageTestConfig(sourcePath, "/tmp/fr/image.png")
		profile := cfg.LLM.Profiles["default"]
		profile.Provider = "anthropic"
		cfg.LLM.Profiles["default"] = profile
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte("source-image"), nil
		}
		return nil, filepath.ErrBadPattern
	}

	_, err := svc.Run(context.Background(), Input{DryRun: true})
	if err == nil {
		t.Fatal("expected non-OpenAI provider error")
	}
	if got := err.Error(); !strings.Contains(got, "image localization is only supported with provider \"openai\"") || !strings.Contains(got, sourcePath) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunImageEditWritesLocalizedImage(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.png"
	targetPath := "/tmp/fr/image.webp"
	localized := []byte("localized-webp")
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig(sourcePath, targetPath)
		profile := cfg.LLM.Profiles["default"]
		profile.Model = "ignored-text-model"
		cfg.LLM.Profiles["default"] = profile
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte("source-image"), nil
		}
		return nil, filepath.ErrBadPattern
	}
	var gotReq translator.ImageEditRequest
	svc.editImage = func(_ context.Context, req translator.ImageEditRequest) ([]byte, error) {
		gotReq = req
		return localized, nil
	}
	var wrotePath string
	var wroteContent []byte
	svc.writeFile = func(path string, content []byte) error {
		wrotePath = path
		wroteContent = append([]byte(nil), content...)
		return nil
	}

	report, err := svc.Run(context.Background(), Input{Workers: 1})
	if err != nil {
		t.Fatalf("run image edit: %v", err)
	}
	if report.Succeeded != 1 || report.Failed != 0 {
		t.Fatalf("succeeded/failed = %d/%d, want 1/0", report.Succeeded, report.Failed)
	}
	if wrotePath != targetPath || !bytes.Equal(wroteContent, localized) {
		t.Fatalf("write = (%q, %q), want (%q, %q)", wrotePath, string(wroteContent), targetPath, string(localized))
	}
	if gotReq.Model != translator.OpenAIImageModel {
		t.Fatalf("image model = %q, want %q", gotReq.Model, translator.OpenAIImageModel)
	}
	if gotReq.OutputFormat != "webp" {
		t.Fatalf("output format = %q, want webp", gotReq.OutputFormat)
	}
	if !strings.Contains(gotReq.Prompt, "fr") {
		t.Fatalf("prompt should include target locale, got %q", gotReq.Prompt)
	}
}

func TestRunImageOutputFormatByTargetExtension(t *testing.T) {
	for _, tt := range []struct {
		targetPath string
		want       string
	}{
		{targetPath: "/tmp/fr/image.png", want: "png"},
		{targetPath: "/tmp/fr/image.jpg", want: "jpeg"},
		{targetPath: "/tmp/fr/image.jpeg", want: "jpeg"},
		{targetPath: "/tmp/fr/image.webp", want: "webp"},
	} {
		t.Run(filepath.Ext(tt.targetPath), func(t *testing.T) {
			svc := newTestService()
			sourcePath := "/tmp/source.png"
			svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
				cfg := testConfig(sourcePath, tt.targetPath)
				return &cfg, nil
			}
			svc.readFile = func(path string) ([]byte, error) {
				if path == sourcePath {
					return []byte("source-image"), nil
				}
				return nil, filepath.ErrBadPattern
			}
			var gotFormat string
			svc.editImage = func(_ context.Context, req translator.ImageEditRequest) ([]byte, error) {
				gotFormat = req.OutputFormat
				return []byte("localized-image"), nil
			}

			if _, err := svc.Run(context.Background(), Input{Workers: 1}); err != nil {
				t.Fatalf("run image edit: %v", err)
			}
			if gotFormat != tt.want {
				t.Fatalf("output format = %q, want %q", gotFormat, tt.want)
			}
		})
	}
}

func TestRunImageLockSkip(t *testing.T) {
	sourcePath := "/tmp/source.png"
	targetPath := "/tmp/fr/image.png"
	lockState := &lockfile.File{
		LocaleStates:  map[string]lockfile.LocaleCheckpoint{},
		RunCompleted:  map[string]lockfile.RunCompletion{},
		RunCheckpoint: map[string]lockfile.RunCheckpoint{},
	}
	newImageService := func() *Service {
		svc := newTestService()
		svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
			cfg := testConfig(sourcePath, targetPath)
			return &cfg, nil
		}
		svc.loadLock = func(_ string) (*lockfile.File, error) { return lockState, nil }
		svc.saveLock = func(_ string, f lockfile.File) error {
			*lockState = f
			return nil
		}
		svc.readFile = func(path string) ([]byte, error) {
			if path == sourcePath {
				return []byte("source-image"), nil
			}
			return nil, filepath.ErrBadPattern
		}
		return svc
	}

	first := newImageService()
	if _, err := first.Run(context.Background(), Input{Workers: 1}); err != nil {
		t.Fatalf("first run: %v", err)
	}

	second := newImageService()
	second.editImage = func(_ context.Context, _ translator.ImageEditRequest) ([]byte, error) {
		t.Fatal("editImage should not be called for lock-skipped image")
		return nil, nil
	}
	report, err := second.Run(context.Background(), Input{Workers: 1})
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if report.SkippedByLock != 1 || report.ExecutableTotal != 0 {
		t.Fatalf("skipped/executable = %d/%d, want 1/0", report.SkippedByLock, report.ExecutableTotal)
	}
}
