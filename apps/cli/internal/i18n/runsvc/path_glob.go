package runsvc

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
)

func shouldIgnoreSourcePath(sourcePath, projectRoot string, targetLocales []string) bool {
	pathForScan := sourcePath
	configRelative := false
	if root := strings.TrimSpace(projectRoot); root != "" {
		if rel, err := filepath.Rel(root, sourcePath); err == nil {
			rel = filepath.ToSlash(rel)
			if rel != ".." && !strings.HasPrefix(rel, "../") {
				pathForScan = rel
				configRelative = true
			}
		}
	}

	return shouldIgnoreLocalePathSegments(pathForScan, configRelative, targetLocales)
}

func shouldIgnoreLocalePathSegments(pathForScan string, configRelative bool, targetLocales []string) bool {
	normalized := filepath.ToSlash(pathForScan)
	segments := strings.Split(normalized, "/")
	if len(segments) < 2 {
		return false
	}

	targets := make(map[string]struct{}, len(targetLocales))
	for _, locale := range targetLocales {
		targets[locale] = struct{}{}
	}

	start := 1
	if configRelative {
		start = 0
	}
	for i := start; i < len(segments)-1; i++ {
		if _, ok := targets[segments[i]]; ok {
			return true
		}
	}
	return false
}

func resolveSourcePaths(sourcePattern string) ([]string, error) {
	return pathresolver.ResolveGlob(sourcePattern)
}

func resolveTargetPath(sourcePattern, targetPattern, sourcePath string) (string, error) {
	if !strings.ContainsAny(sourcePattern, "*?[") {
		return targetPattern, nil
	}
	if !strings.ContainsAny(targetPattern, "*?[") {
		return "", fmt.Errorf("target pattern %q must include glob tokens when source pattern %q includes globs", targetPattern, sourcePattern)
	}
	sourceBase := globBaseDir(sourcePattern)
	targetBase := globBaseDir(targetPattern)
	relative, err := filepath.Rel(sourceBase, sourcePath)
	if err != nil {
		return "", err
	}
	parentPrefix := ".." + string(filepath.Separator)
	if relative == ".." || strings.HasPrefix(relative, parentPrefix) {
		return "", fmt.Errorf("source path %q escapes source base %q", sourcePath, sourceBase)
	}
	return filepath.Join(targetBase, relative), nil
}

func baseDirForDoublestar(pattern string) string {
	return pathresolver.DoublestarBaseDir(pattern)
}

func globBaseDir(pattern string) string {
	return pathresolver.GlobBaseDir(pattern)
}

func globToRegex(pattern string) (*regexp.Regexp, error) {
	return pathresolver.GlobToRegex(pattern)
}
