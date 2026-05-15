package icuparser

import "testing"

func TestSamePlaceholderSetIgnoresOrderAndDuplicates(t *testing.T) {
	if !SamePlaceholderSet([]string{"b", "a", "b"}, []string{"a", "b"}) {
		t.Fatalf("expected placeholder sets to match")
	}
}

func TestSameICUBlocks(t *testing.T) {
	tests := []struct {
		name string
		a    []BlockSignature
		b    []BlockSignature
		want bool
	}{
		{
			name: "identical blocks",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			want: true,
		},
		{
			name: "pound mismatch is accepted",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{2}}},
			want: true,
		},
		{
			name: "type mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{{Arg: "n", Type: "select", Options: []string{"one"}}},
			want: false,
		},
		{
			name: "arg mismatch",
			a:    []BlockSignature{{Arg: "n1", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{{Arg: "n2", Type: "plural", Options: []string{"one"}}},
			want: false,
		},
		{
			name: "options mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"other"}}},
			want: false,
		},
		{
			name: "length mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SameICUBlocks(tt.a, tt.b); got != tt.want {
				t.Errorf("SameICUBlocks() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCountPoundsNestedPlurals(t *testing.T) {
	// Inside the "one" branch of c1, there is one # (for c1) and a nested c2 plural.
	// The # inside the c2 plural MUST NOT be counted towards c1's pound count.
	msg := "{c1, plural, one {# {c2, plural, one {#} other {##}}}}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	foundC1 := false
	for _, block := range inv.ICUBlocks {
		if block.Arg == "c1" {
			foundC1 = true
			// Expected Pounds for c1: [1] (only the one # that refers to c1)
			if len(block.Pounds) != 1 || block.Pounds[0] != 1 {
				t.Errorf("expected c1 Pounds [1], got %v", block.Pounds)
			}
		}
	}
	if !foundC1 {
		t.Fatal("block c1 not found")
	}
}
