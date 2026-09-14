package icuparser

import (
	"testing"
)

// Bolt #2403: ParseInvariant short-circuits when the message has no ICU AST signal
// characters ({ # < } ' }). These cases lock that contract so plain copy stays empty
// and braced messages still extract placeholders.
func TestParseInvariantPlainTextFastPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		msg  string
	}{
		{name: "empty", msg: ""},
		{name: "ascii plain", msg: "Hello world"},
		{name: "unicode and punctuation without specials", msg: "Café — 100% done."},
		{name: "currency without braces", msg: "Price: $12.50 (USD)"},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			inv, err := ParseInvariant(tt.msg)
			if err != nil {
				t.Fatalf("ParseInvariant(%q): %v", tt.msg, err)
			}
			if inv.Placeholders != nil || inv.ICUBlocks != nil {
				t.Fatalf("ParseInvariant(%q) = %#v, want empty Invariant", tt.msg, inv)
			}
		})
	}
}

func TestParseInvariantSignalCharactersStillParse(t *testing.T) {
	t.Parallel()

	inv, err := ParseInvariant("Hello {name}")
	if err != nil {
		t.Fatalf("ParseInvariant: %v", err)
	}
	if len(inv.Placeholders) != 1 || inv.Placeholders[0] != "name" {
		t.Fatalf("placeholders = %#v, want [name]", inv.Placeholders)
	}

	mustache, err := ParseInvariant("Hello {{name}}")
	if err != nil {
		t.Fatalf("ParseInvariant mustache: %v", err)
	}
	if len(mustache.Placeholders) != 1 || mustache.Placeholders[0] != "name" {
		t.Fatalf("mustache placeholders = %#v, want [name]", mustache.Placeholders)
	}

	// '#' is a fast-path signal character; outside a plural it stays literal text.
	hashOnly, err := ParseInvariant("issue #42")
	if err != nil {
		t.Fatalf("ParseInvariant hash: %v", err)
	}
	if hashOnly.Placeholders != nil || hashOnly.ICUBlocks != nil {
		t.Fatalf("hash-only = %#v, want empty Invariant", hashOnly)
	}
}
