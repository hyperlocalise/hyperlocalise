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
	if got == nil {
		t.Fatal("expected empty map, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected no extracted entries, got %d", len(got))
	}
}

func TestLiquidParserParseWithContextReturnsNilContext(t *testing.T) {
	t.Helper()

	values, contextByKey, err := (LiquidParser{}).ParseWithContext([]byte(`{{ 'header.navigation.home' | t }}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if values == nil {
		t.Fatal("expected empty values map, got nil")
	}
	if len(values) != 0 {
		t.Fatalf("expected no extracted entries, got %d", len(values))
	}
	if contextByKey != nil {
		t.Fatalf("expected nil context map, got %#v", contextByKey)
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
