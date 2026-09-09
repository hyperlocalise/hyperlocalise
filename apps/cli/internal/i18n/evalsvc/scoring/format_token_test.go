package scoring

import (
	"math"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func expectedICUBlockToken(block icuparser.BlockSignature) string {
	var b strings.Builder
	b.WriteString("icu-block:")
	b.WriteString(block.Arg)
	if block.Offset != 0 {
		b.WriteString("(offset:")
		b.WriteString(strconv.Itoa(block.Offset))
		b.WriteString(")")
	}
	b.WriteString(":")
	b.WriteString(block.Type)
	b.WriteString(":")
	for i, opt := range block.Options {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(opt)
	}
	return b.String()
}

func TestFormatICUBlockTokenBoundaries(t *testing.T) {
	t.Parallel()

	longArg := strings.Repeat("a", 88)
	// 10 + 88 + 8 + 19 + 1 + 1 + 6 + 1 + 1 + 1 + 1 = 137, the review panic case:
	// a 10-digit offset reservation would undersize this as exactly 128.
	overflowCase := icuparser.BlockSignature{
		Arg:     longArg,
		Type:    "plural",
		Offset:  math.MaxInt,
		Options: []string{"x", "y"},
	}
	if got := len(expectedICUBlockToken(overflowCase)); got <= tokenStackBufSize {
		t.Fatalf("review overflow fixture should exceed the stack buffer, got len %d", got)
	}

	exactly128 := icuparser.BlockSignature{
		Arg:     strings.Repeat("b", 101),
		Type:    "plural",
		Options: []string{"one", "other"},
	}
	if got := len(expectedICUBlockToken(exactly128)); got != tokenStackBufSize {
		t.Fatalf("fixture exactly128 has token length %d, want %d", got, tokenStackBufSize)
	}

	over128 := icuparser.BlockSignature{
		Arg:     strings.Repeat("c", 102),
		Type:    "plural",
		Options: []string{"one", "other"},
	}
	if got := len(expectedICUBlockToken(over128)); got != tokenStackBufSize+1 {
		t.Fatalf("fixture over128 has token length %d, want %d", got, tokenStackBufSize+1)
	}

	tests := []struct {
		name  string
		block icuparser.BlockSignature
	}{
		{
			name:  "short offset uses stack buffer",
			block: icuparser.BlockSignature{Arg: "count", Type: "plural", Offset: 1, Options: []string{"one", "other"}},
		},
		{
			name:  "no offset",
			block: icuparser.BlockSignature{Arg: "count", Type: "plural", Options: []string{"one", "other"}},
		},
		{
			name:  "negative offset",
			block: icuparser.BlockSignature{Arg: "count", Type: "plural", Offset: -1, Options: []string{"one", "other"}},
		},
		{
			name:  "19-digit 64-bit offset",
			block: icuparser.BlockSignature{Arg: "count", Type: "plural", Offset: math.MaxInt, Options: []string{"one", "other"}},
		},
		{
			name:  "min int offset including sign",
			block: icuparser.BlockSignature{Arg: "count", Type: "plural", Offset: math.MinInt, Options: []string{"one", "other"}},
		},
		{
			name:  "review overflow: 88-byte arg, 19-digit offset, two one-byte options",
			block: overflowCase,
		},
		{
			name:  "exactly 128 bytes",
			block: exactly128,
		},
		{
			name:  "129 bytes uses builder fallback",
			block: over128,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			want := expectedICUBlockToken(tt.block)
			got := formatICUBlockToken(tt.block)
			if got != want {
				t.Fatalf("formatICUBlockToken() = %q (len %d), want %q (len %d)", got, len(got), want, len(want))
			}
		})
	}
}

func TestFormatHTMLTokenBoundaries(t *testing.T) {
	t.Parallel()

	// "html:" is 5 bytes, so a 123-byte raw tag fills the 128-byte stack buffer.
	upperExact := `<STRONG class="` + strings.Repeat("X", 106) + `">`
	if len(upperExact) != tokenStackBufSize-len("html:") {
		t.Fatalf("upperExact raw length %d, want %d", len(upperExact), tokenStackBufSize-len("html:"))
	}
	upperOver := `<STRONG class="` + strings.Repeat("Y", 107) + `">`
	if len(upperOver) != tokenStackBufSize-len("html:")+1 {
		t.Fatalf("upperOver raw length %d, want %d", len(upperOver), tokenStackBufSize-len("html:")+1)
	}

	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "already lowercase ascii",
			raw:  "<strong>",
			want: "html:<strong>",
		},
		{
			name: "uppercase ascii uses stack lowercasing",
			raw:  "<STRONG>",
			want: "html:<strong>",
		},
		{
			name: "uppercase ascii at 128-byte boundary",
			raw:  upperExact,
			want: "html:" + strings.ToLower(upperExact),
		},
		{
			name: "uppercase ascii over 128-byte builder fallback",
			raw:  upperOver,
			want: "html:" + strings.ToLower(upperOver),
		},
		{
			name: "non-ascii attribute uses unicode ToLower",
			raw:  `<span title="CAFÉ">`,
			want: `html:<span title="café">`,
		},
		{
			name: "non-ascii mixed case tag name via ToLower path",
			raw:  `<SPAN title="naïve">`,
			want: `html:<span title="naïve">`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := formatHTMLToken(tt.raw)
			if got != tt.want {
				t.Fatalf("formatHTMLToken(%q) = %q (len %d), want %q (len %d)", tt.raw, got, len(got), tt.want, len(tt.want))
			}
		})
	}
}

func TestEvaluatorICULongOffsetIntegrity(t *testing.T) {
	t.Parallel()

	arg := strings.Repeat("a", 88)
	offset := strconv.Itoa(math.MaxInt)
	source := "{" + arg + ", plural, offset:" + offset + " one {# file} other {# files}}"
	translated := "{" + arg + ", plural, offset:" + offset + " one {# fichier} other {# fichiers}}"

	got := NewEvaluator().Evaluate(source, translated, "", "fr-FR", nil)
	if got.PlaceholderIntegrity != 1 {
		t.Fatalf("expected full ICU integrity for 19-digit offset, got %+v", got)
	}
	if slices.Contains(got.HardFails, HardFailPlaceholderDrop) {
		t.Fatalf("expected no placeholder hard fail, got %+v", got.HardFails)
	}

	inv, err := icuparser.ParseInvariant(source)
	if err != nil {
		t.Fatalf("ParseInvariant(%q) error: %v", source, err)
	}
	counts, _ := placeholderTokenCounts(source, inv, err)
	wantKey := formatICUBlockToken(icuparser.BlockSignature{
		Arg:     arg,
		Type:    "plural",
		Offset:  math.MaxInt,
		Options: []string{"one", "other"},
	})
	if counts[wantKey] != 1 {
		t.Fatalf("expected token %q, got %v", wantKey, counts)
	}
}

func TestEvaluatorHTMLCaseAndNonASCIIIntegrity(t *testing.T) {
	t.Parallel()

	upperExact := `<STRONG class="` + strings.Repeat("X", 106) + `">`
	source := "Click " + strings.ToLower(upperExact) + "here</strong>"
	translated := "Cliquez " + upperExact + "ici</STRONG>"

	got := NewEvaluator().Evaluate(source, translated, "", "fr-FR", nil)
	if got.TagIntegrity != 1 {
		t.Fatalf("expected matching uppercase/lowercase HTML around 128-byte boundary, got %+v", got)
	}
	if slices.Contains(got.HardFails, HardFailTagMismatch) {
		t.Fatalf("expected no tag hard fail, got %+v", got.HardFails)
	}

	nonASCIISource := `See <span title="CAFÉ">here</span>`
	nonASCIITranslated := `Voir <SPAN title="café">ici</SPAN>`
	nonASCII := NewEvaluator().Evaluate(nonASCIISource, nonASCIITranslated, "", "fr-FR", nil)
	if nonASCII.TagIntegrity != 1 {
		t.Fatalf("expected matching non-ASCII HTML tokens, got %+v", nonASCII)
	}
}
