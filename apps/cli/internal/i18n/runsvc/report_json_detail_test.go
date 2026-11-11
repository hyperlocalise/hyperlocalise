package runsvc

import (
	"strings"
	"testing"
)

func TestReportForJSONRejectsInvalidDetail(t *testing.T) {
	got, err := ReportForJSON(Report{}, "verbose")
	if err == nil || !strings.Contains(err.Error(), `invalid report JSON detail "verbose"`) {
		t.Fatalf("expected invalid detail error, got %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil payload on error, got %T", got)
	}
}

func TestReportForJSONFullNormalizesTokenAliases(t *testing.T) {
	report := Report{
		PlannedTotal: 3,
		TokenUsage:   TokenUsage{PromptTokens: 10, CompletionTokens: 4},
		LocaleUsage: map[string]TokenUsage{
			"fr-FR": {InputTokens: 6, OutputTokens: 2},
			"de-DE": {PromptTokens: 4, CompletionTokens: 2, TotalTokens: 99},
		},
		Batches: []BatchUsage{
			{TargetLocale: "fr-FR", EntryKey: "hello", TokenUsage: TokenUsage{PromptTokens: 6, CompletionTokens: 2}},
		},
	}

	for _, detail := range []string{"", " FULL "} {
		got, err := ReportForJSON(report, detail)
		if err != nil {
			t.Fatalf("ReportForJSON(%q): %v", detail, err)
		}
		full, ok := got.(Report)
		if !ok {
			t.Fatalf("ReportForJSON(%q) returned %T, want Report", detail, got)
		}
		if full.PlannedTotal != 3 {
			t.Fatalf("expected report fields preserved, got %+v", full)
		}
		if u := full.TokenUsage; u.InputTokens != 10 || u.OutputTokens != 4 || u.TotalTokens != 14 || u.PromptTokens != 10 || u.CompletionTokens != 4 {
			t.Fatalf("token usage = %+v", u)
		}
		if fr := full.LocaleUsage["fr-FR"]; fr.PromptTokens != 6 || fr.CompletionTokens != 2 || fr.TotalTokens != 8 {
			t.Fatalf("fr-FR usage = %+v", fr)
		}
		if de := full.LocaleUsage["de-DE"]; de.InputTokens != 4 || de.OutputTokens != 2 || de.TotalTokens != 99 {
			t.Fatalf("de-DE usage = %+v", de)
		}
		if batch := full.Batches[0].TokenUsage; batch.InputTokens != 6 || batch.TotalTokens != 8 {
			t.Fatalf("batch usage = %+v", batch)
		}
	}

	if report.LocaleUsage["fr-FR"].PromptTokens != 0 {
		t.Fatal("normalizing must not mutate the caller's locale usage map")
	}
}

func TestReportForJSONSummaryReturnsSummaryShape(t *testing.T) {
	got, err := ReportForJSON(Report{Succeeded: 2, PruneCandidates: make([]PruneCandidate, 3)}, ReportJSONDetailSummary)
	if err != nil {
		t.Fatalf("ReportForJSON summary: %v", err)
	}
	summary, ok := got.(SummaryJSONReport)
	if !ok {
		t.Fatalf("ReportForJSON summary returned %T", got)
	}
	if summary.Succeeded != 2 || summary.PruneCandidateCount != 3 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
}

func TestNormalizeTokenUsageKeepsExplicitValues(t *testing.T) {
	got := NormalizeTokenUsage(TokenUsage{InputTokens: 5, PromptTokens: 7, OutputTokens: 1, CompletionTokens: 3})
	if got.InputTokens != 5 || got.PromptTokens != 7 || got.OutputTokens != 1 || got.CompletionTokens != 3 || got.TotalTokens != 6 {
		t.Fatalf("unexpected normalized usage: %+v", got)
	}
	if got := NormalizeTokenUsage(TokenUsage{}); got.InputTokens != 0 || got.OutputTokens != 0 || got.TotalTokens != 0 || got.PromptTokens != 0 || got.CompletionTokens != 0 {
		t.Fatalf("expected zero usage to stay zero, got %+v", got)
	}
}
