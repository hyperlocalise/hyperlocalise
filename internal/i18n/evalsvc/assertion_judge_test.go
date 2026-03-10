package evalsvc

import (
	"context"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/evalset"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

func TestNewAssertionJudgeScorer(t *testing.T) {
	scorer, ok := NewAssertionJudgeScorer(AssertionLLMRubric, "openai", "gpt", "", func(_ context.Context, _ translator.Request) (string, error) {
		return `{"score":0.8,"rationale":"ok","rubric":{"accuracy":4,"terminology":4,"fluency":4,"localeFit":4,"formattingSafety":4,"policyTone":4}}`, nil
	})
	if !ok || scorer == nil {
		t.Fatalf("expected scorer")
	}
	out, err := scorer.ScoreJudge(context.Background(), ScoreInput{
		Case:       evalset.Case{ID: "1", Source: "Hello", TargetLocale: "fr-FR"},
		Translated: "Bonjour",
	})
	if err != nil {
		t.Fatalf("score judge: %v", err)
	}
	if out.Score == nil || *out.Score != 0.8 {
		t.Fatalf("unexpected score: %+v", out)
	}
	if out.Details["assertion"] != AssertionLLMRubric {
		t.Fatalf("expected assertion metadata, got %+v", out.Details)
	}
}

func TestNewAssertionJudgeScorerRejectsUnknownAssertion(t *testing.T) {
	scorer, ok := NewAssertionJudgeScorer("unknown", "openai", "gpt", "", nil)
	if ok || scorer != nil {
		t.Fatalf("expected unknown assertion to be rejected")
	}
}

func TestLLMRubricTemplateIncludesLocalizationCriteria(t *testing.T) {
	prompt, ok := assertionPromptFor(AssertionLLMRubric)
	if !ok {
		t.Fatalf("expected rubric assertion prompt")
	}
	for _, token := range []string{"accuracy", "terminology", "fluency", "localeFit", "formattingSafety", "policyTone"} {
		if !strings.Contains(prompt, token) {
			t.Fatalf("expected token %q in prompt", token)
		}
	}
	if !strings.Contains(prompt, "Write the rationale in English.") {
		t.Fatalf("expected english rationale instruction in prompt")
	}
}

func TestAssertionPromptsRequireEnglishRationale(t *testing.T) {
	for _, assertion := range []string{
		AssertionFactuality,
		AssertionGEval,
		AssertionClosedQA,
		AssertionAnswerRelevance,
		AssertionContextFaithful,
		AssertionContextRecall,
	} {
		prompt, ok := assertionPromptFor(assertion)
		if !ok {
			t.Fatalf("expected assertion prompt for %s", assertion)
		}
		if !strings.Contains(prompt, "Write the rationale in English.") {
			t.Fatalf("expected english rationale instruction for %s", assertion)
		}
	}
}

func TestAssertionJudgeScorerFactualityRequiresSchema(t *testing.T) {
	scorer, ok := NewAssertionJudgeScorer(AssertionFactuality, "openai", "gpt", "", func(_ context.Context, _ translator.Request) (string, error) {
		return `{"score":0.8,"rationale":"ok"}`, nil
	})
	if !ok || scorer == nil {
		t.Fatalf("expected scorer")
	}
	_, err := scorer.ScoreJudge(context.Background(), ScoreInput{
		Case:       evalset.Case{ID: "1", Source: "Hello", TargetLocale: "fr-FR"},
		Translated: "Bonjour",
	})
	if err == nil || !strings.Contains(err.Error(), "grounded") {
		t.Fatalf("expected schema validation error, got %v", err)
	}
}

func TestAssertionJudgeScorerGEvalParsesDimensions(t *testing.T) {
	scorer, ok := NewAssertionJudgeScorer(AssertionGEval, "openai", "gpt", "", func(_ context.Context, _ translator.Request) (string, error) {
		return `{"rationale":"ok","dimensions":{"coherence":0.9,"adequacy":0.8,"toneControl":0.7,"styleConformance":0.6}}`, nil
	})
	if !ok || scorer == nil {
		t.Fatalf("expected scorer")
	}
	out, err := scorer.ScoreJudge(context.Background(), ScoreInput{
		Case:       evalset.Case{ID: "1", Source: "Hello", TargetLocale: "fr-FR"},
		Translated: "Bonjour",
	})
	if err != nil {
		t.Fatalf("score judge: %v", err)
	}
	if out.Score == nil || *out.Score != 0.75 {
		t.Fatalf("expected derived g-eval score 0.75, got %+v", out)
	}
	details, ok := out.Details["dimensions"].(map[string]float64)
	if !ok || len(details) != 4 {
		t.Fatalf("expected dimensions in details, got %+v", out.Details)
	}
}

func TestParseContextFaithfulnessJudgeResultDefaultsFaithfulToOne(t *testing.T) {
	out, err := parseContextFaithfulnessJudgeResult(`{"rationale":"ok","faithful":true,"unsupportedClaims":["minor nuance"]}`)
	if err != nil {
		t.Fatalf("parse context faithfulness: %v", err)
	}
	if out.Score == nil || *out.Score != 1 {
		t.Fatalf("expected faithful default score of 1, got %+v", out.Score)
	}
}
