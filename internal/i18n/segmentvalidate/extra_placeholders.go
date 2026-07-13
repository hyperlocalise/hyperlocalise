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
	regexp.MustCompile(`%[sdf]\b`),
	regexp.MustCompile(`%@`),
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
		for _, loc := range pattern.FindAllStringIndex(text, -1) {
			match := strings.TrimSpace(text[loc[0]:loc[1]])
			if match == "" {
				continue
			}
			// Printf-style %% escapes a literal percent. Skip matches whose
			// leading '%' is the second half of an escape pair (e.g. %%@).
			if strings.HasPrefix(match, "%") && isEscapedPercentAt(text, loc[0]) {
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

// isEscapedPercentAt reports whether text[index] is '%' that belongs to a
// %% escape rather than starting a format placeholder. An odd run of '%'
// ending at index is a real placeholder; an even run is escaped.
func isEscapedPercentAt(text string, index int) bool {
	if index < 0 || index >= len(text) || text[index] != '%' {
		return false
	}
	count := 0
	for i := index; i >= 0 && text[i] == '%'; i-- {
		count++
	}
	return count%2 == 0
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
