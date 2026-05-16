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
	// The # inside the c2 plural MUST NOT be counted towards c1's pound count,
	// as it refers to c2.
	msg := "{c1, plural, one {# {c2, plural, one {#} other {##}}}}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	// c1 has one option ("one") with 1 pound sign.
	// c2 has two options ("one", "other") with 1 and 2 pound signs respectively.
	expected := []struct {
		arg    string
		pounds []int
	}{
		{arg: "c1", pounds: []int{1}},
		{arg: "c2", pounds: []int{1, 2}},
	}

	if len(inv.ICUBlocks) != len(expected) {
		t.Fatalf("expected %d ICU blocks, got %d", len(expected), len(inv.ICUBlocks))
	}

	for i, exp := range expected {
		block := inv.ICUBlocks[i]
		if block.Arg != exp.arg {
			t.Errorf("block %d: expected Arg %q, got %q", i, exp.arg, block.Arg)
		}
		if !slicesEqual(block.Pounds, exp.pounds) {
			t.Errorf("block %d (%s): expected Pounds %v, got %v", i, exp.arg, exp.pounds, block.Pounds)
		}
	}
}
