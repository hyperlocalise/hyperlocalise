package pathresolver

import (
	"io/fs"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// skippedGlobDirs are dependency, VCS, and build output directories that `**` walks never enter.
// They can hold hundreds of thousands of files (node_modules) and never hold source catalogs. A
// pattern that names one as a literal segment, such as `dist/**/en.json` or `**/build/en.json`,
// still walks it.
var skippedGlobDirs = []string{".git", ".next", "build", "coverage", "dist", "node_modules"}

// ResolveGlob returns the sorted files matching a source pattern. Patterns without glob tokens
// return themselves, patterns without `**` use filepath.Glob, and `**` patterns walk the
// directory before the first `**`.
func ResolveGlob(pattern string) ([]string, error) {
	if !strings.ContainsAny(pattern, "*?[") {
		return []string{pattern}, nil
	}
	if !strings.Contains(pattern, "**") {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			return nil, err
		}
		slices.Sort(matches)
		return matches, nil
	}

	normalizedPattern := filepath.ToSlash(pattern)
	re, err := GlobToRegex(normalizedPattern)
	if err != nil {
		return nil, err
	}
	skipped := skippedDirsForPattern(normalizedPattern)

	baseDir := DoublestarBaseDir(pattern)
	matches := make([]string, 0)
	err = filepath.WalkDir(baseDir, func(candidate string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			if candidate != baseDir && slices.Contains(skipped, d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if re.MatchString(filepath.ToSlash(candidate)) {
			matches = append(matches, candidate)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	slices.Sort(matches)
	return matches, nil
}

// skippedDirsForPattern drops any skipped directory the pattern names as a literal segment.
func skippedDirsForPattern(normalizedPattern string) []string {
	segments := strings.Split(normalizedPattern, "/")
	skipped := make([]string, 0, len(skippedGlobDirs))
	for _, name := range skippedGlobDirs {
		if !slices.Contains(segments, name) {
			skipped = append(skipped, name)
		}
	}
	return skipped
}

// DoublestarBaseDir returns the directory before the first `**` in a pattern.
func DoublestarBaseDir(pattern string) string {
	normalized := filepath.ToSlash(pattern)
	idx := strings.Index(normalized, "**")
	if idx == -1 {
		return filepath.Dir(pattern)
	}
	prefix := strings.TrimSuffix(normalized[:idx], "/")
	if prefix == "" {
		return "."
	}
	return filepath.FromSlash(prefix)
}

// GlobBaseDir returns the directory before the first glob token in a pattern.
func GlobBaseDir(pattern string) string {
	idx := strings.IndexAny(filepath.ToSlash(pattern), "*?[")
	if idx == -1 {
		return filepath.Dir(pattern)
	}
	prefix := filepath.ToSlash(pattern)[:idx]
	prefix = strings.TrimSuffix(prefix, "/")
	if prefix == "" {
		return "."
	}
	return filepath.FromSlash(prefix)
}

// GlobToRegex compiles a slash-separated glob with `*`, `?`, and `**` into an anchored regexp.
// Other characters, including brackets, match literally.
func GlobToRegex(pattern string) (*regexp.Regexp, error) {
	var b strings.Builder
	b.WriteString("^")
	for i := 0; i < len(pattern); {
		switch pattern[i] {
		case '*':
			if i+1 < len(pattern) && pattern[i+1] == '*' {
				if i+2 < len(pattern) && pattern[i+2] == '/' {
					b.WriteString("(?:.*/)?")
					i += 3
					continue
				}
				b.WriteString(".*")
				i += 2
				continue
			}
			b.WriteString("[^/]*")
		case '?':
			b.WriteString("[^/]")
		default:
			b.WriteString(regexp.QuoteMeta(pattern[i : i+1]))
		}
		i++
	}
	b.WriteString("$")
	return regexp.Compile(b.String())
}
