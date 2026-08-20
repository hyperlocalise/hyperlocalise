package pathguard

import (
	"os"
	"path/filepath"
	"testing"
)

// TestEnsureUnderRoot_PrefixBoundary_ScoutEdgeCases tests root directory prefix matching,
// ensuring directories with matching prefix names (e.g. /root vs /root_sibling) are rejected.
func TestEnsureUnderRoot_PrefixBoundary_ScoutEdgeCases(t *testing.T) {
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		tmp = t.TempDir()
	}

	root := filepath.Join(tmp, "workspace")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("failed to create root dir: %v", err)
	}

	siblingDir := filepath.Join(tmp, "workspace_sibling")
	if err := os.MkdirAll(siblingDir, 0o755); err != nil {
		t.Fatalf("failed to create sibling dir: %v", err)
	}

	tests := []struct {
		name      string
		root      string
		candidate string
		wantErr   bool
	}{
		{
			name:      "sibling directory with prefix collision",
			root:      root,
			candidate: filepath.Join(siblingDir, "secret.txt"),
			wantErr:   true,
		},
		{
			name:      "root with trailing slash and candidate child",
			root:      root + string(filepath.Separator),
			candidate: filepath.Join(root, "child", "file.txt"),
			wantErr:   false,
		},
		{
			name:      "candidate with trailing slash inside root",
			root:      root,
			candidate: filepath.Join(root, "child") + string(filepath.Separator),
			wantErr:   false,
		},
		{
			name:      "sibling directory with trailing slash on root",
			root:      root + string(filepath.Separator),
			candidate: filepath.Join(siblingDir, "file.txt"),
			wantErr:   true,
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

// TestCanonicalForContainment_ChainedSymlinks_ScoutEdgeCases tests multi-hop symlink chains
// resolving through intermediate non-existent subdirectories and symlink targets.
func TestCanonicalForContainment_ChainedSymlinks_ScoutEdgeCases(t *testing.T) {
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Skipf("failed to eval symlinks for temp dir: %v", err)
	}

	targetDir := filepath.Join(tmp, "target_real")
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		t.Fatalf("failed to create target dir: %v", err)
	}

	// Create chain: link1 -> link2 -> target_real
	link2 := filepath.Join(tmp, "link2")
	if err := os.Symlink(targetDir, link2); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	link1 := filepath.Join(tmp, "link1")
	if err := os.Symlink(link2, link1); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	// 1. Existing file through chained symlink
	realFile := filepath.Join(targetDir, "data.json")
	if err := os.WriteFile(realFile, []byte("{}"), 0o644); err != nil {
		t.Fatalf("failed to write file: %v", err)
	}

	candidateChainExisting := filepath.Join(link1, "data.json")
	canonicalExisting, err := CanonicalForContainment(candidateChainExisting)
	if err != nil {
		t.Fatalf("CanonicalForContainment failed for existing chain: %v", err)
	}

	if canonicalExisting != realFile {
		t.Errorf("expected canonical %q, got %q", realFile, canonicalExisting)
	}

	// 2. Non-existent deeply nested path through chained symlink
	candidateChainMissing := filepath.Join(link1, "nonexistent_dir", "sub_missing", "file.txt")
	canonicalMissing, err := CanonicalForContainment(candidateChainMissing)
	if err != nil {
		t.Fatalf("CanonicalForContainment failed for missing chain: %v", err)
	}

	expectedMissing := filepath.Join(targetDir, "nonexistent_dir", "sub_missing", "file.txt")
	if canonicalMissing != expectedMissing {
		t.Errorf("expected canonical missing %q, got %q", expectedMissing, canonicalMissing)
	}
}

// TestEnsureUnderRoot_ChainedSymlinksAndEscapes_ScoutEdgeCases verifies containment checks when
// candidates involve multi-hop symlink chains escaping or entering the root.
func TestEnsureUnderRoot_ChainedSymlinksAndEscapes_ScoutEdgeCases(t *testing.T) {
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Skipf("failed to eval symlinks for temp dir: %v", err)
	}

	root := filepath.Join(tmp, "root")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("failed to create root: %v", err)
	}

	outside := filepath.Join(tmp, "outside")
	if err := os.MkdirAll(outside, 0o755); err != nil {
		t.Fatalf("failed to create outside: %v", err)
	}

	// Chain inside root pointing outside: root/hop1 -> root/hop2 -> outside
	hop2 := filepath.Join(root, "hop2")
	if err := os.Symlink(outside, hop2); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	hop1 := filepath.Join(root, "hop1")
	if err := os.Symlink(hop2, hop1); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	// Chain outside root pointing inside: outside/in_hop2 -> outside/in_hop1 -> root
	inHop1 := filepath.Join(outside, "in_hop1")
	if err := os.Symlink(root, inHop1); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	inHop2 := filepath.Join(outside, "in_hop2")
	if err := os.Symlink(inHop1, inHop2); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	tests := []struct {
		name      string
		root      string
		candidate string
		wantErr   bool
	}{
		{
			name:      "multi-hop symlink inside root pointing outside",
			root:      root,
			candidate: filepath.Join(hop1, "file.txt"),
			wantErr:   true,
		},
		{
			name:      "multi-hop symlink outside root pointing inside root",
			root:      root,
			candidate: filepath.Join(inHop2, "file.txt"),
			wantErr:   false,
		},
		{
			name:      "non-existent file under multi-hop symlink inside root pointing outside",
			root:      root,
			candidate: filepath.Join(hop1, "missing_dir", "file.txt"),
			wantErr:   true,
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
