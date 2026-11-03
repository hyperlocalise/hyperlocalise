package segmentvalidate

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
)

// MaxCustomPlaceholderPatterns caps how many per-file regular expressions are
// compiled for one validation. Extra patterns are ignored.
const MaxCustomPlaceholderPatterns = 20

// CompileCustomPlaceholderPatterns compiles per-file placeholder regular
// expressions. Empty and invalid patterns, and patterns that match the empty
// string, are skipped so one bad pattern cannot break validation.
func CompileCustomPlaceholderPatterns(patterns []string) []*regexp.Regexp {
	if len(patterns) == 0 {
		return nil
	}
	out := make([]*regexp.Regexp, 0, min(len(patterns), MaxCustomPlaceholderPatterns))
	for _, pattern := range patterns {
		if len(out) == MaxCustomPlaceholderPatterns {
			break
		}
		if strings.TrimSpace(pattern) == "" {
			continue
		}
		re, err := regexp.Compile(pattern)
		if err != nil || re.MatchString("") {
			continue
		}
		out = append(out, re)
	}
	return out
}

// ExtractCustomPlaceholders returns the sorted literals that the patterns
// match in text. At each position the earliest-starting, then longest, match
// wins, and matches never overlap.
func ExtractCustomPlaceholders(patterns []*regexp.Regexp, text string) []string {
	if len(patterns) == 0 || text == "" {
		return nil
	}
	var out []string
	pos := 0
	for pos < len(text) {
		bestStart, bestEnd := -1, -1
		for _, re := range patterns {
			loc := re.FindStringIndex(text[pos:])
			if loc == nil {
				continue
			}
			start, end := pos+loc[0], pos+loc[1]
			if bestStart < 0 || start < bestStart || (start == bestStart && end > bestEnd) {
				bestStart, bestEnd = start, end
			}
		}
		if bestStart < 0 || bestEnd <= bestStart {
			break
		}
		out = append(out, text[bestStart:bestEnd])
		pos = bestEnd
	}
	if len(out) > 1 {
		slices.Sort(out)
	}
	return out
}

// customPlaceholderCheck reports whether the target keeps every literal the
// file's custom placeholder patterns match in the source. It returns nil when
// the file has no usable patterns or the source and target match none.
func customPlaceholderCheck(patterns []string, source, target string) *Check {
	compiled := CompileCustomPlaceholderPatterns(patterns)
	if len(compiled) == 0 {
		return nil
	}
	expected := ExtractCustomPlaceholders(compiled, source)
	got := ExtractCustomPlaceholders(compiled, target)
	if len(expected) == 0 && len(got) == 0 {
		return nil
	}
	missing, extra := multisetDifference(expected, got), multisetDifference(got, expected)
	if len(missing) == 0 && len(extra) == 0 {
		return &Check{
			ID:       "custom-placeholder-parity",
			Label:    "Custom placeholders",
			Status:   StatusPass,
			Message:  "Target keeps the custom placeholders.",
			Category: "placeholder",
		}
	}
	var message string
	if len(missing) > 0 {
		message = fmt.Sprintf("Target is missing custom placeholders (%s).", strings.Join(missing, ", "))
	} else {
		message = fmt.Sprintf("Target introduces custom placeholders (%s) that are not in the source.", strings.Join(extra, ", "))
	}
	return &Check{
		ID:            "custom-placeholder-mismatch",
		Label:         "Custom placeholders",
		Status:        StatusFail,
		Message:       message,
		Category:      "placeholder",
		RelatedTokens: append(missing, extra...),
	}
}

// multisetDifference returns the values of sorted left that occur more often
// than in sorted right.
func multisetDifference(left, right []string) []string {
	var out []string
	i, j := 0, 0
	for i < len(left) {
		switch {
		case j >= len(right) || left[i] < right[j]:
			out = append(out, left[i])
			i++
		case left[i] > right[j]:
			j++
		default:
			i++
			j++
		}
	}
	return out
}
