package segmentvalidate

import "fmt"

func formatInvariantDebugContext(source, translated string) string {
	return fmt.Sprintf(
		`source=%q candidate=%q diff=%s`,
		elideInvariantDebugString(source, 160),
		elideInvariantDebugString(translated, 160),
		firstDiffWindow(source, translated, 24),
	)
}

// ElideDebugString truncates s to maxRunes runes, appending "…" when truncated.
func ElideDebugString(s string, maxRunes int) string {
	return elideInvariantDebugString(s, maxRunes)
}

func elideInvariantDebugString(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	if maxRunes <= 1 {
		return string(runes[:maxRunes])
	}
	return string(runes[:maxRunes-1]) + "…"
}

func firstDiffWindow(a, b string, radius int) string {
	ar := []rune(a)
	br := []rune(b)
	limit := len(ar)
	if len(br) < limit {
		limit = len(br)
	}
	idx := 0
	for idx < limit && ar[idx] == br[idx] {
		idx++
	}
	if idx == len(ar) && idx == len(br) {
		return "none"
	}

	aStart := max(0, idx-radius)
	aEnd := min(len(ar), idx+radius)
	bStart := max(0, idx-radius)
	bEnd := min(len(br), idx+radius)

	return fmt.Sprintf(
		`at=%d source[%d:%d]=%q candidate[%d:%d]=%q`,
		idx,
		aStart,
		aEnd,
		string(ar[aStart:aEnd]),
		bStart,
		bEnd,
		string(br[bStart:bEnd]),
	)
}
