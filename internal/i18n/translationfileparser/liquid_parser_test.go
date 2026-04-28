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

func TestLiquidParserParseReturnsEmptyEntries(t *testing.T) {
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
{{ 'header.navigation.home' | upcase | t }}
{{ 'header.navigation.home' | t | escape }}
{{ 'header.navigation.home' | upcase }}
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 0 {
		t.Fatalf("expected no extracted entries for unsupported shapes, got %#v", got)
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
