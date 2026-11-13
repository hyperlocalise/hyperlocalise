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
	if found.ID == "" || found.Status != StatusFail {
		t.Fatalf("expected unreachable plural failure, got %+v", checks)
	}
	if !slices.Equal(found.RelatedTokens, []string{"one"}) {
		t.Fatalf("tokens = %v", found.RelatedTokens)
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
