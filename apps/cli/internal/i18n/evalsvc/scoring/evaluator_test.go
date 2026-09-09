package scoring

import (
	"math"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func TestEvaluatorDetectsPlaceholderDrop(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Hello {name}, total is %s", "Bonjour, total est %s", "", "fr-FR", nil)

	if got.PlaceholderIntegrity >= 1 {
		t.Fatalf("expected placeholder integrity penalty, got %+v", got)
	}
	if !slices.Contains(got.HardFails, HardFailPlaceholderDrop) {
		t.Fatalf("expected placeholder hard fail, got %+v", got.HardFails)
	}
	if got.WeightedAggregate != 0 {
		t.Fatalf("expected hard-failed weighted aggregate=0, got %v", got.WeightedAggregate)
	}
}

func TestEvaluatorPlaceholderDropHardFailIsDeduped(t *testing.T) {
	e := NewEvaluator()
	// ICU block shape differs (plural vs select) and placeholder integrity is also < 1.
	// Both hard-fail paths used to be able to append HardFailPlaceholderDrop; keep one.
	got := e.Evaluate(
		"{count, plural, one {# file} other {# files}}",
		"{count, select, other {# fichiers}}",
		"",
		"fr-FR",
		nil,
	)

	if got.PlaceholderIntegrity >= 1 {
		t.Fatalf("expected placeholder integrity penalty, got %+v", got)
	}
	dropCount := 0
	for _, hardFail := range got.HardFails {
		if hardFail == HardFailPlaceholderDrop {
			dropCount++
		}
	}
	if dropCount != 1 {
		t.Fatalf("expected exactly one %q hard fail, got %+v", HardFailPlaceholderDrop, got.HardFails)
	}
}

func TestEvaluatorHandlesICUPluralIntegrity(t *testing.T) {
	e := NewEvaluator()
	source := "{count, plural, one {# file} other {# files}} uploaded by {name}"
	translated := "{count, plural, one {# fichier} other {# fichiers}} téléchargés par {name}"

	got := e.Evaluate(source, translated, "", "fr-FR", nil)
	if got.PlaceholderIntegrity != 1 {
		t.Fatalf("expected full ICU placeholder integrity, got %+v", got)
	}
	if len(got.HardFails) != 0 {
		t.Fatalf("expected no hard fails, got %+v", got.HardFails)
	}
}

func TestEvaluatorDetectsMalformedICU(t *testing.T) {
	e := NewEvaluator()
	source := "{count, plural, one {One} other {Many}}"
	translated := "{count, plural, one {Uno} other {Muchos}"

	got := e.Evaluate(source, translated, "", "es-ES", nil)
	if !slices.Contains(got.HardFails, HardFailMalformedICU) {
		t.Fatalf("expected malformed ICU hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorReferenceScores(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Pay now", "Payer maintenant", "Payer maintenant!", "fr-FR", nil)

	if got.ReferenceExact == nil || *got.ReferenceExact != 0 {
		t.Fatalf("expected exact mismatch, got %+v", got.ReferenceExact)
	}
	if got.ReferenceNormalized == nil || *got.ReferenceNormalized != 1 {
		t.Fatalf("expected normalized match, got %+v", got.ReferenceNormalized)
	}
	if got.ReferenceSimilarity == nil || *got.ReferenceSimilarity < 0.9 {
		t.Fatalf("expected high similarity score, got %+v", got.ReferenceSimilarity)
	}
}

func TestEvaluatorHardFailSourceCopied(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Save", "Save", "Enregistrer", "fr-FR", nil)
	if !slices.Contains(got.HardFails, HardFailSourceCopied) {
		t.Fatalf("expected source copied hard fail, got %+v", got.HardFails)
	}
	if got.WeightedAggregate != 0 {
		t.Fatalf("expected aggregate hard fail to 0, got %v", got.WeightedAggregate)
	}
}

func TestEvaluatorDetectsTagMismatch(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Click <strong>here</strong>", "Cliquez ici", "", "fr-FR", nil)
	if !slices.Contains(got.HardFails, HardFailTagMismatch) {
		t.Fatalf("expected tag mismatch hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorLengthBoundForUITags(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Save", "Veuillez cliquer pour enregistrer vos changements immédiatement", "", "fr-FR", []string{"ui"})
	if !slices.Contains(got.HardFails, HardFailLengthOutOfBound) {
		t.Fatalf("expected length hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorForbiddenTerms(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Sign in", "Use legacy-login to enter", "", "en-US", []string{"forbidden:legacy-login"})
	if !slices.Contains(got.HardFails, HardFailForbiddenTerms) {
		t.Fatalf("expected forbidden term hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorForbiddenTermsCaseInsensitiveTag(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Sign in", "Use legacy-login to enter", "", "en-US", []string{"Forbidden:legacy-login"})
	if !slices.Contains(got.HardFails, HardFailForbiddenTerms) {
		t.Fatalf("expected forbidden term hard fail for mixed-case tag, got %+v", got.HardFails)
	}
}

func TestEvaluatorSkipsTagGatedWeightsWithoutTags(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Pay now", "Payer maintenant", "Payer maintenant!", "fr-FR", nil)
	if slices.Contains(got.HardFails, HardFailLengthOutOfBound) || slices.Contains(got.HardFails, HardFailForbiddenTerms) {
		t.Fatalf("expected tag-gated hard fails to stay disabled without tags, got %+v", got.HardFails)
	}
	if got.LengthCompliance != 1 || got.TermCompliance != 1 {
		t.Fatalf("expected raw tag-gated scores to stay neutral without tags, got %+v", got)
	}
	if got.ReferenceSimilarity == nil || got.WeightedAggregate != 0.882 {
		t.Fatalf("expected weighted aggregate to exclude tag-gated weights when tags are absent, got %+v", got)
	}
}

func TestEvaluatorDetectsDuplicateTagLoss(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Use **bold** and **more bold**", "Utilisez **gras** et plus gras", "", "fr-FR", nil)
	if !slices.Contains(got.HardFails, HardFailTagMismatch) {
		t.Fatalf("expected duplicate markdown tag loss to hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorDetectsInvalidCyrillicLocaleScript(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Hello", "Privet", "", "ru-RU", nil)
	if !slices.Contains(got.HardFails, HardFailInvalidLocale) {
		t.Fatalf("expected locale script hard fail for non-Cyrillic text, got %+v", got.HardFails)
	}
}

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
	if got := len(expectedICUBlockToken(overflowCase)); got <= TOKEN_STACK_BUF_SIZE {
		t.Fatalf("review overflow fixture should exceed the stack buffer, got len %d", got)
	}

	exactly128 := icuparser.BlockSignature{
		Arg:     strings.Repeat("b", 101),
		Type:    "plural",
		Options: []string{"one", "other"},
	}
	if got := len(expectedICUBlockToken(exactly128)); got != TOKEN_STACK_BUF_SIZE {
		t.Fatalf("fixture exactly128 has token length %d, want %d", got, TOKEN_STACK_BUF_SIZE)
	}

	over128 := icuparser.BlockSignature{
		Arg:     strings.Repeat("c", 102),
		Type:    "plural",
		Options: []string{"one", "other"},
	}
	if got := len(expectedICUBlockToken(over128)); got != TOKEN_STACK_BUF_SIZE+1 {
		t.Fatalf("fixture over128 has token length %d, want %d", got, TOKEN_STACK_BUF_SIZE+1)
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
	if len(upperExact) != TOKEN_STACK_BUF_SIZE-len("html:") {
		t.Fatalf("upperExact raw length %d, want %d", len(upperExact), TOKEN_STACK_BUF_SIZE-len("html:"))
	}
	upperOver := `<STRONG class="` + strings.Repeat("Y", 107) + `">`
	if len(upperOver) != TOKEN_STACK_BUF_SIZE-len("html:")+1 {
		t.Fatalf("upperOver raw length %d, want %d", len(upperOver), TOKEN_STACK_BUF_SIZE-len("html:")+1)
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
