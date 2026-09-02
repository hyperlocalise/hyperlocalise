package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveConfigRelativePath(t *testing.T) {
	root := t.TempDir()
	absInside := filepath.Join(root, "src", "en.json")

	tests := []struct {
		name       string
		configRoot string
		path       string
		want       string
		wantErr    string
	}{
		{
			name:       "joins relative path to config root",
			configRoot: root,
			path:       "src/en.json",
			want:       filepath.Join(root, "src", "en.json"),
		},
		{
			name:       "keeps absolute path",
			configRoot: root,
			path:       absInside,
			want:       absInside,
		},
		{
			name:       "returns cleaned relative path without config root",
			configRoot: "",
			path:       "src/en.json",
			want:       "src/en.json",
		},
		{
			name:    "rejects empty path",
			path:    "  ",
			wantErr: "path is empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveConfigRelativePath(tt.configRoot, tt.path)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("resolveConfigRelativePath() error = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveConfigRelativePath() error = %v", err)
			}
			if filepath.Clean(got) != filepath.Clean(tt.want) {
				t.Fatalf("resolveConfigRelativePath() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRelativizeConfigPath(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	inside := filepath.Join(root, "src", "en.json")
	if err := os.MkdirAll(filepath.Dir(inside), 0o755); err != nil {
		t.Fatalf("mkdir inside: %v", err)
	}

	tests := []struct {
		name       string
		configRoot string
		path       string
		want       string
		wantErr    string
	}{
		{
			name:       "relativizes absolute path under config root",
			configRoot: root,
			path:       inside,
			want:       "src/en.json",
		},
		{
			name:       "relativizes config-relative path",
			configRoot: root,
			path:       "src/en.json",
			want:       "src/en.json",
		},
		{
			name:       "returns cleaned path without config root",
			configRoot: "",
			path:       "src/en.json",
			want:       "src/en.json",
		},
		{
			name:       "rejects path outside config root",
			configRoot: root,
			path:       filepath.Join(outside, "en.json"),
			wantErr:    "escapes config root",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := relativizeConfigPath(tt.configRoot, tt.path)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("relativizeConfigPath() error = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("relativizeConfigPath() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("relativizeConfigPath() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolveSourcePathsForStatusUsesConfigRoot(t *testing.T) {
	repoRoot := t.TempDir()
	projectDir := filepath.Join(repoRoot, "nested-app")
	sourcePath := filepath.Join(projectDir, "src", "locales", "en", "common.json")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	otherCWD := t.TempDir()
	t.Chdir(otherCWD)

	got, err := resolveSourcePathsForStatus(projectDir, "src/locales/en/common.json")
	if err != nil {
		t.Fatalf("resolveSourcePathsForStatus() error = %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("resolveSourcePathsForStatus() = %v, want one path", got)
	}
	if filepath.Clean(got[0]) != filepath.Clean(sourcePath) {
		t.Fatalf("resolveSourcePathsForStatus() = %q, want %q", got[0], sourcePath)
	}
}

func TestResolveSourcePathsForStatusExpandsDoublestarGlobFromConfigRoot(t *testing.T) {
	repoRoot := t.TempDir()
	projectDir := filepath.Join(repoRoot, "nested-app")
	first := filepath.Join(projectDir, "_posts", "en", "alpha.md")
	second := filepath.Join(projectDir, "_posts", "en", "nested", "beta.md")
	for _, path := range []string{first, second} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
		if err := os.WriteFile(path, []byte("# post"), 0o600); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	otherCWD := t.TempDir()
	t.Chdir(otherCWD)

	got, err := resolveSourcePathsForStatus(projectDir, "_posts/en/**/*.md")
	if err != nil {
		t.Fatalf("resolveSourcePathsForStatus() error = %v", err)
	}
	want := []string{first, second}
	if len(got) != len(want) {
		t.Fatalf("resolveSourcePathsForStatus() = %v, want %v", got, want)
	}
	for i, path := range want {
		if filepath.Clean(got[i]) != filepath.Clean(path) {
			t.Fatalf("resolveSourcePathsForStatus()[%d] = %q, want %q", i, got[i], path)
		}
	}
}

func TestResolveTargetPathForStatusMapsGlobFromConfigRoot(t *testing.T) {
	repoRoot := t.TempDir()
	projectDir := filepath.Join(repoRoot, "nested-app")
	sourcePattern := "_posts/en/**/*.md"
	sourcePath := filepath.Join(projectDir, "_posts", "en", "guides", "intro.md")

	got, err := resolveTargetPathForStatus(projectDir, sourcePattern, "_posts/fr/**/*.md", sourcePath)
	if err != nil {
		t.Fatalf("resolveTargetPathForStatus() error = %v", err)
	}
	want := filepath.Join(projectDir, "_posts", "fr", "guides", "intro.md")
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("resolveTargetPathForStatus() = %q, want %q", got, want)
	}
}

func setupNestedConfigLocaleProject(t *testing.T) (configPath, sourcePath, targetPath string) {
	t.Helper()

	repoRoot := t.TempDir()
	projectDir := filepath.Join(repoRoot, "nested-app")
	configPath = filepath.Join(projectDir, "i18n.jsonc")
	sourcePath = filepath.Join(projectDir, "src", "locales", "en", "common.json")
	targetPath = filepath.Join(projectDir, "src", "locales", "fr", "common.json")

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("create target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"hello":"Bonjour"}`), 0o600); err != nil {
		t.Fatalf("write target file: %v", err)
	}
	writeCheckConfigWithMappings(t, configPath, []checkConfigMapping{
		{source: "src/locales/en/common.json", target: "src/locales/fr/common.json"},
	}, []string{"fr"})

	return configPath, sourcePath, targetPath
}
