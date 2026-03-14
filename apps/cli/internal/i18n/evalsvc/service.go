package evalsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/quiet-circles/hyperlocalise/apps/cli/internal/i18n/evalset"
	"github.com/quiet-circles/hyperlocalise/apps/cli/internal/i18n/evalsvc/scoring"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

// Input controls evaluation execution.
type Input struct {
	EvalSetPath  string   `json:"evalSetPath"`
	Profiles     []string `json:"profiles,omitempty"`
	Providers    []string `json:"providers,omitempty"`
	Models       []string `json:"models,omitempty"`
	Prompts      []string `json:"prompts,omitempty"`
	Concurrency  int      `json:"concurrency,omitempty"`
	Seed         int64    `json:"seed,omitempty"`
	OutputPath   string   `json:"outputPath,omitempty"`
	EvalProvider string   `json:"evalProvider,omitempty"`
	EvalModel    string   `json:"evalModel,omitempty"`
	EvalPrompt   string   `json:"evalPrompt,omitempty"`
	Assertions   []string `json:"assertions,omitempty"`
}

const (
	defaultEvalProvider = translator.ProviderOpenAI
	defaultEvalModel    = "gpt-5.2"
)

// Validate checks input semantics before execution.
func (in Input) Validate() error {
	if strings.TrimSpace(in.EvalSetPath) == "" {
		return fmt.Errorf("--eval-set is required")
	}

	for _, assertion := range in.Assertions {
		kind := canonicalJudgeAssertion(assertion)
		if kind == "" {
			return fmt.Errorf("--assertion must not be empty")
		}
		if _, ok := assertionPromptFor(kind); !ok {
			return fmt.Errorf("unsupported --assertion %q", assertion)
		}
	}

	return nil
}

// LLMEvaluationEnabled reports whether model-based evaluation is configured.
func (in Input) LLMEvaluationEnabled() bool {
	return strings.TrimSpace(in.EvalProvider) != "" && strings.TrimSpace(in.EvalModel) != ""
}

// Aggregate summarizes evaluation totals.
type Aggregate struct {
	TotalRuns          int                           `json:"totalRuns"`
	SuccessfulRuns     int                           `json:"successfulRuns"`
	FailedRuns         int                           `json:"failedRuns"`
	AverageLatencyMS   float64                       `json:"averageLatencyMs"`
	AverageScoreByName map[string]float64            `json:"averageScoreByName,omitempty"`
	AverageJudgeScore  *float64                      `json:"averageJudgeScore,omitempty"`
	WeightedScore      float64                       `json:"weightedScore,omitempty"`
	FinalScore         float64                       `json:"finalScore,omitempty"`
	HardFailCounts     map[string]int                `json:"hardFailCounts,omitempty"`
	JudgeFailureCounts map[string]int                `json:"judgeFailureCounts,omitempty"`
	DecisionCounts     map[string]int                `json:"decisionCounts,omitempty"`
	ByLocale           map[string]AggregateBreakdown `json:"byLocale,omitempty"`
	ByBucket           map[string]AggregateBreakdown `json:"byBucket,omitempty"`
	ByTag              map[string]AggregateBreakdown `json:"byTag,omitempty"`
}

// Report is the full result payload for an eval execution.
type Report struct {
	GeneratedAt         time.Time           `json:"generatedAt"`
	Input               Input               `json:"input"`
	Aggregate           Aggregate           `json:"aggregate"`
	LLMEvaluation       *LLMEvaluation      `json:"llmEvaluation,omitempty"`
	Runs                []RunResult         `json:"runs"`
	CaseSummaries       []CaseSummary       `json:"caseSummaries"`
	ExperimentSummaries []ExperimentSummary `json:"experimentSummaries"`
}

// LLMEvaluation summarizes the LLM judge lane.
// SuccessfulJudges and FailedJudges count individual judge calls, not runs.
type LLMEvaluation struct {
	Enabled            bool               `json:"enabled"`
	Provider           string             `json:"provider,omitempty"`
	Model              string             `json:"model,omitempty"`
	Prompt             string             `json:"prompt,omitempty"`
	Assertions         []string           `json:"assertions,omitempty"`
	AggregateScore     *float64           `json:"aggregateScore,omitempty"`
	AverageScoreByName map[string]float64 `json:"averageScoreByName,omitempty"`
	SuccessfulJudges   int                `json:"successfulJudges,omitempty"`
	FailedJudges       int                `json:"failedJudges,omitempty"`
	SkippedRuns        int                `json:"skippedRuns,omitempty"`
	FailedByName       map[string]int     `json:"failedByName,omitempty"`
}

// JudgeResult stores one judge outcome for a run.
type JudgeResult struct {
	Score     *float64       `json:"score,omitempty"`
	Rationale string         `json:"rationale,omitempty"`
	Error     string         `json:"error,omitempty"`
	Details   map[string]any `json:"details,omitempty"`
}

// RunResult captures one case/experiment translation attempt.
type RunResult struct {
	CaseID              string                 `json:"caseId"`
	TargetLocale        string                 `json:"targetLocale,omitempty"`
	ExperimentID        string                 `json:"experimentId"`
	Profile             string                 `json:"profile"`
	Provider            string                 `json:"provider"`
	Model               string                 `json:"model"`
	Prompt              string                 `json:"prompt"`
	Translated          string                 `json:"translated,omitempty"`
	LatencyMS           float64                `json:"latencyMs"`
	Error               string                 `json:"error,omitempty"`
	Scores              map[string]float64     `json:"scores,omitempty"`
	JudgeResults        map[string]JudgeResult `json:"judgeResults,omitempty"`
	AssertionResults    []AssertionResult      `json:"assertionResults,omitempty"`
	JudgeAggregateScore *float64               `json:"judgeAggregateScore,omitempty"`
	Quality             scoring.Result         `json:"quality"`
	FinalScore          float64                `json:"finalScore,omitempty"`
	Decision            string                 `json:"decision,omitempty"`
}

type AssertionResult struct {
	Type      string   `json:"type"`
	Passed    bool     `json:"passed"`
	Expected  string   `json:"expected,omitempty"`
	Threshold *float64 `json:"threshold,omitempty"`
	Score     *float64 `json:"score,omitempty"`
	Error     string   `json:"error,omitempty"`
}

// CaseSummary aggregates all runs for a single case.
type CaseSummary struct {
	CaseID             string             `json:"caseId"`
	RunCount           int                `json:"runCount"`
	SuccessfulRuns     int                `json:"successfulRuns"`
	FailedRuns         int                `json:"failedRuns"`
	AverageLatencyMS   float64            `json:"averageLatencyMs"`
	AverageScoreByName map[string]float64 `json:"averageScoreByName,omitempty"`
	AverageJudgeScore  *float64           `json:"averageJudgeScore,omitempty"`
	WeightedScore      float64            `json:"weightedScore,omitempty"`
	FinalScore         float64            `json:"finalScore,omitempty"`
	HardFailCounts     map[string]int     `json:"hardFailCounts,omitempty"`
	JudgeFailureCounts map[string]int     `json:"judgeFailureCounts,omitempty"`
	DecisionCounts     map[string]int     `json:"decisionCounts,omitempty"`
}

// ExperimentSummary aggregates all runs for a single experiment.
type ExperimentSummary struct {
	ExperimentID       string             `json:"experimentId"`
	RunCount           int                `json:"runCount"`
	SuccessfulRuns     int                `json:"successfulRuns"`
	FailedRuns         int                `json:"failedRuns"`
	AverageLatencyMS   float64            `json:"averageLatencyMs"`
	AverageScoreByName map[string]float64 `json:"averageScoreByName,omitempty"`
	AverageJudgeScore  *float64           `json:"averageJudgeScore,omitempty"`
	WeightedScore      float64            `json:"weightedScore,omitempty"`
	FinalScore         float64            `json:"finalScore,omitempty"`
	HardFailCounts     map[string]int     `json:"hardFailCounts,omitempty"`
	JudgeFailureCounts map[string]int     `json:"judgeFailureCounts,omitempty"`
	DecisionCounts     map[string]int     `json:"decisionCounts,omitempty"`
}

type AggregateBreakdown struct {
	TotalRuns          int            `json:"totalRuns"`
	SuccessfulRuns     int            `json:"successfulRuns"`
	FailedRuns         int            `json:"failedRuns"`
	AverageLatencyMS   float64        `json:"averageLatencyMs"`
	AverageJudgeScore  *float64       `json:"averageJudgeScore,omitempty"`
	WeightedScore      float64        `json:"weightedScore,omitempty"`
	FinalScore         float64        `json:"finalScore,omitempty"`
	HardFailCounts     map[string]int `json:"hardFailCounts,omitempty"`
	JudgeFailureCounts map[string]int `json:"judgeFailureCounts,omitempty"`
	DecisionCounts     map[string]int `json:"decisionCounts,omitempty"`
}

type ProgressEventKind string

const (
	ProgressEventPlanned      ProgressEventKind = "planned"
	ProgressEventRunStarted   ProgressEventKind = "run_started"
	ProgressEventRunCompleted ProgressEventKind = "run_completed"
)

type ProgressEvent struct {
	Kind           ProgressEventKind `json:"kind"`
	CaseCount      int               `json:"caseCount,omitempty"`
	TotalRuns      int               `json:"totalRuns,omitempty"`
	StartedRuns    int               `json:"startedRuns,omitempty"`
	CompletedRuns  int               `json:"completedRuns,omitempty"`
	SuccessfulRuns int               `json:"successfulRuns,omitempty"`
	FailedRuns     int               `json:"failedRuns,omitempty"`
	ExperimentIDs  []string          `json:"experimentIds,omitempty"`
	Run            *RunResult        `json:"run,omitempty"`
}

// ScoreInput is passed to scorer implementations.
type ScoreInput struct {
	Case       evalset.Case
	Request    translator.Request
	Translated string
}

// ReferenceScorer computes a score against references.
type ReferenceScorer interface {
	Name() string
	ScoreReference(ctx context.Context, in ScoreInput) (float64, error)
}

// JudgeScorer computes a score via model-as-judge or similar heuristics.
type JudgeScorer interface {
	Name() string
	ScoreJudge(ctx context.Context, in ScoreInput) (JudgeResult, error)
}

type experiment struct {
	id       string
	profile  string
	provider string
	model    string
	prompt   string
}

type preparedCase struct {
	evalset.Case
	sanitizedContext string
}

type runStats struct {
	totalRuns          int
	successfulRuns     int
	failedRuns         int
	totalLatency       float64
	totalWeighted      float64
	totalFinal         float64
	totalJudge         float64
	totalJudgeCount    int
	scoreSums          map[string]float64
	scoreCounts        map[string]int
	hardFailCounts     map[string]int
	judgeFailureCounts map[string]int
	decisionCounts     map[string]int
}

type executionEvent struct {
	kind ProgressEventKind
	run  RunResult
}

type Service struct {
	loadEvalset func(path string) (*evalset.Dataset, error)
	translate   func(ctx context.Context, req translator.Request) (string, error)
	writeFile   func(path string, content []byte, perm os.FileMode) error
	mkdirAll    func(path string, perm os.FileMode) error
	now         func() time.Time
	numCPU      func() int

	referenceScorers []ReferenceScorer
	judgeScorers     []JudgeScorer
	qualityEvaluator *scoring.Evaluator
}

func New() *Service {
	return &Service{
		loadEvalset:      evalset.Load,
		translate:        translator.Translate,
		writeFile:        os.WriteFile,
		mkdirAll:         os.MkdirAll,
		now:              func() time.Time { return time.Now().UTC() },
		numCPU:           runtime.NumCPU,
		qualityEvaluator: scoring.NewEvaluator(),
	}
}

func Run(ctx context.Context, in Input) (Report, error) {
	return New().Run(ctx, in)
}

func RunWithProgress(ctx context.Context, in Input, progress func(ProgressEvent)) (Report, error) {
	return New().RunWithProgress(ctx, in, progress)
}

func (s *Service) WithReferenceScorers(scorers ...ReferenceScorer) *Service {
	s.referenceScorers = append([]ReferenceScorer(nil), scorers...)
	return s
}

func (s *Service) WithJudgeScorers(scorers ...JudgeScorer) *Service {
	s.judgeScorers = append([]JudgeScorer(nil), scorers...)
	return s
}

func (s *Service) Run(ctx context.Context, in Input) (Report, error) {
	return s.RunWithProgress(ctx, in, nil)
}

func (s *Service) RunWithProgress(ctx context.Context, in Input, progress func(ProgressEvent)) (Report, error) {
	if err := in.Validate(); err != nil {
		return Report{}, err
	}

	dataset, err := s.loadEvalset(in.EvalSetPath)
	if err != nil {
		return Report{}, fmt.Errorf("load evalset: %w", err)
	}
	in = normalizeEvalInput(in, dataset)

	experiments, err := buildExperiments(in, dataset)
	if err != nil {
		return Report{}, err
	}

	cases := prepareCases(dataset.Cases)
	if len(requiredJudgeAssertions(cases)) > 0 && !in.LLMEvaluationEnabled() {
		return Report{}, fmt.Errorf("eval set requires judge assertions; set --eval-provider and --eval-model")
	}
	if in.Seed != 0 {
		r := rand.New(rand.NewSource(in.Seed))
		r.Shuffle(len(cases), func(i, j int) {
			cases[i], cases[j] = cases[j], cases[i]
		})
	}

	workerCount := resolveWorkerCount(in.Concurrency, s.numCPU)
	referenceScorers := append([]ReferenceScorer(nil), s.referenceScorers...)
	judgeScorers := s.resolveJudgeScorers(in, cases)

	// Initialize qualityEvaluator before spawning concurrent workers.
	if s.qualityEvaluator == nil {
		s.qualityEvaluator = scoring.NewEvaluator()
	}

	emitProgress(progress, ProgressEvent{
		Kind:          ProgressEventPlanned,
		CaseCount:     len(cases),
		TotalRuns:     len(cases) * len(experiments),
		ExperimentIDs: progressExperimentIDs(experiments),
	})

	runs, err := s.execute(ctx, cases, experiments, referenceScorers, judgeScorers, workerCount, progress)
	if err != nil {
		return Report{}, err
	}

	report := Report{
		GeneratedAt: s.now(),
		Input:       in,
		Runs:        runs,
	}
	report.Aggregate = aggregateRuns(runs)
	report.LLMEvaluation = aggregateLLMEvaluation(in, runs, cases)
	report.CaseSummaries = summarizeCases(runs)
	report.ExperimentSummaries = summarizeExperiments(runs)

	if in.OutputPath != "" {
		encoded, marshalErr := json.MarshalIndent(report, "", "  ")
		if marshalErr != nil {
			return Report{}, fmt.Errorf("marshal report: %w", marshalErr)
		}
		if dir := filepath.Dir(in.OutputPath); dir != "" && dir != "." {
			if mkdirErr := s.mkdirAll(dir, 0o755); mkdirErr != nil {
				return Report{}, fmt.Errorf("create report directory: %w", mkdirErr)
			}
		}
		if writeErr := s.writeFile(in.OutputPath, encoded, 0o644); writeErr != nil {
			return Report{}, fmt.Errorf("write report: %w", writeErr)
		}
	}

	return report, nil
}

func emitProgress(progress func(ProgressEvent), event ProgressEvent) {
	if progress == nil {
		return
	}
	progress(event)
}

func progressExperimentIDs(experiments []experiment) []string {
	ids := make([]string, 0, len(experiments))
	for _, exp := range experiments {
		ids = append(ids, exp.id)
	}
	return ids
}

func prepareCases(cases []evalset.Case) []preparedCase {
	out := make([]preparedCase, len(cases))
	for i, tc := range cases {
		out[i] = preparedCase{
			Case:             tc,
			sanitizedContext: sanitizeEvalCaseContext(tc.Context),
		}
	}
	return out
}

func (s *Service) resolveJudgeScorers(in Input, cases []preparedCase) []JudgeScorer {
	required := effectiveJudgeAssertions(in.Assertions, cases)
	if !in.LLMEvaluationEnabled() {
		return nil
	}
	if len(s.judgeScorers) > 0 {
		return append([]JudgeScorer(nil), s.judgeScorers...)
	}

	scorers := make([]JudgeScorer, 0, len(required))
	for _, assertion := range required {
		scorer, ok := NewAssertionJudgeScorer(assertion, in.EvalProvider, in.EvalModel, in.EvalPrompt, s.translate)
		if ok {
			scorers = append(scorers, scorer)
		}
	}
	if len(scorers) == 0 {
		return []JudgeScorer{NewLLMJudgeScorer(in.EvalProvider, in.EvalModel, in.EvalPrompt, s.translate)}
	}
	return scorers
}

func resolveWorkerCount(requested int, numCPU func() int) int {
	if requested > 0 {
		return requested
	}
	workers := numCPU()
	if workers < 1 {
		return 1
	}
	return workers
}

func buildExperiments(in Input, dataset *evalset.Dataset) ([]experiment, error) {
	if !hasCLIExperimentOverrides(in) && dataset != nil && len(dataset.Experiments) > 0 {
		experiments := make([]experiment, 0, len(dataset.Experiments))
		for i, spec := range dataset.Experiments {
			profile := strings.TrimSpace(spec.Profile)
			if profile == "" {
				profile = "default"
			}
			prompt := strings.TrimSpace(spec.Prompt)
			if prompt == "" {
				prompt = "Translate to {{target}}: {{input}}"
			}
			id := strings.TrimSpace(spec.ID)
			if id == "" {
				id = fmt.Sprintf("%s|%s|%s|%d", profile, spec.Provider, spec.Model, i)
			}
			experiments = append(experiments, experiment{
				id:       id,
				profile:  profile,
				provider: strings.TrimSpace(spec.Provider),
				model:    strings.TrimSpace(spec.Model),
				prompt:   prompt,
			})
		}
		if len(experiments) > 0 {
			return experiments, nil
		}
	}

	profiles := normalizedOrDefault(in.Profiles, "default")
	providers := normalizedOrDefault(in.Providers, translator.ProviderOpenAI)
	models := normalizedOrDefault(in.Models, "gpt-4.1-mini")
	prompts := normalizedOrDefault(in.Prompts, "Translate to {{target}}: {{input}}")

	experiments := make([]experiment, 0, len(profiles)*len(providers)*len(models)*len(prompts))
	for _, profile := range profiles {
		for _, provider := range providers {
			for _, model := range models {
				for _, prompt := range prompts {
					experiments = append(experiments, experiment{
						id:       fmt.Sprintf("%s|%s|%s|%s", profile, provider, model, prompt),
						profile:  profile,
						provider: provider,
						model:    model,
						prompt:   prompt,
					})
				}
			}
		}
	}
	if len(experiments) == 0 {
		return nil, fmt.Errorf("build experiments: no experiment variants resolved")
	}

	return experiments, nil
}

func hasCLIExperimentOverrides(in Input) bool {
	return len(in.Profiles) > 0 || len(in.Providers) > 0 || len(in.Models) > 0 || len(in.Prompts) > 0
}

func normalizeEvalInput(in Input, dataset *evalset.Dataset) Input {
	var cases []evalset.Case
	if dataset != nil {
		cases = dataset.Cases
		if strings.TrimSpace(in.EvalProvider) == "" {
			in.EvalProvider = strings.TrimSpace(dataset.Judge.Provider)
		}
		if strings.TrimSpace(in.EvalModel) == "" {
			in.EvalModel = strings.TrimSpace(dataset.Judge.Model)
		}
		if strings.TrimSpace(in.EvalPrompt) == "" {
			in.EvalPrompt = strings.TrimSpace(dataset.Judge.Prompt)
		}
		if len(in.Assertions) == 0 && len(dataset.Judge.Assertions) > 0 {
			in.Assertions = canonicalJudgeAssertions(dataset.Judge.Assertions)
		}
	}
	if len(in.Assertions) > 0 {
		in.Assertions = canonicalJudgeAssertions(in.Assertions)
	}
	if !evalRequested(in, cases) {
		return in
	}
	if strings.TrimSpace(in.EvalProvider) == "" {
		in.EvalProvider = defaultEvalProvider
	}
	if strings.TrimSpace(in.EvalModel) == "" {
		in.EvalModel = defaultEvalModel
	}
	return in
}

func evalRequested(in Input, cases []evalset.Case) bool {
	if strings.TrimSpace(in.EvalProvider) != "" || strings.TrimSpace(in.EvalModel) != "" {
		return true
	}
	if strings.TrimSpace(in.EvalPrompt) != "" || len(in.Assertions) > 0 {
		return true
	}
	return len(requiredJudgeAssertions(prepareCases(cases))) > 0
}

func normalizedOrDefault(values []string, fallback string) []string {
	if len(values) == 0 {
		return []string{fallback}
	}
	out := make([]string, 0, len(values))
	for _, v := range values {
		if v == "" {
			continue
		}
		out = append(out, v)
	}
	if len(out) == 0 {
		return []string{fallback}
	}
	return out
}

func (s *Service) execute(ctx context.Context, cases []preparedCase, experiments []experiment, referenceScorers []ReferenceScorer, judgeScorers []JudgeScorer, workerCount int, progress func(ProgressEvent)) ([]RunResult, error) {
	type job struct {
		tc  preparedCase
		exp experiment
	}

	jobs := make(chan job, workerCount)
	events := make(chan executionEvent, workerCount*2)

	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case item, ok := <-jobs:
					if !ok {
						return
					}
					startedRun := RunResult{
						CaseID:       item.tc.ID,
						TargetLocale: item.tc.TargetLocale,
						ExperimentID: item.exp.id,
						Profile:      item.exp.profile,
						Provider:     item.exp.provider,
						Model:        item.exp.model,
						Prompt:       item.exp.prompt,
					}
					select {
					case events <- executionEvent{kind: ProgressEventRunStarted, run: startedRun}:
					case <-ctx.Done():
						return
					}
					completedRun := s.executeSingle(ctx, item.tc, item.exp, referenceScorers, judgeScorers)
					select {
					case events <- executionEvent{kind: ProgressEventRunCompleted, run: completedRun}:
					case <-ctx.Done():
						return
					}
				}
			}
		}()
	}

	go func() {
		defer close(jobs)
		for _, tc := range cases {
			for _, exp := range experiments {
				select {
				case <-ctx.Done():
					return
				case jobs <- job{tc: tc, exp: exp}:
				}
			}
		}
	}()

	go func() {
		wg.Wait()
		close(events)
	}()

	expected := len(cases) * len(experiments)
	runs := make([]RunResult, 0, expected)
	startedRuns := 0
	completedRuns := 0
	successfulRuns := 0
	failedRuns := 0

	for event := range events {
		switch event.kind {
		case ProgressEventRunStarted:
			run := event.run
			startedRuns++
			emitRunStartedProgress(progress, expected, startedRuns, run)
		case ProgressEventRunCompleted:
			run := event.run
			runs = append(runs, run)
			completedRuns++
			if strings.TrimSpace(run.Error) == "" {
				successfulRuns++
			} else {
				failedRuns++
			}
			runCopy := run
			emitProgress(progress, ProgressEvent{
				Kind:           ProgressEventRunCompleted,
				TotalRuns:      expected,
				StartedRuns:    startedRuns,
				CompletedRuns:  completedRuns,
				SuccessfulRuns: successfulRuns,
				FailedRuns:     failedRuns,
				Run:            &runCopy,
			})
		}
	}

	if err := ctx.Err(); err != nil {
		return nil, err
	}

	sort.Slice(runs, func(i, j int) bool {
		if runs[i].CaseID != runs[j].CaseID {
			return runs[i].CaseID < runs[j].CaseID
		}
		return runs[i].ExperimentID < runs[j].ExperimentID
	})

	return runs, nil
}

func emitRunStartedProgress(progress func(ProgressEvent), totalRuns, startedRuns int, run RunResult) {
	runCopy := run
	emitProgress(progress, ProgressEvent{
		Kind:        ProgressEventRunStarted,
		TotalRuns:   totalRuns,
		StartedRuns: startedRuns,
		Run:         &runCopy,
	})
}

func (s *Service) executeSingle(ctx context.Context, tc preparedCase, exp experiment, referenceScorers []ReferenceScorer, judgeScorers []JudgeScorer) RunResult {
	systemPrompt := exp.prompt
	if tc.sanitizedContext != "" {
		if sp := strings.TrimSpace(systemPrompt); sp != "" {
			systemPrompt = sp + "\n\nEval case context (do not translate or repeat):\n" + tc.sanitizedContext
		} else {
			systemPrompt = "Eval case context (do not translate or repeat):\n" + tc.sanitizedContext
		}
	}
	req := translator.Request{
		Source:         tc.Source,
		TargetLanguage: tc.TargetLocale,
		ModelProvider:  exp.provider,
		Model:          exp.model,
		SystemPrompt:   systemPrompt,
	}
	start := time.Now()
	translated, err := s.translate(ctx, req)
	latency := time.Since(start)

	run := RunResult{
		CaseID:       tc.ID,
		TargetLocale: tc.TargetLocale,
		ExperimentID: exp.id,
		Profile:      exp.profile,
		Provider:     exp.provider,
		Model:        exp.model,
		Prompt:       exp.prompt,
		Translated:   translated,
		LatencyMS:    float64(latency.Microseconds()) / 1000,
	}

	if err != nil {
		run.Error = err.Error()
		run.Quality = s.qualityEvaluator.Evaluate(tc.Source, "", tc.Reference, tc.TargetLocale, nil)
		run.AssertionResults = evaluateAssertions(tc.Assertions, run.Translated, run.JudgeResults)
		finalizeRun(&run)
		return run
	}
	run.Quality = s.qualityEvaluator.Evaluate(tc.Source, translated, tc.Reference, tc.TargetLocale, nil)

	scoreInput := ScoreInput{Case: tc.Case, Request: req, Translated: translated}
	for _, scorer := range referenceScorers {
		score, scoreErr := scorer.ScoreReference(ctx, scoreInput)
		if scoreErr != nil {
			continue
		}
		if run.Scores == nil {
			run.Scores = map[string]float64{}
		}
		run.Scores[scorer.Name()] = score
	}
	for _, scorer := range judgeScorers {
		judgeResult, scoreErr := scorer.ScoreJudge(ctx, scoreInput)
		if run.JudgeResults == nil {
			run.JudgeResults = map[string]JudgeResult{}
		}
		if scoreErr != nil {
			run.JudgeResults[scorer.Name()] = JudgeResult{Error: scoreErr.Error()}
			continue
		}
		if judgeResult.Score == nil && strings.TrimSpace(judgeResult.Error) == "" {
			judgeResult.Error = "judge returned no score"
		}
		run.JudgeResults[scorer.Name()] = judgeResult
	}
	run.AssertionResults = evaluateAssertions(tc.Assertions, run.Translated, run.JudgeResults)
	finalizeRun(&run)

	return run
}

func aggregateLLMEvaluation(in Input, runs []RunResult, cases []preparedCase) *LLMEvaluation {
	if !in.LLMEvaluationEnabled() {
		return nil
	}

	llm := &LLMEvaluation{
		Enabled:    true,
		Provider:   strings.TrimSpace(in.EvalProvider),
		Model:      strings.TrimSpace(in.EvalModel),
		Prompt:     effectiveLLMJudgePrompt(strings.TrimSpace(in.EvalPrompt)),
		Assertions: effectiveJudgeAssertions(in.Assertions, cases),
	}

	total := 0.0
	totalCount := 0
	scoreSums := map[string]float64{}
	scoreCounts := map[string]int{}
	failedByName := map[string]int{}
	for _, run := range runs {
		if strings.TrimSpace(run.Error) != "" {
			llm.SkippedRuns++
			continue
		}
		for name, result := range run.JudgeResults {
			if result.Score != nil {
				score := *result.Score
				total += score
				totalCount++
				llm.SuccessfulJudges++
				scoreSums[name] += score
				scoreCounts[name]++
				continue
			}
			if strings.TrimSpace(result.Error) != "" {
				llm.FailedJudges++
				failedByName[name]++
			}
		}
	}

	if totalCount > 0 {
		aggregateScore := round3(total / float64(totalCount))
		llm.AggregateScore = &aggregateScore
		llm.AverageScoreByName = map[string]float64{}
		for name, sum := range scoreSums {
			llm.AverageScoreByName[name] = round3(sum / float64(scoreCounts[name]))
		}
	}
	if len(failedByName) > 0 {
		llm.FailedByName = failedByName
	}

	return llm
}

func newRunStats() *runStats {
	return &runStats{}
}

func (s *runStats) add(run RunResult) {
	s.totalRuns++
	s.totalLatency += run.LatencyMS
	s.totalWeighted += run.Quality.WeightedAggregate
	s.totalFinal += run.FinalScore
	if run.Error != "" {
		s.failedRuns++
	} else {
		s.successfulRuns++
	}
	if run.JudgeAggregateScore != nil {
		s.totalJudge += *run.JudgeAggregateScore
		s.totalJudgeCount++
	}
	if run.Decision != "" {
		if s.decisionCounts == nil {
			s.decisionCounts = map[string]int{}
		}
		s.decisionCounts[run.Decision]++
	}
	for _, cat := range run.Quality.HardFails {
		if s.hardFailCounts == nil {
			s.hardFailCounts = map[string]int{}
		}
		s.hardFailCounts[cat]++
	}
	for name, result := range run.JudgeResults {
		if result.Score != nil {
			if s.scoreSums == nil {
				s.scoreSums = map[string]float64{}
				s.scoreCounts = map[string]int{}
			}
			s.scoreSums[name] += *result.Score
			s.scoreCounts[name]++
		}
		if strings.TrimSpace(result.Error) != "" {
			if s.judgeFailureCounts == nil {
				s.judgeFailureCounts = map[string]int{}
			}
			s.judgeFailureCounts[name]++
		}
	}
	for name, score := range run.Scores {
		if s.scoreSums == nil {
			s.scoreSums = map[string]float64{}
			s.scoreCounts = map[string]int{}
		}
		s.scoreSums[name] += score
		s.scoreCounts[name]++
	}
}

func (s *runStats) averageScoreByName() map[string]float64 {
	if len(s.scoreSums) == 0 {
		return nil
	}
	out := make(map[string]float64, len(s.scoreSums))
	for name, sum := range s.scoreSums {
		out[name] = round3(sum / float64(s.scoreCounts[name]))
	}
	return out
}

func (s *runStats) averageJudgeScore() *float64 {
	if s.totalJudgeCount == 0 {
		return nil
	}
	score := round3(s.totalJudge / float64(s.totalJudgeCount))
	return &score
}

func aggregateRuns(runs []RunResult) Aggregate {
	stats := newRunStats()
	byLocale := map[string]*runStats{}
	for _, run := range runs {
		stats.add(run)
		if locale := strings.TrimSpace(run.TargetLocale); locale != "" {
			if byLocale[locale] == nil {
				byLocale[locale] = newRunStats()
			}
			byLocale[locale].add(run)
		}
	}

	agg := stats.aggregate()
	if len(byLocale) > 0 {
		agg.ByLocale = map[string]AggregateBreakdown{}
		for key, localeStats := range byLocale {
			agg.ByLocale[key] = localeStats.breakdown()
		}
	}

	return agg
}

func summarizeCases(runs []RunResult) []CaseSummary {
	byCase := map[string]*runStats{}
	for _, run := range runs {
		if byCase[run.CaseID] == nil {
			byCase[run.CaseID] = newRunStats()
		}
		byCase[run.CaseID].add(run)
	}

	caseIDs := make([]string, 0, len(byCase))
	for caseID := range byCase {
		caseIDs = append(caseIDs, caseID)
	}
	sort.Strings(caseIDs)

	summaries := make([]CaseSummary, 0, len(caseIDs))
	for _, caseID := range caseIDs {
		summaries = append(summaries, byCase[caseID].caseSummary(caseID))
	}

	return summaries
}

func summarizeExperiments(runs []RunResult) []ExperimentSummary {
	byExperiment := map[string]*runStats{}
	for _, run := range runs {
		if byExperiment[run.ExperimentID] == nil {
			byExperiment[run.ExperimentID] = newRunStats()
		}
		byExperiment[run.ExperimentID].add(run)
	}

	experimentIDs := make([]string, 0, len(byExperiment))
	for experimentID := range byExperiment {
		experimentIDs = append(experimentIDs, experimentID)
	}
	sort.Strings(experimentIDs)

	summaries := make([]ExperimentSummary, 0, len(experimentIDs))
	for _, experimentID := range experimentIDs {
		summaries = append(summaries, byExperiment[experimentID].experimentSummary(experimentID))
	}

	return summaries
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func (s *runStats) aggregate() Aggregate {
	out := Aggregate{
		TotalRuns:      s.totalRuns,
		SuccessfulRuns: s.successfulRuns,
		FailedRuns:     s.failedRuns,
	}
	if s.totalRuns == 0 {
		return out
	}
	out.AverageLatencyMS = round3(s.totalLatency / float64(s.totalRuns))
	out.WeightedScore = round3(s.totalWeighted / float64(s.totalRuns))
	out.FinalScore = round3(s.totalFinal / float64(s.totalRuns))
	out.AverageJudgeScore = s.averageJudgeScore()
	out.AverageScoreByName = s.averageScoreByName()
	if len(s.hardFailCounts) > 0 {
		out.HardFailCounts = s.hardFailCounts
	}
	if len(s.judgeFailureCounts) > 0 {
		out.JudgeFailureCounts = s.judgeFailureCounts
	}
	if len(s.decisionCounts) > 0 {
		out.DecisionCounts = s.decisionCounts
	}
	return out
}

func (s *runStats) breakdown() AggregateBreakdown {
	out := AggregateBreakdown{
		TotalRuns:      s.totalRuns,
		SuccessfulRuns: s.successfulRuns,
		FailedRuns:     s.failedRuns,
	}
	if s.totalRuns == 0 {
		return out
	}
	out.AverageLatencyMS = round3(s.totalLatency / float64(s.totalRuns))
	out.WeightedScore = round3(s.totalWeighted / float64(s.totalRuns))
	out.FinalScore = round3(s.totalFinal / float64(s.totalRuns))
	out.AverageJudgeScore = s.averageJudgeScore()
	if len(s.hardFailCounts) > 0 {
		out.HardFailCounts = s.hardFailCounts
	}
	if len(s.judgeFailureCounts) > 0 {
		out.JudgeFailureCounts = s.judgeFailureCounts
	}
	if len(s.decisionCounts) > 0 {
		out.DecisionCounts = s.decisionCounts
	}
	return out
}

func (s *runStats) caseSummary(caseID string) CaseSummary {
	out := CaseSummary{
		CaseID:         caseID,
		RunCount:       s.totalRuns,
		SuccessfulRuns: s.successfulRuns,
		FailedRuns:     s.failedRuns,
	}
	if s.totalRuns == 0 {
		return out
	}
	out.AverageLatencyMS = round3(s.totalLatency / float64(s.totalRuns))
	out.WeightedScore = round3(s.totalWeighted / float64(s.totalRuns))
	out.FinalScore = round3(s.totalFinal / float64(s.totalRuns))
	out.AverageJudgeScore = s.averageJudgeScore()
	out.AverageScoreByName = s.averageScoreByName()
	if len(s.hardFailCounts) > 0 {
		out.HardFailCounts = s.hardFailCounts
	}
	if len(s.judgeFailureCounts) > 0 {
		out.JudgeFailureCounts = s.judgeFailureCounts
	}
	if len(s.decisionCounts) > 0 {
		out.DecisionCounts = s.decisionCounts
	}
	return out
}

func (s *runStats) experimentSummary(experimentID string) ExperimentSummary {
	out := ExperimentSummary{
		ExperimentID:   experimentID,
		RunCount:       s.totalRuns,
		SuccessfulRuns: s.successfulRuns,
		FailedRuns:     s.failedRuns,
	}
	if s.totalRuns == 0 {
		return out
	}
	out.AverageLatencyMS = round3(s.totalLatency / float64(s.totalRuns))
	out.WeightedScore = round3(s.totalWeighted / float64(s.totalRuns))
	out.FinalScore = round3(s.totalFinal / float64(s.totalRuns))
	out.AverageJudgeScore = s.averageJudgeScore()
	out.AverageScoreByName = s.averageScoreByName()
	if len(s.hardFailCounts) > 0 {
		out.HardFailCounts = s.hardFailCounts
	}
	if len(s.judgeFailureCounts) > 0 {
		out.JudgeFailureCounts = s.judgeFailureCounts
	}
	if len(s.decisionCounts) > 0 {
		out.DecisionCounts = s.decisionCounts
	}
	return out
}

func normalizedAssertions(assertions []string) []string {
	return canonicalJudgeAssertions(assertions)
}

func effectiveJudgeAssertions(globalAssertions []string, cases []preparedCase) []string {
	configured := normalizedAssertions(globalAssertions)
	required := requiredJudgeAssertions(cases)
	merged := mergeAssertionKinds(configured, required)
	if len(merged) == 0 {
		return []string{AssertionLLMRubric}
	}
	return merged
}

func finalizeRun(run *RunResult) {
	run.JudgeAggregateScore = averageJudgeScore(run.JudgeResults)
	run.FinalScore = calibratedFinalScore(run.Quality.WeightedAggregate, run.JudgeAggregateScore, run.Error, hasAssertionFailures(run.AssertionResults))
	run.Decision = classifyRunDecision(*run)
}

func averageJudgeScore(results map[string]JudgeResult) *float64 {
	total := 0.0
	count := 0
	for _, result := range results {
		if result.Score != nil {
			total += *result.Score
			count++
		}
	}
	if count == 0 {
		return nil
	}
	score := round3(total / float64(count))
	return &score
}

func calibratedFinalScore(qualityScore float64, judgeScore *float64, runErr string, assertionFailed bool) float64 {
	if strings.TrimSpace(runErr) != "" || qualityScore == 0 || assertionFailed {
		return 0
	}
	if judgeScore == nil {
		return round3(qualityScore)
	}
	return round3(qualityScore*0.65 + *judgeScore*0.35)
}

func classifyRunDecision(run RunResult) string {
	if strings.TrimSpace(run.Error) != "" || len(run.Quality.HardFails) > 0 || hasAssertionFailures(run.AssertionResults) {
		return "fail"
	}
	if hasAssertionErrors(run.AssertionResults) {
		return "review"
	}
	hasJudgeFailure := false
	for _, result := range run.JudgeResults {
		if strings.TrimSpace(result.Error) != "" {
			hasJudgeFailure = true
			break
		}
	}
	if hasJudgeFailure && run.JudgeAggregateScore == nil {
		return "review"
	}
	if run.FinalScore >= 0.85 && !hasJudgeFailure {
		return "pass"
	}
	if run.FinalScore >= 0.60 {
		return "review"
	}
	return "fail"
}

func evaluateAssertions(assertions []evalset.Assertion, translated string, judgeResults map[string]JudgeResult) []AssertionResult {
	if len(assertions) == 0 {
		return nil
	}
	results := make([]AssertionResult, 0, len(assertions))
	for _, assertion := range assertions {
		kind := normalizeEvalAssertionType(assertion.Type)
		switch kind {
		case "contains":
			expected := strings.TrimSpace(assertion.Value)
			results = append(results, AssertionResult{
				Type:     assertion.Type,
				Passed:   strings.Contains(translated, expected),
				Expected: expected,
			})
		case "not_contains":
			expected := strings.TrimSpace(assertion.Value)
			results = append(results, AssertionResult{
				Type:     assertion.Type,
				Passed:   !strings.Contains(translated, expected),
				Expected: expected,
			})
		case "equals":
			expected := strings.TrimSpace(assertion.Value)
			results = append(results, AssertionResult{
				Type:     assertion.Type,
				Passed:   strings.TrimSpace(translated) == expected,
				Expected: expected,
			})
		default:
			judgeKind, ok := evalJudgeAssertionKind(kind)
			if !ok {
				results = append(results, AssertionResult{Type: assertion.Type, Error: "unsupported assertion type"})
				continue
			}
			name := "judge:" + judgeKind
			result, ok := judgeResults[name]
			if !ok {
				results = append(results, AssertionResult{Type: assertion.Type, Threshold: assertion.Threshold, Error: "required judge result missing"})
				continue
			}
			if strings.TrimSpace(result.Error) != "" {
				results = append(results, AssertionResult{Type: assertion.Type, Threshold: assertion.Threshold, Error: result.Error})
				continue
			}
			if result.Score == nil {
				results = append(results, AssertionResult{Type: assertion.Type, Threshold: assertion.Threshold, Error: "judge returned no score"})
				continue
			}
			threshold := assertion.Threshold
			passed := threshold == nil || *result.Score >= *threshold
			results = append(results, AssertionResult{
				Type:      assertion.Type,
				Passed:    passed,
				Threshold: threshold,
				Score:     result.Score,
			})
		}
	}
	return results
}

func hasAssertionFailures(results []AssertionResult) bool {
	for _, result := range results {
		if strings.TrimSpace(result.Error) == "" && !result.Passed {
			return true
		}
	}
	return false
}

func hasAssertionErrors(results []AssertionResult) bool {
	for _, result := range results {
		if strings.TrimSpace(result.Error) != "" {
			return true
		}
	}
	return false
}

func requiredJudgeAssertions(cases []preparedCase) []string {
	kinds := make([]string, 0)
	seen := map[string]struct{}{}
	for _, tc := range cases {
		for _, assertion := range tc.Assertions {
			if kind, ok := evalJudgeAssertionKind(normalizeEvalAssertionType(assertion.Type)); ok {
				if _, exists := seen[kind]; exists {
					continue
				}
				seen[kind] = struct{}{}
				kinds = append(kinds, kind)
			}
		}
	}
	sort.Strings(kinds)
	return kinds
}

func mergeAssertionKinds(groups ...[]string) []string {
	seen := map[string]struct{}{}
	merged := make([]string, 0)
	for _, group := range groups {
		for _, item := range group {
			kind := strings.TrimSpace(item)
			if kind == "" {
				continue
			}
			if _, exists := seen[kind]; exists {
				continue
			}
			seen[kind] = struct{}{}
			merged = append(merged, kind)
		}
	}
	sort.Strings(merged)
	return merged
}

func normalizeEvalAssertionType(value string) string {
	kind := strings.ToLower(strings.TrimSpace(value))
	kind = strings.ReplaceAll(kind, "-", "_")
	return kind
}

func canonicalJudgeAssertion(value string) string {
	kind := strings.ToLower(strings.TrimSpace(value))
	if kind == "" {
		return ""
	}
	if judgeKind, ok := evalJudgeAssertionKind(normalizeEvalAssertionType(kind)); ok {
		return judgeKind
	}
	return kind
}

func canonicalJudgeAssertions(assertions []string) []string {
	out := make([]string, 0, len(assertions))
	for _, assertion := range assertions {
		if kind := canonicalJudgeAssertion(assertion); kind != "" {
			out = append(out, kind)
		}
	}
	return out
}

func evalJudgeAssertionKind(kind string) (string, bool) {
	switch kind {
	case "judge.translation_quality", "llm_rubric":
		return AssertionLLMRubric, true
	case "judge.factuality", "factuality":
		return AssertionFactuality, true
	case "judge.g_eval", "g_eval":
		return AssertionGEval, true
	case "judge.model_graded_closedqa", "model_graded_closedqa":
		return AssertionClosedQA, true
	case "judge.answer_relevance", "answer_relevance":
		return AssertionAnswerRelevance, true
	case "judge.context_faithfulness", "context_faithfulness":
		return AssertionContextFaithful, true
	case "judge.context_recall", "context_recall":
		return AssertionContextRecall, true
	case "judge.context_relevance", "context_relevance":
		return AssertionAnswerRelevance, true
	default:
		return "", false
	}
}

func aggregateBreakdown(runs []RunResult) AggregateBreakdown {
	stats := newRunStats()
	for _, run := range runs {
		stats.add(run)
	}
	return stats.breakdown()
}
