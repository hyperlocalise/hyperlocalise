package segmentvalidate

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
)

// BOLT OPTIMIZATION: Combine individual placeholder patterns into a single
// regex to reduce the number of passes over the input string. The order of
// alternations is preserved from the original set to maintain priority.
var combinedPlaceholderPattern = regexp.MustCompile(
	`%[0-9]+\$[-+ #0]*[0-9]*(?:\.[0-9]*)?(?:ll|l|hh|h)?[diuXxfsSFeEgGcC]|` +
		`%\([A-Za-z_][\w]*\)[-+ #0]*[0-9]*(?:\.[0-9]*)?(?:ll|l|hh|h)?[diuXxfsSFeEgGcC]|` +
		`%[-+ #0]*[0-9]*(?:\.[0-9]*)?(?:ll|l|hh|h)?[diuXxfsSFeEgGcC]\b|` +
		`%(?:[0-9]+\$|\([A-Za-z_][\w]*\))?@|` +
		`%\{[ \w.-]+\}|` +
		`\$\{[A-Za-z_][\w.-]*\}|` +
		`\$[A-Za-z_][\w.+-]*\$`,
)

func extractExtraPlaceholders(text string) []string {
	// BOLT OPTIMIZATION: Fast-path for strings without potential placeholders
	// to avoid regex execution overhead (~2-5x faster for non-placeholder text).
	if text == "" || !strings.ContainsAny(text, "%$") {
		return nil
	}

	// BOLT OPTIMIZATION: Use a single pass FindAllStringIndex on the combined pattern.
	// Size the output from actual matches so marker-heavy literal text (e.g. "50% off",
	// "$5") does not allocate a large unused []string backing array.
	locs := combinedPlaceholderPattern.FindAllStringIndex(text, -1)
	if len(locs) == 0 {
		return nil
	}

	out := make([]string, 0, len(locs))
	for _, loc := range locs {
		match := text[loc[0]:loc[1]]
		// BOLT OPTIMIZATION: Defined patterns are self-delimiting; TrimSpace is redundant.

		// Printf-style %% escapes a literal percent. Skip matches whose
		// leading '%' is the second half of an escape pair (e.g. %%@).
		if match[0] == '%' && isEscapedPercentAt(text, loc[0]) {
			continue
		}
		out = append(out, match)
	}

	if len(out) == 0 {
		return nil
	}

	// BOLT OPTIMIZATION: Only sort if there are multiple placeholders.
	// Use modern slices.Sort for allocation-free inlined sorting.
	if len(out) > 1 {
		slices.Sort(out)
	}
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
	_, err := validateExtraPlaceholderParityWithTokens(source, translated)
	return err
}

func validateExtraPlaceholderParityWithTokens(source, translated string) (bool, error) {
	// BOLT OPTIMIZATION: Dual-string fast-path when neither source nor translated contains
	// placeholder signal characters (% or $).
	if !strings.ContainsAny(source, "%$") && !strings.ContainsAny(translated, "%$") {
		return false, nil
	}
	expected := extractExtraPlaceholders(source)
	got := extractExtraPlaceholders(translated)
	if stringSlicesEqual(expected, got) {
		return len(expected) > 0, nil
	}
	return false, fmt.Errorf(
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
