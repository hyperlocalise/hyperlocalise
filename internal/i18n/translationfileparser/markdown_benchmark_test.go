package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkMarkdownParser_Parse(b *testing.B) {
	content := []byte(`---
title: Release notes
description: Product updates for translators
---

# Heading

Paragraph with [link text](https://example.com) and **bold** emphasis.

- First item
- Second item

> Quoted guidance for reviewers.

| Name | Value |
| ---- | ----- |
| Alpha | Beta |
| Gamma | Delta |

Term
: Definition body with more detail.

~~Deprecated copy~~ should stay readable.

- [ ] Open task item
- [x] Completed task item

Footnote reference[^note].

[^note]: Footnote definition body.
`)
	parser := MarkdownParser{}

	b.ReportAllocs()
	for b.Loop() {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarkdownParser_ParseLarge(b *testing.B) {
	content := makeMarkdownBenchmarkCorpus(200)
	parser := MarkdownParser{}

	b.ReportAllocs()
	for b.Loop() {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarkdownParser_ParseWithContext(b *testing.B) {
	content := makeMarkdownBenchmarkCorpus(200)
	parser := MarkdownParser{}

	b.ReportAllocs()
	for b.Loop() {
		_, _, _ = parser.ParseWithContext(content)
	}
}

func BenchmarkMarkdownParser_ParseMDX(b *testing.B) {
	content := []byte(`---
title: MDX page
---

import Tabs from '@theme/Tabs'

<Tabs defaultValue="first">
  <Tab value="first" label="First tab">
    Paragraph with <Badge text="New" /> and [docs](https://example.com).
  </Tab>
</Tabs>

> <Note icon="info">Read me carefully</Note>
`)
	parser := MarkdownParser{MDX: true}

	b.ReportAllocs()
	for b.Loop() {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarshalMarkdown(b *testing.B) {
	template := makeMarkdownBenchmarkCorpus(200)
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		b.Fatalf("parse template: %v", err)
	}

	values := make(map[string]string, len(entries))
	for key, value := range entries {
		values[key] = strings.ToUpper(value)
	}

	b.ReportAllocs()
	for b.Loop() {
		_ = MarshalMarkdown(template, values, false)
	}
}

func makeMarkdownBenchmarkCorpus(sectionCount int) []byte {
	var builder strings.Builder
	builder.Grow(sectionCount * 512)
	builder.WriteString("---\ntitle: Benchmark corpus\ndescription: Generated markdown for performance tests\n---\n\n")

	for i := 0; i < sectionCount; i++ {
		fmt.Fprintf(&builder, "## Section %03d\n\n", i)
		fmt.Fprintf(&builder, "Paragraph %d with [link %d](https://example.com/%d) and **emphasis**.\n\n", i, i, i)
		fmt.Fprintf(&builder, "- List item %d alpha\n- List item %d beta\n\n", i, i)
		fmt.Fprintf(&builder, "| Column A %d | Column B %d |\n| --- | --- |\n| Value %d | Value %d |\n\n", i, i, i, i)
		fmt.Fprintf(&builder, "> Quote block %d for reviewers.\n\n", i)
	}

	return []byte(builder.String())
}
