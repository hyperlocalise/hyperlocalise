package translationfileparser

import (
	"strings"
	"testing"
)

func TestHTMLParserParseExtractsBlockTextContent(t *testing.T) {
	content := []byte(`<html><body><h1>Welcome</h1><p>Hello world.</p></body></html>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "Welcome") {
		t.Fatalf("expected h1 text in entries, got %q", combined)
	}
	if !strings.Contains(combined, "Hello world.") {
		t.Fatalf("expected p text in entries, got %q", combined)
	}
}

func TestHTMLParserParseExcludesScriptAndStyleContent(t *testing.T) {
	content := []byte(`<body>
<p>Visible text</p>
<script>var x = "should not translate";</script>
<style>.foo { color: red; }</style>
</body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if strings.Contains(combined, "should not translate") {
		t.Fatalf("expected script content excluded, got %q", combined)
	}
	if strings.Contains(combined, ".foo") {
		t.Fatalf("expected style content excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Visible text") {
		t.Fatalf("expected body text included, got %q", combined)
	}
}

func TestHTMLParserParseExcludesHeadContent(t *testing.T) {
	content := []byte(`<!DOCTYPE html>
<html>
<head>
  <title>Page Title</title>
  <meta name="description" content="A description">
</head>
<body><p>Body text</p></body>
</html>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if strings.Contains(combined, "Page Title") {
		t.Fatalf("expected head/title content excluded, got %q", combined)
	}
	if strings.Contains(combined, "A description") {
		t.Fatalf("expected meta content excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Body text") {
		t.Fatalf("expected body text included, got %q", combined)
	}
}

func TestHTMLParserParseProtectsInlineTagsAsPlaceholders(t *testing.T) {
	content := []byte(`<p>Hello <strong>world</strong>!</p>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 entry, got %d: %v", len(got), got)
	}

	for _, v := range got {
		if strings.Contains(v, "<strong>") || strings.Contains(v, "</strong>") {
			t.Fatalf("expected inline tags replaced by placeholders, got entry %q", v)
		}
		// Placeholder sentinel characters must be present.
		if !strings.Contains(v, "\x1e") {
			t.Fatalf("expected placeholder sentinels in entry, got %q", v)
		}
		if !strings.Contains(v, "world") {
			t.Fatalf("expected text content preserved around placeholders, got %q", v)
		}
	}
}

func TestHTMLParserParseProtectsNestedInlineTags(t *testing.T) {
	content := []byte(`<p>Text with <em><strong>nested</strong></em> tags.</p>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(got))
	}

	for _, v := range got {
		if strings.Contains(v, "<em>") || strings.Contains(v, "<strong>") {
			t.Fatalf("expected all nested tags placeholdered, got %q", v)
		}
		if !strings.Contains(v, "nested") {
			t.Fatalf("expected inner text preserved, got %q", v)
		}
	}
}

func TestHTMLParserParsePreservesHTMLEntitiesInEntries(t *testing.T) {
	content := []byte(`<p>Tom &amp; Jerry &lt;rivals&gt;</p>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "&amp;") {
		t.Fatalf("expected &amp; preserved in entries, got %q", combined)
	}
}

func TestHTMLParserParseSkipsWhitespaceOnlyTextNodes(t *testing.T) {
	content := []byte(`<ul>
  <li>Item one</li>
  <li>Item two</li>
</ul>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	// Should have 2 entries (one per <li>), not extra whitespace-only entries.
	if len(got) != 2 {
		t.Fatalf("expected 2 entries, got %d: %v", len(got), got)
	}
}

// --- Marshal tests ---

func TestHTMLMarshalRoundTripPreservesStructure(t *testing.T) {
	template := []byte(`<!DOCTYPE html>
<html>
<body>
<h1>Hello world</h1>
<p>Simple paragraph.</p>
</body>
</html>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	uppercased := make(map[string]string, len(entries))
	for k, v := range entries {
		uppercased[k] = strings.ToUpper(v)
	}

	out, diags := MarshalHTML(template, uppercased)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, "<h1>") || !strings.Contains(s, "</h1>") {
		t.Fatalf("expected h1 tags preserved, got:\n%s", s)
	}
	if !strings.Contains(s, "HELLO WORLD") {
		t.Fatalf("expected uppercased h1 text, got:\n%s", s)
	}
	if !strings.Contains(s, "SIMPLE PARAGRAPH.") {
		t.Fatalf("expected uppercased paragraph text, got:\n%s", s)
	}
	if !strings.Contains(s, "<!DOCTYPE html>") {
		t.Fatalf("expected doctype preserved, got:\n%s", s)
	}
}

func TestHTMLMarshalRestoresInlineTagPlaceholders(t *testing.T) {
	template := []byte(`<p>Hello <strong>world</strong>!</p>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	uppercased := make(map[string]string, len(entries))
	for k, v := range entries {
		uppercased[k] = strings.ToUpper(v)
	}

	out, diags := MarshalHTML(template, uppercased)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, "<strong>") || !strings.Contains(s, "</strong>") {
		t.Fatalf("expected inline tags restored, got: %s", s)
	}
	if strings.Contains(s, "\x1e") {
		t.Fatalf("expected no residual placeholder sentinels, got: %s", s)
	}
}

func TestHTMLMarshalRestoresNestedTagPlaceholders(t *testing.T) {
	template := []byte(`<p>See <em><strong>important note</strong></em> here.</p>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	uppercased := make(map[string]string, len(entries))
	for k, v := range entries {
		uppercased[k] = strings.ToUpper(v)
	}

	out, diags := MarshalHTML(template, uppercased)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, "<em>") || !strings.Contains(s, "<strong>") {
		t.Fatalf("expected nested inline tags restored, got: %s", s)
	}
	if !strings.Contains(s, "IMPORTANT NOTE") {
		t.Fatalf("expected uppercased inner text, got: %s", s)
	}
}

func TestHTMLMarshalPreservesHTMLEntitiesOnRoundTrip(t *testing.T) {
	template := []byte(`<p>Tom &amp; Jerry &lt;rivals&gt;</p>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	// Simulate translation that leaves entity-encoded text as-is.
	out, diags := MarshalHTML(template, entries)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, "&amp;") {
		t.Fatalf("expected &amp; preserved in output, got: %s", s)
	}
	if !strings.Contains(s, "&lt;rivals&gt;") {
		t.Fatalf("expected &lt; &gt; entities preserved, got: %s", s)
	}
}

func TestHTMLMarshalFallsBackToSourceForMissingKey(t *testing.T) {
	template := []byte(`<p>Untranslated text</p>`)

	out, diags := MarshalHTML(template, map[string]string{})

	if len(diags.SourceFallbackKeys) != 1 {
		t.Fatalf("expected 1 fallback key, got %d: %v", len(diags.SourceFallbackKeys), diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, "Untranslated text") {
		t.Fatalf("expected source text preserved on fallback, got: %s", s)
	}
}

func TestHTMLMarshalPreservesScriptAndStyleVerbatim(t *testing.T) {
	template := []byte(`<body>
<p>Hello</p>
<script>var x = 1;</script>
<style>.a{}</style>
</body>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	out, _ := MarshalHTML(template, entries)
	s := string(out)

	if !strings.Contains(s, "var x = 1;") {
		t.Fatalf("expected script preserved verbatim, got:\n%s", s)
	}
	if !strings.Contains(s, ".a{}") {
		t.Fatalf("expected style preserved verbatim, got:\n%s", s)
	}
}

func TestHTMLParserParseFixture(t *testing.T) {
	content := readFixture(t, "tests/html/en-US.html")

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}

	if len(got) == 0 {
		t.Fatalf("expected entries from fixture")
	}

	combined := strings.Join(mapValues(got), "\n")

	// Script content must be excluded.
	if strings.Contains(combined, "should not be translated") {
		t.Fatalf("expected script content excluded, got %q", combined)
	}
	// Body text must be present.
	if !strings.Contains(combined, "Welcome") {
		t.Fatalf("expected heading text in entries, got %q", combined)
	}
}

// --- MarshalHTMLWithTargetFallback tests ---

func TestHTMLMarshalWithTargetFallbackHappyPath(t *testing.T) {
	source := []byte(`<p>Hello</p><p>World</p>`)
	target := []byte(`<p>Bonjour</p><p>Monde</p>`)

	out, diags := MarshalHTMLWithTargetFallback(source, target, map[string]string{})
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("expected no source fallbacks, got %v", diags.SourceFallbackKeys)
	}
	s := string(out)
	if !strings.Contains(s, "Bonjour") || !strings.Contains(s, "Monde") {
		t.Fatalf("expected target translations used as fallback, got: %s", s)
	}
}

func TestHTMLMarshalWithTargetFallbackStagedValueTakesPriority(t *testing.T) {
	source := []byte(`<p>Hello</p>`)
	target := []byte(`<p>Bonjour</p>`)

	entries, err := HTMLParser{}.Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	// Provide a staged value that differs from the target.
	staged := make(map[string]string)
	for k := range entries {
		staged[k] = "Hola"
	}

	out, diags := MarshalHTMLWithTargetFallback(source, target, staged)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}
	s := string(out)
	if strings.Contains(s, "Bonjour") {
		t.Fatalf("expected staged value to take priority over target, got: %s", s)
	}
	if !strings.Contains(s, "Hola") {
		t.Fatalf("expected staged value in output, got: %s", s)
	}
}

func TestHTMLMarshalWithTargetFallbackLengthMismatch(t *testing.T) {
	// Source has more segments than target; extra segments fall back to source text.
	source := []byte(`<p>One</p><p>Two</p><p>Three</p>`)
	target := []byte(`<p>Un</p><p>Deux</p>`)

	out, diags := MarshalHTMLWithTargetFallback(source, target, map[string]string{})
	s := string(out)
	if !strings.Contains(s, "Un") || !strings.Contains(s, "Deux") {
		t.Fatalf("expected first two segments translated, got: %s", s)
	}
	// Third segment has no target and no staged value — must fall back to source.
	if len(diags.SourceFallbackKeys) != 1 {
		t.Fatalf("expected 1 source fallback for extra segment, got %d: %v", len(diags.SourceFallbackKeys), diags.SourceFallbackKeys)
	}
	if !strings.Contains(s, "Three") {
		t.Fatalf("expected source text for extra segment, got: %s", s)
	}
}

func TestHTMLMarshalWithTargetFallbackPositionalAlignment(t *testing.T) {
	// Source has two segments; staged covers position 0.
	// Target position 1 ("Deux") must align with source position 1 ("Two").
	source := []byte(`<p>One</p><p>Two</p>`)
	target := []byte(`<p>Un</p><p>Deux</p>`)

	entries, err := HTMLParser{}.Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	var keyForOne string
	for k, v := range entries {
		if strings.Contains(v, "One") {
			keyForOne = k
			break
		}
	}
	staged := map[string]string{keyForOne: "Uno"}

	out, diags := MarshalHTMLWithTargetFallback(source, target, staged)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}
	s := string(out)
	if !strings.Contains(s, "Deux") {
		t.Fatalf("expected target position 1 used for source position 1, got: %s", s)
	}
}

func TestHTMLParserPreExcludedFromTranslation(t *testing.T) {
	content := []byte(`<p>Here is an example:</p>
<pre>
  const x = 1;
  console.log(x);
</pre>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if strings.Contains(combined, "const x") {
		t.Fatalf("expected pre content excluded from translation, got %q", combined)
	}
	if !strings.Contains(combined, "Here is an example:") {
		t.Fatalf("expected paragraph text included, got %q", combined)
	}
}

func TestHTMLMarshalPreContentPreservedVerbatim(t *testing.T) {
	template := []byte(`<p>Intro</p><pre>  code here  </pre>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	out, _ := MarshalHTML(template, entries)
	s := string(out)
	if !strings.Contains(s, "  code here  ") {
		t.Fatalf("expected pre content preserved verbatim, got: %s", s)
	}
}

func TestHTMLMarshalFixtureRoundTrip(t *testing.T) {
	template := readFixture(t, "tests/html/en-US.html")

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	uppercased := make(map[string]string, len(entries))
	for k, v := range entries {
		uppercased[k] = strings.ToUpper(v)
	}

	out, diags := MarshalHTML(template, uppercased)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}

	s := string(out)

	// All structural markup must survive.
	if !strings.Contains(s, "<body>") || !strings.Contains(s, "</body>") {
		t.Fatalf("expected body tags preserved, got:\n%s", s)
	}
	if !strings.Contains(s, "<script>") {
		t.Fatalf("expected script tag preserved, got:\n%s", s)
	}
	// Inline tags inside paragraphs must be restored.
	if !strings.Contains(s, "<strong>") {
		t.Fatalf("expected inline strong tag restored, got:\n%s", s)
	}
	// No residual placeholders.
	if strings.Contains(s, "\x1e") {
		t.Fatalf("expected no residual placeholder sentinels, got:\n%s", s)
	}
}

func TestHTMLParserExtractsImgAlt(t *testing.T) {
	content := []byte(`<body><img src="cat.png" alt="A red cat"></body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 entry, got %d: %v", len(got), got)
	}
	for _, v := range got {
		if v != "A red cat" {
			t.Fatalf("expected entry value %q, got %q", "A red cat", v)
		}
	}
}

func TestHTMLParserSkipsImgWithNoAlt(t *testing.T) {
	content := []byte(`<body><img src="cat.png"></body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 entries, got %d: %v", len(got), got)
	}
}

func TestHTMLParserSkipsImgWithEmptyAlt(t *testing.T) {
	content := []byte(`<body><img src="cat.png" alt=""></body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 entries for empty alt, got %d: %v", len(got), got)
	}
}

func TestHTMLParserDecodesImgAltEntities(t *testing.T) {
	content := []byte(`<body><img alt="Cat &amp; dog"></body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 entry, got %d: %v", len(got), got)
	}
	for _, v := range got {
		if v != "Cat & dog" {
			t.Fatalf("expected decoded value %q, got %q", "Cat & dog", v)
		}
	}
}

func TestHTMLMarshalImgAltRoundTrip(t *testing.T) {
	template := []byte(`<body><img src="cat.png" alt="A red cat" class="banner"></body>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	translated := make(map[string]string, len(entries))
	for k := range entries {
		translated[k] = "Un gato rojo"
	}

	out, diags := MarshalHTML(template, translated)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, `alt="Un gato rojo"`) {
		t.Fatalf("expected translated alt in output, got:\n%s", s)
	}
	// Rest of tag must be unchanged.
	if !strings.Contains(s, `src="cat.png"`) {
		t.Fatalf("expected src attribute preserved, got:\n%s", s)
	}
	if !strings.Contains(s, `class="banner"`) {
		t.Fatalf("expected class attribute preserved, got:\n%s", s)
	}
}

func TestHTMLMarshalImgAltFallsBackToSource(t *testing.T) {
	template := []byte(`<body><img alt="A red cat"></body>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	_ = entries

	out, diags := MarshalHTML(template, map[string]string{})
	if len(diags.SourceFallbackKeys) != 1 {
		t.Fatalf("expected 1 fallback key, got %v", diags.SourceFallbackKeys)
	}

	s := string(out)
	if !strings.Contains(s, `alt="A red cat"`) {
		t.Fatalf("expected source alt in fallback output, got:\n%s", s)
	}
}

func TestHTMLMarshalImgAltSingleQuoteRoundTrip(t *testing.T) {
	template := []byte(`<body><img src="cat.png" alt='A red cat'></body>`)

	entries, err := HTMLParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	translated := make(map[string]string, len(entries))
	for k := range entries {
		translated[k] = "Un gato rojo"
	}

	out, diags := MarshalHTML(template, translated)
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallbacks: %v", diags.SourceFallbackKeys)
	}
	if !strings.Contains(string(out), "Un gato rojo") {
		t.Fatalf("expected translated alt in output, got:\n%s", out)
	}
}

func TestHTMLParserImgInlineWithinParagraph(t *testing.T) {
	// <img> within a <p> splits the paragraph into separate segments.
	content := []byte(`<p>See <img alt="icon" src="icon.png"> for details.</p>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), " ")
	if !strings.Contains(combined, "icon") {
		t.Fatalf("expected img alt extracted, got entries: %v", got)
	}
	if !strings.Contains(combined, "details") {
		t.Fatalf("expected surrounding text extracted, got entries: %v", got)
	}
}

func TestHTMLParserImgAltWithSpacesAroundEquals(t *testing.T) {
	// HTML allows optional whitespace around `=`; ensure alt is still extracted.
	content := []byte(`<body><img alt = "A red cat"></body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 entry, got %d: %v", len(got), got)
	}
	for _, v := range got {
		if v != "A red cat" {
			t.Fatalf("expected alt value extracted, got: %q", v)
		}
	}
}

func TestHTMLParserImgDataAltDoesNotMatchAlt(t *testing.T) {
	// \balt= would match the "alt" suffix of data-alt="..."; [\s]alt= must not.
	content := []byte(`<body><img data-alt="icon" alt="A red cat"></body>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 entry for alt only, got %d: %v", len(got), got)
	}
	for _, v := range got {
		if v != "A red cat" {
			t.Fatalf("expected alt value extracted, got: %q", v)
		}
	}
}

func TestHTMLParserImgWithoutAltDoesNotFragmentProse(t *testing.T) {
	// <img> without alt must not fragment surrounding prose into separate segments.
	content := []byte(`<p>See <img src="icon.png"> for details.</p>`)

	got, err := HTMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 translation unit, got %d: %v", len(got), got)
	}
	for _, v := range got {
		if !strings.Contains(v, "See") || !strings.Contains(v, "details") {
			t.Fatalf("expected prose kept in one unit, got: %q", v)
		}
	}
}
