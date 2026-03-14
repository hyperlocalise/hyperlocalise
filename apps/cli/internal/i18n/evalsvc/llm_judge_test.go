package evalsvc

import "testing"

func TestParseJudgeResultSupportsRubricWeightedScore(t *testing.T) {
	got, err := parseJudgeResult(`{"rubric":{"accuracy":5,"terminology":4,"fluency":4,"localeFit":3,"formattingSafety":5,"policyTone":4},"rationale":"solid"}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got.Score == nil {
		t.Fatalf("expected score")
	}
	if *got.Score != 0.86 {
		t.Fatalf("expected weighted score 0.86, got %v", *got.Score)
	}
}

func TestParseJudgeResultRubricRequiresPolicyTone(t *testing.T) {
	_, err := parseJudgeResult(`{"rubric":{"accuracy":5,"terminology":4,"fluency":4,"localeFit":3,"formattingSafety":5}}`)
	if err == nil {
		t.Fatalf("expected error")
	}
}
