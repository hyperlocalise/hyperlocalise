package pluralrules

import (
	"slices"
	"testing"
)

func TestUnreachableJapaneseCardinalOne(t *testing.T) {
	got := Unreachable("ja", "plural", []string{"one", "other"})
	if !slices.Equal(got, []string{"one"}) {
		t.Fatalf("ja unreachable = %v, want [one]", got)
	}
}

func TestUnreachableJapaneseOtherOnly(t *testing.T) {
	if got := Unreachable("ja-JP", "plural", []string{"other"}); len(got) != 0 {
		t.Fatalf("ja-JP other-only = %v", got)
	}
}

func TestUnreachableEnglishAllowsOne(t *testing.T) {
	if got := Unreachable("en-US", "plural", []string{"one", "other"}); len(got) != 0 {
		t.Fatalf("en-US one/other = %v", got)
	}
}

func TestUnreachableIgnoresExactMatches(t *testing.T) {
	if got := Unreachable("ja", "plural", []string{"=0", "other"}); len(got) != 0 {
		t.Fatalf("exact zero = %v", got)
	}
}

func TestUnreachableUnknownLocale(t *testing.T) {
	if got := Unreachable("", "plural", []string{"one", "other"}); got != nil {
		t.Fatalf("empty locale = %v", got)
	}
	if got := Unreachable("!!!", "plural", []string{"one", "other"}); got != nil {
		t.Fatalf("invalid locale = %v", got)
	}
}

func TestUnreachableSelectOrdinalUsesOrdinalRules(t *testing.T) {
	got := Unreachable("ja", "selectordinal", []string{"one", "other"})
	if !slices.Equal(got, []string{"one"}) {
		t.Fatalf("ja ordinal unreachable = %v, want [one]", got)
	}
}
