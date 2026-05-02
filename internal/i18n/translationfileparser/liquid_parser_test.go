package translationfileparser

import (
	"strings"
	"testing"

	"github.com/osteele/liquid"
	"github.com/osteele/liquid/render"
)

func TestLiquidParserImplementsParserInterfaces(t *testing.T) {
	t.Helper()

	requireLiquidParser(LiquidParser{})
	requireLiquidContextParser(LiquidParser{})
}

func TestLiquidParserParseExtractsStaticEntry(t *testing.T) {
	t.Helper()

	got, err := (LiquidParser{}).Parse([]byte(`{{ 'header.navigation.home' | t }}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected one extracted entry, got %d", len(got))
	}
	if got["header.navigation.home"] != "header.navigation.home" {
		t.Fatalf("unexpected extracted value: %q", got["header.navigation.home"])
	}
}

func TestLiquidParserParseWithContextReturnsNilContext(t *testing.T) {
	t.Helper()

	values, contextByKey, err := (LiquidParser{}).ParseWithContext([]byte(`{{ 'header.navigation.home' | t }}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if len(values) != 1 {
		t.Fatalf("expected one extracted entry, got %d", len(values))
	}
	if values["header.navigation.home"] != "header.navigation.home" {
		t.Fatalf("unexpected extracted value: %q", values["header.navigation.home"])
	}
	if contextByKey != nil {
		t.Fatalf("expected nil context map, got %#v", contextByKey)
	}
}

func TestLiquidParserParseWithDiagnosticsEmitsDynamicKeyWarning(t *testing.T) {
	t.Helper()

	var diagnostics []Diagnostic
	values, contextByKey, err := (LiquidParser{}).ParseWithDiagnostics([]byte(`{{ 'static.key' | t }}
{{ product.title | t }}
{{ section.settings.label | default: 'Label' | t }}
`), &diagnostics)
	if err != nil {
		t.Fatalf("parse with diagnostics: %v", err)
	}

	if len(values) != 1 {
		t.Fatalf("expected one static entry, got %#v", values)
	}
	if values["static.key"] != "static.key" {
		t.Fatalf("expected static key to be extracted, got %#v", values)
	}
	if contextByKey != nil {
		t.Fatalf("expected nil context map, got %#v", contextByKey)
	}

	if len(diagnostics) != 2 {
		t.Fatalf("expected two diagnostics, got %#v", diagnostics)
	}
	assertLiquidDynamicKeyDiagnostic(t, diagnostics[0], 2)
	assertLiquidDynamicKeyDiagnostic(t, diagnostics[1], 3)
}

func TestLiquidParserParseWithDiagnosticsIgnoresStringLiteralPipes(t *testing.T) {
	t.Helper()

	var diagnostics []Diagnostic
	values, _, err := (LiquidParser{}).ParseWithDiagnostics([]byte(`
{{ "'theme.string_literal.ignored' | t" }}
{{ 'theme.included' | t }}
`), &diagnostics)
	if err != nil {
		t.Fatalf("parse with diagnostics: %v", err)
	}

	if len(diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %#v", diagnostics)
	}
	if values["theme.included"] != "theme.included" {
		t.Fatalf("expected included key, got %#v", values)
	}
}

func TestLiquidParserParseExtractsMultipleStaticKeys(t *testing.T) {
	t.Helper()

	got, err := (LiquidParser{}).Parse([]byte(`
{{ 'header.navigation.home' | t }}
{{ "footer.contact.title" | t }}
{{ 'header.navigation.home' | t }}
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected two unique extracted entries, got %d", len(got))
	}
	if got["header.navigation.home"] != "header.navigation.home" {
		t.Fatalf("unexpected first extracted value: %q", got["header.navigation.home"])
	}
	if got["footer.contact.title"] != "footer.contact.title" {
		t.Fatalf("unexpected second extracted value: %q", got["footer.contact.title"])
	}
}

func TestLiquidParserParseIgnoresUnsupportedShapes(t *testing.T) {
	t.Helper()

	got, err := (LiquidParser{}).Parse([]byte(`
{{ variable | t }}
{{ section.settings.label | t }}
{{ 'header.navigation.home' | upcase }}
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 0 {
		t.Fatalf("expected no extracted entries for unsupported shapes, got %#v", got)
	}
}

func TestLiquidParserParseExtractsChainedFilterKeys(t *testing.T) {
	t.Helper()

	got, err := (LiquidParser{}).Parse([]byte(`
{{ 'header.navigation.home' | upcase | t }}
{{ 'footer.contact.title' | t | escape }}
{{ "cart.checkout.label" | default: "Checkout" | t | escape }}
{{ 'header.navigation.home' | upcase }}
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("expected three extracted entries, got %#v", got)
	}
	expectedKeys := []string{
		"header.navigation.home",
		"footer.contact.title",
		"cart.checkout.label",
	}
	for _, key := range expectedKeys {
		if got[key] != key {
			t.Fatalf("expected %q to be extracted, got %#v", key, got)
		}
	}
	if _, ok := got["header.navigation.home | upcase"]; ok {
		t.Fatalf("expected non-t chain to be ignored, got %#v", got)
	}
}

func TestLiquidParserParseExtractsHTMLSafeAndCaptureKeys(t *testing.T) {
	t.Helper()

	got, err := (LiquidParser{}).Parse([]byte(`
{% capture header_title %}
{{ 'sections.header.title' | t }}
{% endcapture %}

{{ 'sections.header.html' | html_safe | t }}
{{ 'sections.footer.html' | t | html_safe }}
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("expected three extracted entries, got %#v", got)
	}
	expectedKeys := []string{
		"sections.header.title",
		"sections.header.html",
		"sections.footer.html",
	}
	for _, key := range expectedKeys {
		if got[key] != key {
			t.Fatalf("expected %q to be extracted, got %#v", key, got)
		}
	}
}

func TestLiquidParserParseSkipsNonTranslatableRegions(t *testing.T) {
	t.Helper()

	got, err := (LiquidParser{}).Parse([]byte(`
{% comment %}
{{ 'theme.comment.ignored' | t }}
{% endcomment %}

{% raw %}
{{ 'theme.raw.ignored' | t }}
{% endraw %}

{{ "'theme.string_literal.ignored' | t" }}
{% assign ignored = "'theme.assigned_string.ignored' | t" %}

{{ 'theme.included' | t }}
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected one extracted entry, got %#v", got)
	}
	if got["theme.included"] != "theme.included" {
		t.Fatalf("expected included key, got %#v", got)
	}

	ignoredKeys := []string{
		"theme.comment.ignored",
		"theme.raw.ignored",
		"theme.string_literal.ignored",
		"theme.assigned_string.ignored",
	}
	for _, key := range ignoredKeys {
		if _, ok := got[key]; ok {
			t.Fatalf("expected %q to be ignored, got %#v", key, got)
		}
	}
}

func TestLiquidPackageParsesChainedFilters(t *testing.T) {
	t.Helper()

	engine := liquid.NewEngine()
	template, err := engine.ParseTemplate([]byte(`{{ "hello" | capitalize | append: "!" }}`))
	if err != nil {
		t.Fatalf("parse template: %v", err)
	}
	root := template.GetRoot()

	seq, ok := root.(*render.SeqNode)
	if !ok {
		t.Fatalf("unexpected root type %T", root)
	}
	if len(seq.Children) != 1 {
		t.Fatalf("unexpected child count: got %d want 1", len(seq.Children))
	}

	objectNode, ok := seq.Children[0].(*render.ObjectNode)
	if !ok {
		t.Fatalf("unexpected child type %T", seq.Children[0])
	}
	if sourceText := objectNode.SourceText(); !strings.Contains(sourceText, "capitalize") || !strings.Contains(sourceText, "append") {
		t.Fatalf("expected chained filter source text, got %q", sourceText)
	}
}

func requireLiquidParser(_ Parser) {}

func requireLiquidContextParser(_ ContextParser) {}

func assertLiquidDynamicKeyDiagnostic(t *testing.T, got Diagnostic, lineNumber int) {
	t.Helper()

	if got.Code != LiquidDynamicKeyDiagnosticCode {
		t.Fatalf("unexpected diagnostic code: %#v", got)
	}
	if got.FilePath != unknownDiagnosticFilePath {
		t.Fatalf("unexpected diagnostic file path: %#v", got)
	}
	if got.LineNumber != lineNumber {
		t.Fatalf("unexpected diagnostic line number: got %d want %d in %#v", got.LineNumber, lineNumber, got)
	}
	if got.Hint != DefaultDiagnosticHint(LiquidDynamicKeyDiagnosticCode) {
		t.Fatalf("unexpected diagnostic hint: %#v", got)
	}
}
