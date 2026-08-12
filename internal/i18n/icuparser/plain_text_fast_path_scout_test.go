package icuparser

import (
	"reflect"
	"testing"
)

// Bolt #1775: top-level parseMessage short-circuits when the remaining input has no
// ICU/XML/quote specials. These cases lock the fast-path contract and ensure nested
// untilBrace parsing still stops at '}' (must not reuse the top-level fast path).
func TestPlainTextFastPathParse(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		msg  string
		want []Element
	}{
		{name: "empty", msg: "", want: []Element{}},
		{name: "ascii plain", msg: "Hello world", want: []Element{LiteralElement{Value: "Hello world"}}},
		{
			name: "unicode and punctuation without specials",
			msg:  "Café — 100% done.",
			want: []Element{LiteralElement{Value: "Café — 100% done."}},
		},
		{
			name: "hash outside plural stays literal text",
			msg:  "issue #42",
			want: []Element{LiteralElement{Value: "issue #42"}},
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := Parse(tt.msg, nil)
			if err != nil {
				t.Fatalf("Parse(%q): %v", tt.msg, err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("Parse(%q) = %#v, want %#v", tt.msg, got, tt.want)
			}
		})
	}
}

func TestPlainTextFastPathDoesNotSkipSpecials(t *testing.T) {
	t.Parallel()

	got, err := Parse("Hi {name}", nil)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	want := []Element{
		LiteralElement{Value: "Hi "},
		ArgumentElement{Value: "name"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}

	if _, err := Parse("oops}", nil); err == nil {
		t.Fatal("unexpected closing brace must still error")
	}
}

func TestPlainTextInsidePluralOptionStopsAtBrace(t *testing.T) {
	t.Parallel()

	// Nested parseMessage(..., untilBrace=true) must not consume past '}'.
	// A mistaken reuse of the top-level IndexAny==-1 fast path would break this.
	got, err := Parse("{count, plural, one {hello world} other {goodbye}}", nil)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected one plural element, got %#v", got)
	}
	plural, ok := got[0].(PluralElement)
	if !ok {
		t.Fatalf("expected PluralElement, got %T", got[0])
	}

	findOption := func(selector string) []Element {
		for _, opt := range plural.Options {
			if opt.Selector == selector {
				return opt.Value
			}
		}
		return nil
	}

	one := findOption("one")
	other := findOption("other")
	if !reflect.DeepEqual(one, []Element{LiteralElement{Value: "hello world"}}) {
		t.Fatalf("one option = %#v", one)
	}
	if !reflect.DeepEqual(other, []Element{LiteralElement{Value: "goodbye"}}) {
		t.Fatalf("other option = %#v", other)
	}
}
