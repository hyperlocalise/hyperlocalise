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
			name: "pound mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{2}}},
			want: false,
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
		{
			name: "nil vs empty pounds",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: nil}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{}}},
			want: true,
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
