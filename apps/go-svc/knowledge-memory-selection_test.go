package main

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSelectKnowledgeMemoryContextEmptyAndWholeSmall(t *testing.T) {
	empty := selectKnowledgeMemoryContext(" \r\n\t", knowledgeMemoryPreviewPayload{})
	require.Equal(t, "empty", empty.Metrics.FallbackMode)
	require.Empty(t, empty.CompactText)
	require.Empty(t, empty.Segments)

	content := "# Memory.md\n\nUse Australian English for customer-facing copy.\n"
	whole := selectKnowledgeMemoryContext(content, knowledgeMemoryPreviewPayload{})
	require.Equal(t, "whole_small", whole.Metrics.FallbackMode)
	require.Equal(t, strings.TrimSpace(content), whole.CompactText)
	require.Equal(t, 0, whole.Metrics.SelectedMemoryCount)
	require.Equal(t, 0.0, whole.Metrics.ReductionPercent)
}

func TestSelectKnowledgeMemoryContextRetrievesTargetLocaleAndQuery(t *testing.T) {
	lines := []string{
		"# Memory.md",
		"",
		"## Locale notes",
		"",
		"### fr-FR",
		"",
		"Use idiomatic French for payment confirmation messages.",
		"",
		"### en-AU",
		"",
		"Use Australian English spelling in checkout copy.",
		"",
	}
	for i := 0; i < 80; i++ {
		lines = append(lines, fmt.Sprintf("## Operations note %d", i+1), "", fmt.Sprintf("Archive internal process note %d.", i+1), "")
	}
	content := strings.Join(lines, "\n")
	require.Greater(t, utf16Length(content), knowledgeMemorySmallLimit)

	preview := selectKnowledgeMemoryContext(content, knowledgeMemoryPreviewPayload{
		TargetLocale: stringPointer("fr-FR"),
		SourceText:   stringPointer("payment confirmation"),
		MaxChars:     intPointer(700),
	})
	require.Equal(t, "selective", preview.Metrics.FallbackMode)
	require.Greater(t, preview.Metrics.SelectedMemoryCount, 0)
	require.Contains(t, preview.CompactText, "idiomatic French")
	require.Contains(t, strings.Join(preview.Metrics.MatchedHeadingPaths, "\n"), "fr-FR")
	require.LessOrEqual(t, preview.Metrics.SelectedMemoryChars, 700)
}

func TestSelectKnowledgeMemoryContextFallsBackToGeneralAndHeadingOutline(t *testing.T) {
	lines := []string{
		"# Memory.md",
		"",
		"## General",
		"",
		"Use clear language for every customer-facing surface.",
		"",
		"## Brand voice",
		"",
		"Sound practical, precise, and useful.",
		"",
	}
	for i := 0; i < 70; i++ {
		lines = append(lines, fmt.Sprintf("## Operations note %d", i+1), "", fmt.Sprintf("Archive internal process note %d.", i+1), "")
	}
	content := strings.Join(lines, "\n")
	preview := selectKnowledgeMemoryContext(content, knowledgeMemoryPreviewPayload{})
	require.Equal(t, "general", preview.Metrics.FallbackMode)
	require.Contains(t, preview.CompactText, "Memory.md heading fallback:")
	require.Contains(t, preview.CompactText, "clear language")
	require.Contains(t, preview.Metrics.MatchedHeadingPaths[0], "General")
	require.LessOrEqual(t, preview.Metrics.SelectedMemoryChars, knowledgeMemoryMaxPreview)

	headingLines := []string{"# Memory.md", "", "## Brand voice", "## Locale"}
	for i := 0; i < 100; i++ {
		headingLines = append(headingLines, fmt.Sprintf("## Operations note %d", i+1))
	}
	headingOnly := strings.Join(headingLines, "\n")
	fallback := selectKnowledgeMemoryContext(headingOnly, knowledgeMemoryPreviewPayload{})
	require.Equal(t, "fallback", fallback.Metrics.FallbackMode)
	require.Empty(t, fallback.Segments)
	require.Contains(t, fallback.CompactText, "Brand voice")
}

func TestSelectKnowledgeMemoryContextKeepsMatchedRuleUnderBudget(t *testing.T) {
	longRule := "This unrelated introduction contains many words that do not identify the requested rule. " +
		strings.Repeat("Additional broad policy background without the requested identifier. ", 40) +
		"PROTECTED_SKU_984 must never be translated."
	content := "# Memory.md\n\n## Protected tokens\n\n" + longRule
	preview := selectKnowledgeMemoryContext(content, knowledgeMemoryPreviewPayload{
		SourceText: stringPointer("PROTECTED_SKU_984"),
		MaxChars:   intPointer(256),
	})
	require.Equal(t, "selective", preview.Metrics.FallbackMode)
	require.Contains(t, preview.CompactText, "PROTECTED_SKU_984")
	require.Contains(t, preview.CompactText, "never be translated")
	require.LessOrEqual(t, preview.Metrics.SelectedMemoryChars, 256)
}

func intPointer(value int) *int { return &value }
