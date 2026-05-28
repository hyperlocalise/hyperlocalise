package pathguard

import (
	"fmt"
	"path/filepath"
	"strings"
)

// CanonicalForContainment resolves symlinks in path when possible. If the final
// path does not exist yet, it resolves the nearest existing parent and appends
// the missing suffix.
func CanonicalForContainment(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		return filepath.Clean(resolved), nil
	}

	dir := abs
	var suffix []string
	for {
		resolved, err := filepath.EvalSymlinks(dir)
		if err == nil {
			for i := len(suffix) - 1; i >= 0; i-- {
				resolved = filepath.Join(resolved, suffix[i])
			}
			return filepath.Clean(resolved), nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return filepath.Clean(abs), nil
		}
		suffix = append(suffix, filepath.Base(dir))
		dir = parent
	}
}

// EnsureUnderRoot rejects candidate paths that escape root after symlink-aware
// canonicalization.
func EnsureUnderRoot(root, candidate string) error {
	rootCanonical, err := CanonicalForContainment(root)
	if err != nil {
		return fmt.Errorf("resolve root path: %w", err)
	}
	candidateCanonical, err := CanonicalForContainment(candidate)
	if err != nil {
		return fmt.Errorf("resolve candidate path: %w", err)
	}
	if err := EnsureCanonicalUnderRoot(rootCanonical, candidateCanonical); err != nil {
		return err
	}
	return nil
}

// EnsureCanonicalUnderRoot compares already-canonical paths.
func EnsureCanonicalUnderRoot(root, candidate string) error {
	rel, err := filepath.Rel(root, candidate)
	if err != nil {
		return fmt.Errorf("resolve relative path: %w", err)
	}
	rel = filepath.ToSlash(rel)
	if rel == ".." || strings.HasPrefix(rel, "../") {
		return fmt.Errorf("path %q escapes root %q", candidate, root)
	}
	return nil
}
