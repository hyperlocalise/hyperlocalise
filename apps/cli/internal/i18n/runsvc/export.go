package runsvc

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/pathguard"
)

// ExportInput reconstructs a translated target file from a source template and prefilled entries.
type ExportInput struct {
	TargetPath   string
	SourcePath   string
	SourceLocale string
	TargetLocale string
	Prefilled    map[string]string
	ProjectRoot  string
}

// ExportPrefilledTarget writes the native file format for targetPath using prefilled segment values.
func ExportPrefilledTarget(in ExportInput) ([]byte, error) {
	targetPath := strings.TrimSpace(in.TargetPath)
	sourcePath := strings.TrimSpace(in.SourcePath)
	if targetPath == "" {
		return nil, fmt.Errorf("export target path is required")
	}
	if sourcePath == "" {
		return nil, fmt.Errorf("export source path is required")
	}
	s := New()
	if root := strings.TrimSpace(in.ProjectRoot); root != "" {
		canonicalRoot, err := pathguard.CanonicalForContainment(root)
		if err != nil {
			return nil, fmt.Errorf("resolve export project root: %w", err)
		}
		s.enforceProjectPaths = true
		s.projectRoot = canonicalRoot
	}

	content, _, err := s.marshalTargetFile(
		targetPath,
		sourcePath,
		strings.TrimSpace(in.SourceLocale),
		strings.TrimSpace(in.TargetLocale),
		in.Prefilled,
		in.Prefilled,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("export %q from %q: %w", targetPath, sourcePath, err)
	}
	if len(content) == 0 {
		return nil, fmt.Errorf("export %q from %q: produced empty output", targetPath, sourcePath)
	}
	return content, nil
}

// ResolveExportPath joins projectRoot with a relative path when needed.
func ResolveExportPath(projectRoot, path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", fmt.Errorf("path is empty")
	}
	candidate := trimmed
	if !filepath.IsAbs(candidate) {
		if strings.TrimSpace(projectRoot) == "" {
			return "", fmt.Errorf("project root is required for relative path %q", trimmed)
		}
		candidate = filepath.Join(projectRoot, candidate)
	}
	if strings.TrimSpace(projectRoot) != "" {
		if err := pathguard.EnsureUnderRoot(projectRoot, candidate); err != nil {
			return "", err
		}
	}
	return candidate, nil
}
