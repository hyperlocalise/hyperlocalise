package srx

import "testing"

func TestLoadTemplateRejectsUnknown(t *testing.T) {
	t.Parallel()
	if _, err := LoadTemplate("icu"); err == nil {
		t.Fatal("expected unknown template error")
	}
}

func TestNamedTemplatesSegmentDifferently(t *testing.T) {
	t.Parallel()
	def, err := LoadTemplate("DEFAULT")
	if err != nil {
		t.Fatalf("default: %v", err)
	}
	md, err := LoadTemplate("Markdown")
	if err != nil {
		t.Fatalf("markdown: %v", err)
	}
	html, err := LoadTemplate("html")
	if err != nil {
		t.Fatalf("html: %v", err)
	}

	numbered := "1. First item. Second sentence."
	if got := spanTexts(def.Segment(numbered, "en")); !equalStrings(got, []string{"1.", " First item.", " Second sentence."}) {
		t.Fatalf("default numbered spans = %#v", got)
	}
	if got := spanTexts(md.Segment(numbered, "en")); !equalStrings(got, []string{"1. First item.", " Second sentence."}) {
		t.Fatalf("markdown numbered spans = %#v", got)
	}

	urlText := "See http: docs. Next."
	if got := spanTexts(html.Segment(urlText, "en")); !equalStrings(got, []string{"See http: docs.", " Next."}) {
		t.Fatalf("html url spans = %#v", got)
	}
}

func TestIsNamedTemplate(t *testing.T) {
	t.Parallel()
	if !IsNamedTemplate(" default ") || !IsNamedTemplate("HTML") || !IsNamedTemplate("markdown") {
		t.Fatal("expected named templates to match")
	}
	if IsNamedTemplate("rules/custom.srx") || IsNamedTemplate("") {
		t.Fatal("did not expect path or empty spec to be a template")
	}
}
