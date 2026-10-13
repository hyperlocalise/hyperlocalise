package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMatchStringsEmptyInputs(t *testing.T) {
	require.Nil(t, matchStrings(nil, []matchCandidate{{KeyID: "a", SourceText: "Hello"}}))
	require.Nil(t, matchStrings([]ocrLine{confidentLine("Hello", 0.1, 0.1, 0.2, 0.05)}, nil))
	require.Nil(t, matchStrings([]ocrLine{confidentLine("Hello", 0.1, 0.1, 0.2, 0.05)}, []matchCandidate{{KeyID: "a", SourceText: "x"}}))
}

func TestMatchStringsExactAndNormalized(t *testing.T) {
	lines := []ocrLine{confidentLine("Hello, World!", 0.1, 0.2, 0.3, 0.05)}
	matches := matchStrings(lines, []matchCandidate{
		{KeyID: "hello", SourceText: "hello world"},
		{KeyID: "dup", SourceText: "Hello world"},
	})
	require.Len(t, matches, 1)
	require.ElementsMatch(t, []string{"hello", "dup"}, matches[0].KeyIDs)
	require.Equal(t, 1.0, matches[0].Score)
	require.Equal(t, markerPercent{Left: 9.5, Top: 19.5, Width: 31, Height: 6}, matches[0].Marker)
}

func TestMatchStringsFuzzyTypo(t *testing.T) {
	matches := matchStrings(
		[]ocrLine{confidentLine("Welcme back", 0.2, 0.3, 0.4, 0.06)},
		[]matchCandidate{{KeyID: "welcome", SourceText: "Welcome back"}},
	)
	require.Len(t, matches, 1)
	require.Equal(t, []string{"welcome"}, matches[0].KeyIDs)
	require.GreaterOrEqual(t, matches[0].Score, shortStringThreshold)
}

func TestMatchStringsRejectsDistantFuzzy(t *testing.T) {
	require.Empty(t, matchStrings(
		[]ocrLine{confidentLine("Goodbye now", 0.2, 0.3, 0.4, 0.06)},
		[]matchCandidate{{KeyID: "welcome", SourceText: "Welcome back"}},
	))
}

func TestMatchStringsShortCandidateNeedsExact(t *testing.T) {
	lines := []ocrLine{confidentLine("OKAY", 0.1, 0.1, 0.1, 0.04)}
	require.Empty(t, matchStrings(lines, []matchCandidate{{KeyID: "ok", SourceText: "OK"}}))
	matches := matchStrings(lines, []matchCandidate{{KeyID: "okay", SourceText: "Okay"}})
	require.Len(t, matches, 1)
	require.Equal(t, []string{"okay"}, matches[0].KeyIDs)
}

func TestMatchStringsPlaceholderAndPrintf(t *testing.T) {
	icu := matchStrings(
		[]ocrLine{confidentLine("Hello, Ada!", 0.1, 0.1, 0.3, 0.05)},
		[]matchCandidate{{KeyID: "greet", SourceText: "Hello, {name}!"}},
	)
	require.Len(t, icu, 1)
	require.Equal(t, []string{"greet"}, icu[0].KeyIDs)
	require.InDelta(t, 0.8+0.2*(5.0/8.0), icu[0].Score, 1e-9)

	printf := matchStrings(
		[]ocrLine{confidentLine("You have 12 items", 0.1, 0.2, 0.5, 0.05)},
		[]matchCandidate{{KeyID: "count", SourceText: "You have %d items"}},
	)
	require.Len(t, printf, 1)
	require.Equal(t, []string{"count"}, printf[0].KeyIDs)
}

func TestMatchStringsPlaceholderNeedsLiteralCoverage(t *testing.T) {
	require.Empty(t, matchStrings(
		[]ocrLine{confidentLine("Ada Lovelace", 0.1, 0.1, 0.3, 0.05)},
		[]matchCandidate{{KeyID: "name", SourceText: "{name}"}},
	))
	require.Empty(t, matchStrings(
		[]ocrLine{confidentLine("Hello there friend from our store today", 0.1, 0.1, 0.5, 0.05)},
		[]matchCandidate{{KeyID: "hello", SourceText: "Hello {name}"}},
	))
}

func TestMatchStringsStripsHTMLAndSkipsWeakOCR(t *testing.T) {
	matches := matchStrings(
		[]ocrLine{
			{Text: "noise", Confidence: 10, Box: ocrBox{Left: 0.1, Top: 0.1, Width: 0.2, Height: 0.04}},
			{Text: "Click here", Confidence: 99, Box: ocrBox{Left: 0, Top: 0, Width: 0, Height: 0.04}},
			confidentLine("Click here", 0.15, 0.25, 0.2, 0.05),
		},
		[]matchCandidate{{KeyID: "cta", SourceText: "Click <b>here</b>"}},
	)
	require.Len(t, matches, 1)
	require.Equal(t, []string{"cta"}, matches[0].KeyIDs)
	require.Equal(t, 1.0, matches[0].Score)
}

func TestMatchStringsClaimsEachLineOnce(t *testing.T) {
	lines := []ocrLine{confidentLine("Welcome back today", 0.1, 0.1, 0.4, 0.05)}
	matches := matchStrings(lines, []matchCandidate{
		{KeyID: "exact", SourceText: "Welcome back today"},
		{KeyID: "typo", SourceText: "Welcome back todey"},
	})
	require.Len(t, matches, 1)
	require.Equal(t, []string{"exact"}, matches[0].KeyIDs)
}

func TestMatchStringsWrapsStackedLines(t *testing.T) {
	matches := matchStrings(
		[]ocrLine{
			confidentLine("Welcome", 0.10, 0.10, 0.20, 0.04),
			confidentLine("back", 0.12, 0.15, 0.16, 0.04),
		},
		[]matchCandidate{{KeyID: "welcome", SourceText: "Welcome back"}},
	)
	require.Len(t, matches, 1)
	require.Equal(t, []string{"welcome"}, matches[0].KeyIDs)
	require.Equal(t, 1.0, matches[0].Score)
	require.Equal(t, markerPercent{Left: 9.5, Top: 9.5, Width: 21, Height: 10}, matches[0].Marker)
}

func TestLiteralParts(t *testing.T) {
	parts, hasPlaceholder := literalParts("Save {count, plural, one {# item} other {# items}} now")
	require.True(t, hasPlaceholder)
	require.Equal(t, []string{"save", "now"}, parts)

	parts, hasPlaceholder = literalParts("You have %d items")
	require.True(t, hasPlaceholder)
	require.Equal(t, []string{"youhave", "items"}, parts)

	parts, hasPlaceholder = literalParts("Plain text")
	require.False(t, hasPlaceholder)
	require.Equal(t, []string{"plaintext"}, parts)
}

func TestCompactText(t *testing.T) {
	require.Equal(t, "helloworld", compactText("Hello, World!"))
	require.Equal(t, "café", compactText("Café"))
	require.Equal(t, "", compactText(" — "))
}

func TestLinesContinue(t *testing.T) {
	prev := ocrBox{Left: 0.10, Top: 0.10, Width: 0.20, Height: 0.04}
	require.True(t, linesContinue(prev, ocrBox{Left: 0.12, Top: 0.15, Width: 0.16, Height: 0.04}))
	require.False(t, linesContinue(prev, ocrBox{Left: 0.12, Top: 0.08, Width: 0.16, Height: 0.04}))
	require.False(t, linesContinue(prev, ocrBox{Left: 0.12, Top: 0.20, Width: 0.16, Height: 0.04}))
	require.False(t, linesContinue(prev, ocrBox{Left: 0.40, Top: 0.15, Width: 0.10, Height: 0.04}))
}

func TestMarkerFromBoxClampsEdges(t *testing.T) {
	require.Equal(t, markerPercent{Left: 0, Top: 0, Width: 1.5, Height: 1.5}, markerFromBox(ocrBox{
		Left: 0, Top: 0, Width: 0.01, Height: 0.01,
	}))
	require.Equal(t, markerPercent{Left: 98.5, Top: 98.5, Width: 1.5, Height: 1.5}, markerFromBox(ocrBox{
		Left: 0.99, Top: 0.99, Width: 0.02, Height: 0.02,
	}))
}

func TestContainsPartsInOrder(t *testing.T) {
	require.True(t, containsPartsInOrder("youhave12items", []string{"youhave", "items"}))
	require.False(t, containsPartsInOrder("itemsyouhave12", []string{"youhave", "items"}))
	require.False(t, containsPartsInOrder("youhave", []string{"youhave", "items"}))
}

func TestBoundedLevenshtein(t *testing.T) {
	require.Equal(t, 1, boundedLevenshtein([]rune("welcomeback"), []rune("welcmeback"), 1))
	require.Equal(t, 0, boundedLevenshtein([]rune("same"), []rune("same"), 0))
	require.Greater(t, boundedLevenshtein([]rune("aaaa"), []rune("bbbb"), 1), 1)
}

func TestFuzzyThreshold(t *testing.T) {
	require.Equal(t, shortStringThreshold, fuzzyThreshold(11))
	require.Equal(t, longStringThreshold, fuzzyThreshold(12))
}

func confidentLine(text string, left, top, width, height float64) ocrLine {
	return ocrLine{
		Text:       text,
		Confidence: 99,
		Box:        ocrBox{Left: left, Top: top, Width: width, Height: height},
	}
}

func TestMatchStringsLongFuzzyUsesLowerThreshold(t *testing.T) {
	source := "Please confirm your shipping address"
	ocr := strings.Replace(source, "shipping", "shiping", 1)
	matches := matchStrings(
		[]ocrLine{confidentLine(ocr, 0.1, 0.1, 0.6, 0.05)},
		[]matchCandidate{{KeyID: "address", SourceText: source}},
	)
	require.Len(t, matches, 1)
	require.GreaterOrEqual(t, matches[0].Score, longStringThreshold)
	require.Less(t, matches[0].Score, 1.0)
}
