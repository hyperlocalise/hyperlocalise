package main

import (
	"fmt"
	"strings"
	"testing"
)

func knowledgeMemoryBenchmarkContent(sections int) string {
	lines := []string{"# Memory.md", "", "## Locale notes", "", "### fr-FR", "", "Use idiomatic French for payment confirmation messages.", "", "## General", "", "Use clear language for every customer-facing surface.", ""}
	for i := 0; i < sections; i++ {
		lines = append(lines, fmt.Sprintf("## Operations note %d", i+1), "", fmt.Sprintf("Archive internal process note %d about checkout, cart, and localization.", i+1), "")
	}
	return strings.Join(lines, "\n")
}

func BenchmarkSelectKnowledgeMemoryContext(b *testing.B) {
	content := knowledgeMemoryBenchmarkContent(80)
	input := knowledgeMemoryPreviewPayload{
		TargetLocale: stringPointer("fr-FR"),
		SourceText:   stringPointer("payment confirmation checkout"),
		MaxChars:     intPointer(700),
	}
	b.ReportAllocs()
	b.SetBytes(int64(len(content)))
	for b.Loop() {
		preview := selectKnowledgeMemoryContext(content, input)
		if preview.CompactText == "" {
			b.Fatal("empty preview")
		}
	}
}

func BenchmarkSelectKnowledgeMemoryContextGeneralFallback(b *testing.B) {
	content := knowledgeMemoryBenchmarkContent(70)
	b.ReportAllocs()
	b.SetBytes(int64(len(content)))
	for b.Loop() {
		preview := selectKnowledgeMemoryContext(content, knowledgeMemoryPreviewPayload{})
		if preview.Metrics.FallbackMode == "" {
			b.Fatal("missing fallback")
		}
	}
}
