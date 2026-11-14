package segmentvalidate

import (
	"slices"
	"testing"
)

func TestUnreachablePluralCases(t *testing.T) {
	got := UnreachablePluralCases("ja", "{count, plural, one {# file} other {# files}}")
	if !slices.Equal(got, []string{"one"}) {
		t.Fatalf("got %v, want [one]", got)
	}
	if got := UnreachablePluralCases("ja", "{count, plural, other {# files}}"); len(got) != 0 {
		t.Fatalf("other-only = %v", got)
	}
	if got := UnreachablePluralCases("en-US", "{count, plural, one {# file} other {# files}}"); len(got) != 0 {
		t.Fatalf("english = %v", got)
	}
}

func TestUnreachablePluralCheck(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText:   "{count, plural, one {# file} other {# files}}",
		TargetText:   "{count, plural, one {# 件} other {# 件}}",
		SourcePath:   "messages/ja.json",
		TargetLocale: "ja",
		Modes:        []string{QAModeUnreachablePlural},
	})
	var found Check
	for _, check := range checks {
		if check.ID == "qa-unreachable-plural-case" {
			found = check
		}
	}
	if found.ID == "" || found.Status != StatusWarn {
		t.Fatalf("expected unreachable plural warning, got %+v", checks)
	}
	if !slices.Equal(found.RelatedTokens, []string{"one"}) {
		t.Fatalf("tokens = %v", found.RelatedTokens)
	}
}

func TestUnreachablePluralCheckKeepsSourceCategoriesValid(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText:   "{count, plural, one {# file} other {# files}}",
		TargetText:   "{count, plural, one {# tệp} other {# tệp}}",
		SourcePath:   "messages/vi.json",
		TargetLocale: "vi",
		Modes:        []string{QAModeUnreachablePlural},
	})
	for _, check := range checks {
		if check.Status == StatusFail {
			t.Fatalf("source plural categories must not fail ICU parity, got %+v", checks)
		}
	}
}

func TestICUParityAllowsLocaleSpecificPluralCategories(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText:   "{count, plural, one {# file} other {# files}}",
		TargetText:   "{count, plural, other {# 件}}",
		SourcePath:   "messages/ja.json",
		TargetLocale: "ja",
	})
	if len(checks) != 1 || checks[0].Status != StatusPass {
		t.Fatalf("expected format pass for ja other-only, got %+v", checks)
	}
}
