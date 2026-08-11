package scoring

import (
	"math"
	"strings"
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
		{
			name:      "leading trailing and multi ASCII whitespace ignored",
			reference: "  hello   world\t ",
			candidate: "hello\nworld",
			want:      1,
		},
		{
			name:      "only whitespace both sides matches empty",
			reference: " \t\n\v\f\r ",
			candidate: "\u00a0\u3000",
			want:      1,
		},
		{
			name:      "NBSP splits tokens like strings.Fields",
			reference: "hello\u00a0world",
			candidate: "hello world",
			want:      1,
		},
		{
			name:      "ideographic space splits tokens like strings.Fields",
			reference: "hello\u3000world",
			candidate: "hello world",
			want:      1,
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

func tokenF1ViaStringsFields(reference, candidate string) float64 {
	if reference == "" && candidate == "" {
		return 1
	}
	r := strings.Fields(reference)
	c := strings.Fields(candidate)
	if len(r) == 0 && len(c) == 0 {
		return 1
	}
	if len(r) == 0 || len(c) == 0 {
		return 0
	}
	rCount := make(map[string]int, len(r))
	for _, tok := range r {
		rCount[tok]++
	}
	matches := 0
	for _, tok := range c {
		if count, ok := rCount[tok]; ok && count > 0 {
			matches++
			rCount[tok]--
		}
	}
	precision := float64(matches) / float64(len(c))
	recall := float64(matches) / float64(len(r))
	if precision+recall == 0 {
		return 0
	}
	return 2 * precision * recall / (precision + recall)
}

func TestTokenF1Normalized_MatchesStringsFieldsOracle(t *testing.T) {
	t.Parallel()

	// #1719 replaced strings.Fields with a custom scanner; keep oracle parity for
	// ASCII + Unicode whitespace and multiset matching.
	cases := [][2]string{
		{"", ""},
		{"", "hello"},
		{"hello", ""},
		{"hello world", "hello world"},
		{"  hello   world\t ", "hello\nworld"},
		{"aa bb", "aa aa"},
		{"aa aa", "aa bb"},
		{"hello\u00a0world", "hello world"},
		{"hello\u3000world", "hello there"},
		{"\u00a0\u00a0", "\t\t"},
		{"café latte", "cafe latte"},
		{"one\u0085two", "one two"},
	}

	for _, tt := range cases {
		reference, candidate := tt[0], tt[1]
		t.Run(reference+"|"+candidate, func(t *testing.T) {
			t.Parallel()
			got := tokenF1Normalized(reference, candidate)
			want := tokenF1ViaStringsFields(reference, candidate)
			if math.Abs(got-want) > 1e-9 {
				t.Fatalf("tokenF1Normalized(%q, %q) = %v, strings.Fields oracle = %v", reference, candidate, got, want)
			}
		})
	}
}

func TestTokenF1_NormalizesUnicodeWhitespaceBeforeScoring(t *testing.T) {
	t.Parallel()

	// Production path runs normalizeText first, collapsing Unicode spaces to ASCII.
	got := tokenF1("Hello\u00a0World", "hello world")
	if math.Abs(got-1) > 1e-9 {
		t.Fatalf("tokenF1 with NBSP = %v, want 1", got)
	}
}
