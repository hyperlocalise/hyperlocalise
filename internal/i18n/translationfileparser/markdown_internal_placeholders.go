package translationfileparser

import (
	"fmt"
	"slices"
)

// MarkdownInternalPlaceholderTokens returns sorted internal markdown sentinel tokens
// (\x1eHLMDPH_…\x1f) found in s.
func MarkdownInternalPlaceholderTokens(s string) []string {
	matches := markdownPlaceholderPattern.FindAllString(s, -1)
	slices.Sort(matches)
	return matches
}

// ValidateMarkdownInternalPlaceholders returns an error if the multiset of internal
// markdown placeholder tokens in translated differs from source.
func ValidateMarkdownInternalPlaceholders(source, translated string) error {
	src := MarkdownInternalPlaceholderTokens(source)
	tgt := MarkdownInternalPlaceholderTokens(translated)
	if slices.Equal(src, tgt) {
		return nil
	}
	return fmt.Errorf("markdown internal placeholder mismatch: expected %d token(s), got %d (source tokens %v vs candidate %v)", len(src), len(tgt), src, tgt)
}
