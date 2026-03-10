package cmd

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/evalsvc"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/evalsvc/scoring"
)

func TestRootHelpIncludesEvalCommand(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"--help"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("run root help: %v", err)
	}

	if !strings.Contains(out.String(), "eval") {
		t.Fatalf("expected help to include eval command, got %q", out.String())
	}
}

func TestEvalRunRequiresEvalSet(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "run"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "--eval-set is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEvalRunRejectsInlineAndFilePromptTogether(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "run", "--eval-set", "set.json", "--prompt", "x", "--prompt-file", "prompt.txt"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "mutually exclusive") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEvalRunRejectsInlineAndFileEvalPromptTogether(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "run", "--eval-set", "set.json", "--eval-prompt", "x", "--eval-prompt-file", "prompt.txt"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "mutually exclusive") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEvalRunAllowsIncompleteEvaluatorFlagsForDefaults(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "run", "--eval-set", "set.json", "--eval-provider", "openai"})

	prev := evalRunFunc
	evalRunFunc = func(_ context.Context, in evalsvc.Input) (evalsvc.Report, error) {
		if in.EvalProvider != "openai" || in.EvalModel != "" {
			t.Fatalf("unexpected eval input: %+v", in)
		}
		return evalsvc.Report{}, nil
	}
	t.Cleanup(func() { evalRunFunc = prev })

	if err := cmd.Execute(); err != nil {
		t.Fatalf("expected incomplete evaluator flags to be allowed, got %v", err)
	}
}

func TestEvalRunPassesEvalPromptFromFile(t *testing.T) {
	dir := t.TempDir()
	promptPath := filepath.Join(dir, "eval-prompt.txt")
	if err := os.WriteFile(promptPath, []byte("judge prompt"), 0o600); err != nil {
		t.Fatalf("write prompt file: %v", err)
	}

	prev := evalRunFunc
	var got evalsvc.Input
	evalRunFunc = func(_ context.Context, in evalsvc.Input) (evalsvc.Report, error) {
		got = in
		return evalsvc.Report{}, nil
	}
	t.Cleanup(func() { evalRunFunc = prev })

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "run", "--eval-set", "set.json", "--eval-provider", "openai", "--eval-model", "gpt-4.1-mini", "--eval-prompt-file", promptPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("eval run: %v", err)
	}
	if got.EvalPrompt != "judge prompt" {
		t.Fatalf("expected eval prompt from file, got %q", got.EvalPrompt)
	}
}

func TestEvalRunPrintsSummary(t *testing.T) {
	prev := evalRunFunc
	evalRunFunc = func(_ context.Context, _ evalsvc.Input) (evalsvc.Report, error) {
		return evalsvc.Report{
			Input: evalsvc.Input{
				EvalSetPath:  "set.json",
				OutputPath:   "report.json",
				EvalProvider: "openai",
				EvalModel:    "gpt-5.2",
			},
			Aggregate: evalsvc.Aggregate{
				TotalRuns:      2,
				SuccessfulRuns: 1,
				FailedRuns:     1,
			},
			LLMEvaluation: &evalsvc.LLMEvaluation{
				Enabled:    true,
				Provider:   "openai",
				Model:      "gpt-5.2",
				Assertions: []string{"llm-rubric"},
			},
			CaseSummaries: []evalsvc.CaseSummary{
				{CaseID: "a"},
			},
			ExperimentSummaries: []evalsvc.ExperimentSummary{
				{
					ExperimentID:     "default|openai|gpt|prompt",
					RunCount:         2,
					SuccessfulRuns:   1,
					FailedRuns:       1,
					DecisionCounts:   map[string]int{"pass": 1, "review": 1},
					AverageLatencyMS: 15,
					WeightedScore:    0.75,
					HardFailCounts:   map[string]int{scoring.HardFailPlaceholderDrop: 1},
					AverageScoreByName: map[string]float64{
						"judge:llm-rubric": 0.82,
						"judge:factuality": 0.79,
					},
				},
			},
		}, nil
	}
	t.Cleanup(func() { evalRunFunc = prev })

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"eval", "run", "--eval-set", "set.json"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("eval run: %v", err)
	}
	if !strings.Contains(out.String(), "experiment | score | pass_rate | placeholder_violations | latency_ms | factuality | llm-rubric") {
		t.Fatalf("expected table header, got %q", out.String())
	}
	if !strings.Contains(out.String(), "50.0%") {
		t.Fatalf("expected pass rate, got %q", out.String())
	}
	if !strings.Contains(out.String(), "0.790 | 0.820") {
		t.Fatalf("expected assertion columns, got %q", out.String())
	}
	if !strings.Contains(out.String(), "eval: starting dataset=set.json") {
		t.Fatalf("expected start log, got %q", out.String())
	}
	if !strings.Contains(out.String(), "eval: judge provider=openai model=gpt-5.2 assertions=llm-rubric") {
		t.Fatalf("expected judge log, got %q", out.String())
	}
}

func TestWriteExperimentSummaryUsesDecisionPassRate(t *testing.T) {
	out := bytes.NewBuffer(nil)
	err := writeExperimentSummary(out, []evalsvc.ExperimentSummary{
		{
			ExperimentID:     "default|openai|gpt|prompt",
			RunCount:         4,
			SuccessfulRuns:   4,
			DecisionCounts:   map[string]int{"pass": 1, "review": 2, "fail": 1},
			AverageLatencyMS: 15,
			WeightedScore:    0.75,
		},
	}, false)
	if err != nil {
		t.Fatalf("write experiment summary: %v", err)
	}
	if !strings.Contains(out.String(), "25.0%") {
		t.Fatalf("expected decision-based pass rate, got %q", out.String())
	}
	if strings.Contains(out.String(), "100.0%") {
		t.Fatalf("unexpected transport-success pass rate, got %q", out.String())
	}
}

func TestWriteExperimentSummaryUsesZeroPassRateWithoutDecisions(t *testing.T) {
	out := bytes.NewBuffer(nil)
	err := writeExperimentSummary(out, []evalsvc.ExperimentSummary{
		{
			ExperimentID:     "default|openai|gpt|prompt",
			RunCount:         2,
			SuccessfulRuns:   2,
			AverageLatencyMS: 15,
			WeightedScore:    0.75,
		},
	}, false)
	if err != nil {
		t.Fatalf("write experiment summary: %v", err)
	}
	if !strings.Contains(out.String(), "0.0%") {
		t.Fatalf("expected zero pass rate without decision counts, got %q", out.String())
	}
	if strings.Contains(out.String(), "100.0%") {
		t.Fatalf("unexpected transport-success pass rate fallback, got %q", out.String())
	}
}

func TestEvalCompareFailsOnRegressionThreshold(t *testing.T) {
	dir := t.TempDir()
	candidatePath := filepath.Join(dir, "candidate.json")
	baselinePath := filepath.Join(dir, "baseline.json")

	candidate := `{"aggregate":{"weightedScore":0.7},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.7},"latencyMs":12}]}`
	baseline := `{"aggregate":{"weightedScore":0.9},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.9},"latencyMs":10}]}`

	if err := os.WriteFile(candidatePath, []byte(candidate), 0o600); err != nil {
		t.Fatalf("write candidate: %v", err)
	}
	if err := os.WriteFile(baselinePath, []byte(baseline), 0o600); err != nil {
		t.Fatalf("write baseline: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"eval", "compare", "--candidate", candidatePath, "--baseline", baselinePath, "--max-regression", "0.1"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected regression error")
	}
	if !strings.Contains(err.Error(), "exceeds max regression") {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out.String(), "candidate experiment summary") {
		t.Fatalf("expected compare output, got %q", out.String())
	}
}

func TestEvalComparePrefersLLMAggregateWhenPresent(t *testing.T) {
	dir := t.TempDir()
	candidatePath := filepath.Join(dir, "candidate.json")
	baselinePath := filepath.Join(dir, "baseline.json")

	candidate := `{"aggregate":{"weightedScore":0.7},"llmEvaluation":{"enabled":true,"aggregateScore":0.91},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.7},"latencyMs":12}]}`
	baseline := `{"aggregate":{"weightedScore":0.9},"llmEvaluation":{"enabled":true,"aggregateScore":0.89},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.9},"latencyMs":10}]}`

	if err := os.WriteFile(candidatePath, []byte(candidate), 0o600); err != nil {
		t.Fatalf("write candidate: %v", err)
	}
	if err := os.WriteFile(baselinePath, []byte(baseline), 0o600); err != nil {
		t.Fatalf("write baseline: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"eval", "compare", "--candidate", candidatePath, "--baseline", baselinePath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("eval compare: %v", err)
	}
	if !strings.Contains(out.String(), "candidate_score=0.910") || !strings.Contains(out.String(), "candidate_score_source=llm") {
		t.Fatalf("expected llm compare output, got %q", out.String())
	}
}

func TestEvalCompareFallsBackToHeuristicScoreWhenLLMAbsent(t *testing.T) {
	dir := t.TempDir()
	candidatePath := filepath.Join(dir, "candidate.json")
	baselinePath := filepath.Join(dir, "baseline.json")

	candidate := `{"aggregate":{"weightedScore":0.71},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.71},"latencyMs":12}]}`
	baseline := `{"aggregate":{"weightedScore":0.69},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.69},"latencyMs":10}]}`

	if err := os.WriteFile(candidatePath, []byte(candidate), 0o600); err != nil {
		t.Fatalf("write candidate: %v", err)
	}
	if err := os.WriteFile(baselinePath, []byte(baseline), 0o600); err != nil {
		t.Fatalf("write baseline: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"eval", "compare", "--candidate", candidatePath, "--baseline", baselinePath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("eval compare: %v", err)
	}
	if !strings.Contains(out.String(), "candidate_score=0.710") || !strings.Contains(out.String(), "candidate_score_source=heuristic") {
		t.Fatalf("expected heuristic compare output, got %q", out.String())
	}
}

func TestEvalCompareFailsOnMixedScoreSources(t *testing.T) {
	dir := t.TempDir()
	candidatePath := filepath.Join(dir, "candidate.json")
	baselinePath := filepath.Join(dir, "baseline.json")

	candidate := `{"aggregate":{"weightedScore":0.7},"llmEvaluation":{"enabled":true,"aggregateScore":0.91},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.7},"latencyMs":12}]}`
	baseline := `{"aggregate":{"weightedScore":0.9},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.9},"latencyMs":10}]}`

	if err := os.WriteFile(candidatePath, []byte(candidate), 0o600); err != nil {
		t.Fatalf("write candidate: %v", err)
	}
	if err := os.WriteFile(baselinePath, []byte(baseline), 0o600); err != nil {
		t.Fatalf("write baseline: %v", err)
	}

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "compare", "--candidate", candidatePath, "--baseline", baselinePath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected mismatch error")
	}
	if !strings.Contains(err.Error(), "score source mismatch") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEvalCompareFailsWhenLLMEnabledButAggregateMissing(t *testing.T) {
	dir := t.TempDir()
	candidatePath := filepath.Join(dir, "candidate.json")
	baselinePath := filepath.Join(dir, "baseline.json")

	candidate := `{"aggregate":{"weightedScore":0.7},"llmEvaluation":{"enabled":true,"skippedRuns":1},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.7},"latencyMs":12,"error":"translation failed"}]}`
	baseline := `{"aggregate":{"weightedScore":0.9},"runs":[{"experimentId":"exp","quality":{"weightedAggregate":0.9},"latencyMs":10}]}`

	if err := os.WriteFile(candidatePath, []byte(candidate), 0o600); err != nil {
		t.Fatalf("write candidate: %v", err)
	}
	if err := os.WriteFile(baselinePath, []byte(baseline), 0o600); err != nil {
		t.Fatalf("write baseline: %v", err)
	}

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"eval", "compare", "--candidate", candidatePath, "--baseline", baselinePath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "skipped due to translation errors") {
		t.Fatalf("unexpected error: %v", err)
	}
}
