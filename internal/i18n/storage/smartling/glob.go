package smartling

import (
	"io/fs"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

func resolveSourcePaths(basePath, pattern string) ([]string, error) {
	localPattern := strings.TrimPrefix(filepath.ToSlash(pattern), "/")
	localPattern = filepath.Clean(filepath.Join(basePath, filepath.FromSlash(localPattern)))

	if !strings.ContainsAny(localPattern, "*?[") {
		return []string{localPattern}, nil
	}
	if !strings.Contains(localPattern, "**") {
		matches, err := filepath.Glob(localPattern)
		if err != nil {
			return nil, err
		}
		slices.Sort(matches)
		return matches, nil
	}
	re, err := globToRegex(filepath.ToSlash(localPattern))
	if err != nil {
		return nil, err
	}
	baseDir := baseDirForDoublestar(localPattern)
	matches := make([]string, 0)
	err = filepath.WalkDir(baseDir, func(candidate string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
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

func baseDirForDoublestar(pattern string) string {
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

func globToRegex(pattern string) (*regexp.Regexp, error) {
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
		case '[':
			charClass, width := parseGlobCharClass(pattern[i:])
			b.WriteString(charClass)
			i += width
			continue
		default:
			b.WriteString(regexp.QuoteMeta(pattern[i : i+1]))
		}
		i++
	}
	b.WriteString("$")
	return regexp.Compile(b.String())
}

func parseGlobCharClass(pattern string) (string, int) {
	if len(pattern) < 2 {
		return `\[`, 1
	}

	var b strings.Builder
	b.WriteByte('[')
	i := 1

	switch pattern[i] {
	case '!', '^':
		b.WriteByte('^')
		i++
	}

	if i < len(pattern) && pattern[i] == ']' {
		b.WriteString(`\]`)
		i++
	}

	for ; i < len(pattern); i++ {
		ch := pattern[i]
		if ch == '/' {
			return `\[`, 1
		}
		if ch == ']' {
			b.WriteByte(']')
			return b.String(), i + 1
		}
		if ch == '\\' {
			b.WriteString(`\\`)
			continue
		}
		b.WriteByte(ch)
	}

	return `\[`, 1
}
