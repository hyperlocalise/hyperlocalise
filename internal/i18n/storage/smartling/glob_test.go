package smartling

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestGlobToRegex(t *testing.T) {
	tests := []struct {
		pattern string
		match   []string
		fail    []string
	}{
		{
			pattern: "a/b.js",
			match:   []string{"a/b.js"},
			fail:    []string{"a/c.js", "a/b.jss", "ba/b.js"},
		},
		{
			pattern: "a/*.js",
			match:   []string{"a/b.js", "a/c.js"},
			fail:    []string{"a/b/c.js", "a/js", "b/b.js"},
		},
		{
			pattern: "a/??.js",
			match:   []string{"a/bc.js", "a/12.js"},
			fail:    []string{"a/b.js", "a/bcd.js", "a/b/c.js"},
		},
		{
			pattern: "a/**/*",
			match:   []string{"a/b", "a/b/c", "a/b/c/d"},
			fail:    []string{"b/c"},
		},
		{
			pattern: "**/foo.js",
			match:   []string{"foo.js", "a/foo.js", "a/b/foo.js"},
			fail:    []string{"foo.jss", "a/foo.js/b"},
		},
		{
			pattern: "a/[bc].js",
			match:   []string{"a/b.js", "a/c.js"},
			fail:    []string{"a/a.js", "a/bc.js"},
		},
		{
			pattern: "a/[!bc].js",
			match:   []string{"a/a.js", "a/d.js"},
			fail:    []string{"a/b.js", "a/c.js"},
		},
	}

	for _, tt := range tests {
		re, err := globToRegex(tt.pattern)
		if err != nil {
			t.Errorf("globToRegex(%q) error: %v", tt.pattern, err)
			continue
		}
		for _, s := range tt.match {
			if !re.MatchString(s) {
				t.Errorf("globToRegex(%q) should match %q", tt.pattern, s)
			}
		}
		for _, s := range tt.fail {
			if re.MatchString(s) {
				t.Errorf("globToRegex(%q) should NOT match %q", tt.pattern, s)
			}
		}
	}
}

func TestBaseDirForDoublestar(t *testing.T) {
	tests := []struct {
		pattern string
		want    string
	}{
		{"a/b/**/*.json", filepath.FromSlash("a/b")},
		{"**/foo.json", "."},
		{"a/b/c.json", filepath.FromSlash("a/b")}, // Falls back to filepath.Dir
		{"**", "."},
	}

	for _, tt := range tests {
		got := baseDirForDoublestar(tt.pattern)
		if got != tt.want {
			t.Errorf("baseDirForDoublestar(%q) = %q, want %q", tt.pattern, got, tt.want)
		}
	}
}

func TestResolveSourcePaths(t *testing.T) {
	tempDir := t.TempDir()

	files := []string{
		"a.json",
		"b/c.json",
		"b/d.json",
		"b/e/f.json",
		"g.txt",
	}

	for _, f := range files {
		path := filepath.Join(tempDir, filepath.FromSlash(f))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	tests := []struct {
		pattern string
		want    []string
	}{
		{
			pattern: "*.json",
			want:    []string{filepath.Join(tempDir, "a.json")},
		},
		{
			pattern: "b/*.json",
			want: []string{
				filepath.Join(tempDir, "b/c.json"),
				filepath.Join(tempDir, "b/d.json"),
			},
		},
		{
			pattern: "**/*.json",
			want: []string{
				filepath.Join(tempDir, "a.json"),
				filepath.Join(tempDir, "b/c.json"),
				filepath.Join(tempDir, "b/d.json"),
				filepath.Join(tempDir, "b/e/f.json"),
			},
		},
		{
			pattern: "b/**/*.json",
			want: []string{
				filepath.Join(tempDir, "b/c.json"),
				filepath.Join(tempDir, "b/d.json"),
				filepath.Join(tempDir, "b/e/f.json"),
			},
		},
		{
			pattern: "a.json",
			want:    []string{filepath.Join(tempDir, "a.json")},
		},
	}

	for _, tt := range tests {
		got, err := resolveSourcePaths(tempDir, tt.pattern)
		if err != nil {
			t.Errorf("resolveSourcePaths(%q) error: %v", tt.pattern, err)
			continue
		}

		// Normalize paths for comparison
		for i := range got {
			got[i] = filepath.Clean(got[i])
		}
		want := make([]string, len(tt.want))
		for i := range tt.want {
			want[i] = filepath.Clean(tt.want[i])
		}

		if !reflect.DeepEqual(got, want) {
			t.Errorf("resolveSourcePaths(%q) = %v, want %v", tt.pattern, got, want)
		}
	}
}

func TestParseGlobCharClass(t *testing.T) {
	tests := []struct {
		pattern string
		wantRE  string
		wantLen int
	}{
		{"[abc]def", "[abc]", 5},
		{"[!abc]def", "[^abc]", 6},
		{"[^abc]def", "[^abc]", 6},
		{"[]abc]def", `[\]abc]`, 6},
		{"[a-z]def", "[a-z]", 5},
		{"[", `\[`, 1},
		{"[]", `\[`, 1},
	}

	for _, tt := range tests {
		gotRE, gotLen := parseGlobCharClass(tt.pattern)
		if gotRE != tt.wantRE || gotLen != tt.wantLen {
			t.Errorf("parseGlobCharClass(%q) = (%q, %d), want (%q, %d)", tt.pattern, gotRE, gotLen, tt.wantRE, tt.wantLen)
		}
	}
}
