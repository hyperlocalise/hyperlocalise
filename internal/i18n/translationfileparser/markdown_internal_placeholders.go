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

func markdownInternalPlaceholderError(source, translated string) error {
	src := MarkdownInternalPlaceholderTokens(source)
	tgt := MarkdownInternalPlaceholderTokens(translated)
	return fmt.Errorf("markdown internal placeholder mismatch: expected %d token(s), got %d (source tokens %v vs candidate %v)", len(src), len(tgt), src, tgt)
}

func markdownInternalPlaceholdersMatch(source, translated string) bool {
	return slices.Equal(MarkdownInternalPlaceholderTokens(source), MarkdownInternalPlaceholderTokens(translated))
}

// RecoverMarkdownInternalPlaceholders re-protects a translation that came back as
// raw markdown (links, Intercom {#heading-id}, :::callout fences) so the HLMDPH
// token multiset matches source. Returns translated unchanged when it already matches.
func RecoverMarkdownInternalPlaceholders(source, translated string) (string, error) {
	if markdownInternalPlaceholdersMatch(source, translated) {
		return translated, nil
	}

	recovered, _, _ := protectStandardMarkdownInlineSyntax(translated)
	if markdownInternalPlaceholdersMatch(source, recovered) {
		return recovered, nil
	}

	recoveredMDX, _, _, malformed := protectMarkdownInlineSyntax(translated)
	if !malformed && markdownInternalPlaceholdersMatch(source, recoveredMDX) {
		return recoveredMDX, nil
	}

	return "", markdownInternalPlaceholderError(source, translated)
}

// ValidateMarkdownInternalPlaceholders returns an error if the multiset of internal
// markdown placeholder tokens in translated differs from source. A candidate that
// dropped HLMDPH tokens but still has the same markdown literals is recovered first.
func ValidateMarkdownInternalPlaceholders(source, translated string) error {
	_, err := RecoverMarkdownInternalPlaceholders(source, translated)
	return err
}
