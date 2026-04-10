package icuparser

import (
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
