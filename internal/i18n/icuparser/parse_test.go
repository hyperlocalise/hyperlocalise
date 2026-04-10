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
