package scoring

import (
	"reflect"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func collectBracePlaceholders(s string) []string {
	names := make([]string, 0)
	scanBracePlaceholders(s, func(name string) {
		names = append(names, name)
	})
	return names
}

func TestScanBracePlaceholders_MatchesFormerRegexContract(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   string
		want []string
	}{
		{name: "empty", in: "", want: []string{}},
		{name: "no braces", in: "Hello world", want: []string{}},
		{name: "simple", in: "Hello {name}", want: []string{"name"}},
		{name: "underscore and dollar start", in: "{_private} and {$amount}", want: []string{"_private", "$amount"}},
		{
			name: "identifier body allows dot dash dollar digits",
			in:   "Hi {user.name-with$1}",
			want: []string{"user.name-with$1"},
		},
		{
			name: "optional whitespace inside braces",
			in:   "Hi { name } and {\tcount\n}",
			want: []string{"name", "count"},
		},
		{
			name: "rejects digit-leading identifiers",
			in:   "bad {1name} good {name1}",
			want: []string{"name1"},
		},
		{name: "empty braces ignored", in: "x {} y", want: []string{}},
		{name: "whitespace-only braces ignored", in: "x {   } y", want: []string{}},
		{name: "unclosed brace ignored", in: "Hello {name", want: []string{}},
		{
			name: "closed then unclosed still recovers closed",
			in:   "Hello {name} {",
			want: []string{"name"},
		},
		{
			name: "double open brace finds inner placeholder",
			in:   "{{name}}",
			want: []string{"name"},
		},
		{
			name: "icu plural args are not brace placeholders",
			in:   "{count, plural, one {# file} other {# files}}",
			want: []string{},
		},
		{
			name: "icu plural with trailing simple placeholder",
			in:   "{count, plural, one {# file} other {# files}} by {name}",
			want: []string{"name"},
		},
		{
			name: "repeated placeholders counted separately",
			in:   "{name} and {name}",
			want: []string{"name", "name"},
		},
		{
			name: "invalid char after identifier prevents match and resumes",
			in:   "{name!still} then {ok}",
			want: []string{"ok"},
		},
		{
			name: "dollar template literal style",
			in:   "cost is ${amount}",
			want: []string{"amount"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := collectBracePlaceholders(tt.in)
			if len(got) == 0 && len(tt.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("scanBracePlaceholders(%q) = %#v, want %#v", tt.in, got, tt.want)
			}
		})
	}
}

func TestPlaceholderTokenCounts_BraceScannerWhitespaceAndDrops(t *testing.T) {
	t.Parallel()

	withSpaces := "Hello { name }"
	inv, err := icuparser.ParseInvariant(withSpaces)
	// ICU may or may not accept interior spaces; brace scanner must still count.
	counts, total := placeholderTokenCounts(withSpaces, inv, err)
	if total == 0 || counts["brace:name"] != 1 {
		t.Fatalf("expected brace:name for spaced placeholder, got total=%d counts=%v err=%v", total, counts, err)
	}

	dropped := "Hello {name}, total is %s"
	translatedDropInv, translatedDropErr := icuparser.ParseInvariant("Bonjour, total est %s")
	sourceInv, sourceErr := icuparser.ParseInvariant(dropped)
	sourceCounts, sourceTotal := placeholderTokenCounts(dropped, sourceInv, sourceErr)
	translatedCounts, translatedTotal := placeholderTokenCounts(
		"Bonjour, total est %s",
		translatedDropInv,
		translatedDropErr,
	)
	if sourceTotal == 0 || sourceCounts["brace:name"] != 1 {
		t.Fatalf("expected source brace:name, got total=%d counts=%v", sourceTotal, sourceCounts)
	}
	if translatedTotal == 0 || translatedCounts["brace:name"] != 0 {
		t.Fatalf("expected translated without brace:name, got total=%d counts=%v", translatedTotal, translatedCounts)
	}
}
