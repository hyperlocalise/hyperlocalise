package runsvc

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestRetryMarkdownASTParityScopeExhausted(t *testing.T) {
	sourcePath := "/tmp/source.md"
	targetPath := "/tmp/out.md"
	source := "Hello world.\n"

	entries, err := translationfileparser.MarkdownParser{}.Parse([]byte(source))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected markdown entries")
	}

	cfg := testConfig(sourcePath, targetPath)
	in := &markdownParityRetryInput{
		cfg:           &cfg,
		bucket:        "ui",
		group:         "default",
		targetLocales: []string{"fr"},
		sourcePaths:   []string{sourcePath},
	}

	svc := newTestService()
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(source), nil
		}
		return nil, fmt.Errorf("unexpected readFile %q", path)
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		return req.Source, nil
	}

	t.Cleanup(func() { marshalMarkdownTargetHook = nil })
	marshalMarkdownTargetHook = func(path, srcPath string, _ map[string]string) ([]byte, []string, error) {
		if path != targetPath || srcPath != sourcePath {
			t.Fatalf("unexpected marshal paths %q %q", path, srcPath)
		}
		return nil, nil, &translationfileparser.MarkdownASTParityError{
			TargetPath: path,
			Messages:   []string{"stub parity"},
		}
	}

	out := stagedOutput{
		entries:      entries,
		sourcePath:   sourcePath,
		sourceLocale: "en",
		targetLocale: "fr",
	}

	rerr := svc.retryMarkdownASTParityScope(context.Background(), in, targetPath, out, []string{"initial"})
	if rerr == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(rerr.Error(), "markdown parity retry exhausted after 3 passes") {
		t.Fatalf("unexpected error: %v", rerr)
	}
}

func TestRetryMarkdownASTParityScopeMTOnlyFailsWithoutAnyTranslateCall(t *testing.T) {
	sourcePath := "/tmp/source.md"
	targetPath := "/tmp/out.md"
	source := "Hello world.\n"

	entries, err := translationfileparser.MarkdownParser{}.Parse([]byte(source))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected markdown entries")
	}

	cfg := testConfig(sourcePath, targetPath)
	cfg.MT = &config.MTConfig{
		Profiles: map[string]config.MTProfile{
			"p1": {Provider: "google", APIKeyEnv: "X"},
		},
	}
	cfg.Translation = &config.TranslationConfig{
		Default: config.TranslationSelection{Type: config.TranslationTypeMT, Profile: "p1"},
	}
	in := &markdownParityRetryInput{
		cfg:           &cfg,
		bucket:        "ui",
		group:         "default",
		targetLocales: []string{"fr"},
		sourcePaths:   []string{sourcePath},
	}

	svc := newTestService()
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return []byte(source), nil
		}
		return nil, fmt.Errorf("unexpected readFile %q", path)
	}
	var translateCalled atomic.Bool
	svc.translate = func(_ context.Context, _ translator.Request) (string, error) {
		translateCalled.Store(true)
		t.Fatal("LLM translate must not be called for an MT-routed parity-retry scope")
		return "", nil
	}

	var marshalCalled atomic.Bool
	t.Cleanup(func() { marshalMarkdownTargetHook = nil })
	marshalMarkdownTargetHook = func(path, srcPath string, _ map[string]string) ([]byte, []string, error) {
		marshalCalled.Store(true)
		t.Fatal("remarshal must not be attempted for a pure-MT parity-retry scope")
		return nil, nil, nil
	}

	out := stagedOutput{
		entries:      entries,
		sourcePath:   sourcePath,
		sourceLocale: "en",
		targetLocale: "fr",
	}

	rerr := svc.retryMarkdownASTParityScope(context.Background(), in, targetPath, out, []string{"initial parity issue"})
	if rerr == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(rerr.Error(), "is not retried") {
		t.Fatalf("unexpected error: %v", rerr)
	}
	if translateCalled.Load() {
		t.Fatal("svc.translate was called")
	}
	if marshalCalled.Load() {
		t.Fatal("marshalMarkdownTargetHook was called")
	}
}
