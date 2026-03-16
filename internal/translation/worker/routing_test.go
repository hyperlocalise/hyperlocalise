package worker

import (
	"strings"
	"testing"
)

func TestPolicyEngineSelectLanguagePairAndBudgetPremium(t *testing.T) {
	engine := newDefaultPolicyEngine("openai", "gpt-4o-mini")

	decision := engine.Select(TranslationTask{
		SourceLocale: "en",
		TargetLocale: "ja",
		Metadata: map[string]string{
			metadataBudgetTargetKey: "premium",
		},
	})

	if decision.Provider != "anthropic" {
		t.Fatalf("expected anthropic provider, got %q", decision.Provider)
	}
	if decision.Model != "claude-3-7-sonnet" {
		t.Fatalf("expected premium model, got %q", decision.Model)
	}
	joined := strings.Join(decision.Reasons, " ")
	if !strings.Contains(joined, "matched language-pair budget policy") {
		t.Fatalf("expected policy match reason, got %v", decision.Reasons)
	}
}

func TestPolicyEngineSelectLanguagePairEconomy(t *testing.T) {
	engine := newDefaultPolicyEngine("openai", "gpt-4o-mini")

	decision := engine.Select(TranslationTask{
		SourceLocale: "en",
		TargetLocale: "de",
		Metadata: map[string]string{
			metadataBudgetTargetKey: "economy",
		},
	})

	if decision.Provider != "openai" {
		t.Fatalf("expected openai provider, got %q", decision.Provider)
	}
	if decision.Model != "gpt-4o-mini" {
		t.Fatalf("expected economy model, got %q", decision.Model)
	}
}

func TestPolicyEngineFallbackWhenNoPolicy(t *testing.T) {
	engine := newDefaultPolicyEngine("openai", "gpt-4o-mini")

	decision := engine.Select(TranslationTask{SourceLocale: "sv", TargetLocale: "th"})
	if decision.Provider != "openai" || decision.Model != "gpt-4.1" {
		t.Fatalf("expected fallback route, got %s/%s", decision.Provider, decision.Model)
	}
	joined := strings.Join(decision.Reasons, " ")
	if !strings.Contains(joined, "no specific language-pair policy") {
		t.Fatalf("expected fallback reason, got %v", decision.Reasons)
	}
}
