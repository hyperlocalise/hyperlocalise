package cmd

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// naiveLineForValue is the original per-call scan that the cached index replaces.
func naiveLineForValue(content []byte, value string) int {
	needle := strings.TrimSpace(value)
	if needle == "" {
		return 0
	}
	for i, line := range strings.Split(string(content), "\n") {
		if strings.Contains(line, needle) {
			return i + 1
		}
	}
	return 0
}

func naiveLineForKey(content []byte, key string) int {
	key = strings.TrimSpace(key)
	if key == "" {
		return 0
	}
	segments := strings.Split(key, ".")
	for i := len(segments) - 1; i >= 0; i-- {
		segment := strings.TrimSpace(segments[i])
		if segment == "" {
			continue
		}
		if line := naiveLineForValue(content, `"`+segment+`"`); line > 0 {
			return line
		}
	}
	return 0
}

func TestCheckCachedFileLineLookupsMatchNaiveScan(t *testing.T) {
	t.Parallel()

	content := "{\n" +
		"  \"nav\": {\n" +
		"    \"home\": \"Home\",\n" +
		"    \"quote\": \"Say \\\"hello\\\" to \\\"home\\\"\",\n" +
		"    \"empty\": \"\",\n" +
		"    \"dup\": \"Home\"\n" +
		"  },\n" +
		"  \"a\": \"x\", \"b\": \"y\"\r\n" +
		"  \"multi\": \"line one\nline two\",\n" +
		"  \"with.dot\": \"v\"\n" +
		"}\n"
	path := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	f := newCheckFileCache().file(path)
	if _, err := f.read(); err != nil {
		t.Fatalf("read: %v", err)
	}

	keys := []string{
		"nav.home", "nav.quote", "nav.empty", "nav.dup", "a", "b", "multi", "with.dot",
		"missing", "nav.missing", " nav . home ", "", "...", `say "hi"`, "hello\\", "x", ": ", "line one",
	}
	for _, key := range keys {
		if got, want := f.lineForKey(key), naiveLineForKey([]byte(content), key); got != want {
			t.Errorf("lineForKey(%q) = %d, want %d", key, got, want)
		}
	}
	values := []string{
		"Home", "hello", `\"home\"`, "y", " line two ", "line one\nline two", "", "   ", "absent", "}", "{",
	}
	for _, value := range values {
		// Ask twice so the memoized result is checked too.
		for range 2 {
			if got, want := f.lineForValue(value), naiveLineForValue([]byte(content), value); got != want {
				t.Errorf("lineForValue(%q) = %d, want %d", value, got, want)
			}
		}
	}
}

func TestCheckLocationResolverMissingFile(t *testing.T) {
	t.Parallel()

	resolver := &checkLocationResolver{}
	missing := filepath.Join(t.TempDir(), "missing.json")
	if file, line := resolver.resolve(missing, missing, "key", "", "", false); file != missing || line != 1 {
		t.Fatalf("resolve missing = %q:%d, want %q:1", file, line, missing)
	}
}

func TestRunCheckStopsWhenContextCancelled(t *testing.T) {
	t.Parallel()

	o := defaultCheckOptions()
	o.configPath = writeCheckPerfFixture(t, 100, []string{"fr", "de"})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := runCheck(ctx, o); !errors.Is(err, context.Canceled) {
		t.Fatalf("runCheck error = %v, want context.Canceled", err)
	}
}

func TestRunCheckLargeUntranslatedFileAnnotatesEveryKey(t *testing.T) {
	t.Parallel()

	o := defaultCheckOptions()
	o.configPath = writeCheckPerfFixture(t, 2000, []string{"fr", "de"})
	report, err := runCheck(context.Background(), o)
	if err != nil {
		t.Fatalf("runCheck: %v", err)
	}
	if got, want := len(report.Findings), 4000; got != want {
		t.Fatalf("findings = %d, want %d", got, want)
	}
	sourcePath := filepath.Join(filepath.Dir(o.configPath), "en.json")
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read source: %v", err)
	}
	for _, finding := range report.Findings {
		if finding.Type != checkNotLocalized || finding.AnnotationFile != sourcePath {
			t.Fatalf("unexpected finding %+v", finding)
		}
		if want := naiveLineForKey(content, finding.Key); finding.AnnotationLine != want {
			t.Fatalf("finding %q line = %d, want %d", finding.Key, finding.AnnotationLine, want)
		}
	}
}
