package pathresolver

import "strings"

const (
	tokenSource    = "{{source}}"
	tokenTarget    = "{{target}}"
	tokenLocaleDir = "{{localeDir}}"
	legacyLocale   = "[locale]"
)

func ResolveSourcePath(pattern, sourceLocale string) string {
	return resolve(pattern, sourceLocale, sourceLocale)
}

func ResolveTargetPath(pattern, sourceLocale, targetLocale string) string {
	return resolve(pattern, sourceLocale, targetLocale)
}

func resolve(pattern, sourceLocale, targetLocale string) string {
	localeDir := targetLocale
	if sourceLocale == targetLocale {
		localeDir = ""
	}

	path := strings.ReplaceAll(pattern, tokenSource, sourceLocale)
	path = strings.ReplaceAll(path, tokenTarget, targetLocale)
	path = strings.ReplaceAll(path, tokenLocaleDir, localeDir)
	path = strings.ReplaceAll(path, legacyLocale, targetLocale)

	for strings.Contains(path, "//") {
		path = strings.ReplaceAll(path, "//", "/")
	}

	// If the original pattern was relative, ensure the resolved path remains relative
	// by trimming any leading slash that might have been introduced by tokens
	// at the start of the pattern resolving to empty strings.
	if !strings.HasPrefix(pattern, "/") && !strings.HasPrefix(pattern, `\`) {
		path = strings.TrimPrefix(path, "/")
	}

	return path
}
