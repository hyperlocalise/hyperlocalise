package pathguard

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureUnderRoot(t *testing.T) {
	tmp := t.TempDir()

	root, err := filepath.EvalSymlinks(tmp)
	if err != nil {
		root = tmp
	}
	root = filepath.Join(root, "root")

	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatalf("failed to create root: %v", err)
	}

	subdir := filepath.Join(root, "subdir")
	if err := os.MkdirAll(subdir, 0755); err != nil {
		t.Fatalf("failed to create subdir: %v", err)
	}

	outside := filepath.Join(filepath.Dir(root), "outside")
	if err := os.MkdirAll(outside, 0755); err != nil {
		t.Fatalf("failed to create outside: %v", err)
	}

	tests := []struct {
		name      string
		root      string
		candidate string
		wantErr   bool
	}{
		{
			name:      "direct child",
			root:      root,
			candidate: filepath.Join(root, "file.txt"),
			wantErr:   false,
		},
		{
			name:      "nested child",
			root:      root,
			candidate: filepath.Join(subdir, "file.txt"),
			wantErr:   false,
		},
		{
			name:      "exactly root",
			root:      root,
			candidate: root,
			wantErr:   false,
		},
		{
			name:      "escapes via dot dot",
			root:      root,
			candidate: filepath.Join(root, "..", "outside"),
			wantErr:   true,
		},
		{
			name:      "outside path",
			root:      root,
			candidate: outside,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := EnsureUnderRoot(tt.root, tt.candidate)
			if (err != nil) != tt.wantErr {
				t.Errorf("EnsureUnderRoot() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestEnsureUnderRoot_Symlinks(t *testing.T) {
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Skipf("failed to eval symlinks for temp dir: %v", err)
	}

	root := filepath.Join(tmp, "root")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatalf("failed to create root: %v", err)
	}

	outside := filepath.Join(tmp, "outside")
	if err := os.MkdirAll(outside, 0755); err != nil {
		t.Fatalf("failed to create outside: %v", err)
	}
	outsideFile := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(outsideFile, []byte("secret"), 0644); err != nil {
		t.Fatalf("failed to write outside file: %v", err)
	}

	// Symlink inside root pointing outside
	linkOutside := filepath.Join(root, "link_outside")
	if err := os.Symlink(outsideFile, linkOutside); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	// Symlink outside pointing inside root
	linkInside := filepath.Join(outside, "link_inside")
	if err := os.Symlink(root, linkInside); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	tests := []struct {
		name      string
		root      string
		candidate string
		wantErr   bool
	}{
		{
			name:      "symlink inside root pointing outside should be rejected",
			root:      root,
			candidate: linkOutside,
			wantErr:   true,
		},
		{
			name:      "symlink outside root pointing inside root is accepted because target is inside",
			root:      root,
			candidate: linkInside,
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := EnsureUnderRoot(tt.root, tt.candidate)
			if (err != nil) != tt.wantErr {
				t.Errorf("EnsureUnderRoot(%q, %q) error = %v, wantErr %v", tt.root, tt.candidate, err, tt.wantErr)
			}
		})
	}
}

func TestCanonicalForContainment_NonExistent(t *testing.T) {
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		tmp = t.TempDir()
	}
	root := filepath.Join(tmp, "root")

	// root doesn't exist yet
	path := filepath.Join(root, "a", "b", "c")

	canonical, err := CanonicalForContainment(path)
	if err != nil {
		t.Fatalf("CanonicalForContainment failed: %v", err)
	}

	expected, _ := filepath.Abs(path)
	if canonical != expected {
		t.Errorf("expected %q, got %q", expected, canonical)
	}
}

func TestEnsureCanonicalUnderRoot(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "root")
	outside := filepath.Join(tmp, "outside")

	tests := []struct {
		name      string
		root      string
		candidate string
		wantErr   bool
	}{
		{
			name:      "simple containment",
			root:      root,
			candidate: filepath.Join(root, "file.txt"),
			wantErr:   false,
		},
		{
			name:      "exactly root",
			root:      root,
			candidate: root,
			wantErr:   false,
		},
		{
			name:      "escape via dot dot",
			root:      root,
			candidate: outside,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := EnsureCanonicalUnderRoot(tt.root, tt.candidate)
			if (err != nil) != tt.wantErr {
				t.Errorf("EnsureCanonicalUnderRoot() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestCanonicalForContainment_Symlinks(t *testing.T) {
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Skipf("failed to eval symlinks for temp dir: %v", err)
	}

	realDir := filepath.Join(tmp, "real")
	if err := os.MkdirAll(realDir, 0755); err != nil {
		t.Fatalf("failed to create real dir: %v", err)
	}

	linkDir := filepath.Join(tmp, "link")
	if err := os.Symlink(realDir, linkDir); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	// Test path through symlink to existing file
	realFile := filepath.Join(realDir, "file.txt")
	if err := os.WriteFile(realFile, []byte("hello"), 0644); err != nil {
		t.Fatalf("failed to write real file: %v", err)
	}

	pathThroughLink := filepath.Join(linkDir, "file.txt")
	canonical, err := CanonicalForContainment(pathThroughLink)
	if err != nil {
		t.Fatalf("CanonicalForContainment failed: %v", err)
	}

	if canonical != realFile {
		t.Errorf("expected %q, got %q", realFile, canonical)
	}

	// Test path through symlink to non-existing file
	pathThroughLinkMissing := filepath.Join(linkDir, "missing.txt")
	canonical, err = CanonicalForContainment(pathThroughLinkMissing)
	if err != nil {
		t.Fatalf("CanonicalForContainment failed: %v", err)
	}

	expectedMissing := filepath.Join(realDir, "missing.txt")
	if canonical != expectedMissing {
		t.Errorf("expected %q, got %q", expectedMissing, canonical)
	}
}
