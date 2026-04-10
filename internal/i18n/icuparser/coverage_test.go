package icuparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestPluralElementTypeUsesPluralTypeField(t *testing.T) {
	p := PluralElement{PluralType: TypePlural, Ordinal: true}
	if got := p.Type(); got != TypePlural {
		t.Fatalf("expected PluralType field to win: got %q", got)
	}
	if got := (PluralElement{Ordinal: true}).Type(); got != TypeSelectOrdinal {
		t.Fatal("expected Ordinal without PluralType")
	}
	if got := (PluralElement{}).Type(); got != TypePlural {
		t.Fatal("expected default plural type")
	}
}

func TestInvariantExportedHelpers(t *testing.T) {
	a := []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1, 0}}}
	b := []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1, 0}}}
	if !SameICUBlocks(a, b) {
		t.Fatal("SameICUBlocks expected true")
	}
	if SameICUBlocks(a, []BlockSignature{{Arg: "n", Type: "select", Options: []string{"x"}}}) {
		t.Fatal("SameICUBlocks expected false for type mismatch")
	}
	if SameICUBlocks(a, []BlockSignature{}) {
		t.Fatal("SameICUBlocks expected false for length mismatch")
	}
	if SameICUBlocks(a, []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"other"}}}) {
		t.Fatal("SameICUBlocks expected false for options mismatch")
	}

	if !HasDuplicatePounds([]BlockSignature{{Pounds: []int{0, 2, 0}}}) {
		t.Fatal("expected duplicate pounds")
	}
	if HasDuplicatePounds([]BlockSignature{{Pounds: []int{0, 1}}}) {
		t.Fatal("expected no duplicate pounds")
	}

	if got := FormatICUBlocks(nil); got != "[]" {
		t.Fatalf("empty FormatICUBlocks: %q", got)
	}
	formatted := FormatICUBlocks([]BlockSignature{
		{Arg: "a", Type: "plural", Options: []string{"one"}, Pounds: []int{1}},
		{Arg: "b", Type: "select", Options: []string{"x"}},
	})
	if !strings.Contains(formatted, "#") || !strings.Contains(formatted, "b:select") {
		t.Fatalf("unexpected format: %s", formatted)
	}
}

func TestParseInvariantMustacheFallback(t *testing.T) {
	inv, err := ParseInvariant("{{name}}")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !reflect.DeepEqual(inv.Placeholders, []string{"name"}) {
		t.Fatalf("placeholders: %#v", inv.Placeholders)
	}
}

func TestParseInvariantSortsICUBlocksByCompoundKey(t *testing.T) {
	// Same Arg and Type; third sort key compares joined options (differs here).
	msg := "{a, select, x {x}}{a, select, y {y}}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(inv.ICUBlocks) != 2 {
		t.Fatalf("expected 2 blocks, got %d: %#v", len(inv.ICUBlocks), inv.ICUBlocks)
	}

	// Same Arg, different Type — exercises ICUBlocks sort Type comparison.
	msg2 := "{a, select, x {x}}{a, plural, one {y}}"
	if _, err := ParseInvariant(msg2); err != nil {
		t.Fatalf("parse: %v", err)
	}
}

func TestCollectInvariantNumberDateTimeAndNoop(t *testing.T) {
	var inv Invariant
	collectInvariantFromElement(NumberElement{Value: "n"}, &inv, "")
	collectInvariantFromElement(DateElement{Value: "d"}, &inv, "")
	collectInvariantFromElement(TimeElement{Value: "t"}, &inv, "")
	if !reflect.DeepEqual(inv.Placeholders, []string{"n", "d", "t"}) {
		t.Fatalf("got %#v", inv.Placeholders)
	}

	var inv2 Invariant
	collectInvariantFromElement(noopEl{}, &inv2, "")
	if len(inv2.Placeholders) != 0 || len(inv2.ICUBlocks) != 0 {
		t.Fatalf("noop should not mutate: %#v", inv2)
	}
}

type noopEl struct{}

func (noopEl) Type() ElementType { return "noop" }

func TestCountPoundsNested(t *testing.T) {
	n := countPounds([]Element{
		TagElement{Children: []Element{PoundElement{}}},
		SelectElement{Options: []SelectOption{{Value: []Element{PoundElement{}, PoundElement{}}}}},
		PluralElement{Options: []PluralOption{{Value: []Element{PoundElement{}}}}},
	})
	if n != 4 {
		t.Fatalf("countPounds: got %d", n)
	}
}

func TestInvariantHelpersEdgeCases(t *testing.T) {
	if formatPoundCounts(nil) != "" {
		t.Fatal("empty formatPoundCounts")
	}
	if formatPoundCounts([]int{1, 2}) != "1,2" {
		t.Fatalf("formatPoundCounts: %q", formatPoundCounts([]int{1, 2}))
	}
	if uniqueStrings(nil) != nil {
		t.Fatal("uniqueStrings(nil) should be nil")
	}
	if !slicesEqual([]int{1}, []int{1}) || slicesEqual([]int{1}, []int{2}) || slicesEqual([]int{1}, []int{1, 1}) {
		t.Fatal("slicesEqual broken")
	}
	if isPlaceholderName("") || isPlaceholderName("9bad") || isPlaceholderName("a b") {
		t.Fatal("isPlaceholderName should reject")
	}
}

func TestParseErrorsAndEdgeCases(t *testing.T) {
	if _, err := Parse("{x, select, other {", nil); err == nil {
		t.Fatal("expected unclosed")
	}

	if _, err := Parse("#", nil); err != nil {
		t.Fatalf("pound outside plural: %v", err)
	}

	if _, err := Parse("<3", nil); err != nil {
		t.Fatalf("literal lt: %v", err)
	}

	for _, in := range []string{
		"{",
		"{ ",
		"{x y}",
		"{x,}",
		"{x, select}",
		"{x, select, }",
		"{x, plural}",
		"{x, plural, offset:x one {}}",
		"{x, plural, one {",
		"<a/",
		"<a>no close",
		"<a></b>",
		"<a>{x}}</a>",
	} {
		if _, err := Parse(in, nil); err == nil {
			t.Fatalf("expected error for %q", in)
		}
	}

	if _, err := Parse("{x, spellout, ::x}", nil); err != nil {
		t.Fatalf("custom formatter: %v", err)
	}

	if _, err := Parse("{n, number, {a{b}}}", nil); err != nil {
		t.Fatalf("nested braces in style: %v", err)
	}

	if _, err := Parse("{d, date}", nil); err != nil {
		t.Fatalf("date no style: %v", err)
	}
	if _, err := Parse("{tm, time, ::H}", nil); err != nil {
		t.Fatalf("time with style: %v", err)
	}

	if _, err := Parse("{c, plural, one {#} other {x}}", nil); err != nil {
		t.Fatalf("pound in plural: %v", err)
	}

	if _, err := Parse("<p><span>x</span></p>", nil); err != nil {
		t.Fatalf("nested tags: %v", err)
	}

	if _, err := Parse("<b>'a''b' {x}</b>", nil); err != nil {
		t.Fatalf("quoted doubled inside tag: %v", err)
	}
}

func TestParseSimpleStyleUnclosed(t *testing.T) {
	if _, err := Parse("{x, number, x", nil); err == nil {
		t.Fatal("expected unclosed simple style")
	}
}

func TestParseSimpleTypedArgumentStyleError(t *testing.T) {
	if _, err := Parse("{x, number x}", nil); err == nil {
		t.Fatal("expected error from parseSimpleStyle")
	}
}

func TestConsumeQuotedIntoDoubledMiddle(t *testing.T) {
	elems, err := Parse("'{ab''c}'", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 1 {
		t.Fatalf("got %#v", elems)
	}
	lit, ok := elems[0].(LiteralElement)
	if !ok || lit.Value != "{ab'c}" {
		t.Fatalf("literal: %#v", elems[0])
	}

	var b strings.Builder
	p := astParser{src: "'{z''w}'", pos: 0}
	p.consumeQuotedInto(&b)
	if got := b.String(); got != "{z'w}" {
		t.Fatalf("consumeQuotedInto middle escape: %q", got)
	}
}

func TestPeekReadEdges(t *testing.T) {
	p := astParser{src: "x"}
	p.pos = 1
	if p.peek() != 0 {
		t.Fatalf("peek EOF: %d", p.peek())
	}
	p = astParser{src: "{ ,"}
	p.pos = 0
	if _, err := p.parseMessage(parseCtx{}, false); err == nil {
		t.Fatal("expected empty identifier")
	}
	p = astParser{src: "=0"}
	p.pos = 0
	if sel, ok := p.readSelector(); !ok || sel != "=0" {
		t.Fatalf("expected numeric selector, got %q ok=%v", sel, ok)
	}
	p = astParser{src: " \t"}
	p.pos = 0
	if _, ok := p.readSelector(); ok {
		t.Fatal("expected empty selector")
	}
	p = astParser{src: ">"}
	p.pos = 0
	if _, ok := p.readTagName(); ok {
		t.Fatal("expected empty tag name")
	}
}

func TestParseArgumentLikeExpectedOpenBrace(t *testing.T) {
	p := astParser{src: "", pos: 0}
	if _, err := p.parseArgumentLike(); err == nil || !strings.Contains(err.Error(), "expected '{'") {
		t.Fatalf("got %v", err)
	}
}

func TestParseCustomArgumentStyleError(t *testing.T) {
	if _, err := Parse("{x, spellout", nil); err == nil {
		t.Fatal("expected error")
	}
}

func TestParseSimpleStyleQuotedInStyle(t *testing.T) {
	if _, err := Parse("{n, number, 'a''b' 'c'}", nil); err != nil {
		t.Fatalf("parse: %v", err)
	}
}

func TestParseSelectPluralAndTagBranches(t *testing.T) {
	for _, in := range []string{
		"{x, select, other {x}",
		"{x, select, other x {}}",
		"{x, plural, one {x}",
		"{x, plural, offset:bad one {}}",
	} {
		if _, err := Parse(in, nil); err == nil {
			t.Fatalf("expected error for %q", in)
		}
	}

	if _, err := Parse("<a></a>", nil); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, err := Parse("</a>", nil); err != nil {
		t.Fatalf("parse: %v", err)
	}
	pTag := &astParser{src: "<>", pos: 0}
	if _, _, err := pTag.tryParseTag(parseCtx{}); err != nil {
		t.Fatalf("tryParseTag: %v", err)
	}
	if _, err := Parse("<a/>", nil); err != nil {
		t.Fatalf("self-close: %v", err)
	}
	if _, err := Parse("<a/", nil); err == nil {
		t.Fatal("expected self-closing tag error")
	}
	if _, err := Parse("<a></b>", nil); err == nil {
		t.Fatal("expected mismatched close tag")
	}
	if _, err := Parse("<a></a ", nil); err == nil {
		t.Fatal("expected closing tag > error")
	}
	if _, err := Parse("<a></>", nil); err == nil {
		t.Fatal("expected empty close name handling")
	}

	if _, err := Parse("<a>{", nil); err == nil {
		t.Fatal("expected error in tag body arg")
	}
	if _, err := Parse("<a>}</a>", nil); err == nil {
		t.Fatal("expected unexpected } in tag body")
	}
	if _, err := Parse("<a>#</a>", nil); err != nil {
		t.Fatalf("hash in tag: %v", err)
	}
	if _, err := Parse("{p, plural, one {<t>#</t>}}", nil); err != nil {
		t.Fatalf("pound in plural tag: %v", err)
	}
	if _, err := Parse("<a><b></a>", nil); err == nil {
		t.Fatal("expected nested tag error")
	}
	if _, err := Parse("<a>'z</a>", nil); err != nil {
		t.Fatalf("literal apostrophe in tag: %v", err)
	}

	pNo := &astParser{src: "x", pos: 0}
	if _, _, err := pNo.tryParseTag(parseCtx{}); err != nil {
		t.Fatalf("tryParseTag: %v", err)
	}
}

func TestParsePluralOptionClosingError(t *testing.T) {
	if _, err := Parse("{x, plural, one {x}", nil); err == nil {
		t.Fatal("expected error")
	}
}

func TestParseSelectPluralRemainingBranches(t *testing.T) {
	if _, err := Parse("{x, select, }", nil); err == nil {
		t.Fatal("expected select missing options")
	}
	if _, err := Parse("{x, select, {}}", nil); err == nil {
		t.Fatal("expected invalid select selector")
	}
	if _, err := Parse("{x, select, other {", nil); err == nil {
		t.Fatal("expected error in select option body")
	}
	if _, err := Parse("{x, plural, }", nil); err == nil {
		t.Fatal("expected plural missing options")
	}
	if _, err := Parse("{x, plural, {}}", nil); err == nil {
		t.Fatal("expected invalid plural selector")
	}
	if _, err := Parse("{x, plural, one {", nil); err == nil {
		t.Fatal("expected error in plural option body")
	}

	p := &astParser{src: "'", pos: 0}
	if p.startsQuotedLiteral() {
		t.Fatal("expected startsQuotedLiteral false at EOF")
	}
}
