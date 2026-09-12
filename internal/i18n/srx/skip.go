package srx

import (
	"path/filepath"
	"regexp"
	"strings"
)

var (
	icuMessagePattern = regexp.MustCompile(`\{[A-Za-z_][A-Za-z0-9_]*\s*,\s*(plural|select|selectordinal)\b`)
	icuPlaceholder    = regexp.MustCompile(`\{[A-Za-z_][A-Za-z0-9_]*\}`)
	printfPattern     = regexp.MustCompile(`%(?:\d+\$)?[-+#0 ]*\d*(?:\.\d+)?[sdifFeEgGxXucpo@]`)
	fluentVarPattern  = regexp.MustCompile(`\{\s*\$[A-Za-z_][A-Za-z0-9_]*`)
)

// FormatSupports reports whether a source path/parser mode may apply SRX.
func FormatSupports(path, parserMode string) bool {
	switch strings.ToLower(strings.TrimSpace(parserMode)) {
	case "formatjs", "arb":
		return false
	}

	normalized := strings.ToLower(filepath.ToSlash(strings.TrimSpace(path)))
	switch {
	case strings.HasSuffix(normalized, ".xlf"),
		strings.HasSuffix(normalized, ".xlif"),
		strings.HasSuffix(normalized, ".xliff"),
		strings.HasSuffix(normalized, ".po"),
		strings.HasSuffix(normalized, ".pot"),
		strings.HasSuffix(normalized, ".srt"),
		strings.HasSuffix(normalized, ".vtt"),
		strings.HasSuffix(normalized, ".xcstrings"),
		strings.HasSuffix(normalized, ".stringsdict"):
		return false
	default:
		return true
	}
}

// ShouldSkipValue reports whether a leaf value should stay a single translation unit.
func ShouldSkipValue(text, parserMode string) bool {
	if !FormatSupports("", parserMode) {
		return true
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return true
	}
	if icuMessagePattern.MatchString(trimmed) {
		return true
	}
	if icuPlaceholder.MatchString(trimmed) {
		return true
	}
	if fluentVarPattern.MatchString(trimmed) {
		return true
	}
	if printfPattern.MatchString(trimmed) {
		return true
	}
	return false
}
