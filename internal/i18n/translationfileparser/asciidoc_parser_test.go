package translationfileparser

import (
	"strings"
	"testing"
)

func TestAsciiDocParserExtractsSmartlingUnits(t *testing.T) {
	t.Parallel()

	source := `---
title: ignored
---
= Product guide
Jane Doe <jane@example.com>
:toc:
:product-name: Widget

Welcome to the setup guide.
This paragraph wraps.

== Install

NOTE: Remember to save your work.

* First step
* Second step

.Download options
Term:: A short description

[source,bash]
----
widget --start
----

include::partials/install.adoc[]

|===
| Header one | Header two
| Cell a | Cell b
|===

See link:https://example.com[the setup guide] and {product-name}.
`

	entries, err := AsciiDocParser{}.Parse([]byte(source))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	mustContain := []string{
		"Product guide",
		"Welcome to the setup guide. This paragraph wraps.",
		"Install",
		"Remember to save your work.",
		"First step",
		"Second step",
		"Download options",
		"Term",
		"A short description",
		"Header one",
		"Header two",
		"Cell a",
		"Cell b",
	}
	joined := valuesJoin(entries)
	for _, want := range mustContain {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing extracted text %q in %#v", want, entries)
		}
	}

	mustOmit := []string{
		"ignored",
		"Jane Doe",
		":toc:",
		"widget --start",
		"include::",
	}
	for _, omit := range mustOmit {
		for key, value := range entries {
			if strings.Contains(value, omit) {
				t.Fatalf("did not expect %q in %s=%q", omit, key, value)
			}
		}
	}

	if _, ok := entries["adoc.title"]; !ok {
		t.Fatalf("expected adoc.title, got %#v", keysOf(entries))
	}
	if !strings.HasPrefix(keysOf(entries)[0], "adoc.") && entries["adoc.title"] == "" {
		t.Fatalf("expected adoc. keys, got %#v", keysOf(entries))
	}
}

func TestAsciiDocParserProtectsInlineMarkup(t *testing.T) {
	t.Parallel()

	source := "See link:https://example.com[the setup guide] and {product-name} plus `widget --start` and #4580.\n"
	entries, err := AsciiDocParser{}.Parse([]byte(source))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d, want 1: %#v", len(entries), entries)
	}

	var text string
	for _, value := range entries {
		text = value
	}
	if !strings.Contains(text, "the setup guide") {
		t.Fatalf("link label missing: %q", text)
	}
	if strings.Contains(text, "https://example.com") {
		t.Fatalf("bare URL leaked into translatable text: %q", text)
	}
	if strings.Contains(text, "{product-name}") {
		t.Fatalf("attribute reference leaked: %q", text)
	}
	if strings.Contains(text, "widget --start") {
		t.Fatalf("inline code leaked: %q", text)
	}
	if strings.Contains(text, "#4580") {
		t.Fatalf("issue reference leaked: %q", text)
	}
	if !strings.Contains(text, "\x1eHLADPH_") {
		t.Fatalf("expected placeholders in %q", text)
	}
}

func TestMarshalAsciiDocRoundTrip(t *testing.T) {
	t.Parallel()

	source := []byte("= Welcome\n\nRead the link:https://example.com[setup guide].\n")
	entries, err := AsciiDocParser{}.Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	translated := make(map[string]string, len(entries))
	for key, value := range entries {
		translated[key] = strings.ReplaceAll(value, "Welcome", "Bienvenue")
		translated[key] = strings.ReplaceAll(translated[key], "setup guide", "guide d'installation")
		if strings.Contains(value, "Read") {
			translated[key] = strings.ReplaceAll(translated[key], "Read the", "Lisez le")
		}
	}

	got := string(MarshalAsciiDoc(source, translated))
	if !strings.Contains(got, "= Bienvenue") {
		t.Fatalf("title not translated: %q", got)
	}
	if !strings.Contains(got, "link:https://example.com[guide d'installation]") {
		t.Fatalf("link not restored: %q", got)
	}
	if strings.Contains(got, "\x1e") {
		t.Fatalf("placeholder leaked: %q", got)
	}
}

func TestMarshalAsciiDocFallsBackWhenPlaceholderMissing(t *testing.T) {
	t.Parallel()

	source := []byte("See link:https://example.com[the setup guide].\n")
	entries, err := AsciiDocParser{}.Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	values := map[string]string{}
	for key := range entries {
		values[key] = "broken translation"
	}
	got, diags := MarshalAsciiDocWithDiagnostics(source, values)
	if len(diags.SourceFallbackKeys) == 0 {
		t.Fatalf("expected source fallback, got %q", got)
	}
	if !strings.Contains(string(got), "link:https://example.com[the setup guide]") {
		t.Fatalf("expected source link restored, got %q", got)
	}
}

func TestAlignAsciiDocTargetToSource(t *testing.T) {
	t.Parallel()

	source := []byte("= Welcome\n\nHello world.\n")
	target := []byte("= Bienvenue\n\nBonjour le monde.\n")
	aligned := AlignAsciiDocTargetToSource(source, target)
	if aligned["adoc.title"] != "Bienvenue" {
		t.Fatalf("title=%q, want Bienvenue", aligned["adoc.title"])
	}
	if aligned["adoc.paragraph"] != "Bonjour le monde." {
		t.Fatalf("paragraph=%q", aligned["adoc.paragraph"])
	}
}

func TestAlignAsciiDocTargetToSourceDoesNotShiftWhenParagraphInserted(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\n\nExisting intro.\n\nNew section added.\n\nExisting outro.\n")
	target := []byte("= Guide\n\nIntro existant.\n\nConclusion existante.\n")
	aligned := AlignAsciiDocTargetToSource(source, target)
	if aligned["adoc.paragraph"] != "Intro existant." {
		t.Fatalf("intro=%q, want Intro existant.", aligned["adoc.paragraph"])
	}
	if aligned["adoc.paragraph.3"] != "Conclusion existante." {
		t.Fatalf("outro=%q, want Conclusion existante.", aligned["adoc.paragraph.3"])
	}
	if aligned["adoc.paragraph.2"] == "Conclusion existante." || aligned["adoc.paragraph.2"] == "Intro existant." {
		t.Fatalf("inserted paragraph stole a neighbor translation: %#v", aligned)
	}
}

func TestMarshalAsciiDocWithTargetFallbackPreservesNeighborsWhenInserting(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\n\nExisting intro.\n\nNew section added.\n\nExisting outro.\n")
	target := []byte("= Guide\n\nIntro existant.\n\nConclusion existante.\n")
	got := string(MarshalAsciiDocWithTargetFallback(source, target, map[string]string{
		"adoc.paragraph.2": "Nouvelle section ajoutee.",
	}))
	if !strings.Contains(got, "Intro existant.") {
		t.Fatalf("expected existing intro preserved, got %q", got)
	}
	if !strings.Contains(got, "Nouvelle section ajoutee.") {
		t.Fatalf("expected inserted paragraph translated, got %q", got)
	}
	if !strings.Contains(got, "Conclusion existante.") {
		t.Fatalf("expected existing outro preserved, got %q", got)
	}
}

func TestAsciiDocExtractsHeadingImmediatelyAfterTitle(t *testing.T) {
	t.Parallel()

	entries, err := AsciiDocParser{}.Parse([]byte("= Guide\n== Install\n\nBody text.\n"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if entries["adoc.title"] != "Guide" {
		t.Fatalf("title=%q", entries["adoc.title"])
	}
	if entries["adoc.heading"] != "Install" {
		t.Fatalf("heading=%q, want Install; entries=%#v", entries["adoc.heading"], entries)
	}
	if entries["adoc.paragraph"] != "Body text." {
		t.Fatalf("paragraph=%q", entries["adoc.paragraph"])
	}
}

func TestAsciiDocDoesNotTreatEqualsParagraphAsHeading(t *testing.T) {
	t.Parallel()

	source := []byte("=price is the listed amount.\n")
	entries, err := AsciiDocParser{}.Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, ok := entries["adoc.title"]; ok {
		t.Fatalf("treated =price as a title: %#v", entries)
	}
	if entries["adoc.paragraph"] != "=price is the listed amount." {
		t.Fatalf("paragraph=%q; entries=%#v", entries["adoc.paragraph"], entries)
	}
	got := string(MarshalAsciiDoc(source, entries))
	if strings.Contains(got, "= price") {
		t.Fatalf("rewrote paragraph as a heading: %q", got)
	}
	if !strings.Contains(got, "=price is the listed amount.") {
		t.Fatalf("lost paragraph text: %q", got)
	}
}

func TestAsciiDocProtectsLinkTargetWithBrackets(t *testing.T) {
	t.Parallel()

	entries, err := AsciiDocParser{}.Parse([]byte("See link:https://example.com/a[b][label].\n"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d, want 1: %#v", len(entries), entries)
	}
	var text string
	for _, value := range entries {
		text = value
	}
	if !strings.Contains(text, "label") {
		t.Fatalf("label missing: %q", text)
	}
	if strings.Contains(text, "example.com") || strings.Contains(text, "[b]") {
		t.Fatalf("link target leaked into translatable text: %q", text)
	}
	translated := map[string]string{}
	for key, value := range entries {
		translated[key] = strings.ReplaceAll(value, "label", "etiqueta")
	}
	got := string(MarshalAsciiDoc([]byte("See link:https://example.com/a[b][label].\n"), translated))
	if !strings.Contains(got, "link:https://example.com/a[b][etiqueta]") {
		t.Fatalf("did not restore destination and translated label: %q", got)
	}
}

func TestParseAsciiDocDocumentIRStableKeys(t *testing.T) {
	t.Parallel()

	original := ParseAsciiDocDocumentIR([]byte("= Hello world\n\nFirst paragraph.\n"))
	edited := ParseAsciiDocDocumentIR([]byte("= Hello there\n\nFirst paragraph changed.\n"))
	if len(original.Blocks) != 2 || len(edited.Blocks) != 2 {
		t.Fatalf("blocks original=%d edited=%d", len(original.Blocks), len(edited.Blocks))
	}
	if original.Blocks[0].ID != edited.Blocks[0].ID {
		t.Fatalf("title slot changed: %q vs %q", original.Blocks[0].ID, edited.Blocks[0].ID)
	}
	if original.Blocks[1].ID != edited.Blocks[1].ID {
		t.Fatalf("paragraph slot changed: %q vs %q", original.Blocks[1].ID, edited.Blocks[1].ID)
	}
	if original.Format != DocumentFormatAsciiDoc {
		t.Fatalf("format=%q", original.Format)
	}
}

func TestIsAsciiDocDocumentExtension(t *testing.T) {
	t.Parallel()

	for _, path := range []string{"guide.adoc", "Guide.ASCIIDOC", "notes.asc"} {
		if !IsAsciiDocDocumentExtension(path) {
			t.Fatalf("expected %q to be AsciiDoc", path)
		}
	}
	if IsAsciiDocDocumentExtension("guide.md") {
		t.Fatalf("markdown should not be AsciiDoc")
	}
}

func TestStrategyParsesAsciiDocExtensions(t *testing.T) {
	t.Parallel()

	s := NewDefaultStrategy()
	for _, ext := range []string{".adoc", ".asciidoc", ".asc"} {
		got, err := s.Parse("file"+ext, []byte("= Hello\n"))
		if err != nil {
			t.Fatalf("parse %s: %v", ext, err)
		}
		if len(got) == 0 {
			t.Fatalf("expected extracted entries for %s", ext)
		}
	}
}

func TestAsciiDocSkipsCommentsAndVerbatim(t *testing.T) {
	t.Parallel()

	source := `// line comment
////
hidden block
////
Visible paragraph.

++++
<b>raw html</b>
++++
`
	entries, err := AsciiDocParser{}.Parse([]byte(source))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d, want 1: %#v", len(entries), entries)
	}
	for _, value := range entries {
		if value != "Visible paragraph." {
			t.Fatalf("value=%q", value)
		}
	}
}

func TestLineForAsciiDocKey(t *testing.T) {
	t.Parallel()

	source := []byte("= Title\n\nHello.\n")
	if got := LineForAsciiDocKey(source, "adoc.title"); got != 1 {
		t.Fatalf("title line=%d, want 1", got)
	}
	if got := LineForAsciiDocKey(source, "adoc.paragraph"); got != 3 {
		t.Fatalf("paragraph line=%d, want 3", got)
	}
}

func valuesJoin(entries map[string]string) string {
	var b strings.Builder
	for _, value := range entries {
		b.WriteString(value)
		b.WriteByte('\n')
	}
	return b.String()
}

func keysOf(entries map[string]string) []string {
	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	return keys
}
