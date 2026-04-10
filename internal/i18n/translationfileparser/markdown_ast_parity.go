package translationfileparser

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

// MarkdownASTParityWarnings returns human-readable warnings when the set of
// MarkdownASTPaths for marshaled output differs from the source template,
// using the same path-set comparison as the check command.
func MarkdownASTParityWarnings(sourceContent, marshaledContent []byte, sourcePath, targetPath string) []string {
	if len(sourceContent) == 0 || len(marshaledContent) == 0 {
		return nil
	}
	sourceMDX := strings.EqualFold(filepath.Ext(sourcePath), ".mdx")
	targetMDX := strings.EqualFold(filepath.Ext(targetPath), ".mdx")
	sourcePaths := MarkdownASTPaths(sourceContent, sourceMDX)
	targetPaths := MarkdownASTPaths(marshaledContent, targetMDX)

	sourceSet := make(map[string]struct{}, len(sourcePaths))
	for _, p := range sourcePaths {
		sourceSet[p] = struct{}{}
	}
	targetSet := make(map[string]struct{}, len(targetPaths))
	for _, p := range targetPaths {
		targetSet[p] = struct{}{}
	}

	var missing []string
	for _, p := range sourcePaths {
		if _, ok := targetSet[p]; !ok {
			missing = append(missing, p)
		}
	}
	slices.Sort(missing)

	var extra []string
	for _, p := range targetPaths {
		if _, ok := sourceSet[p]; !ok {
			extra = append(extra, p)
		}
	}
	slices.Sort(extra)

	if len(missing) == 0 && len(extra) == 0 {
		return nil
	}

	var out []string
	const maxList = 5
	if len(missing) > 0 {
		show := missing
		if len(show) > maxList {
			show = show[:maxList]
		}
		out = append(out, fmt.Sprintf("markdown AST parity: marshaled output missing %d source path(s) in %q (examples: %s)", len(missing), targetPath, strings.Join(show, ", ")))
	}
	if len(extra) > 0 {
		show := extra
		if len(show) > maxList {
			show = show[:maxList]
		}
		out = append(out, fmt.Sprintf("markdown AST parity: marshaled output has %d unexpected path(s) in %q (examples: %s)", len(extra), targetPath, strings.Join(show, ", ")))
	}
	return out
}
