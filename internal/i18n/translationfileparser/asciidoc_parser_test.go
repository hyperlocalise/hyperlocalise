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

func TestMarshalAsciiDocKeepsUnmatchedParagraphInsteadOfListItem(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\n\nNew intro paragraph.\n\n* First step\n* Second step\n")
	target := []byte("= Guide\n\n* Premiere etape\n* Deuxieme etape\n")
	got := string(MarshalAsciiDocWithTargetFallback(source, target, map[string]string{}))
	if !strings.Contains(got, "New intro paragraph.") {
		t.Fatalf("expected unmatched paragraph to keep source text, got %q", got)
	}
	if strings.Contains(got, "Premiere etape") && strings.Index(got, "Premiere etape") < strings.Index(got, "*") {
		t.Fatalf("new paragraph received a list item translation: %q", got)
	}
	if !strings.Contains(got, "* Premiere etape") || !strings.Contains(got, "* Deuxieme etape") {
		t.Fatalf("expected list items to keep target translations, got %q", got)
	}
}

func TestAlignAsciiDocDoesNotAssignListItemToNewParagraph(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\n\nNew intro paragraph.\n\n* First step\n* Second step\n")
	target := []byte("= Guide\n\n* Premiere etape\n* Deuxieme etape\n")
	aligned := AlignAsciiDocTargetToSource(source, target)
	if aligned["adoc.paragraph"] == "Premiere etape" || aligned["adoc.paragraph"] == "Deuxieme etape" {
		t.Fatalf("new paragraph received a list item translation: %#v", aligned)
	}
	if aligned["adoc.list_item"] != "Premiere etape" {
		t.Fatalf("first list item=%q, want Premiere etape; aligned=%#v", aligned["adoc.list_item"], aligned)
	}
	if aligned["adoc.list_item.2"] != "Deuxieme etape" {
		t.Fatalf("second list item=%q, want Deuxieme etape; aligned=%#v", aligned["adoc.list_item.2"], aligned)
	}
}

func TestMarshalAsciiDocDoesNotReuseListItemAsParagraphWhenCountsMatch(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\n\nA new paragraph in place of the list.\n")
	target := []byte("= Guide\n\n* Ancienne etape\n")
	got := string(MarshalAsciiDocWithTargetFallback(source, target, map[string]string{}))
	if !strings.Contains(got, "A new paragraph in place of the list.") {
		t.Fatalf("expected unmatched paragraph to keep source text, got %q", got)
	}
	if strings.Contains(got, "Ancienne etape") {
		t.Fatalf("paragraph received a list item translation: %q", got)
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

func TestMarshalAsciiDocPartialRerunKeepsUnchangedParagraphs(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n")
	target := []byte("= Guide\n\nPremier paragraphe.\n\nDeuxieme paragraphe.\n\nTroisieme paragraphe.\n")

	t.Run("update first only", func(t *testing.T) {
		t.Parallel()
		got := string(MarshalAsciiDocWithTargetFallback(source, target, map[string]string{
			"adoc.paragraph": "Premier paragraphe mis a jour.",
		}))
		if !strings.Contains(got, "Premier paragraphe mis a jour.") {
			t.Fatalf("missing updated first paragraph: %q", got)
		}
		if !strings.Contains(got, "Deuxieme paragraphe.") {
			t.Fatalf("second paragraph reused the first translation: %q", got)
		}
		if !strings.Contains(got, "Troisieme paragraphe.") {
			t.Fatalf("lost third paragraph: %q", got)
		}
		if strings.Count(got, "Premier paragraphe.") != 0 {
			t.Fatalf("stale first translation leaked: %q", got)
		}
	})

	t.Run("update middle only", func(t *testing.T) {
		t.Parallel()
		got := string(MarshalAsciiDocWithTargetFallback(source, target, map[string]string{
			"adoc.paragraph.2": "Deuxieme paragraphe mis a jour.",
		}))
		if !strings.Contains(got, "Premier paragraphe.") {
			t.Fatalf("lost first paragraph: %q", got)
		}
		if !strings.Contains(got, "Deuxieme paragraphe mis a jour.") {
			t.Fatalf("missing updated middle paragraph: %q", got)
		}
		if !strings.Contains(got, "Troisieme paragraphe.") {
			t.Fatalf("lost third paragraph: %q", got)
		}
		if strings.Contains(got, "Deuxieme paragraphe.\n") {
			t.Fatalf("stale middle translation leaked: %q", got)
		}
	})

	t.Run("update last only", func(t *testing.T) {
		t.Parallel()
		got := string(MarshalAsciiDocWithTargetFallback(source, target, map[string]string{
			"adoc.paragraph.3": "Troisieme paragraphe mis a jour.",
		}))
		if !strings.Contains(got, "Premier paragraphe.") || !strings.Contains(got, "Deuxieme paragraphe.") {
			t.Fatalf("lost unchanged neighbors: %q", got)
		}
		if !strings.Contains(got, "Troisieme paragraphe mis a jour.") {
			t.Fatalf("missing updated last paragraph: %q", got)
		}
	})
}

func TestMarshalAsciiDocWithTargetFallbackAddDeleteCycle(t *testing.T) {
	t.Parallel()

	v1Source := []byte("= Checklist\n\nFirst section.\n\nSecond section.\n\nThird section.\n")
	v1Target := MarshalAsciiDoc(v1Source, map[string]string{
		"adoc.title":       "Liste",
		"adoc.paragraph":   "FR:First section.",
		"adoc.paragraph.2": "FR:Second section.",
		"adoc.paragraph.3": "FR:Third section.",
	})

	v2Source := []byte("= Checklist\n\nFirst section.\n\nSecond section.\n\nInserted section.\n\nThird section.\n")
	v2Target := MarshalAsciiDocWithTargetFallback(v2Source, v1Target, map[string]string{
		"adoc.paragraph.3": "FR:Inserted section.",
	})
	if !strings.Contains(string(v2Target), "FR:First section.") ||
		!strings.Contains(string(v2Target), "FR:Second section.") ||
		!strings.Contains(string(v2Target), "FR:Inserted section.") ||
		!strings.Contains(string(v2Target), "FR:Third section.") {
		t.Fatalf("insert lost a translation: %q", v2Target)
	}

	v3Source := []byte("= Checklist\n\nFirst section.\n\nInserted section.\n\nThird section.\n")
	v3Target := string(MarshalAsciiDocWithTargetFallback(v3Source, v2Target, map[string]string{}))
	if strings.Contains(v3Target, "FR:Second section.") {
		t.Fatalf("deleted section remained: %q", v3Target)
	}
	first := strings.Index(v3Target, "FR:First section.")
	inserted := strings.Index(v3Target, "FR:Inserted section.")
	third := strings.Index(v3Target, "FR:Third section.")
	if first < 0 || inserted < 0 || third < 0 {
		t.Fatalf("expected remaining translations, got %q", v3Target)
	}
	if first >= inserted || inserted >= third {
		t.Fatalf("order broken after add/delete: %q", v3Target)
	}
}

func TestMarshalAsciiDocInsertAtStartAndEnd(t *testing.T) {
	t.Parallel()

	baseTarget := []byte("= Guide\n\nCorps existant.\n")

	start := string(MarshalAsciiDocWithTargetFallback(
		[]byte("= Guide\n\nNew intro.\n\nExisting body.\n"),
		baseTarget,
		map[string]string{"adoc.paragraph": "Nouvelle intro."},
	))
	if !strings.Contains(start, "Nouvelle intro.") || !strings.Contains(start, "Corps existant.") {
		t.Fatalf("insert at start failed: %q", start)
	}
	if strings.Index(start, "Nouvelle intro.") > strings.Index(start, "Corps existant.") {
		t.Fatalf("insert at start out of order: %q", start)
	}

	end := string(MarshalAsciiDocWithTargetFallback(
		[]byte("= Guide\n\nExisting body.\n\nNew outro.\n"),
		baseTarget,
		map[string]string{"adoc.paragraph.2": "Nouvelle conclusion."},
	))
	if !strings.Contains(end, "Corps existant.") || !strings.Contains(end, "Nouvelle conclusion.") {
		t.Fatalf("insert at end failed: %q", end)
	}
	if strings.Index(end, "Corps existant.") > strings.Index(end, "Nouvelle conclusion.") {
		t.Fatalf("insert at end out of order: %q", end)
	}
}

func TestAsciiDocExtractsStackedHeadingsAndKeepsAuthorHeader(t *testing.T) {
	t.Parallel()

	source := []byte("= Guide\nJane Doe <jane@example.com>\n== Install\n=== Linux\n\nBody.\n")
	entries, err := AsciiDocParser{}.Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if entries["adoc.title"] != "Guide" || entries["adoc.heading"] != "Install" || entries["adoc.heading.2"] != "Linux" {
		t.Fatalf("headings=%#v", entries)
	}
	if entries["adoc.paragraph"] != "Body." {
		t.Fatalf("paragraph=%q", entries["adoc.paragraph"])
	}
	for _, value := range entries {
		if strings.Contains(value, "Jane Doe") {
			t.Fatalf("author leaked into translatable text: %#v", entries)
		}
	}
	got := string(MarshalAsciiDoc(source, map[string]string{
		"adoc.title":     "Guia",
		"adoc.heading":   "Instalar",
		"adoc.heading.2": "Linux",
		"adoc.paragraph": "Cuerpo.",
	}))
	if !strings.Contains(got, "Jane Doe <jane@example.com>") {
		t.Fatalf("lost author line: %q", got)
	}
	if !strings.Contains(got, "== Instalar") || !strings.Contains(got, "=== Linux") {
		t.Fatalf("lost stacked headings: %q", got)
	}
}

func TestAsciiDocEqualsParagraphVariantsStayParagraphs(t *testing.T) {
	t.Parallel()

	cases := []string{
		"=price is the listed amount.\n",
		"==value without a space.\n",
		"= Guide\n\n=price stays a paragraph.\n",
	}
	for _, source := range cases {
		entries, err := AsciiDocParser{}.Parse([]byte(source))
		if err != nil {
			t.Fatalf("parse %q: %v", source, err)
		}
		joined := valuesJoin(entries)
		if strings.Contains(joined, "price") && entries["adoc.title"] == "price is the listed amount." {
			t.Fatalf("parsed =price as title for %q: %#v", source, entries)
		}
		got := string(MarshalAsciiDoc([]byte(source), entries))
		if strings.Contains(got, "= price") || strings.Contains(got, "== value") {
			t.Fatalf("rewrote equals paragraph as heading for %q: %q", source, got)
		}
	}
}

func TestAsciiDocProtectsMacrosWithBracketedTargets(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		source string
		label  string
		leak   string
		want   string
	}{
		{
			name:   "link with bracketed path",
			source: "See link:https://example.com/a[b][label].\n",
			label:  "label",
			leak:   "example.com/a[b]",
			want:   "link:https://example.com/a[b][etiqueta]",
		},
		{
			name:   "xref with bracketed target",
			source: "Read xref:section[b][the chapter].\n",
			label:  "the chapter",
			leak:   "section[b]",
			want:   "xref:section[b][el capitulo]",
		},
		{
			name:   "plain url with attr list after bracketed path",
			source: "Open https://example.com/a[b][docs].\n",
			label:  "docs",
			leak:   "example.com/a[b]",
			want:   "https://example.com/a[b][documentos]",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			entries, err := AsciiDocParser{}.Parse([]byte(tc.source))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(entries) != 1 {
				t.Fatalf("entries=%d: %#v", len(entries), entries)
			}
			var key, text string
			for k, value := range entries {
				key, text = k, value
			}
			if !strings.Contains(text, tc.label) {
				t.Fatalf("label %q missing: %q", tc.label, text)
			}
			if strings.Contains(text, tc.leak) {
				t.Fatalf("target leaked %q into %q", tc.leak, text)
			}
			got := string(MarshalAsciiDoc([]byte(tc.source), map[string]string{
				key: strings.NewReplacer(
					"label", "etiqueta",
					"the chapter", "el capitulo",
					"docs", "documentos",
				).Replace(text),
			}))
			if !strings.Contains(got, tc.want) {
				t.Fatalf("restored macro=%q, want substring %q", got, tc.want)
			}
		})
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
