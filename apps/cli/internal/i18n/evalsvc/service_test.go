package evalsvc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/quiet-circles/hyperlocalise/apps/cli/internal/i18n/evalset"
	"github.com/quiet-circles/hyperlocalise/apps/cli/internal/i18n/evalsvc/scoring"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

type fakeReferenceScorer struct{}

func (f fakeReferenceScorer) Name() string { return "reference" }
func (f fakeReferenceScorer) ScoreReference(_ context.Context, in ScoreInput) (float64, error) {
	if in.Case.Reference == "" {
		return 0, errors.New("missing reference")
	}
	if strings.EqualFold(strings.TrimSpace(in.Case.Reference), strings.TrimSpace(in.Translated)) {
		return 1, nil
	}
	return 0, nil
}

type fakeJudgeScorer struct{}

func (f fakeJudgeScorer) Name() string { return "judge" }

func scorePtr(v float64) *float64 { return &v }

func (f fakeJudgeScorer) ScoreJudge(_ context.Context, in ScoreInput) (JudgeResult, error) {
	if strings.Contains(in.Translated, "!") {
		return JudgeResult{Score: scorePtr(0.5), Rationale: "punctuation detected"}, nil
	}
	return JudgeResult{Score: scorePtr(0.25), Rationale: "default"}, nil
}

type fakeFailingJudgeScorer struct{}

func (f fakeFailingJudgeScorer) Name() string { return "judge" }
func (f fakeFailingJudgeScorer) ScoreJudge(_ context.Context, _ ScoreInput) (JudgeResult, error) {
	return JudgeResult{}, errors.New("judge failed")
}

type fakeEmptyJudgeScorer struct{}

func (f fakeEmptyJudgeScorer) Name() string { return "judge" }
func (f fakeEmptyJudgeScorer) ScoreJudge(_ context.Context, _ ScoreInput) (JudgeResult, error) {
	return JudgeResult{}, nil
}

type fakeSecondJudgeScorer struct{}

func (f fakeSecondJudgeScorer) Name() string { return "judge_two" }
func (f fakeSecondJudgeScorer) ScoreJudge(_ context.Context, _ ScoreInput) (JudgeResult, error) {
	return JudgeResult{Score: scorePtr(0.75), Rationale: "second judge"}, nil
}

type fakeStrongJudgeScorer struct{}

func (f fakeStrongJudgeScorer) Name() string { return "judge:factuality" }
func (f fakeStrongJudgeScorer) ScoreJudge(_ context.Context, _ ScoreInput) (JudgeResult, error) {
	return JudgeResult{Score: scorePtr(0.8), Rationale: "grounded"}, nil
}

func TestRunIsDeterministicWithSeed(t *testing.T) {
	svc := newTestService()
	input := Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default", "fast"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a"},
		Prompts:     []string{"prompt A"},
		Concurrency: 3,
		Seed:        99,
	}

	report1, err := svc.Run(context.Background(), input)
	if err != nil {
		t.Fatalf("run 1: %v", err)
	}
	report2, err := svc.Run(context.Background(), input)
	if err != nil {
		t.Fatalf("run 2: %v", err)
	}

	report1.GeneratedAt = time.Time{}
	report2.GeneratedAt = time.Time{}
	zeroLatency(report1.Runs)
	zeroLatency(report2.Runs)
	zeroCaseLatency(report1.CaseSummaries)
	zeroCaseLatency(report2.CaseSummaries)
	zeroExperimentLatency(report1.ExperimentSummaries)
	zeroExperimentLatency(report2.ExperimentSummaries)
	report1.Aggregate.AverageLatencyMS = 0
	report2.Aggregate.AverageLatencyMS = 0
	zeroAggregateBreakdownLatency(report1.Aggregate.ByLocale)
	zeroAggregateBreakdownLatency(report2.Aggregate.ByLocale)
	zeroAggregateBreakdownLatency(report1.Aggregate.ByBucket)
	zeroAggregateBreakdownLatency(report2.Aggregate.ByBucket)
	zeroAggregateBreakdownLatency(report1.Aggregate.ByTag)
	zeroAggregateBreakdownLatency(report2.Aggregate.ByTag)
	report1.Aggregate.WeightedScore = 0
	report2.Aggregate.WeightedScore = 0

	if !reflect.DeepEqual(report1, report2) {
		t.Fatalf("expected deterministic report for same seed")
	}
}

func TestRunAccountsForErrors(t *testing.T) {
	svc := newTestService()
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		if req.Source == "boom" {
			return "", errors.New("provider failed")
		}
		return strings.ToUpper(req.Source), nil
	}

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a"},
		Prompts:     []string{"prompt A"},
		Seed:        1,
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if report.Aggregate.TotalRuns != 2 {
		t.Fatalf("expected 2 runs, got %d", report.Aggregate.TotalRuns)
	}
	if report.Aggregate.SuccessfulRuns != 1 || report.Aggregate.FailedRuns != 1 {
		t.Fatalf("unexpected success/failure accounting: %+v", report.Aggregate)
	}

	seenErr := false
	for _, run := range report.Runs {
		if run.Error != "" {
			seenErr = true
		}
	}
	if !seenErr {
		t.Fatalf("expected at least one run error")
	}
}

func TestRunWithProgressEmitsPlannedStartedAndCompletedEvents(t *testing.T) {
	svc := newTestService()
	events := make([]ProgressEvent, 0)

	report, err := svc.RunWithProgress(context.Background(), Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a"},
		Prompts:     []string{"prompt A"},
	}, func(event ProgressEvent) {
		events = append(events, event)
	})
	if err != nil {
		t.Fatalf("run with progress: %v", err)
	}
	if report.Aggregate.TotalRuns != 2 {
		t.Fatalf("expected 2 total runs, got %d", report.Aggregate.TotalRuns)
	}
	if len(events) != 5 {
		t.Fatalf("expected planned + 2 started + 2 completed events, got %+v", events)
	}
	if events[0].Kind != ProgressEventPlanned || events[0].CaseCount != 2 || events[0].TotalRuns != 2 {
		t.Fatalf("unexpected planned event: %+v", events[0])
	}
	if len(events[0].ExperimentIDs) != 1 || events[0].ExperimentIDs[0] == "" {
		t.Fatalf("expected experiment ids in planned event, got %+v", events[0])
	}
	startedCount := 0
	completedCount := 0
	for _, event := range events[1:] {
		switch event.Kind {
		case ProgressEventRunStarted:
			startedCount++
			if event.Run == nil {
				t.Fatalf("expected started event run payload, got %+v", event)
			}
		case ProgressEventRunCompleted:
			completedCount++
			if event.Run == nil {
				t.Fatalf("expected completed event run payload, got %+v", event)
			}
		default:
			t.Fatalf("unexpected progress event: %+v", event)
		}
	}
	if startedCount != 2 || completedCount != 2 {
		t.Fatalf("expected 2 started and 2 completed events, got %+v", events)
	}
	last := events[len(events)-1]
	if last.Kind != ProgressEventRunCompleted || last.CompletedRuns != 2 {
		t.Fatalf("unexpected final completed event: %+v", last)
	}
	if last.SuccessfulRuns+last.FailedRuns != 2 {
		t.Fatalf("unexpected final progress counters: %+v", last)
	}
}

func TestRunAggregatesScorersAndPersistsReport(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "report.json")
	svc := newTestService()
	svc.WithReferenceScorers(fakeReferenceScorer{}).WithJudgeScorers(fakeJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai", "anthropic"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		OutputPath:   outputPath,
		EvalProvider: "openai",
		EvalModel:    "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if report.Aggregate.TotalRuns != 4 {
		t.Fatalf("expected 4 total runs, got %d", report.Aggregate.TotalRuns)
	}
	if report.Aggregate.AverageScoreByName["reference"] != 1 {
		t.Fatalf("unexpected reference aggregate score: %+v", report.Aggregate.AverageScoreByName)
	}
	if report.LLMEvaluation == nil || report.LLMEvaluation.AggregateScore == nil || *report.LLMEvaluation.AggregateScore != 0.25 {
		t.Fatalf("expected llm aggregate score, got %+v", report.LLMEvaluation)
	}
	if report.LLMEvaluation.AverageScoreByName["judge"] != 0.25 {
		t.Fatalf("unexpected llm judge aggregate score: %+v", report.LLMEvaluation)
	}
	if report.LLMEvaluation.Provider != "openai" || report.LLMEvaluation.Model != "gpt-4.1-mini" {
		t.Fatalf("unexpected llm metadata: %+v", report.LLMEvaluation)
	}
	for _, run := range report.Runs {
		if _, ok := run.JudgeResults["judge"]; !ok {
			t.Fatalf("expected judge results on each run: %+v", run)
		}
	}
	if len(report.CaseSummaries) != 2 {
		t.Fatalf("expected 2 case summaries, got %d", len(report.CaseSummaries))
	}
	if len(report.ExperimentSummaries) != 2 {
		t.Fatalf("expected 2 experiment summaries, got %d", len(report.ExperimentSummaries))
	}

	if len(svc.writes) != 1 || svc.writes[0] != outputPath {
		t.Fatalf("expected report written once to output path, got %+v", svc.writes)
	}
}

func TestRunJudgeScoringDisabledByDefault(t *testing.T) {
	svc := newTestService()
	svc.WithJudgeScorers(fakeJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a"},
		Prompts:     []string{"prompt A"},
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	for _, run := range report.Runs {
		if _, ok := run.Scores["judge"]; ok {
			t.Fatalf("expected judge scorer to be disabled by default")
		}
		if len(run.JudgeResults) > 0 {
			t.Fatalf("expected judge results to be disabled by default")
		}
	}
}

func TestRunCreatesOutputDirectoryWhenMissing(t *testing.T) {
	svc := newTestService()
	outputPath := filepath.Join("artifacts", "nested", "report.json")

	_, err := svc.Run(context.Background(), Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a"},
		Prompts:     []string{"prompt A"},
		OutputPath:  outputPath,
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if len(svc.dirs) != 1 || svc.dirs[0] != filepath.Join("artifacts", "nested") {
		t.Fatalf("expected output directory creation, got %+v", svc.dirs)
	}
	if len(svc.writes) != 1 || svc.writes[0] != outputPath {
		t.Fatalf("expected report write after mkdir, got %+v", svc.writes)
	}
}

func TestRunAllowsMissingReferenceInLLMMode(t *testing.T) {
	svc := newTestService()
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		return &evalset.Dataset{Cases: []evalset.Case{{ID: "a", Source: "hello", TargetLocale: "fr"}}}, nil
	}
	svc.WithJudgeScorers(fakeJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.LLMEvaluation == nil || report.LLMEvaluation.AggregateScore == nil {
		t.Fatalf("expected llm evaluation aggregate: %+v", report.LLMEvaluation)
	}
}

func TestRunRecordsJudgeFailuresWithoutFailingReport(t *testing.T) {
	svc := newTestService()
	svc.WithJudgeScorers(fakeFailingJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.LLMEvaluation == nil {
		t.Fatalf("expected llm evaluation metadata")
	}
	if report.LLMEvaluation.AggregateScore != nil {
		t.Fatalf("expected no aggregate score on total judge failure: %+v", report.LLMEvaluation)
	}
	if report.LLMEvaluation.FailedJudges != len(report.Runs) {
		t.Fatalf("expected failed judge count to match runs: %+v", report.LLMEvaluation)
	}
	for _, run := range report.Runs {
		if run.JudgeResults["judge"].Error == "" {
			t.Fatalf("expected judge failure recorded on run: %+v", run)
		}
	}
}

func TestRunNormalizesEmptyJudgeResultToFailure(t *testing.T) {
	svc := newTestService()
	svc.WithJudgeScorers(fakeEmptyJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.LLMEvaluation == nil {
		t.Fatalf("expected llm evaluation metadata")
	}
	if report.LLMEvaluation.FailedJudges != len(report.Runs) {
		t.Fatalf("expected empty judge results counted as failures: %+v", report.LLMEvaluation)
	}
	for _, run := range report.Runs {
		if got := run.JudgeResults["judge"].Error; got != "judge returned no score" {
			t.Fatalf("expected normalized judge error, got %+v", run)
		}
	}
}

func TestRunTracksSkippedRunsWhenTranslationFailsInLLMMode(t *testing.T) {
	svc := newTestService()
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		if req.Source == "boom" {
			return "", errors.New("provider failed")
		}
		return strings.ToUpper(req.Source), nil
	}
	svc.WithJudgeScorers(fakeJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.LLMEvaluation == nil {
		t.Fatalf("expected llm evaluation metadata")
	}
	if report.LLMEvaluation.SkippedRuns != 1 {
		t.Fatalf("expected 1 skipped run, got %+v", report.LLMEvaluation)
	}
	if report.LLMEvaluation.SuccessfulJudges != 1 || report.LLMEvaluation.FailedJudges != 0 {
		t.Fatalf("unexpected llm counters: %+v", report.LLMEvaluation)
	}
	if report.LLMEvaluation.AggregateScore == nil || *report.LLMEvaluation.AggregateScore != 0.25 {
		t.Fatalf("expected llm aggregate score from successful run, got %+v", report.LLMEvaluation)
	}
}

func TestAggregateLLMEvaluationCountsJudgeCallsAcrossScorers(t *testing.T) {
	svc := newTestService()
	svc.WithJudgeScorers(fakeJudgeScorer{}, fakeSecondJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.LLMEvaluation == nil {
		t.Fatalf("expected llm evaluation metadata")
	}
	if report.LLMEvaluation.SuccessfulJudges != len(report.Runs)*2 {
		t.Fatalf("expected judge call count across scorers, got %+v", report.LLMEvaluation)
	}
}

func TestInputValidateAllowsPartialEvalConfigForDefaults(t *testing.T) {
	if err := (Input{EvalSetPath: "set.json", EvalProvider: "openai"}).Validate(); err != nil {
		t.Fatalf("expected provider-only eval config to be allowed, got %v", err)
	}
}

func TestInputValidateAllowsEvalPromptWithoutProviderAndModel(t *testing.T) {
	if err := (Input{EvalSetPath: "set.json", EvalPrompt: "judge this"}).Validate(); err != nil {
		t.Fatalf("expected eval prompt-only config to be allowed, got %v", err)
	}
}

func TestInputValidateAllowsAssertionsWithoutProviderAndModel(t *testing.T) {
	if err := (Input{EvalSetPath: "set.json", Assertions: []string{AssertionLLMRubric}}).Validate(); err != nil {
		t.Fatalf("expected assertion-only config to be allowed, got %v", err)
	}
}

func TestInputValidateRejectsUnknownAssertions(t *testing.T) {
	err := (Input{
		EvalSetPath:  "set.json",
		EvalProvider: "openai",
		EvalModel:    "judge-model",
		Assertions:   []string{"llm-rubirc"},
	}).Validate()
	if err == nil || !strings.Contains(err.Error(), "unsupported --assertion") {
		t.Fatalf("expected unsupported assertion validation error, got %v", err)
	}
}

func TestAggregateLLMEvaluationDeterministic(t *testing.T) {
	in := Input{EvalSetPath: "set.json", EvalProvider: "openai", EvalModel: "judge-model"}
	runs := []RunResult{
		{JudgeResults: map[string]JudgeResult{"judge": {Score: scorePtr(0.2)}}},
		{JudgeResults: map[string]JudgeResult{"judge": {Score: scorePtr(0.4)}}},
		{JudgeResults: map[string]JudgeResult{"judge": {Error: "boom"}}},
		{Error: "translation failed"},
	}
	got := aggregateLLMEvaluation(in, runs, nil)
	if got == nil || got.AggregateScore == nil || *got.AggregateScore != 0.3 {
		t.Fatalf("unexpected llm aggregate: %+v", got)
	}
	if got.SuccessfulJudges != 2 || got.FailedJudges != 1 || got.SkippedRuns != 1 {
		t.Fatalf("unexpected llm counters: %+v", got)
	}
}

func TestAggregateLLMEvaluationIncludesOnlyConfiguredAndRequiredAssertions(t *testing.T) {
	in := Input{EvalSetPath: "set.json", EvalProvider: "openai", EvalModel: "judge-model"}
	cases := []evalset.Case{{
		ID:         "a",
		Assertions: []evalset.Assertion{{Type: "judge.factuality"}},
	}}
	got := aggregateLLMEvaluation(in, nil, prepareCases(cases))
	if got == nil {
		t.Fatalf("expected llm evaluation payload")
	}
	want := []string{AssertionFactuality}
	if len(got.Assertions) != len(want) || got.Assertions[0] != want[0] {
		t.Fatalf("expected required test-level assertions only, got %+v", got.Assertions)
	}
}

func TestAggregateLLMEvaluationUsesDefaultAssertionWhenNoneConfigured(t *testing.T) {
	in := Input{EvalSetPath: "set.json", EvalProvider: "openai", EvalModel: "judge-model"}
	got := aggregateLLMEvaluation(in, nil, nil)
	if got == nil {
		t.Fatalf("expected llm evaluation payload")
	}
	want := []string{AssertionLLMRubric}
	if len(got.Assertions) != len(want) || got.Assertions[0] != want[0] {
		t.Fatalf("expected default llm-rubric assertion when none configured, got %+v", got.Assertions)
	}
}

func TestAggregateRunsIncludesBreakdownsAndCalibratedFinalScore(t *testing.T) {
	svc := newTestService()
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		return &evalset.Dataset{Cases: []evalset.Case{
			{ID: "a", Source: "Save account settings", TargetLocale: "fr-FR", Reference: "Enregistrer les parametres du compte"},
			{ID: "b", Source: "Product docs", TargetLocale: "de-DE", Reference: "Produktdokumentation"},
		}}, nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		switch req.Source {
		case "Save account settings":
			return "Enregistrer les parametres du compte", nil
		case "Product docs":
			return "Produktdokumentation", nil
		default:
			return req.Source, nil
		}
	}
	svc.WithJudgeScorers(fakeStrongJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.json",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Aggregate.AverageJudgeScore == nil || *report.Aggregate.AverageJudgeScore != 0.8 {
		t.Fatalf("expected aggregate judge score, got %+v", report.Aggregate)
	}
	if report.Aggregate.FinalScore != 0.93 {
		t.Fatalf("expected calibrated final score 0.93, got %+v", report.Aggregate.FinalScore)
	}
	if report.Aggregate.DecisionCounts["pass"] != 2 {
		t.Fatalf("expected pass decision counts, got %+v", report.Aggregate.DecisionCounts)
	}
	if report.Aggregate.ByLocale["fr-FR"].TotalRuns != 1 || report.Aggregate.ByLocale["de-DE"].TotalRuns != 1 {
		t.Fatalf("expected locale breakdowns, got %+v", report.Aggregate.ByLocale)
	}
	if len(report.CaseSummaries) != 2 || report.CaseSummaries[0].AverageJudgeScore == nil {
		t.Fatalf("expected case summaries with judge scores, got %+v", report.CaseSummaries)
	}
	if len(report.ExperimentSummaries) != 1 || report.ExperimentSummaries[0].AverageJudgeScore == nil {
		t.Fatalf("expected experiment summaries with judge scores, got %+v", report.ExperimentSummaries)
	}
	if report.ExperimentSummaries[0].AverageScoreByName["judge:factuality"] != 0.8 {
		t.Fatalf("expected experiment summary assertion average, got %+v", report.ExperimentSummaries[0].AverageScoreByName)
	}
}

func TestNormalizeEvalInputDefaultsJudgeModelToOpenAIGPT52(t *testing.T) {
	got := normalizeEvalInput(Input{
		EvalSetPath: "set.yaml",
		Assertions:  []string{AssertionLLMRubric},
	}, &evalset.Dataset{})
	if got.EvalProvider != "openai" || got.EvalModel != "gpt-5.2" {
		t.Fatalf("expected default judge config openai/gpt-5.2, got %+v", got)
	}
}

func TestNormalizeEvalInputHandlesNilDataset(t *testing.T) {
	got := normalizeEvalInput(Input{
		EvalSetPath: "set.yaml",
		Assertions:  []string{AssertionLLMRubric},
	}, nil)
	if got.EvalProvider != "openai" || got.EvalModel != "gpt-5.2" {
		t.Fatalf("expected default judge config with nil dataset, got %+v", got)
	}
}

func TestNormalizeEvalInputUsesDatasetJudgeConfig(t *testing.T) {
	got := normalizeEvalInput(Input{
		EvalSetPath: "set.yaml",
	}, &evalset.Dataset{
		Judge: evalset.Judge{
			Provider:   "anthropic",
			Model:      "claude-sonnet-4-5",
			Prompt:     "Judge carefully.",
			Assertions: []string{"factuality"},
		},
	})
	if got.EvalProvider != "anthropic" || got.EvalModel != "claude-sonnet-4-5" || got.EvalPrompt != "Judge carefully." {
		t.Fatalf("expected dataset judge config, got %+v", got)
	}
	if len(got.Assertions) != 1 || got.Assertions[0] != "factuality" {
		t.Fatalf("expected dataset judge assertions, got %+v", got.Assertions)
	}
}

func TestNormalizeEvalInputCanonicalizesDatasetJudgeAssertions(t *testing.T) {
	got := normalizeEvalInput(Input{
		EvalSetPath: "set.yaml",
	}, &evalset.Dataset{
		Judge: evalset.Judge{
			Assertions: []string{"llm_rubric", "judge.factuality", "g_eval"},
		},
	})
	want := []string{AssertionLLMRubric, AssertionFactuality, AssertionGEval}
	if len(got.Assertions) != len(want) {
		t.Fatalf("expected canonical dataset judge assertions, got %+v", got.Assertions)
	}
	for i := range want {
		if got.Assertions[i] != want[i] {
			t.Fatalf("expected canonical dataset judge assertions %v, got %+v", want, got.Assertions)
		}
	}
}

func TestNormalizeEvalInputCLIOverridesDatasetJudgeConfig(t *testing.T) {
	got := normalizeEvalInput(Input{
		EvalSetPath:  "set.yaml",
		EvalProvider: "openai",
		Assertions:   []string{"g-eval"},
	}, &evalset.Dataset{
		Judge: evalset.Judge{
			Provider:   "anthropic",
			Model:      "claude-sonnet-4-5",
			Prompt:     "Judge carefully.",
			Assertions: []string{"factuality"},
		},
	})
	if got.EvalProvider != "openai" {
		t.Fatalf("expected CLI provider to win, got %+v", got)
	}
	if got.EvalModel != "claude-sonnet-4-5" {
		t.Fatalf("expected dataset model to fill missing CLI model, got %+v", got)
	}
	if len(got.Assertions) != 1 || got.Assertions[0] != "g-eval" {
		t.Fatalf("expected CLI assertions to win, got %+v", got.Assertions)
	}
}

func TestRunUsesDefaultJudgeModelWhenAssertionsRequested(t *testing.T) {
	svc := newTestService()
	svc.WithJudgeScorers(fakeJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath: "unused.yaml",
		Assertions:  []string{AssertionLLMRubric},
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Input.EvalProvider != "openai" || report.Input.EvalModel != "gpt-5.2" {
		t.Fatalf("expected normalized judge config in report input, got %+v", report.Input)
	}
	if report.LLMEvaluation == nil || report.LLMEvaluation.Provider != "openai" || report.LLMEvaluation.Model != "gpt-5.2" {
		t.Fatalf("expected default judge metadata, got %+v", report.LLMEvaluation)
	}
}

func TestRunUsesDatasetJudgeConfigWhenPresent(t *testing.T) {
	svc := newTestService()
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		return &evalset.Dataset{
			Judge: evalset.Judge{
				Provider:   "openai",
				Model:      "gpt-5.2",
				Assertions: []string{AssertionLLMRubric},
			},
			Cases: []evalset.Case{
				{ID: "a", Source: "hello", TargetLocale: "fr", Reference: "HELLO"},
			},
		}, nil
	}
	svc.WithJudgeScorers(fakeJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath: "unused.yaml",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Input.EvalProvider != "openai" || report.Input.EvalModel != "gpt-5.2" {
		t.Fatalf("expected dataset judge config in report input, got %+v", report.Input)
	}
	if report.LLMEvaluation == nil || report.LLMEvaluation.Provider != "openai" || report.LLMEvaluation.Model != "gpt-5.2" {
		t.Fatalf("expected dataset judge metadata, got %+v", report.LLMEvaluation)
	}
}

func TestInputJSONOmitsUnsetJudgeFieldsAndUsesJSONNames(t *testing.T) {
	content, err := json.Marshal(Input{EvalSetPath: "set.yaml"})
	if err != nil {
		t.Fatalf("marshal input: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, `"evalSetPath":"set.yaml"`) {
		t.Fatalf("expected json field name evalSetPath, got %s", text)
	}
	if strings.Contains(text, "EvalProvider") || strings.Contains(text, `"evalProvider":""`) || strings.Contains(text, `"assertions":null`) {
		t.Fatalf("expected unset judge fields to be omitted, got %s", text)
	}
}

func TestSummarizeExperimentsAggregatesByExperimentID(t *testing.T) {
	score := 0.8
	summaries := summarizeExperiments([]RunResult{
		{
			ExperimentID:        "exp-a",
			LatencyMS:           10,
			Scores:              map[string]float64{"reference": 1},
			JudgeResults:        map[string]JudgeResult{"judge:factuality": {Score: &score}},
			JudgeAggregateScore: &score,
			Quality:             scoring.Result{WeightedAggregate: 0.9, HardFails: []string{scoring.HardFailPlaceholderDrop}},
			FinalScore:          0.85,
			Decision:            "pass",
		},
		{
			ExperimentID: "exp-a",
			LatencyMS:    20,
			Scores:       map[string]float64{"reference": 0.5},
			Quality:      scoring.Result{WeightedAggregate: 0.7},
			FinalScore:   0.7,
			Decision:     "review",
			Error:        "boom",
		},
		{
			ExperimentID: "exp-b",
			LatencyMS:    15,
			Quality:      scoring.Result{WeightedAggregate: 0.6},
			FinalScore:   0.6,
			Decision:     "pass",
		},
	})
	if len(summaries) != 2 {
		t.Fatalf("expected 2 experiment summaries, got %+v", summaries)
	}
	if summaries[0].ExperimentID != "exp-a" || summaries[0].RunCount != 2 || summaries[0].SuccessfulRuns != 1 || summaries[0].FailedRuns != 1 {
		t.Fatalf("unexpected exp-a summary: %+v", summaries[0])
	}
	if summaries[0].AverageJudgeScore == nil || *summaries[0].AverageJudgeScore != 0.8 {
		t.Fatalf("expected exp-a judge summary, got %+v", summaries[0])
	}
	if summaries[0].AverageScoreByName["judge:factuality"] != 0.8 {
		t.Fatalf("expected exp-a assertion average, got %+v", summaries[0].AverageScoreByName)
	}
	if summaries[0].HardFailCounts[scoring.HardFailPlaceholderDrop] != 1 {
		t.Fatalf("expected exp-a placeholder hard fail count, got %+v", summaries[0].HardFailCounts)
	}
	if summaries[1].ExperimentID != "exp-b" || summaries[1].RunCount != 1 {
		t.Fatalf("unexpected exp-b summary: %+v", summaries[1])
	}
}

func TestRunAppliesDeterministicAssertions(t *testing.T) {
	svc := newTestService()
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		return &evalset.Dataset{Cases: []evalset.Case{
			{
				ID:           "a",
				Source:       "Save account settings",
				TargetLocale: "fr-FR",
				Assertions: []evalset.Assertion{
					{Type: "contains", Value: "parametres"},
					{Type: "not_contains", Value: "legacy-login"},
				},
			},
		}}, nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		return "Enregistrer les parametres du compte", nil
	}

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.yaml",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if len(report.Runs) != 1 || len(report.Runs[0].AssertionResults) != 2 {
		t.Fatalf("expected assertion results, got %+v", report.Runs)
	}
	for _, result := range report.Runs[0].AssertionResults {
		if !result.Passed {
			t.Fatalf("expected deterministic assertions to pass, got %+v", report.Runs[0].AssertionResults)
		}
	}
}

func TestRunFailsOnAssertionThresholdMiss(t *testing.T) {
	svc := newTestService()
	threshold := 0.9
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		return &evalset.Dataset{Cases: []evalset.Case{
			{
				ID:           "a",
				Source:       "Save account settings",
				TargetLocale: "fr-FR",
				Assertions: []evalset.Assertion{
					{Type: "judge.factuality", Threshold: &threshold},
				},
			},
		}}, nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		return "Enregistrer les parametres du compte", nil
	}
	svc.WithJudgeScorers(fakeStrongJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.yaml",
		Profiles:     []string{"default"},
		Providers:    []string{"openai"},
		Models:       []string{"model-a"},
		Prompts:      []string{"prompt A"},
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Runs[0].Decision != "fail" || report.Runs[0].FinalScore != 0 {
		t.Fatalf("expected assertion threshold miss to fail run, got %+v", report.Runs[0])
	}
}

func TestRunTreatsAssertionErrorsAsReviewNotFailure(t *testing.T) {
	svc := newTestService()
	threshold := 0.7
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		return &evalset.Dataset{Cases: []evalset.Case{
			{
				ID:           "a",
				Source:       "Save account settings",
				TargetLocale: "fr-FR",
				Reference:    "Enregistrer les parametres du compte",
				Assertions: []evalset.Assertion{
					{Type: "judge.factuality", Threshold: &threshold},
				},
			},
		}}, nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		return "Enregistrer les parametres du compte", nil
	}
	svc.WithJudgeScorers(fakeFailingJudgeScorer{})

	report, err := svc.Run(context.Background(), Input{
		EvalSetPath:  "unused.yaml",
		EvalProvider: "openai",
		EvalModel:    "judge-model",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Runs[0].Decision != "review" {
		t.Fatalf("expected assertion error to downgrade to review, got %+v", report.Runs[0])
	}
	if report.Runs[0].FinalScore == 0 {
		t.Fatalf("expected assertion error to preserve calibrated score, got %+v", report.Runs[0])
	}
	if len(report.Runs[0].AssertionResults) != 1 || report.Runs[0].AssertionResults[0].Error == "" {
		t.Fatalf("expected assertion error to be recorded, got %+v", report.Runs[0].AssertionResults)
	}
}

func TestAggregateRunsTracksJudgeFailureModesByAssertion(t *testing.T) {
	agg := aggregateRuns([]RunResult{
		{Decision: "review", JudgeResults: map[string]JudgeResult{"judge:factuality": {Error: "bad schema"}}},
		{Decision: "fail", JudgeResults: map[string]JudgeResult{"judge:g-eval": {Error: "timeout"}}},
	})
	if agg.JudgeFailureCounts["judge:factuality"] != 1 || agg.JudgeFailureCounts["judge:g-eval"] != 1 {
		t.Fatalf("expected assertion-scoped judge failure counts, got %+v", agg.JudgeFailureCounts)
	}
}

func TestParseJudgeResult(t *testing.T) {
	got, err := parseJudgeResult("```json\n{\"score\":0.83,\"rationale\":\"good\"}\n```")
	if err != nil {
		t.Fatalf("parse judge result: %v", err)
	}
	if got.Score == nil || *got.Score != 0.83 || got.Rationale != "good" {
		t.Fatalf("unexpected parsed judge result: %+v", got)
	}
}

func TestParseJudgeResultWithTrailingBraces(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantScore float64
		wantErr   bool
	}{
		{
			name:      "trailing text with extra closing braces",
			input:     `{"score":0.8,"rationale":"good"} some text }}`,
			wantScore: 0.8,
			wantErr:   false,
		},
		{
			name:      "markdown code block with trailing braces",
			input:     "```json\n{\"score\":0.75,\"rationale\":\"ok\"}\n```\n\nSome explanation }\n}",
			wantScore: 0.75,
			wantErr:   false,
		},
		{
			name:      "json followed by multiple closing braces",
			input:     `{"score":0.5,"rationale":"average"}}}}`,
			wantScore: 0.5,
			wantErr:   false,
		},
		{
			name:      "nested braces in string value with trailing braces",
			input:     `{"score":0.9,"rationale":"{\"nested\":true} is good"} extra }}}`,
			wantScore: 0.9,
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseJudgeResult(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseJudgeResult() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if got.Score == nil || *got.Score != tt.wantScore {
					t.Fatalf("parseJudgeResult() = %+v, want score %.2f", got, tt.wantScore)
				}
			}
		})
	}
}

func TestLLMJudgeScorerUsesOriginalSourceAndCustomPrompt(t *testing.T) {
	var gotReq translator.Request
	scorer := NewLLMJudgeScorer("openai", "gpt-4.1-mini", "judge prompt", func(_ context.Context, req translator.Request) (string, error) {
		gotReq = req
		return `{"score":0.8,"rationale":"ok"}`, nil
	})

	result, err := scorer.ScoreJudge(context.Background(), ScoreInput{
		Case: evalset.Case{
			Source:       "Hello",
			TargetLocale: "fr",
			Context:      "homepage headline",
			Reference:    "Bonjour",
		},
		Translated: "Salut",
	})
	if err != nil {
		t.Fatalf("score judge: %v", err)
	}
	if gotReq.Source != "Hello" {
		t.Fatalf("expected original source in request, got %+v", gotReq)
	}
	if !strings.Contains(gotReq.UserPrompt, "Candidate translation:\nSalut") {
		t.Fatalf("expected candidate translation in user prompt, got %q", gotReq.UserPrompt)
	}
	if strings.Contains(gotReq.UserPrompt, "Shared context:") {
		t.Fatalf("expected eval context to be system-only, got user prompt %q", gotReq.UserPrompt)
	}
	if !strings.Contains(gotReq.SystemPrompt, "judge prompt") {
		t.Fatalf("expected custom judge system prompt, got %q", gotReq.SystemPrompt)
	}
	if !strings.Contains(gotReq.SystemPrompt, "Write the rationale in English.") {
		t.Fatalf("expected english rationale instruction, got %q", gotReq.SystemPrompt)
	}
	if !strings.Contains(gotReq.SystemPrompt, "Eval case context:") || !strings.Contains(gotReq.SystemPrompt, "homepage headline") {
		t.Fatalf("expected eval context in system prompt, got %q", gotReq.SystemPrompt)
	}
	if result.Score == nil || *result.Score != 0.8 {
		t.Fatalf("unexpected judge result: %+v", result)
	}
}

func TestLLMJudgeScorerSanitizesEvalCaseContextInSystemPrompt(t *testing.T) {
	var gotReq translator.Request
	longCtx := strings.Repeat("界", maxEvalCaseContextLen+10)
	scorer := NewLLMJudgeScorer("openai", "gpt-4.1-mini", "judge prompt", func(_ context.Context, req translator.Request) (string, error) {
		gotReq = req
		return `{"score":0.8,"rationale":"ok"}`, nil
	})

	_, err := scorer.ScoreJudge(context.Background(), ScoreInput{
		Case: evalset.Case{
			Source:       "Hello",
			TargetLocale: "fr",
			Context:      "  line1\n" + longCtx + "\rline2  ",
		},
		Translated: "Salut",
	})
	if err != nil {
		t.Fatalf("score judge: %v", err)
	}
	if strings.Contains(gotReq.SystemPrompt, "\r") || strings.Contains(gotReq.SystemPrompt, "\nline2") {
		t.Fatalf("expected sanitized eval context in system prompt, got %q", gotReq.SystemPrompt)
	}
	parts := strings.SplitN(gotReq.SystemPrompt, "Eval case context:\n", 2)
	if len(parts) != 2 {
		t.Fatalf("expected eval case context section in system prompt, got %q", gotReq.SystemPrompt)
	}
	if len([]rune(parts[1])) > maxEvalCaseContextLen {
		t.Fatalf("expected eval context to be capped at %d runes, got %d", maxEvalCaseContextLen, len([]rune(parts[1])))
	}
}

type testService struct {
	*Service
	writes []string
	dirs   []string
}

func newTestService() *testService {
	now := time.Unix(1700000000, 0).UTC()
	dataset := &evalset.Dataset{Cases: []evalset.Case{
		{ID: "a", Source: "hello", TargetLocale: "fr", Reference: "HELLO"},
		{ID: "b", Source: "boom", TargetLocale: "fr", Reference: "BOOM"},
	}}

	t := &testService{}
	t.Service = &Service{
		loadEvalset: func(_ string) (*evalset.Dataset, error) {
			return dataset, nil
		},
		translate: func(_ context.Context, req translator.Request) (string, error) {
			return strings.ToUpper(req.Source), nil
		},
		writeFile: func(path string, _ []byte, _ os.FileMode) error {
			t.writes = append(t.writes, path)
			return nil
		},
		mkdirAll: func(path string, _ os.FileMode) error {
			t.dirs = append(t.dirs, path)
			return nil
		},
		now:    func() time.Time { return now },
		numCPU: func() int { return 2 },
	}

	return t
}

func TestBuildExperimentsUsesCartesianProduct(t *testing.T) {
	experiments, err := buildExperiments(Input{
		Profiles:  []string{"p1", "p2"},
		Providers: []string{"openai", "anthropic"},
		Models:    []string{"m1"},
		Prompts:   []string{"x", "y"},
	}, nil)
	if err != nil {
		t.Fatalf("build experiments: %v", err)
	}
	if len(experiments) != 8 {
		t.Fatalf("expected 8 experiments, got %d", len(experiments))
	}
	if experiments[0].id == "" {
		t.Fatalf("expected experiment IDs to be populated")
	}
}

func TestBuildExperimentsUsesDatasetExperimentsWhenCLIUnset(t *testing.T) {
	dataset := &evalset.Dataset{
		Experiments: []evalset.Experiment{
			{ID: "openai-mini", Provider: "openai", Model: "gpt-4.1-mini", Prompt: "p1"},
			{Provider: "anthropic", Model: "claude-sonnet-4-5"},
		},
	}
	experiments, err := buildExperiments(Input{}, dataset)
	if err != nil {
		t.Fatalf("build experiments: %v", err)
	}
	if len(experiments) != 2 {
		t.Fatalf("expected 2 dataset experiments, got %d", len(experiments))
	}
	if experiments[0].id != "openai-mini" {
		t.Fatalf("expected explicit experiment id, got %+v", experiments[0])
	}
	if experiments[1].profile != "default" || experiments[1].prompt == "" {
		t.Fatalf("expected defaults for missing dataset experiment fields, got %+v", experiments[1])
	}
}

func TestBuildExperimentsCLIOverridesDatasetExperiments(t *testing.T) {
	dataset := &evalset.Dataset{
		Experiments: []evalset.Experiment{
			{ID: "openai-mini", Provider: "openai", Model: "gpt-4.1-mini"},
		},
	}
	experiments, err := buildExperiments(Input{
		Providers: []string{"anthropic"},
		Models:    []string{"claude-sonnet-4-5"},
	}, dataset)
	if err != nil {
		t.Fatalf("build experiments: %v", err)
	}
	if len(experiments) != 1 {
		t.Fatalf("expected CLI to define the experiment set, got %d", len(experiments))
	}
	if experiments[0].provider != "anthropic" || experiments[0].model != "claude-sonnet-4-5" {
		t.Fatalf("expected CLI experiments to win, got %+v", experiments[0])
	}
}

func TestResolveWorkerCount(t *testing.T) {
	if got := resolveWorkerCount(5, func() int { return 1 }); got != 5 {
		t.Fatalf("expected explicit worker count, got %d", got)
	}
	if got := resolveWorkerCount(0, func() int { return 0 }); got != 1 {
		t.Fatalf("expected fallback to 1, got %d", got)
	}
}

func TestExecuteSingleCapturesArtifacts(t *testing.T) {
	var gotReq translator.Request
	svc := &Service{translate: func(_ context.Context, req translator.Request) (string, error) {
		gotReq = req
		return fmt.Sprintf("%s->%s", req.Source, req.TargetLanguage), nil
	}, qualityEvaluator: scoring.NewEvaluator()}

	run := svc.executeSingle(context.Background(), preparedCase{Case: evalset.Case{ID: "case-1", Source: "hello", TargetLocale: "fr"}}, experiment{
		id:       "exp-1",
		profile:  "default",
		provider: "openai",
		model:    "m1",
		prompt:   "p1",
	}, nil, nil)

	if run.Translated == "" || run.LatencyMS < 0 {
		t.Fatalf("expected translation artifacts, got %+v", run)
	}
	if run.Profile != "default" || run.Provider != "openai" || run.Model != "m1" || run.Prompt != "p1" {
		t.Fatalf("expected experiment identifiers to be captured, got %+v", run)
	}
	if gotReq.SystemPrompt != "p1" {
		t.Fatalf("expected eval experiment prompt routed to system prompt, got %q", gotReq.SystemPrompt)
	}
	if gotReq.UserPrompt != "" {
		t.Fatalf("expected no custom eval user prompt by default, got %q", gotReq.UserPrompt)
	}
}

func TestExecuteSingleSanitizesEvalCaseContextInSystemPrompt(t *testing.T) {
	var gotReq translator.Request
	longCtx := strings.Repeat("界", maxEvalCaseContextLen+15)
	svc := &Service{translate: func(_ context.Context, req translator.Request) (string, error) {
		gotReq = req
		return req.Source, nil
	}, qualityEvaluator: scoring.NewEvaluator()}

	_ = svc.executeSingle(context.Background(), preparedCase{
		Case: evalset.Case{
			ID:           "case-1",
			Source:       "hello",
			TargetLocale: "fr",
			Context:      "  ctx-a\n" + longCtx + "\rctx-b ",
		},
		sanitizedContext: sanitizeEvalCaseContext("  ctx-a\n" + longCtx + "\rctx-b "),
	}, experiment{
		id:       "exp-1",
		profile:  "default",
		provider: "openai",
		model:    "m1",
		prompt:   "p1",
	}, nil, nil)

	if strings.Contains(gotReq.SystemPrompt, "\r") || strings.Contains(gotReq.SystemPrompt, "\nctx-b") {
		t.Fatalf("expected sanitized eval context in executeSingle system prompt, got %q", gotReq.SystemPrompt)
	}
	parts := strings.SplitN(gotReq.SystemPrompt, "Eval case context (do not translate or repeat):\n", 2)
	if len(parts) != 2 {
		t.Fatalf("expected eval context section in executeSingle system prompt, got %q", gotReq.SystemPrompt)
	}
	if len([]rune(parts[1])) > maxEvalCaseContextLen {
		t.Fatalf("expected eval context to be capped at %d runes, got %d", maxEvalCaseContextLen, len([]rune(parts[1])))
	}
}

func TestSharedAccumulatorKeepsAggregateAndSummaryMathAligned(t *testing.T) {
	judgeA := 0.8
	judgeB := 0.4
	runs := []RunResult{
		{
			CaseID:              "case-a",
			TargetLocale:        "fr-FR",
			ExperimentID:        "exp-1",
			LatencyMS:           10,
			Scores:              map[string]float64{"reference": 1},
			JudgeResults:        map[string]JudgeResult{"judge:factuality": {Score: &judgeA}},
			JudgeAggregateScore: &judgeA,
			Quality:             scoring.Result{WeightedAggregate: 0.9, HardFails: []string{scoring.HardFailPlaceholderDrop}},
			FinalScore:          0.85,
			Decision:            "pass",
		},
		{
			CaseID:       "case-a",
			TargetLocale: "fr-FR",
			ExperimentID: "exp-2",
			LatencyMS:    30,
			Scores:       map[string]float64{"reference": 0.5},
			JudgeResults: map[string]JudgeResult{"judge:factuality": {Error: "timeout"}},
			Quality:      scoring.Result{WeightedAggregate: 0.6},
			FinalScore:   0.4,
			Decision:     "review",
			Error:        "boom",
		},
		{
			CaseID:              "case-b",
			TargetLocale:        "de-DE",
			ExperimentID:        "exp-1",
			LatencyMS:           20,
			JudgeResults:        map[string]JudgeResult{"judge:factuality": {Score: &judgeB}},
			JudgeAggregateScore: &judgeB,
			Quality:             scoring.Result{WeightedAggregate: 0.7},
			FinalScore:          0.65,
			Decision:            "review",
		},
	}

	agg := aggregateRuns(runs)
	if agg.TotalRuns != 3 || agg.SuccessfulRuns != 2 || agg.FailedRuns != 1 {
		t.Fatalf("unexpected aggregate counters: %+v", agg)
	}
	if agg.AverageScoreByName["reference"] != 0.75 || agg.AverageScoreByName["judge:factuality"] != 0.6 {
		t.Fatalf("unexpected aggregate averages: %+v", agg.AverageScoreByName)
	}
	if !reflect.DeepEqual(agg.ByLocale["fr-FR"], aggregateBreakdown(runs[:2])) {
		t.Fatalf("expected locale breakdown to match shared accumulator output, got %+v", agg.ByLocale["fr-FR"])
	}
	if !reflect.DeepEqual(agg.ByLocale["de-DE"], aggregateBreakdown(runs[2:])) {
		t.Fatalf("expected locale breakdown to match shared accumulator output, got %+v", agg.ByLocale["de-DE"])
	}

	caseSummaries := summarizeCases(runs)
	if len(caseSummaries) != 2 {
		t.Fatalf("expected 2 case summaries, got %+v", caseSummaries)
	}
	if caseSummaries[0].CaseID != "case-a" || caseSummaries[0].RunCount != 2 || caseSummaries[0].AverageScoreByName["reference"] != 0.75 {
		t.Fatalf("unexpected case-a summary: %+v", caseSummaries[0])
	}
	if caseSummaries[1].CaseID != "case-b" || caseSummaries[1].RunCount != 1 || caseSummaries[1].AverageJudgeScore == nil || *caseSummaries[1].AverageJudgeScore != 0.4 {
		t.Fatalf("unexpected case-b summary: %+v", caseSummaries[1])
	}

	experimentSummaries := summarizeExperiments(runs)
	if len(experimentSummaries) != 2 {
		t.Fatalf("expected 2 experiment summaries, got %+v", experimentSummaries)
	}
	if experimentSummaries[0].ExperimentID != "exp-1" || experimentSummaries[0].RunCount != 2 || experimentSummaries[0].AverageJudgeScore == nil || *experimentSummaries[0].AverageJudgeScore != 0.6 {
		t.Fatalf("unexpected exp-1 summary: %+v", experimentSummaries[0])
	}
	if experimentSummaries[1].ExperimentID != "exp-2" || experimentSummaries[1].FailedRuns != 1 {
		t.Fatalf("unexpected exp-2 summary: %+v", experimentSummaries[1])
	}
}

func TestRunWithProgressStopsPromptlyOnCancellation(t *testing.T) {
	svc := newTestService()
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		cases := make([]evalset.Case, 32)
		for i := range cases {
			cases[i] = evalset.Case{
				ID:           fmt.Sprintf("case-%02d", i),
				Source:       fmt.Sprintf("source-%02d", i),
				TargetLocale: "fr-FR",
			}
		}
		return &evalset.Dataset{Cases: cases}, nil
	}

	var started atomic.Int32
	svc.translate = func(ctx context.Context, req translator.Request) (string, error) {
		started.Add(1)
		if req.Source == "source-00" {
			time.Sleep(15 * time.Millisecond)
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(5 * time.Millisecond):
			return strings.ToUpper(req.Source), nil
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	events := make([]ProgressEvent, 0, 8)
	start := time.Now()
	_, err := svc.RunWithProgress(ctx, Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a"},
		Prompts:     []string{"prompt A", "prompt B"},
		Concurrency: 4,
	}, func(event ProgressEvent) {
		events = append(events, event)
		if event.Kind == ProgressEventRunStarted && event.StartedRuns == 3 {
			cancel()
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context cancellation, got %v", err)
	}
	if time.Since(start) > time.Second {
		t.Fatalf("expected cancellation to return promptly")
	}
	if int(started.Load()) >= 64 {
		t.Fatalf("expected cancellation to stop scheduling before all runs started, got %d", started.Load())
	}
	if len(events) == 0 || events[0].Kind != ProgressEventPlanned {
		t.Fatalf("expected planned event before cancellation, got %+v", events)
	}
}

func zeroLatency(runs []RunResult) {
	for i := range runs {
		runs[i].LatencyMS = 0
	}
}

func zeroCaseLatency(summaries []CaseSummary) {
	for i := range summaries {
		summaries[i].AverageLatencyMS = 0
	}
}

func zeroExperimentLatency(summaries []ExperimentSummary) {
	for i := range summaries {
		summaries[i].AverageLatencyMS = 0
	}
}

func zeroAggregateBreakdownLatency(items map[string]AggregateBreakdown) {
	for key, item := range items {
		item.AverageLatencyMS = 0
		items[key] = item
	}
}
