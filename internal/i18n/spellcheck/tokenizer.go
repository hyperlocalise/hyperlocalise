// Package spellcheck extracts user-visible words from translated segments.
package spellcheck

// Tokenize returns user-visible words in source order, preserving their
// rendered spelling. Recognized escapes and entities are decoded.
// Callers are responsible for deduplication.
func Tokenize(s string) []string {
	cleaned := stripMarkup(s)
	fragments := splitICULiterals(cleaned)

	var out []string
	for _, fragment := range fragments {
		out = scanWords(fragment, out)
	}
	return out
}
