package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/mattn/go-isatty"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/evalsvc"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/evalsvc/scoring"
	"github.com/spf13/cobra"
)

var (
	evalRunFunc             = evalsvc.Run
	evalRunWithProgressFunc = evalsvc.RunWithProgress
	evalRunDashboardFunc    = runEvalDashboard
)

type evalRunOptions struct {
	evalSetPath    string
	profiles       []string
	providers      []string
	models         []string
	promptFile     string
	prompt         string
	evalProvider   string
	evalModel      string
	evalPromptFile string
	evalPrompt     string
	assertions     []string
	outputPath     string
	baselinePath   string
	interactive    bool
}

type evalCompareOptions struct {
	candidatePath string
	baselinePath  string
	minScore      float64
	maxRegression float64
}

func newEvalCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "eval",
		Short: "evaluate translation quality across experiment variants",
	}

	cmd.AddCommand(newEvalRunCmd())
	cmd.AddCommand(newEvalCompareCmd())

	return cmd
}

func newEvalRunCmd() *cobra.Command {
	o := evalRunOptions{}
	cmd := &cobra.Command{
		Use:          "run",
		Short:        "execute experiments and write JSON report",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			prompts, err := resolvePrompts(o.prompt, o.promptFile, "--prompt", "--prompt-file")
			if err != nil {
				return err
			}
			evalPrompts, err := resolvePrompts(o.evalPrompt, o.evalPromptFile, "--eval-prompt", "--eval-prompt-file")
			if err != nil {
				return fmt.Errorf("resolve eval prompt: %w", err)
			}
			evalPrompt := ""
			if len(evalPrompts) > 0 {
				evalPrompt = evalPrompts[0]
			}

			input := evalsvc.Input{
				EvalSetPath:  o.evalSetPath,
				Profiles:     o.profiles,
				Providers:    o.providers,
				Models:       o.models,
				Prompts:      prompts,
				EvalProvider: o.evalProvider,
				EvalModel:    o.evalModel,
				EvalPrompt:   evalPrompt,
				Assertions:   o.assertions,
				OutputPath:   o.outputPath,
			}
			if err := input.Validate(); err != nil {
				return err
			}
			if !o.interactive && strings.TrimSpace(o.baselinePath) != "" {
				return fmt.Errorf("--baseline is supported only with --interactive on eval run")
			}

			if o.interactive {
				return evalRunDashboardFunc(cmd.OutOrStdout(), evalDashboardOptions{
					Input:        input,
					BaselinePath: o.baselinePath,
				})
			}

			if err := logEvalRunStart(cmd.ErrOrStderr(), input); err != nil {
				return err
			}

			report, err := evalRunFunc(backgroundContext(), input)
			if err != nil {
				return fmt.Errorf("run eval: %w", err)
			}

			if err := logEvalRunComplete(cmd.ErrOrStderr(), report); err != nil {
				return err
			}

			return writeExperimentSummary(cmd.OutOrStdout(), report.ExperimentSummaries, false)
		},
	}

	cmd.Flags().StringVar(&o.evalSetPath, "eval-set", "", "path to eval dataset (yaml, yml)")
	cmd.Flags().StringArrayVar(&o.profiles, "profile", nil, "profile name to evaluate (repeatable)")
	cmd.Flags().StringArrayVar(&o.providers, "provider", nil, "provider override (repeatable)")
	cmd.Flags().StringArrayVar(&o.models, "model", nil, "model override (repeatable)")
	cmd.Flags().StringVar(&o.promptFile, "prompt-file", "", "path to prompt file override")
	cmd.Flags().StringVar(&o.prompt, "prompt", "", "inline prompt override")
	cmd.Flags().StringVar(&o.evalProvider, "eval-provider", "", "provider for LLM evaluation (defaults to openai when judge eval is requested)")
	cmd.Flags().StringVar(&o.evalModel, "eval-model", "", "model for LLM evaluation (defaults to gpt-5.2 when judge eval is requested)")
	cmd.Flags().StringVar(&o.evalPromptFile, "eval-prompt-file", "", "path to evaluation prompt file override")
	cmd.Flags().StringVar(&o.evalPrompt, "eval-prompt", "", "inline evaluation prompt override")
	cmd.Flags().StringArrayVar(&o.assertions, "assertion", nil, "judge assertions (repeatable): llm-rubric, factuality, g-eval, model-graded-closedqa, answer-relevance, context-faithfulness, context-recall")
	cmd.Flags().StringVar(&o.outputPath, "output", "", "report output JSON path")
	cmd.Flags().StringVar(&o.baselinePath, "baseline", "", "baseline eval report JSON path for interactive comparison")
	cmd.Flags().BoolVarP(&o.interactive, "interactive", "i", false, "render interactive eval dashboard in TTY")

	return cmd
}

func newEvalCompareCmd() *cobra.Command {
	o := evalCompareOptions{}
	cmd := &cobra.Command{
		Use:          "compare",
		Short:        "compare candidate report against baseline report",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if strings.TrimSpace(o.candidatePath) == "" {
				return fmt.Errorf("--candidate is required")
			}
			if strings.TrimSpace(o.baselinePath) == "" {
				return fmt.Errorf("--baseline is required")
			}

			candidate, err := loadEvalReport(o.candidatePath)
			if err != nil {
				return err
			}
			baseline, err := loadEvalReport(o.baselinePath)
			if err != nil {
				return err
			}

			candidateScore, candidateSource, err := selectCompareScore(candidate)
			if err != nil {
				return fmt.Errorf("candidate report: %w", err)
			}
			baselineScore, baselineSource, err := selectCompareScore(baseline)
			if err != nil {
				return fmt.Errorf("baseline report: %w", err)
			}
			if candidateSource != baselineSource {
				return fmt.Errorf("score source mismatch: candidate uses %q, baseline uses %q; regenerate both reports with the same evaluation mode before comparing", candidateSource, baselineSource)
			}
			regression := baselineScore - candidateScore

			if err := writeExperimentSummary(cmd.OutOrStdout(), candidate.ExperimentSummaries, true); err != nil {
				return err
			}

			if _, err := fmt.Fprintf(
				cmd.OutOrStdout(),
				"candidate_score=%.3f baseline_score=%.3f regression=%.3f min_score=%.3f max_regression=%.3f candidate_score_source=%s baseline_score_source=%s\n",
				candidateScore,
				baselineScore,
				regression,
				o.minScore,
				o.maxRegression,
				candidateSource,
				baselineSource,
			); err != nil {
				return err
			}

			if o.minScore > 0 && candidateScore < o.minScore {
				return fmt.Errorf("candidate %s score %.3f below min score %.3f", candidateSource, candidateScore, o.minScore)
			}
			if o.maxRegression > 0 && regression > o.maxRegression {
				return fmt.Errorf("score regression %.3f exceeds max regression %.3f", regression, o.maxRegression)
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&o.candidatePath, "candidate", "", "candidate eval report JSON path")
	cmd.Flags().StringVar(&o.baselinePath, "baseline", "", "baseline eval report JSON path")
	cmd.Flags().Float64Var(&o.minScore, "min-score", 0, "minimum candidate score")
	cmd.Flags().Float64Var(&o.maxRegression, "max-regression", 0, "maximum allowed score regression vs baseline")

	return cmd
}

func selectCompareScore(report evalsvc.Report) (float64, string, error) {
	if report.LLMEvaluation != nil && report.LLMEvaluation.Enabled {
		if report.LLMEvaluation.AggregateScore != nil {
			return *report.LLMEvaluation.AggregateScore, "llm", nil
		}
		return 0, "", llmAggregateUnavailableError(*report.LLMEvaluation)
	}
	return report.Aggregate.WeightedScore, "heuristic", nil
}

func llmAggregateUnavailableError(llm evalsvc.LLMEvaluation) error {
	if llm.SuccessfulJudges == 0 && llm.FailedJudges == 0 && llm.SkippedRuns > 0 {
		return fmt.Errorf("LLM evaluation enabled but aggregate score is unavailable: all %d run(s) were skipped due to translation errors before the judge ran", llm.SkippedRuns)
	}
	return fmt.Errorf(
		"LLM evaluation enabled but aggregate score is unavailable: %d successful judge call(s), %d failed judge call(s), %d skipped run(s) due to translation errors",
		llm.SuccessfulJudges,
		llm.FailedJudges,
		llm.SkippedRuns,
	)
}

func resolvePrompts(prompt string, promptFile string, promptFlag string, promptFileFlag string) ([]string, error) {
	inline := strings.TrimSpace(prompt)
	file := strings.TrimSpace(promptFile)
	if inline != "" && file != "" {
		return nil, fmt.Errorf("%s and %s are mutually exclusive", promptFlag, promptFileFlag)
	}
	if inline != "" {
		return []string{inline}, nil
	}
	if file == "" {
		return nil, nil
	}

	content, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("read prompt file: %w", err)
	}
	value := strings.TrimSpace(string(content))
	if value == "" {
		return nil, fmt.Errorf("prompt file is empty")
	}

	return []string{value}, nil
}

func loadEvalReport(path string) (evalsvc.Report, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return evalsvc.Report{}, fmt.Errorf("read report %q: %w", path, err)
	}

	var report evalsvc.Report
	if err := json.Unmarshal(content, &report); err != nil {
		return evalsvc.Report{}, fmt.Errorf("decode report %q: %w", path, err)
	}

	return report, nil
}

func writeExperimentSummary(w io.Writer, summaries []evalsvc.ExperimentSummary, includeHeader bool) error {
	styles := newEvalSummaryStyles(w)
	if includeHeader {
		if _, err := fmt.Fprintln(w, "candidate experiment summary:"); err != nil {
			return err
		}
	}
	scoreColumns := experimentScoreColumns(summaries)
	header := []string{"experiment", "score", "pass_rate", "placeholder_violations", "latency_ms"}
	header = append(header, scoreColumns...)
	if _, err := fmt.Fprintln(w, strings.Join(header, " | ")); err != nil {
		return err
	}
	for _, summary := range summaries {
		passRate := 0.0
		if summary.RunCount > 0 {
			passCount := 0
			if summary.DecisionCounts != nil {
				passCount = summary.DecisionCounts["pass"]
			}
			passRate = float64(passCount) / float64(summary.RunCount)
		}
		placeholderViolations := 0
		if summary.HardFailCounts != nil {
			placeholderViolations = summary.HardFailCounts[scoring.HardFailPlaceholderDrop]
		}
		row := []string{
			summary.ExperimentID,
			styles.renderScore(summary.WeightedScore),
			styles.renderPassRate(passRate),
			fmt.Sprintf("%d", placeholderViolations),
			fmt.Sprintf("%.1f", summary.AverageLatencyMS),
		}
		for _, column := range scoreColumns {
			row = append(row, formatExperimentScore(styles, summary.AverageScoreByName, column))
		}
		if _, err := fmt.Fprintln(w, strings.Join(row, " | ")); err != nil {
			return err
		}
	}

	return nil
}

func experimentScoreColumns(summaries []evalsvc.ExperimentSummary) []string {
	seen := map[string]struct{}{}
	columns := make([]string, 0)
	for _, summary := range summaries {
		for name := range summary.AverageScoreByName {
			label := experimentScoreLabel(name)
			if _, ok := seen[label]; ok {
				continue
			}
			seen[label] = struct{}{}
			columns = append(columns, label)
		}
	}
	sort.Strings(columns)
	return columns
}

func formatExperimentScore(styles evalSummaryStyles, scores map[string]float64, column string) string {
	if len(scores) == 0 {
		return "-"
	}
	for name, score := range scores {
		if experimentScoreLabel(name) == column {
			return styles.renderScore(score)
		}
	}
	return "-"
}

func experimentScoreLabel(name string) string {
	label := strings.TrimSpace(name)
	label = strings.TrimPrefix(label, "judge:")
	return label
}

type evalSummaryStyles struct {
	good   lipgloss.Style
	warn   lipgloss.Style
	bad    lipgloss.Style
	colors bool
}

func newEvalSummaryStyles(w io.Writer) evalSummaryStyles {
	styles := evalSummaryStyles{}
	file, ok := w.(*os.File)
	if !ok {
		return styles
	}
	if !isatty.IsTerminal(file.Fd()) && !isatty.IsCygwinTerminal(file.Fd()) {
		return styles
	}
	return evalSummaryStyles{
		good:   lipgloss.NewStyle().Foreground(lipgloss.Color("78")).Bold(true),
		warn:   lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true),
		bad:    lipgloss.NewStyle().Foreground(lipgloss.Color("203")).Bold(true),
		colors: true,
	}
}

func (s evalSummaryStyles) renderScore(score float64) string {
	text := fmt.Sprintf("%.3f", score)
	if !s.colors {
		return text
	}
	switch {
	case score >= 0.85:
		return s.good.Render(text)
	case score >= 0.70:
		return s.warn.Render(text)
	default:
		return s.bad.Render(text)
	}
}

func (s evalSummaryStyles) renderPassRate(passRate float64) string {
	text := fmt.Sprintf("%.1f%%", passRate*100)
	if !s.colors {
		return text
	}
	switch {
	case passRate >= 0.90:
		return s.good.Render(text)
	case passRate >= 0.70:
		return s.warn.Render(text)
	default:
		return s.bad.Render(text)
	}
}

func logEvalRunStart(w io.Writer, input evalsvc.Input) error {
	if _, err := fmt.Fprintf(w, "eval: starting dataset=%s\n", input.EvalSetPath); err != nil {
		return err
	}
	if input.OutputPath != "" {
		if _, err := fmt.Fprintf(w, "eval: report output=%s\n", input.OutputPath); err != nil {
			return err
		}
	}
	return nil
}

func logEvalRunComplete(w io.Writer, report evalsvc.Report) error {
	experimentCount := len(report.ExperimentSummaries)
	caseCount := len(report.CaseSummaries)
	totalRuns := report.Aggregate.TotalRuns

	if _, err := fmt.Fprintf(
		w,
		"eval: completed cases=%d experiments=%d runs=%d successful=%d failed=%d\n",
		caseCount,
		experimentCount,
		totalRuns,
		report.Aggregate.SuccessfulRuns,
		report.Aggregate.FailedRuns,
	); err != nil {
		return err
	}

	if report.LLMEvaluation != nil && report.LLMEvaluation.Enabled {
		assertions := strings.Join(report.LLMEvaluation.Assertions, ",")
		if assertions == "" {
			assertions = "none"
		}
		if _, err := fmt.Fprintf(
			w,
			"eval: judge provider=%s model=%s assertions=%s\n",
			report.LLMEvaluation.Provider,
			report.LLMEvaluation.Model,
			assertions,
		); err != nil {
			return err
		}
	} else {
		if _, err := fmt.Fprintln(w, "eval: judge disabled"); err != nil {
			return err
		}
	}

	if report.Input.OutputPath != "" {
		if _, err := fmt.Fprintf(w, "eval: wrote report=%s\n", report.Input.OutputPath); err != nil {
			return err
		}
	}

	return nil
}
