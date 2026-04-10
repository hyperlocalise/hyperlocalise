package icuparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestParseNumberSkeletonTokens(t *testing.T) {
	toks, err := ParseNumberSkeletonTokens("percent")
	if err != nil || len(toks) != 1 || toks[0].Stem != "percent" {
		t.Fatalf("percent: %+v %v", toks, err)
	}

	toks, err = ParseNumberSkeletonTokens("currency/USD")
	if err != nil || len(toks) != 1 || toks[0].Stem != "currency" || toks[0].Options[0] != "USD" {
		t.Fatalf("currency: %+v %v", toks, err)
	}

	toks, err = ParseNumberSkeletonTokens("percent scale/100")
	if err != nil || len(toks) != 2 || toks[1].Stem != "scale" {
		t.Fatalf("multi: %+v %v", toks, err)
	}

	if _, err := ParseNumberSkeletonTokens(""); err == nil {
		t.Fatal("expected empty error")
	}
	if _, err := ParseNumberSkeletonTokens("currency//"); err == nil {
		t.Fatal("expected invalid slash error")
	}
}

func TestParseNumberSkeletonCurrency(t *testing.T) {
	toks, err := ParseNumberSkeletonTokens("currency/CAD")
	if err != nil {
		t.Fatal(err)
	}
	opts, err := ParseNumberSkeleton(toks)
	if err != nil {
		t.Fatal(err)
	}
	if opts.Style != "currency" || opts.Currency != "CAD" {
		t.Fatalf("got %#v", opts)
	}
}

func TestParseNumberSkeletonUnknownStem(t *testing.T) {
	toks, err := ParseNumberSkeletonTokens("currencyy/USD")
	if err != nil {
		t.Fatal(err)
	}
	_, err = ParseNumberSkeleton(toks)
	if err == nil {
		t.Fatal("expected error for unknown stem")
	}
}

func TestParseDateTimeSkeletonYearMonthDay(t *testing.T) {
	opts, err := ParseDateTimeSkeleton("yyyyMMdd")
	if err != nil {
		t.Fatal(err)
	}
	if opts.Year != "numeric" || opts.Month != "2-digit" || opts.Day != "2-digit" {
		t.Fatalf("got %#v", opts)
	}
}

func TestParseErrorsEmptyDateTimeSkeleton(t *testing.T) {
	for _, in := range []string{
		"{d, date, ::}",
		"{t, time, ::  }",
	} {
		if _, err := Parse(in, nil); err == nil {
			t.Fatalf("expected error for %q", in)
		}
	}
}

func TestParseErrorsInvalidNumberSkeleton(t *testing.T) {
	if _, err := Parse("{n, number, ::}", nil); err == nil {
		t.Fatal("expected empty number skeleton error")
	}
}

func TestParseDateTimeSkeletonUnsupported(t *testing.T) {
	_, err := ParseDateTimeSkeleton("YYYY")
	if err == nil || !strings.Contains(err.Error(), "Y") {
		t.Fatalf("expected unsupported year pattern error, got %v", err)
	}
}

func TestStripICUQuotes(t *testing.T) {
	// Literal spans removed; doubled quotes become a single quote in output.
	got := stripICUQuotes("yyyy'-'MM'-'dd")
	if got != "yyyyMMdd" {
		t.Fatalf("strip quotes: %q", got)
	}
	got = stripICUQuotes("a''b")
	if got != "a'b" {
		t.Fatalf("escaped quote: %q", got)
	}
}

func TestParseDateTimeSkeletonFields(t *testing.T) {
	cases := []struct {
		skeleton string
		check    func(DateTimeFormatOptions) bool
	}{
		{"GGGGG", func(o DateTimeFormatOptions) bool { return o.Era == "narrow" }},
		{"GGGG", func(o DateTimeFormatOptions) bool { return o.Era == "long" }},
		{"GGG", func(o DateTimeFormatOptions) bool { return o.Era == "short" }},
		{"yyMMdd", func(o DateTimeFormatOptions) bool {
			return o.Year == "2-digit" && o.Month == "2-digit" && o.Day == "2-digit"
		}},
		{"MMMMM", func(o DateTimeFormatOptions) bool { return o.Month == "narrow" }},
		{"EEEE", func(o DateTimeFormatOptions) bool { return o.Weekday == "long" }},
		{"EEEEE", func(o DateTimeFormatOptions) bool { return o.Weekday == "narrow" }},
		{"eeee", func(o DateTimeFormatOptions) bool { return o.Weekday == "short" }},
		{"eeeee", func(o DateTimeFormatOptions) bool { return o.Weekday == "long" }},
		{"eeeeee", func(o DateTimeFormatOptions) bool { return o.Weekday == "narrow" }},
		{"cccc", func(o DateTimeFormatOptions) bool { return o.Weekday == "short" }},
		{"hhmm", func(o DateTimeFormatOptions) bool {
			return o.HourCycle == "h12" && o.Hour == "2-digit" && o.Minute == "2-digit"
		}},
		{"HH", func(o DateTimeFormatOptions) bool { return o.HourCycle == "h23" && o.Hour == "2-digit" }},
		{"KK", func(o DateTimeFormatOptions) bool { return o.HourCycle == "h11" && o.Hour == "2-digit" }},
		{"kk", func(o DateTimeFormatOptions) bool { return o.HourCycle == "h24" && o.Hour == "2-digit" }},
		{"a", func(o DateTimeFormatOptions) bool { return o.Hour12 != nil && *o.Hour12 }},
		{"z", func(o DateTimeFormatOptions) bool { return o.TimeZoneName == "short" }},
		{"zzzz", func(o DateTimeFormatOptions) bool { return o.TimeZoneName == "long" }},
	}
	for _, tc := range cases {
		opts, err := ParseDateTimeSkeleton(tc.skeleton)
		if err != nil {
			t.Fatalf("%q: %v", tc.skeleton, err)
		}
		if !tc.check(opts) {
			t.Fatalf("%q: got %#v", tc.skeleton, opts)
		}
	}
}

func TestParseDateTimeSkeletonUnsupportedPatterns(t *testing.T) {
	unsupported := []string{"qq", "ww", "DD", "eee", "ccc", "bb", "uu", "FF", "ZZ"}
	for _, s := range unsupported {
		if _, err := ParseDateTimeSkeleton(s); err == nil {
			t.Fatalf("expected error for %q", s)
		}
	}
}

func mustParseSkeleton(t *testing.T, s string) []NumberSkeletonToken {
	t.Helper()
	toks, err := ParseNumberSkeletonTokens(s)
	if err != nil {
		t.Fatal(err)
	}
	return toks
}

func intPtr(n int) *int             { return &n }
func float64Ptr(f float64) *float64 { return &f }

func TestParseNumberSkeletonStems(t *testing.T) {
	type want struct {
		style, notation, currency, unit, compact, sign, curSign string
		currencyDisplay, unitDisplay                            string
		scale                                                   *float64
		minInt, minFrac, maxFrac, minSig, maxSig                *int
		grouping                                                *bool
		rounding, roundPri, trailing                            string
	}

	assert := func(t *testing.T, got NumberFormatOptions, w want) {
		t.Helper()
		if w.style != "" && got.Style != w.style {
			t.Fatalf("Style: got %q want %q", got.Style, w.style)
		}
		if w.notation != "" && got.Notation != w.notation {
			t.Fatalf("Notation: got %q want %q", got.Notation, w.notation)
		}
		if w.currency != "" && got.Currency != w.currency {
			t.Fatalf("Currency: got %q want %q", got.Currency, w.currency)
		}
		if w.currencyDisplay != "" && got.CurrencyDisplay != w.currencyDisplay {
			t.Fatalf("CurrencyDisplay: got %q want %q", got.CurrencyDisplay, w.currencyDisplay)
		}
		if w.unit != "" && got.Unit != w.unit {
			t.Fatalf("Unit: got %q want %q", got.Unit, w.unit)
		}
		if w.unitDisplay != "" && got.UnitDisplay != w.unitDisplay {
			t.Fatalf("UnitDisplay: got %q want %q", got.UnitDisplay, w.unitDisplay)
		}
		if w.compact != "" && got.CompactDisplay != w.compact {
			t.Fatalf("CompactDisplay: got %q want %q", got.CompactDisplay, w.compact)
		}
		if w.sign != "" && got.SignDisplay != w.sign {
			t.Fatalf("SignDisplay: got %q want %q", got.SignDisplay, w.sign)
		}
		if w.curSign != "" && got.CurrencySign != w.curSign {
			t.Fatalf("CurrencySign: got %q want %q", got.CurrencySign, w.curSign)
		}
		if w.scale != nil && got.Scale != *w.scale {
			t.Fatalf("Scale: got %v want %v", got.Scale, *w.scale)
		}
		if w.minInt != nil && got.MinimumIntegerDigits != *w.minInt {
			t.Fatalf("MinimumIntegerDigits: got %d want %d", got.MinimumIntegerDigits, *w.minInt)
		}
		if w.minFrac != nil && got.MinimumFractionDigits != *w.minFrac {
			t.Fatalf("MinimumFractionDigits: got %d want %d", got.MinimumFractionDigits, *w.minFrac)
		}
		if w.maxFrac != nil && got.MaximumFractionDigits != *w.maxFrac {
			t.Fatalf("MaximumFractionDigits: got %d want %d", got.MaximumFractionDigits, *w.maxFrac)
		}
		if w.minSig != nil && got.MinimumSignificantDigits != *w.minSig {
			t.Fatalf("MinimumSignificantDigits: got %d want %d", got.MinimumSignificantDigits, *w.minSig)
		}
		if w.maxSig != nil && got.MaximumSignificantDigits != *w.maxSig {
			t.Fatalf("MaximumSignificantDigits: got %d want %d", got.MaximumSignificantDigits, *w.maxSig)
		}
		if w.grouping != nil {
			if got.UseGrouping == nil || *got.UseGrouping != *w.grouping {
				t.Fatalf("UseGrouping: got %v want %v", got.UseGrouping, w.grouping)
			}
		}
		if w.rounding != "" && got.RoundingMode != w.rounding {
			t.Fatalf("RoundingMode: got %q want %q", got.RoundingMode, w.rounding)
		}
		if w.roundPri != "" && got.RoundingPriority != w.roundPri {
			t.Fatalf("RoundingPriority: got %q want %q", got.RoundingPriority, w.roundPri)
		}
		if w.trailing != "" && got.TrailingZeroDisplay != w.trailing {
			t.Fatalf("TrailingZeroDisplay: got %q want %q", got.TrailingZeroDisplay, w.trailing)
		}
	}

	t.Run("basics", func(t *testing.T) {
		for _, tc := range []struct {
			in   string
			want want
		}{
			{"%", want{style: "percent"}},
			{"%x100", want{style: "percent", scale: float64Ptr(100)}},
			{"group-off", want{grouping: func() *bool { f := false; return &f }()}},
			{",_", want{grouping: func() *bool { f := false; return &f }()}},
			{"precision-integer", want{minFrac: intPtr(0), maxFrac: intPtr(0)}},
			{".", want{minFrac: intPtr(0), maxFrac: intPtr(0)}},
			{"compact-short", want{notation: "compact", compact: "short"}},
			{"K", want{notation: "compact", compact: "short"}},
			{"compact-long", want{notation: "compact", compact: "long"}},
			{"KK", want{notation: "compact", compact: "long"}},
			{"notation-simple", want{notation: "standard"}},
			{"scientific/sign-auto", want{notation: "scientific", sign: "auto"}},
			{"scientific/sign-accounting-always", want{notation: "scientific", sign: "always", curSign: "accounting"}},
			{"engineering/+?", want{notation: "engineering", sign: "exceptZero"}},
			{"scale/3", want{scale: float64Ptr(3)}},
			{"000", want{minInt: intPtr(3)}},
			{"sign-never", want{sign: "never"}},
			{"+!", want{sign: "always"}},
			{"E00", want{notation: "scientific", minInt: intPtr(2)}},
			{"EE00", want{notation: "engineering", minInt: intPtr(2)}},
		} {
			toks := mustParseSkeleton(t, tc.in)
			got, err := ParseNumberSkeleton(toks)
			if err != nil {
				t.Fatalf("%q: %v", tc.in, err)
			}
			assert(t, got, tc.want)
		}

		// Concise scientific + sign is expressed as a second stem (see parseConciseScientificAndEngineeringStem).
		toks := mustParseSkeleton(t, "E00 +!")
		got, err := ParseNumberSkeleton(toks)
		if err != nil {
			t.Fatal(err)
		}
		assert(t, got, want{notation: "scientific", minInt: intPtr(2), sign: "always"})
	})

	t.Run("currency_unit_widths", func(t *testing.T) {
		for _, tc := range []struct {
			in   string
			want want
		}{
			{"currency/USD", want{style: "currency", currency: "USD"}},
			{"measure-unit/length-meter", want{style: "unit", unit: "meter"}},
			{"unit-width-narrow", want{currencyDisplay: "narrowSymbol", unitDisplay: "narrow"}},
			{"unit-width-short", want{currencyDisplay: "code", unitDisplay: "short"}},
			{"unit-width-full-name", want{currencyDisplay: "name", unitDisplay: "long"}},
			{"unit-width-iso-code", want{currencyDisplay: "symbol"}},
		} {
			toks := mustParseSkeleton(t, tc.in)
			got, err := ParseNumberSkeleton(toks)
			if err != nil {
				t.Fatalf("%q: %v", tc.in, err)
			}
			assert(t, got, tc.want)
		}
	})

	t.Run("rounding_modes", func(t *testing.T) {
		modes := []struct {
			stem, mode string
		}{
			{"rounding-mode-floor", "floor"},
			{"rounding-mode-ceiling", "ceil"},
			{"rounding-mode-down", "trunc"},
			{"rounding-mode-up", "expand"},
			{"rounding-mode-half-even", "halfEven"},
			{"rounding-mode-half-down", "halfTrunc"},
			{"rounding-mode-half-up", "halfExpand"},
		}
		for _, m := range modes {
			toks := mustParseSkeleton(t, m.stem)
			got, err := ParseNumberSkeleton(toks)
			if err != nil {
				t.Fatal(err)
			}
			if got.RoundingMode != m.mode {
				t.Fatalf("%s: got %q", m.stem, got.RoundingMode)
			}
		}
	})

	t.Run("fraction_and_significant", func(t *testing.T) {
		for _, tc := range []struct {
			in   string
			want want
		}{
			{".00*", want{minFrac: intPtr(2)}},
			{".###", want{maxFrac: intPtr(3)}},
			{".0#", want{minFrac: intPtr(1), maxFrac: intPtr(2)}},
			{".00/w", want{minFrac: intPtr(2), maxFrac: intPtr(2), trailing: "stripIfInteger"}},
			{".00/@@@", want{minFrac: intPtr(2), maxFrac: intPtr(2), minSig: intPtr(3), maxSig: intPtr(3)}},
			{"@@@", want{minSig: intPtr(3), maxSig: intPtr(3)}},
			{"@@@r", want{minSig: intPtr(3), maxSig: intPtr(3), roundPri: "morePrecision"}},
			{"@@+s", want{minSig: intPtr(2), roundPri: "lessPrecision"}},
			{"@##", want{minSig: intPtr(1), maxSig: intPtr(3)}},
		} {
			toks := mustParseSkeleton(t, tc.in)
			got, err := ParseNumberSkeleton(toks)
			if err != nil {
				t.Fatalf("%q: %v", tc.in, err)
			}
			assert(t, got, tc.want)
		}
	})

	t.Run("integer_width", func(t *testing.T) {
		toks := mustParseSkeleton(t, "integer-width/*000")
		got, err := ParseNumberSkeleton(toks)
		if err != nil {
			t.Fatal(err)
		}
		if got.MinimumIntegerDigits != 3 {
			t.Fatalf("got %d", got.MinimumIntegerDigits)
		}
	})
}

func TestParseNumberSkeletonErrors(t *testing.T) {
	errCases := []string{
		"currency",
		"measure-unit",
		"scale",
		".00/w/extra",
		"integer-width/*000/*001",
		"integer-width/#0",
		"EX",
		"unknown-stem-xyz",
	}
	for _, s := range errCases {
		toks := mustParseSkeleton(t, s)
		if _, err := ParseNumberSkeleton(toks); err == nil {
			t.Fatalf("expected error for %q", s)
		}
	}
	if _, err := ParseNumberSkeleton(mustParseSkeleton(t, "scale/not-a-float")); err == nil {
		t.Fatal("expected scale parse error")
	}
}

func TestParseWithSkeletonOptions(t *testing.T) {
	opts := &ParseOptions{ShouldParseSkeletons: true}
	elems, err := Parse("{n, number, ::percent compact-short}", opts)
	if err != nil {
		t.Fatal(err)
	}
	ne, ok := elems[0].(NumberElement)
	if !ok || ne.Skeleton == nil || ne.Skeleton.ParsedOptions.Style != "percent" {
		t.Fatalf("number skeleton parse: %#v", elems[0])
	}

	_, err = Parse("{t, time, ::HHmm}", opts)
	if err != nil {
		t.Fatal(err)
	}

	_, err = Parse("{d, date, ::yyyyMMdd}", opts)
	if err != nil {
		t.Fatal(err)
	}
}

func TestParseNumberSkeletonMergeConciseScientificNil(t *testing.T) {
	var dst NumberFormatOptions
	mergeConciseScientific(&dst, nil)
	if !reflect.ValueOf(dst).IsZero() {
		t.Fatal("expected noop")
	}
}

func TestICUUnitToEcmaNoHyphen(t *testing.T) {
	toks := mustParseSkeleton(t, "measure-unit/meter")
	got, err := ParseNumberSkeleton(toks)
	if err != nil {
		t.Fatal(err)
	}
	if got.Unit != "meter" {
		t.Fatalf("got %q", got.Unit)
	}
}

func TestParseSignStemAllScientificOptions(t *testing.T) {
	// Each parseNotationSign option on scientific/engineering stems (covers parseSignStem + parseNotationSign).
	for _, in := range []string{
		"scientific/()",
		"scientific/+?",
		"engineering/sign-never",
		"scientific/unknown-opt",
	} {
		toks := mustParseSkeleton(t, in)
		if _, err := ParseNumberSkeleton(toks); err != nil {
			t.Fatalf("%q: %v", in, err)
		}
	}
	for _, stem := range []string{"()!", "()?", "+?", "+_"} {
		toks := mustParseSkeleton(t, stem)
		if _, err := ParseNumberSkeleton(toks); err != nil {
			t.Fatalf("%q: %v", stem, err)
		}
	}
}

func TestParseConciseScientificEngineeringSignSuffix(t *testing.T) {
	for _, in := range []string{
		"EE+!00",
		"EE+?00",
		"E+!00",
		"E+?00",
	} {
		toks := mustParseSkeleton(t, in)
		got, err := ParseNumberSkeleton(toks)
		if err != nil {
			t.Fatalf("%q: %v", in, err)
		}
		if got.Notation == "" {
			t.Fatalf("%q: missing notation %#v", in, got)
		}
	}
	if _, err := ParseNumberSkeleton(mustParseSkeleton(t, "E00x")); err == nil {
		t.Fatal("expected malformed concise notation error")
	}
}

func TestMergeConciseScientificPartialFields(t *testing.T) {
	var dst NumberFormatOptions
	mergeConciseScientific(&dst, &NumberFormatOptions{MinimumIntegerDigits: 5})
	if dst.MinimumIntegerDigits != 5 {
		t.Fatalf("got %#v", dst)
	}
	var dst2 NumberFormatOptions
	mergeConciseScientific(&dst2, &NumberFormatOptions{Notation: "engineering"})
	if dst2.Notation != "engineering" {
		t.Fatalf("got %#v", dst2)
	}
}

func TestApplyIntegerWidthExactDigitsError(t *testing.T) {
	if _, err := ParseNumberSkeleton(mustParseSkeleton(t, "integer-width/000")); err == nil {
		t.Fatal("expected exact integer digits error")
	}
}

func TestStripICUQuotesUnclosedLiteral(t *testing.T) {
	got := stripICUQuotes("yyyy'open-no-close")
	if got != "yyyy" {
		t.Fatalf("got %q", got)
	}
}

func TestApplyDateTimeFieldEdgeCases(t *testing.T) {
	var z DateTimeFormatOptions
	if err := applyDateTimeField(&z, ""); err != nil {
		t.Fatal(err)
	}

	for _, tc := range []struct {
		match string
		check func(DateTimeFormatOptions) bool
	}{
		{"G", func(o DateTimeFormatOptions) bool { return o.Era == "short" }},
		{"GG", func(o DateTimeFormatOptions) bool { return o.Era == "short" }},
		{"MMMMMM", func(o DateTimeFormatOptions) bool { return o.Month == "narrow" }},
		{"ddd", func(o DateTimeFormatOptions) bool { return o.Day == "" }},
		{"zzzzz", func(o DateTimeFormatOptions) bool { return o.TimeZoneName == "long" }},
	} {
		var o DateTimeFormatOptions
		if err := applyDateTimeField(&o, tc.match); err != nil {
			t.Fatalf("%q: %v", tc.match, err)
		}
		if !tc.check(o) {
			t.Fatalf("%q: got %#v", tc.match, o)
		}
	}
}

func TestParseNumberSkeletonTokensAlternateWhitespace(t *testing.T) {
	// isNumberSkeletonWhitespace includes U+200E; exercises FieldsFunc splitting.
	toks, err := ParseNumberSkeletonTokens("percent\u200ecompact-short")
	if err != nil {
		t.Fatal(err)
	}
	if len(toks) != 2 || toks[0].Stem != "percent" || toks[1].Stem != "compact-short" {
		t.Fatalf("got %+v", toks)
	}
}
