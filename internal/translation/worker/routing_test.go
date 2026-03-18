package worker

import (
	"strings"
	"testing"
)

func TestPolicyEngineSelectLanguagePairAndBudgetPremium(t *testing.T) {
	engine, err := newDefaultPolicyEngine("openai", "gpt-4o-mini")
	if err != nil {
		t.Fatalf("new default policy engine: %v", err)
	}

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
	engine, err := newDefaultPolicyEngine("openai", "gpt-4o-mini")
	if err != nil {
		t.Fatalf("new default policy engine: %v", err)
	}

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
	engine, err := newDefaultPolicyEngine("openai", "gpt-4o-mini")
	if err != nil {
		t.Fatalf("new default policy engine: %v", err)
	}

	decision := engine.Select(TranslationTask{SourceLocale: "sv", TargetLocale: "th"})
	if decision.Provider != "openai" || decision.Model != "gpt-4.1" {
		t.Fatalf("expected fallback route, got %s/%s", decision.Provider, decision.Model)
	}
	joined := strings.Join(decision.Reasons, " ")
	if !strings.Contains(joined, "no specific language-pair policy") {
		t.Fatalf("expected fallback reason, got %v", decision.Reasons)
	}

	budgetedDecision := engine.Select(TranslationTask{
		SourceLocale: "sv",
		TargetLocale: "th",
		Metadata: map[string]string{
			metadataBudgetTargetKey: "economy",
		},
	})
	if budgetedDecision.Provider != "openai" || budgetedDecision.Model != "gpt-4o-mini" {
		t.Fatalf("expected economy guardrail for unknown pair, got %s/%s", budgetedDecision.Provider, budgetedDecision.Model)
	}
	joined = strings.Join(budgetedDecision.Reasons, " ")
	if !strings.Contains(joined, "applied global budget rule for economy") {
		t.Fatalf("expected global budget reason, got %v", budgetedDecision.Reasons)
	}
}

func TestPolicyEngineRejectsUnknownFallbackProvider(t *testing.T) {
	if _, err := newDefaultPolicyEngine("unknown", "gpt-4o-mini"); err == nil || !strings.Contains(err.Error(), `fallback provider "unknown" is not registered`) {
		t.Fatalf("expected unknown provider error, got %v", err)
	}
}

func TestPolicyEngineRejectsUnknownFallbackModel(t *testing.T) {
	if _, err := newDefaultPolicyEngine("openai", "unknown-model"); err == nil || !strings.Contains(err.Error(), `fallback model "unknown-model" is not registered for provider "openai"`) {
		t.Fatalf("expected unknown model error, got %v", err)
	}
}

func TestPolicyEngineNormalizesLocaleTagsForPolicyLookup(t *testing.T) {
	engine, err := newDefaultPolicyEngine("openai", "gpt-4o-mini")
	if err != nil {
		t.Fatalf("new default policy engine: %v", err)
	}

	decision := engine.Select(TranslationTask{
		SourceLocale: " EN_us ",
		TargetLocale: "ja-JP",
		Metadata: map[string]string{
			metadataBudgetTargetKey: "premium",
		},
	})

	if decision.Provider != "anthropic" {
		t.Fatalf("expected anthropic provider, got %q", decision.Provider)
	}
	if decision.Model != "claude-3-7-sonnet" {
		t.Fatalf("expected normalized locale tags to match premium policy, got %q", decision.Model)
	}
}

func TestNormalizeLocalePolicyKeySeparatorOnly(t *testing.T) {
	if got := normalizeLocalePolicyKey("-"); got != "" {
		t.Fatalf("expected empty locale key for separator-only input, got %q", got)
	}
	if got := normalizeLocalePolicyKey("__"); got != "" {
		t.Fatalf("expected empty locale key for separator-only input, got %q", got)
	}
}
