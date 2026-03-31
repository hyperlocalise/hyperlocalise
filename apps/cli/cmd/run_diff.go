package cmd

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

type runDiffSelection struct {
	SourcePaths     []string
	SourceEntryKeys map[string][]string
}

func resolveRunDiffSelection(ctx context.Context) (runDiffSelection, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return runDiffSelection{}, fmt.Errorf("resolve worktree diff: get current directory: %w", err)
	}

	changedFiles, err := gitChangedWorktreeFiles(ctx, cwd)
	if err != nil {
		return runDiffSelection{}, fmt.Errorf("resolve worktree diff: %w", err)
	}
	if len(changedFiles) == 0 {
		return runDiffSelection{}, nil
	}

	selection := runDiffSelection{
		SourceEntryKeys: map[string][]string{},
	}
	parser := translationfileparser.NewDefaultStrategy()

	for _, changedPath := range changedFiles {
		fullPath := filepath.Join(cwd, changedPath)
		if !fileExists(fullPath) {
			continue
		}

		if supportsKeyLevelDiff(changedPath) {
			changedKeys, err := gitChangedTranslationKeys(ctx, cwd, parser, changedPath, fullPath)
			if err != nil {
				return runDiffSelection{}, fmt.Errorf("resolve worktree diff for %q: %w", changedPath, err)
			}
			if len(changedKeys) > 0 {
				addSelectionSourceEntryKeys(&selection, cwd, changedPath, changedKeys)
				continue
			}
		}

		addSelectionSourcePath(&selection, cwd, changedPath)
	}

	selection.SourcePaths = uniqueSorted(selection.SourcePaths)
	for path, keys := range selection.SourceEntryKeys {
		selection.SourceEntryKeys[path] = uniqueSorted(keys)
	}
	if len(selection.SourceEntryKeys) == 0 {
		selection.SourceEntryKeys = nil
	}

	return selection, nil
}

func gitChangedWorktreeFiles(ctx context.Context, cwd string) ([]string, error) {
	hasHead := true
	if _, err := gitOutput(ctx, cwd, "rev-parse", "--verify", "HEAD"); err != nil {
		hasHead = false
	}

	changed := map[string]struct{}{}
	if hasHead {
		paths, err := gitPaths(ctx, cwd, "diff", "--name-only", "-z", "HEAD", "--")
		if err != nil {
			return nil, err
		}
		for _, path := range paths {
			changed[filepath.Clean(path)] = struct{}{}
		}
	} else {
		paths, err := gitPaths(ctx, cwd, "diff", "--cached", "--name-only", "-z", "--")
		if err != nil {
			return nil, err
		}
		for _, path := range paths {
			changed[filepath.Clean(path)] = struct{}{}
		}
		paths, err = gitPaths(ctx, cwd, "diff", "--name-only", "-z", "--")
		if err != nil {
			return nil, err
		}
		for _, path := range paths {
			changed[filepath.Clean(path)] = struct{}{}
		}
	}

	untracked, err := gitPaths(ctx, cwd, "ls-files", "--others", "--exclude-standard", "-z")
	if err != nil {
		return nil, err
	}
	for _, path := range untracked {
		changed[filepath.Clean(path)] = struct{}{}
	}

	paths := make([]string, 0, len(changed))
	for path := range changed {
		if strings.TrimSpace(path) == "" {
			continue
		}
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths, nil
}

func gitChangedTranslationKeys(ctx context.Context, cwd string, parser *translationfileparser.Strategy, relativePath, fullPath string) ([]string, error) {
	beforeContent, err := gitFileAtHEAD(ctx, cwd, relativePath)
	if err != nil {
		return nil, err
	}
	afterContent, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, err
	}

	beforeEntries := map[string]string{}
	if len(beforeContent) > 0 {
		parsed, err := parser.Parse(relativePath, beforeContent)
		if err != nil {
			return nil, nil
		}
		beforeEntries = parsed
	}

	afterEntries, err := parser.Parse(relativePath, afterContent)
	if err != nil {
		return nil, nil
	}

	changed := map[string]struct{}{}
	for key, after := range afterEntries {
		before, ok := beforeEntries[key]
		if !ok || before != after {
			changed[key] = struct{}{}
		}
	}
	for key := range beforeEntries {
		if _, ok := afterEntries[key]; !ok {
			changed[key] = struct{}{}
		}
	}

	keys := make([]string, 0, len(changed))
	for key := range changed {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys, nil
}

func supportsKeyLevelDiff(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".json", ".jsonc", ".arb":
		return true
	default:
		return false
	}
}

func gitFileAtHEAD(ctx context.Context, cwd, relativePath string) ([]byte, error) {
	content, err := gitOutput(ctx, cwd, "show", "HEAD:"+filepath.ToSlash(relativePath))
	if err != nil {
		if isGitRevisionMissing(err) {
			return nil, nil
		}
		return nil, err
	}
	return content, nil
}

func gitPaths(ctx context.Context, cwd string, args ...string) ([]string, error) {
	out, err := gitOutput(ctx, cwd, args...)
	if err != nil {
		return nil, err
	}
	raw := bytes.Split(out, []byte{0})
	paths := make([]string, 0, len(raw))
	for _, item := range raw {
		if len(item) == 0 {
			continue
		}
		paths = append(paths, string(item))
	}
	return paths, nil
}

func gitOutput(ctx context.Context, cwd string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = cwd
	out, err := cmd.Output()
	if err == nil {
		return out, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		stderr := strings.TrimSpace(string(exitErr.Stderr))
		if stderr != "" {
			return nil, fmt.Errorf("git %s: %s", strings.Join(args, " "), stderr)
		}
	}
	return nil, fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
}

func isGitRevisionMissing(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "exists on disk, but not in 'HEAD'") ||
		strings.Contains(msg, "bad revision") ||
		strings.Contains(msg, "invalid object name HEAD") ||
		strings.Contains(msg, "ambiguous argument 'HEAD'") ||
		strings.Contains(msg, "not a valid object name")
}

func addSelectionSourcePath(selection *runDiffSelection, cwd, path string) {
	selection.SourcePaths = append(selection.SourcePaths, canonicalSelectionPaths(cwd, path)...)
}

func addSelectionSourceEntryKeys(selection *runDiffSelection, cwd, path string, keys []string) {
	for _, candidatePath := range canonicalSelectionPaths(cwd, path) {
		selection.SourcePaths = append(selection.SourcePaths, candidatePath)
		selection.SourceEntryKeys[candidatePath] = append(selection.SourceEntryKeys[candidatePath], keys...)
	}
}

func canonicalSelectionPaths(cwd, path string) []string {
	relative := filepath.Clean(path)
	abs := filepath.Clean(filepath.Join(cwd, path))
	if relative == abs {
		return []string{relative}
	}
	return []string{relative, abs}
}

func uniqueSorted(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		unique = append(unique, trimmed)
	}
	sort.Strings(unique)
	return unique
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}
