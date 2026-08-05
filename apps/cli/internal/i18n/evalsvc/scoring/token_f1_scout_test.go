package scoring

import (
	"math"
	"testing"
)

func TestTokenF1Normalized_MultisetMatching(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		reference string
		candidate string
		want      float64
	}{
		{
			name:      "both empty",
			reference: "",
			candidate: "",
			want:      1,
		},
		{
			name:      "empty reference",
			reference: "",
			candidate: "hello",
			want:      0,
		},
		{
			name:      "empty candidate",
			reference: "hello",
			candidate: "",
			want:      0,
		},
		{
			name:      "exact match",
			reference: "hello world",
			candidate: "hello world",
			want:      1,
		},
		{
			name:      "partial overlap",
			reference: "hello world",
			candidate: "hello there",
			want:      0.5,
		},
		{
			// Multiset: reference has one "aa"; candidate has two. Only one match
			// counts — the Bolt rewrite must not over-count duplicate candidate tokens.
			name:      "duplicate candidate tokens capped by reference count",
			reference: "aa bb",
			candidate: "aa aa",
			want:      0.5,
		},
		{
			// Multiset: reference has two "aa"; candidate has one match + one miss.
			// precision=0.5, recall=0.5 → F1=0.5. Extra reference copies stay unmatched.
			name:      "duplicate reference tokens require candidate repeats",
			reference: "aa aa",
			candidate: "aa bb",
			want:      0.5,
		},
		{
			// Three-token overlap check: two shared tokens of three on each side.
			name:      "two of three tokens overlap",
			reference: "aa bb cc",
			candidate: "aa bb dd",
			want:      2.0 / 3.0,
		},
		{
			name:      "no overlap",
			reference: "alpha beta",
			candidate: "gamma delta",
			want:      0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := tokenF1Normalized(tt.reference, tt.candidate)
			if math.Abs(got-tt.want) > 1e-9 {
				t.Fatalf("tokenF1Normalized(%q, %q) = %v, want %v", tt.reference, tt.candidate, got, tt.want)
			}
		})
	}
}
