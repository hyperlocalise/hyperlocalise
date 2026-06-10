package icuparser

import (
	"reflect"
	"testing"
)

func TestParseASTBasicElements(t *testing.T) {
	elems, err := Parse("Hi {name}", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 2 {
		t.Fatalf("expected 2 elements, got %d", len(elems))
	}
	if elems[0].Type() != TypeLiteral {
		t.Fatalf("expected literal, got %s", elems[0].Type())
	}
	if elems[1].Type() != TypeArgument {
		t.Fatalf("expected argument, got %s", elems[1].Type())
	}
}

func TestParseASTPluralHasPound(t *testing.T) {
	elems, err := Parse("{count, plural, one {# item} other {# items}}", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 1 {
		t.Fatalf("expected 1 element, got %d", len(elems))
	}
	pl, ok := elems[0].(PluralElement)
	if !ok {
		t.Fatalf("expected plural element, got %T", elems[0])
	}
	if pl.Type() != TypePlural {
		t.Fatalf("unexpected plural type: %s", pl.Type())
	}
	if len(pl.Options) != 2 {
		t.Fatalf("expected 2 plural options, got %d", len(pl.Options))
	}
	foundPound := false
	for _, el := range pl.Options[0].Value {
		if el.Type() == TypePound {
			foundPound = true
			break
		}
	}
	if !foundPound {
		t.Fatalf("expected pound element in plural option")
	}
}

func TestParseASTPluralNegativeSelector(t *testing.T) {
	tests := []struct {
		name    string
		msg     string
		want    string
		wantErr bool
	}{
		{
			name: "single digit negative",
			msg:  "{n, plural, =-1 {minus one} other {other}}",
			want: "=-1",
		},
		{
			name: "multi digit negative",
			msg:  "{n, plural, =-10 {minus ten} other {other}}",
			want: "=-10",
		},
		{
			name:    "degenerate minus only",
			msg:     "{n, plural, =- {error} other {other}}",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			elems, err := Parse(tt.msg, nil)
			if (err != nil) != tt.wantErr {
				t.Fatalf("Parse(%q) error = %v, wantErr %v", tt.msg, err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			pl := elems[0].(PluralElement)
			if pl.Options[0].Selector != tt.want {
				t.Errorf("expected selector %q, got %q", tt.want, pl.Options[0].Selector)
			}
		})
	}
}

func TestParseASTPluralWithNonASCIIWhitespace(t *testing.T) {
	msg := "{\u00a0count\u00a0,\u00a0plural\u00a0,\u00a0Offset:2\u00a0=0\u00a0{nobody}\u00a0other\u00a0{# items}}"
	elems, err := Parse(msg, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 1 {
		t.Fatalf("expected 1 element, got %d", len(elems))
	}

	pl, ok := elems[0].(PluralElement)
	if !ok {
		t.Fatalf("expected plural element, got %T", elems[0])
	}
	if pl.Value != "count" {
		t.Fatalf("expected argument %q, got %q", "count", pl.Value)
	}
	if pl.Offset != 2 {
		t.Fatalf("expected offset 2, got %d", pl.Offset)
	}
	if len(pl.Options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(pl.Options))
	}
	if got := pl.Options[0].Selector; got != "=0" {
		t.Fatalf("expected exact selector %q, got %q", "=0", got)
	}
	if got := pl.Options[1].Selector; got != "other" {
		t.Fatalf("expected fallback selector %q, got %q", "other", got)
	}
	if len(pl.Options[0].Value) != 1 {
		t.Fatalf("expected 1 element in first option body, got %#v", pl.Options[0].Value)
	}
	lit, ok := pl.Options[0].Value[0].(LiteralElement)
	if !ok || lit.Value != "nobody" {
		t.Fatalf("expected nobody literal in first option, got %#v", pl.Options[0].Value[0])
	}
	if len(pl.Options[1].Value) == 0 {
		t.Fatalf("expected non-empty second option body, got %#v", pl.Options[1].Value)
	}
	if _, ok := pl.Options[1].Value[0].(PoundElement); !ok {
		t.Fatalf("expected pound in second option body, got %#v", pl.Options[1].Value)
	}
}

func TestParseASTQuotedPoundInsidePluralTagIsLiteral(t *testing.T) {
	elems, err := Parse("{count, plural, one {<b>'#'</b>} other {#}}", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 1 {
		t.Fatalf("expected 1 element, got %d", len(elems))
	}

	pl, ok := elems[0].(PluralElement)
	if !ok {
		t.Fatalf("expected plural element, got %T", elems[0])
	}
	if len(pl.Options) != 2 {
		t.Fatalf("expected 2 plural options, got %d", len(pl.Options))
	}

	if len(pl.Options[0].Value) == 0 {
		t.Fatalf("expected non-empty first plural option value, got %#v", pl.Options[0].Value)
	}
	tag, ok := pl.Options[0].Value[0].(TagElement)
	if !ok {
		t.Fatalf("expected tag in first plural option, got %#v", pl.Options[0].Value)
	}
	if len(tag.Children) != 1 {
		t.Fatalf("expected one tag child, got %#v", tag.Children)
	}
	lit, ok := tag.Children[0].(LiteralElement)
	if !ok || lit.Value != "#" {
		t.Fatalf("expected quoted pound to remain literal, got %#v", tag.Children[0])
	}
	if len(pl.Options[1].Value) == 0 {
		t.Fatalf("expected non-empty second plural option value, got %#v", pl.Options[1].Value)
	}
	if _, ok := pl.Options[1].Value[0].(PoundElement); !ok {
		t.Fatalf("expected unquoted pound to parse as PoundElement, got %#v", pl.Options[1].Value)
	}
}

func TestParseASTTags(t *testing.T) {
	elems, err := Parse("Click <b>{name}</b> now", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 3 {
		t.Fatalf("expected 3 top-level elements, got %d", len(elems))
	}
	tag, ok := elems[1].(TagElement)
	if !ok {
		t.Fatalf("expected tag element, got %T", elems[1])
	}
	if tag.Value != "b" || tag.SelfClosing {
		t.Fatalf("unexpected tag: %+v", tag)
	}
	if len(tag.Children) != 1 || tag.Children[0].Type() != TypeArgument {
		t.Fatalf("unexpected tag children: %+v", tag.Children)
	}
}

func TestParseASTTagsWithAttributesAndColons(t *testing.T) {
	msg := `Click <ui:button id="btn" class='primary' disabled><b>{name}</b></ui:button> now`
	elems, err := Parse(msg, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 3 {
		t.Fatalf("expected 3 top-level elements, got %d", len(elems))
	}
	tag, ok := elems[1].(TagElement)
	if !ok {
		t.Fatalf("expected tag element, got %T", elems[1])
	}
	if tag.Value != "ui:button" {
		t.Fatalf("unexpected tag value: %q", tag.Value)
	}
	if len(tag.Children) != 1 {
		t.Fatalf("expected 1 child for ui:button, got %d", len(tag.Children))
	}
	innerTag, ok := tag.Children[0].(TagElement)
	if !ok || innerTag.Value != "b" {
		t.Fatalf("expected inner <b> tag, got %+v", tag.Children[0])
	}
}

func TestParseASTTagsWithQuotesInAttributes(t *testing.T) {
	msg := `<div attr=">">content</div>`
	elems, err := Parse(msg, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 1 {
		t.Fatalf("expected 1 element, got %d", len(elems))
	}
	tag, ok := elems[0].(TagElement)
	if !ok || tag.Value != "div" {
		t.Fatalf("expected div tag, got %+v", elems[0])
	}
}

func TestParseASTIgnoreTagOption(t *testing.T) {
	elems, err := Parse("<b>x</b>", &ParseOptions{IgnoreTag: true})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(elems) != 1 || elems[0].Type() != TypeLiteral {
		t.Fatalf("expected single literal, got %+v", elems)
	}
}

func TestParseASTBareAndEscapedApostrophesKeepArgumentParsing(t *testing.T) {
	tests := []struct {
		name string
		msg  string
	}{
		{name: "bare apostrophe", msg: "It's {name}"},
		{name: "escaped apostrophe", msg: "It''s {name}"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			elems, err := Parse(tt.msg, nil)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(elems) != 2 {
				t.Fatalf("expected 2 elements, got %d", len(elems))
			}
			if elems[0].Type() != TypeLiteral {
				t.Fatalf("expected first element to be literal, got %s", elems[0].Type())
			}
			if elems[1].Type() != TypeArgument {
				t.Fatalf("expected second element to be argument, got %s", elems[1].Type())
			}
		})
	}
}

func TestParseTypedFormatterStyle(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		want Element
	}{
		{
			name: "date skeleton",
			msg:  "{ts, date, ::yyyyMMdd}",
			want: DateElement{
				Value: "ts",
				Style: "::yyyyMMdd",
				Skeleton: &DateTimeSkeleton{
					Pattern: "yyyyMMdd",
				},
			},
		},
		{
			name: "time skeleton",
			msg:  "{t, time, ::Hmm}",
			want: TimeElement{
				Value: "t",
				Style: "::Hmm",
				Skeleton: &DateTimeSkeleton{
					Pattern: "Hmm",
				},
			},
		},
		{
			name: "number skeleton",
			msg:  "{n, number, ::currency/CAD}",
			want: NumberElement{
				Value: "n",
				Style: "::currency/CAD",
				Skeleton: &NumberSkeleton{
					Tokens: []NumberSkeletonToken{{Stem: "currency", Options: []string{"CAD"}}},
				},
			},
		},
		{
			name: "named date style",
			msg:  "{d, date, short}",
			want: DateElement{Value: "d", Style: "short"},
		},
		{
			name: "empty style",
			msg:  "{x, number}",
			want: NumberElement{Value: "x", Style: ""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			elems, err := Parse(tt.msg, nil)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(elems) != 1 {
				t.Fatalf("expected 1 element, got %d", len(elems))
			}
			if !reflect.DeepEqual(elems[0], tt.want) {
				t.Fatalf("got %#v want %#v", elems[0], tt.want)
			}
		})
	}
}

func TestParseTypedFormatterShouldParseSkeletons(t *testing.T) {
	opts := &ParseOptions{ShouldParseSkeletons: true}
	elems, err := Parse("{n, number, ::currency/CAD}", opts)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	ne, ok := elems[0].(NumberElement)
	if !ok || ne.Skeleton == nil {
		t.Fatalf("expected number skeleton: %#v", elems[0])
	}
	if ne.Skeleton.ParsedOptions.Style != "currency" || ne.Skeleton.ParsedOptions.Currency != "CAD" {
		t.Fatalf("parsed options: %#v", ne.Skeleton.ParsedOptions)
	}

	elems, err = Parse("{ts, date, ::yyyyMMdd}", opts)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	de, ok := elems[0].(DateElement)
	if !ok || de.Skeleton == nil {
		t.Fatalf("expected date skeleton: %#v", elems[0])
	}
	if de.Skeleton.ParsedOptions.Year != "numeric" || de.Skeleton.ParsedOptions.Month != "2-digit" || de.Skeleton.ParsedOptions.Day != "2-digit" {
		t.Fatalf("parsed date options: %#v", de.Skeleton.ParsedOptions)
	}
}

func TestParsePluralWithSpaceInOffset(t *testing.T) {
	tests := []struct {
		name string
		msg  string
	}{
		{
			name: "no space",
			msg:  "{count, plural, offset:1 one {# item} other {# items}}",
		},
		{
			name: "space after colon",
			msg:  "{count, plural, offset: 1 one {# item} other {# items}}",
		},
		{
			name: "space before colon",
			msg:  "{count, plural, offset : 1 one {# item} other {# items}}",
		},
		{
			name: "multiple spaces",
			msg:  "{count, plural, offset  :  2 one {# item} other {# items}}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			elems, err := Parse(tt.msg, nil)
			if err != nil {
				t.Fatalf("Parse() failed: %v", err)
			}
			pl := elems[0].(PluralElement)
			expectedOffset := 1
			if tt.name == "multiple spaces" {
				expectedOffset = 2
			}
			if pl.Offset != expectedOffset {
				t.Errorf("expected offset %d, got %d", expectedOffset, pl.Offset)
			}
		})
	}
}
