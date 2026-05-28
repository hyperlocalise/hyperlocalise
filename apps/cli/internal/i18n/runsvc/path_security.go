package runsvc

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/pathguard"
)

const (
	defaultRunConfigYAMLPath  = "i18n.yml"
	defaultRunConfigJSONCPath = "i18n.jsonc"
)

func (s *Service) configureProjectPathRoot(configPath string) (func(), error) {
	previousEnforce := s.enforceProjectPaths
	previousRoot := s.projectRoot
	restore := func() {
		s.enforceProjectPaths = previousEnforce
		s.projectRoot = previousRoot
	}

	root, ok, err := runtimeConfigRoot(configPath)
	if err != nil {
		return restore, err
	}
	if !ok {
		s.enforceProjectPaths = false
		s.projectRoot = ""
		return restore, nil
	}
	s.enforceProjectPaths = true
	s.projectRoot = root
	return restore, nil
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
