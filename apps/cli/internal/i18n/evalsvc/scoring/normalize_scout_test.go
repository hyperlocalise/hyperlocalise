package scoring

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func TestNormalizeTextScout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "trims and collapses whitespace", in: "  Hello   World\t ", want: "hello world"},
		{name: "lowercases letters", in: "Pay NOW", want: "pay now"},
		{name: "strips ordinary punctuation", in: "Payer maintenant!", want: "payer maintenant"},
		{
			name: "preserves placeholder punctuation",
			in:   "Hello {name}, total is %s!",
			want: "hello {name} total is %s",
		},
		{
			name: "preserves underscore dollar and braces",
			in:   "Use user_name / ${amount}",
			want: "use user_name ${amount}",
		},
		{
			name: "strips decimal points inside amounts",
			in:   "Pay $5.00 now",
			want: "pay $500 now",
		},
		{
			name: "leading and trailing punctuation only",
			in:   "!!!",
			want: "",
		},
		{
			name: "unicode letters lowercased",
			in:   "Café",
			want: "café",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := normalizeText(tt.in)
			if got != tt.want {
				t.Fatalf("normalizeText(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestTagTokenCountsSignalFastPath(t *testing.T) {
	t.Parallel()

	counts, total := tagTokenCounts("Plain translation without markup")
	if counts != nil || total != 0 {
		t.Fatalf("expected empty fast-path result, got counts=%v total=%d", counts, total)
	}

	htmlCounts, htmlTotal := tagTokenCounts("Click <strong>here</strong>")
	if htmlTotal != 2 {
		t.Fatalf("expected 2 html tags, got total=%d counts=%v", htmlTotal, htmlCounts)
	}
	if htmlCounts["html:<strong>"] != 1 || htmlCounts["html:</strong>"] != 1 {
		t.Fatalf("unexpected html tag counts: %v", htmlCounts)
	}

	mdCounts, mdTotal := tagTokenCounts("Use **bold** text")
	if mdTotal == 0 {
		t.Fatalf("expected markdown tokens, got counts=%v total=%d", mdCounts, mdTotal)
	}
	if mdCounts["md:**"] != 2 {
		t.Fatalf("expected two markdown ** tokens, got %v", mdCounts)
	}
}

func TestPlaceholderTokenCountsSignalFastPath(t *testing.T) {
	t.Parallel()

	plain := "No placeholders here"
	inv, err := icuparser.ParseInvariant(plain)
	counts, total := placeholderTokenCounts(plain, inv, err)
	if total != 0 {
		t.Fatalf("expected no placeholder tokens for plain text, got total=%d counts=%v", total, counts)
	}

	withPrintf := "Hello %s"
	printfInv, printfErr := icuparser.ParseInvariant(withPrintf)
	printfCounts, printfTotal := placeholderTokenCounts(withPrintf, printfInv, printfErr)
	if printfTotal == 0 || printfCounts["printf:%s"] != 1 {
		t.Fatalf("expected printf token, got total=%d counts=%v", printfTotal, printfCounts)
	}

	withBrace := "Hello {name}"
	braceInv, braceErr := icuparser.ParseInvariant(withBrace)
	if braceErr != nil {
		t.Fatalf("expected ICU parse success for %q, got %v", withBrace, braceErr)
	}
	braceCounts, braceTotal := placeholderTokenCounts(withBrace, braceInv, braceErr)
	if braceTotal == 0 {
		t.Fatalf("expected brace/icu tokens, got total=%d counts=%v", braceTotal, braceCounts)
	}
	if braceCounts["icu:name"] != 1 {
		t.Fatalf("expected icu:name token from ParseInvariant, got %v", braceCounts)
	}
	if braceCounts["brace:name"] != 1 {
		t.Fatalf("expected brace:name token from brace-regex path, got %v", braceCounts)
	}

	// ICU parse fails on the trailing unclosed brace, so icu:* tokens are
	// skipped; brace-regex must still recover the closed {name} placeholder.
	withBraceFallback := "Hello {name} {"
	fallbackInv, fallbackErr := icuparser.ParseInvariant(withBraceFallback)
	if fallbackErr == nil {
		t.Fatalf("expected ICU parse failure for %q", withBraceFallback)
	}
	fallbackCounts, fallbackTotal := placeholderTokenCounts(withBraceFallback, fallbackInv, fallbackErr)
	if fallbackTotal == 0 || fallbackCounts["brace:name"] != 1 {
		t.Fatalf("expected brace-regex fallback token, got total=%d counts=%v", fallbackTotal, fallbackCounts)
	}
	if fallbackCounts["icu:name"] != 0 {
		t.Fatalf("expected no icu:name when ParseInvariant fails, got %v", fallbackCounts)
	}
}

func TestEvaluatorNormalizedReferenceIgnoresPunctuationAroundPlaceholders(t *testing.T) {
	t.Parallel()

	e := NewEvaluator()
	got := e.Evaluate(
		"Hello {name}",
		"Bonjour {name}",
		"Bonjour {name}!",
		"fr-FR",
		nil,
	)
	if got.ReferenceNormalized == nil || *got.ReferenceNormalized != 1 {
		t.Fatalf("expected normalized reference match after punctuation strip, got %+v", got)
	}
	if len(got.HardFails) != 0 {
		t.Fatalf("expected no hard fails, got %+v", got.HardFails)
	}
}
