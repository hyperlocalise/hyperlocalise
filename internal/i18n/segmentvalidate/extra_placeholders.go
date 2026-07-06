package segmentvalidate

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Non-ICU placeholder patterns used in Hyperlocalise projects (subset of Crowdin editor rules).
var extraPlaceholderPatterns = []*regexp.Regexp{
	regexp.MustCompile(`%[0-9]+\$[sdf@]`),
	regexp.MustCompile(`%\([A-Za-z_][\w]*\)[sdf@]`),
	regexp.MustCompile(`%[sdf@]\b`),
	regexp.MustCompile(`%\{[ \w.-]+\}`),
	regexp.MustCompile(`\$\{[A-Za-z_][\w.-]*\}`),
	regexp.MustCompile(`\$[A-Za-z_][\w.+-]*\$`),
}

func extractExtraPlaceholders(text string) []string {
	if text == "" {
		return nil
	}

	var out []string
	for _, pattern := range extraPlaceholderPatterns {
		for _, match := range pattern.FindAllString(text, -1) {
			match = strings.TrimSpace(match)
			if match == "" {
				continue
			}
			out = append(out, match)
		}
	}

	if len(out) == 0 {
		return nil
	}

	sort.Strings(out)
	return out
}

func validateExtraPlaceholderParity(source, translated string) error {
	expected := extractExtraPlaceholders(source)
	got := extractExtraPlaceholders(translated)
	if stringSlicesEqual(expected, got) {
		return nil
	}
	return fmt.Errorf(
		"translation invariant violation: extra placeholder parity mismatch (expected %q, got %q) | %s",
		expected,
		got,
		formatInvariantDebugContext(source, translated),
	)
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
