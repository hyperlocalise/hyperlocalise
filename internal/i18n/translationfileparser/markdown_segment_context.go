package translationfileparser

import "strings"

const (
	maxMarkdownEntryContextRunes = 800
	maxMarkdownNeighborRunes     = 200
)

// Line instructing the model to keep internal markdown markup sentinels verbatim.
const markdownPreservePlaceholdersLine = "Preserve every internal placeholder token matching the pattern \\x1eHLMDPH_…\\x1f exactly (do not translate, remove, or rename them)."

func elideMarkdownContextLiteral(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if maxRunes <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	if maxRunes == 1 {
		return "…"
	}
	return string(runes[:maxRunes-1]) + "…"
}

func buildMarkdownSegmentContext(mdx bool, structuralPath, prevLiteral, nextLiteral string) string {
	var b strings.Builder
	if mdx {
		b.WriteString("MDX translatable segment.\n")
	} else {
		b.WriteString("Markdown translatable segment.\n")
	}
	b.WriteString(markdownPreservePlaceholdersLine)
	b.WriteString("\n")
	if p := strings.TrimSpace(structuralPath); p != "" {
		b.WriteString("Structural path: ")
		b.WriteString(p)
		b.WriteString("\n")
	}
	if prev := strings.TrimSpace(prevLiteral); prev != "" {
		b.WriteString("Adjacent source before (context only; do not translate this line): ")
		b.WriteString(elideMarkdownContextLiteral(prev, maxMarkdownNeighborRunes))
		b.WriteString("\n")
	}
	if next := strings.TrimSpace(nextLiteral); next != "" {
		b.WriteString("Adjacent source after (context only; do not translate this line): ")
		b.WriteString(elideMarkdownContextLiteral(next, maxMarkdownNeighborRunes))
		b.WriteString("\n")
	}
	out := strings.TrimSpace(b.String())
	runes := []rune(out)
	if len(runes) > maxMarkdownEntryContextRunes {
		return string(runes[:maxMarkdownEntryContextRunes-1]) + "…"
	}
	return out
}
