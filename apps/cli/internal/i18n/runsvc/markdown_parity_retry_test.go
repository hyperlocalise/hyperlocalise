package runsvc

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
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
