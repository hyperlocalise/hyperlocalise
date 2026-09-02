package runsvc

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/pathguard"
)

const (
	defaultRunConfigYAMLPath  = "i18n.yml"
	defaultRunConfigJSONCPath = "i18n.jsonc"
)

func (s *Service) configureProjectPathRoot(configPath string) error {
	root, ok, err := runtimeConfigRoot(configPath)
	if err != nil {
		return err
	}
	if !ok {
		s.enforceProjectPaths = false
		s.projectRoot = ""
		return nil
	}
	s.enforceProjectPaths = true
	s.projectRoot = root
	return nil
}

func runtimeConfigRoot(configPath string) (string, bool, error) {
	path := strings.TrimSpace(configPath)
	if path == "" {
		switch {
		case fileExists(defaultRunConfigYAMLPath):
			path = defaultRunConfigYAMLPath
		case fileExists(defaultRunConfigJSONCPath):
			path = defaultRunConfigJSONCPath
		default:
			return "", false, nil
		}
	}
	root, err := pathguard.CanonicalForContainment(filepath.Dir(path))
	if err != nil {
		return "", false, fmt.Errorf("resolve config directory: %w", err)
	}
	return root, true, nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (s *Service) validateProjectPath(path string) error {
	if !s.enforceProjectPaths {
		return nil
	}
	return pathguard.EnsureUnderRoot(s.projectRoot, path)
}

func (s *Service) resolveProjectPattern(pattern string) string {
	trimmed := strings.TrimSpace(pattern)
	if trimmed == "" || filepath.IsAbs(trimmed) || !s.enforceProjectPaths || strings.TrimSpace(s.projectRoot) == "" {
		return trimmed
	}
	return filepath.Join(s.projectRoot, trimmed)
}

func (s *Service) resolveProjectSourcePaths(sourcePattern string) ([]string, error) {
	return resolveSourcePaths(s.resolveProjectPattern(sourcePattern))
}

func (s *Service) resolveProjectTargetPath(sourcePattern, targetPattern, sourcePath string) (string, error) {
	return resolveTargetPath(
		s.resolveProjectPattern(sourcePattern),
		s.resolveProjectPattern(targetPattern),
		s.resolveProjectPattern(sourcePath),
	)
}

func relativizeProjectPath(projectRoot, path string) (string, bool) {
	root := strings.TrimSpace(projectRoot)
	trimmed := strings.TrimSpace(path)
	if root == "" || trimmed == "" {
		return "", false
	}
	rel, err := filepath.Rel(root, trimmed)
	if err != nil {
		return "", false
	}
	rel = filepath.ToSlash(rel)
	if rel == ".." || strings.HasPrefix(rel, "../") {
		return "", false
	}
	return rel, true
}

func preferredTaskIdentity(projectRoot, targetPath, entryKey string) string {
	if rel, ok := relativizeProjectPath(projectRoot, targetPath); ok {
		return taskIdentity(rel, entryKey)
	}
	return taskIdentity(targetPath, entryKey)
}

func plannedLockTargetPath(projectRoot, targetPath string) string {
	if rel, ok := relativizeProjectPath(projectRoot, targetPath); ok {
		return rel
	}
	return targetPath
}

func sourcePathMatchesFilter(projectRoot, filter, sourcePath string) bool {
	for _, candidate := range sourcePathFilterCandidates(projectRoot, filter) {
		if filepath.Clean(candidate) == filepath.Clean(sourcePath) {
			return true
		}
	}
	return false
}

func sourcePathMatchesAnyFilter(projectRoot string, filters []string, sourcePath string) bool {
	for _, filter := range filters {
		if sourcePathMatchesFilter(projectRoot, filter, sourcePath) {
			return true
		}
	}
	return false
}

func sourcePathFilterCandidates(projectRoot, filter string) []string {
	trimmed := strings.TrimSpace(filter)
	if trimmed == "" {
		return nil
	}
	seen := make(map[string]struct{})
	add := func(candidate string) {
		candidate = filepath.Clean(candidate)
		if candidate == "" {
			return
		}
		seen[candidate] = struct{}{}
	}
	add(trimmed)
	if abs, err := filepath.Abs(trimmed); err == nil {
		add(abs)
	}
	if root := strings.TrimSpace(projectRoot); root != "" && !filepath.IsAbs(trimmed) {
		add(filepath.Join(root, trimmed))
	}
	candidates := make([]string, 0, len(seen))
	for candidate := range seen {
		candidates = append(candidates, candidate)
	}
	slices.Sort(candidates)
	return candidates
}

func (s *Service) expandSourcePathFilters(paths []string) (map[string]struct{}, []string, error) {
	if len(paths) == 0 {
		return nil, nil, nil
	}

	originals := make([]string, 0, len(paths))
	matchSet := make(map[string]struct{})
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			return nil, nil, fmt.Errorf("invalid source file value: must not be empty")
		}
		originals = append(originals, trimmed)
		for _, candidate := range sourcePathFilterCandidates(s.projectRoot, trimmed) {
			matchSet[candidate] = struct{}{}
		}
	}
	return matchSet, originals, nil
}

func (s *Service) readProjectFile(path string) ([]byte, error) {
	if err := s.validateProjectPath(path); err != nil {
		return nil, err
	}
	return s.readFile(path)
}

func (s *Service) writeProjectFile(path string, content []byte) error {
	if err := s.validateProjectPath(path); err != nil {
		return err
	}
	return s.writeFile(path, content)
}
