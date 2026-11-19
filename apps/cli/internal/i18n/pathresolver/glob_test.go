package pathresolver

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func writeGlobFixture(t *testing.T, root string, paths ...string) {
	t.Helper()
	for _, path := range paths {
		full := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func relativeMatches(t *testing.T, root string, matches []string) []string {
	t.Helper()
	out := make([]string, 0, len(matches))
	for _, match := range matches {
		rel, err := filepath.Rel(root, match)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, filepath.ToSlash(rel))
	}
	return out
}

func TestResolveGlobSkipsDependencyAndBuildDirs(t *testing.T) {
	root := t.TempDir()
	writeGlobFixture(t, root,
		"app/lang/en.json",
		"pkg/feature/lang/en.json",
		"node_modules/lib/lang/en.json",
		"app/node_modules/lib/lang/en.json",
		".git/lang/en.json",
		"dist/lang/en.json",
		"build/lang/en.json",
		".next/lang/en.json",
		"coverage/lang/en.json",
	)

	matches, err := ResolveGlob(filepath.Join(root, "**", "lang", "en.json"))
	if err != nil {
		t.Fatalf("ResolveGlob() error = %v", err)
	}
	want := []string{"app/lang/en.json", "pkg/feature/lang/en.json"}
	if got := relativeMatches(t, root, matches); !slices.Equal(got, want) {
		t.Fatalf("ResolveGlob() = %v, want %v", got, want)
	}
}

func TestResolveGlobWalksSkippedDirNamedInPattern(t *testing.T) {
	root := t.TempDir()
	writeGlobFixture(t, root,
		"dist/locales/en.json",
		"pkg/dist/en.json",
		"node_modules/lib/dist/en.json",
	)

	matches, err := ResolveGlob(filepath.Join(root, "dist", "**", "*.json"))
	if err != nil {
		t.Fatalf("ResolveGlob() error = %v", err)
	}
	if got, want := relativeMatches(t, root, matches), []string{"dist/locales/en.json"}; !slices.Equal(got, want) {
		t.Fatalf("base dir pattern: ResolveGlob() = %v, want %v", got, want)
	}

	matches, err = ResolveGlob(filepath.Join(root, "**", "dist", "en.json"))
	if err != nil {
		t.Fatalf("ResolveGlob() error = %v", err)
	}
	if got, want := relativeMatches(t, root, matches), []string{"pkg/dist/en.json"}; !slices.Equal(got, want) {
		t.Fatalf("segment pattern: ResolveGlob() = %v, want %v", got, want)
	}
}
