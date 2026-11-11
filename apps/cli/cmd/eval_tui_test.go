package cmd

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"

	"charm.land/bubbles/v2/progress"
	tea "charm.land/bubbletea/v2"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/evalsvc"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/evalsvc/scoring"
)

var evalANSIPattern = regexp.MustCompile(`\x1b\[[0-9;:]*[A-Za-z]`)

func stripEvalANSI(value string) string {
	return evalANSIPattern.ReplaceAllString(value, "")
}

func evalViewText(m evalDashboardModel) string {
	return stripEvalANSI(fmt.Sprint(m.View()))
}

func evalTableColumn(m evalDashboardModel, column int) []string {
	values := make([]string, 0, len(m.tbl.Rows()))
	for _, row := range m.tbl.Rows() {
		values = append(values, stripEvalANSI(row[column]))
	}
	return values
}

func evalKey(text string) tea.KeyPressMsg {
	return tea.KeyPressMsg(tea.Key{Text: text, Code: []rune(text)[0]})
}

func sendEval(t *testing.T, m evalDashboardModel, msgs ...tea.Msg) evalDashboardModel {
	t.Helper()
	for _, msg := range msgs {
		next, _ := m.Update(msg)
		typed, ok := next.(evalDashboardModel)
		if !ok {
			t.Fatalf("expected evalDashboardModel, got %T", next)
		}
		m = typed
	}
	return m
}

func evalScore(v float64) *float64 { return &v }

func evalDashboardWithRuns(t *testing.T, baseline *evalsvc.Report) evalDashboardModel {
	t.Helper()
	opts := evalDashboardOptions{
		Input: evalsvc.Input{
			EvalSetPath:  "set.json",
			OutputPath:   "report.json",
			EvalProvider: "openai",
			EvalModel:    "gpt-judge",
			Assertions:   []string{"fluency", "glossary"},
		},
	}
	if baseline != nil {
		opts.BaselinePath = "/tmp/reports/baseline.json"
	}
	m := newEvalDashboardModel(opts, baseline, func() {})
	passRun := evalsvc.RunResult{
		CaseID:           "case-1",
		ExperimentID:     "exp-a",
		LatencyMS:        100,
		Scores:           map[string]float64{"chrf": 0.8},
		JudgeResults:     map[string]evalsvc.JudgeResult{"judge:fluency": {Score: evalScore(0.75)}},
		AssertionResults: []evalsvc.AssertionResult{{Type: "fluency", Passed: true}},
		Quality:          scoring.Result{WeightedAggregate: 0.9},
		FinalScore:       0.92,
		Decision:         "pass",
	}
	failRun := evalsvc.RunResult{
		CaseID:           "case-1",
		ExperimentID:     "exp-b",
		LatencyMS:        300,
		Error:            "request timeout after 30s",
		JudgeResults:     map[string]evalsvc.JudgeResult{"judge:fluency": {Error: "judge unavailable"}},
		AssertionResults: []evalsvc.AssertionResult{{Type: "glossary", Error: "missing Acme"}},
		Quality:          scoring.Result{WeightedAggregate: 0.4, HardFails: []string{scoring.HardFailPlaceholderDrop}},
		FinalScore:       0.3,
		Decision:         "fail",
	}
	return sendEval(t, m,
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventPlanned, CaseCount: 2, TotalRuns: 4, ExperimentIDs: []string{"exp-a", "exp-b"}}},
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventRunStarted, TotalRuns: 4, StartedRuns: 1, Run: &evalsvc.RunResult{CaseID: "case-1", ExperimentID: "exp-a"}}},
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventRunCompleted, TotalRuns: 4, StartedRuns: 1, CompletedRuns: 1, SuccessfulRuns: 1, Run: &passRun}},
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventRunStarted, TotalRuns: 4, StartedRuns: 2, Run: &evalsvc.RunResult{CaseID: "case-1", ExperimentID: "exp-b"}}},
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventRunCompleted, TotalRuns: 4, StartedRuns: 2, CompletedRuns: 2, SuccessfulRuns: 1, FailedRuns: 1, Run: &failRun}},
	)
}

func TestEvalDashboardProgressPopulatesExperimentsView(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)

	if m.totalRuns != 4 || m.completedRuns != 2 || m.successfulRuns != 1 || m.failedRuns != 1 {
		t.Fatalf("unexpected totals: total=%d completed=%d ok=%d failed=%d", m.totalRuns, m.completedRuns, m.successfulRuns, m.failedRuns)
	}
	if got := strings.Join(m.scoreColumns, ","); got != "chrf,fluency" {
		t.Fatalf("score columns = %s", got)
	}
	expB := m.experiments["exp-b"]
	if expB.placeholderViolations != 1 || expB.judgeFailures != 1 || expB.assertionFailures != 1 || expB.transportFailures != 1 || expB.failCount != 1 {
		t.Fatalf("unexpected exp-b progress: %+v", expB)
	}

	if got := strings.Join(evalTableColumn(m, 0), ","); got != "exp-a,exp-b" {
		t.Fatalf("experiment rows = %s", got)
	}
	if got := strings.Join(evalTableColumn(m, 2), ","); got != "1/2,1/2" {
		t.Fatalf("progress column = %s", got)
	}

	view := evalViewText(m)
	for _, want := range []string{
		"hyperlocalise eval dashboard",
		"state=running  view=experiments  sort=default  reverse=false  dataset=set.json",
		"judge=openai/gpt-judge  assertions=fluency,glossary  report=report.json  baseline=-",
		"started=2/4  completed=2/4",
		"transport_ok=1",
		"transport_failed=1",
		"Experiments",
		"selected experiment=exp-a",
		"quality pass=1 review=0 fail=0 transport_failed=0 judge_failures=0 assertion_failures=0",
	} {
		if !strings.Contains(view, want) {
			t.Fatalf("view missing %q:\n%s", want, view)
		}
	}
	if strings.Contains(view, "press q to exit") {
		t.Fatalf("running dashboard should not show exit hint:\n%s", view)
	}
}

func TestEvalDashboardTabCyclesViewsWithDetails(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)
	tab := tea.KeyPressMsg(tea.Key{Code: tea.KeyTab})

	m = sendEval(t, m, tab)
	view := evalViewText(m)
	if m.view != evalDashboardViewCases || !strings.Contains(view, "view=cases") {
		t.Fatalf("expected cases view:\n%s", view)
	}
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "exp-a,exp-b" {
		t.Fatalf("case rows = %s", got)
	}
	for _, want := range []string{
		"selected case=case-1  experiment=exp-a",
		"decision=pass final=0.920 heuristic=0.900 latency=100.0ms",
		"reason=no critical issues",
		"assertions=fluency=pass",
	} {
		if !strings.Contains(view, want) {
			t.Fatalf("cases view missing %q:\n%s", want, view)
		}
	}

	m = sendEval(t, m, tab)
	view = evalViewText(m)
	if !strings.Contains(view, "Assertions") || !strings.Contains(view, "selected assertion=chrf  experiment=exp-a") {
		t.Fatalf("expected assertions view:\n%s", view)
	}
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "chrf,fluency" {
		t.Fatalf("assertion rows = %s", got)
	}

	m = sendEval(t, m, tab)
	view = evalViewText(m)
	wantBuckets := "assertion:glossary,judge:fluency,quality:placeholder_integrity_failed,transport:timeout"
	if got := strings.Join(evalTableColumn(m, 0), ","); got != wantBuckets {
		t.Fatalf("error buckets = %s", got)
	}
	if !strings.Contains(view, "selected error bucket=assertion:glossary  count=1  examples=case-1 @ exp-b") {
		t.Fatalf("expected errors view detail:\n%s", view)
	}

	m = sendEval(t, m, tab)
	if m.view != evalDashboardViewExperiments {
		t.Fatalf("expected tab to wrap to experiments, got %v", m.view)
	}
}

func TestEvalDashboardSortModesAndReverse(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)
	sortKey := evalKey("s")

	wantLabels := []string{"score", "pass_rate", "failures", "latency", "default"}
	wantOrder := []string{"exp-a,exp-b", "exp-a,exp-b", "exp-b,exp-a", "exp-b,exp-a", "exp-a,exp-b"}
	for i, label := range wantLabels {
		m = sendEval(t, m, sortKey)
		if m.sortModeLabel() != label {
			t.Fatalf("sort label = %s, want %s", m.sortModeLabel(), label)
		}
		if got := strings.Join(evalTableColumn(m, 0), ","); got != wantOrder[i] {
			t.Fatalf("sort %s order = %s, want %s", label, got, wantOrder[i])
		}
	}

	m = sendEval(t, m, evalKey("r"))
	if got := strings.Join(evalTableColumn(m, 0), ","); got != "exp-b,exp-a" || !strings.Contains(evalViewText(m), "reverse=true") {
		t.Fatalf("reversed order = %s", got)
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyTab}), sortKey, sortKey, sortKey)
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "exp-a,exp-b" {
		t.Fatalf("reversed failure sort for cases = %s", got)
	}
	m = sendEval(t, m, sortKey)
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "exp-a,exp-b" {
		t.Fatalf("reversed latency sort for cases = %s", got)
	}
	m = sendEval(t, m, sortKey, sortKey)
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "exp-b,exp-a" {
		t.Fatalf("reversed score sort for cases = %s", got)
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyTab}))
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "fluency,chrf" {
		t.Fatalf("reversed score sort for assertions = %s", got)
	}
	m = sendEval(t, m, sortKey, sortKey)
	if m.sortModeLabel() != "failures" || len(m.tbl.Rows()) != 2 {
		t.Fatalf("reversed failures sort for assertions = %s %v", m.sortModeLabel(), evalTableColumn(m, 1))
	}
	m = sendEval(t, m, sortKey, sortKey)
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "fluency,chrf" {
		t.Fatalf("reversed default sort for assertions = %s", got)
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyTab}))
	if got := evalTableColumn(m, 0); got[0] != "transport:timeout" {
		t.Fatalf("reversed error buckets = %v", got)
	}
}

var evalDashboardAllSortModes = []evalDashboardSortMode{
	evalDashboardSortDefault,
	evalDashboardSortScore,
	evalDashboardSortPassRate,
	evalDashboardSortFailures,
	evalDashboardSortLatency,
}

func evalDashboardWithTiedRows() evalDashboardModel {
	m := newEvalDashboardModel(evalDashboardOptions{}, nil, func() {})
	m.scoreColumns = []string{"fluency", "chrf"}
	m.experimentOrder = []string{"exp-c", "exp-a", "exp-b"}
	m.experiments = map[string]*evalExperimentProgress{}
	for _, id := range m.experimentOrder {
		m.experiments[id] = &evalExperimentProgress{
			experimentID:     id,
			totalRuns:        2,
			completedRuns:    2,
			successfulRuns:   1,
			failedRuns:       1,
			passCount:        1,
			weightedScoreSum: 1,
			latencySumMS:     200,
			scoreSums:        map[string]float64{"fluency": 0.5, "chrf": 0.5},
			scoreCounts:      map[string]int{"fluency": 1, "chrf": 1},
		}
	}
	for _, caseID := range []string{"case-2", "case-1"} {
		for _, id := range m.experimentOrder {
			m.runs = append(m.runs, evalsvc.RunResult{CaseID: caseID, ExperimentID: id, LatencyMS: 100, FinalScore: 0.5, Decision: "pass"})
		}
	}
	m.failureBuckets = map[string]*evalFailureBucket{}
	for _, name := range []string{"transport:timeout", "assertion:glossary", "judge:fluency"} {
		m.failureBuckets[name] = &evalFailureBucket{name: name, count: 2}
	}
	return m
}

func evalTiedRowKeys(meta []evalTableRowMeta) string {
	keys := make([]string, 0, len(meta))
	for _, item := range meta {
		keys = append(keys, strings.Trim(item.caseID+"/"+item.experimentID+"/"+item.assertion, "/"))
	}
	return strings.Join(keys, ",")
}

func TestEvalDashboardTiedRowsSortDeterministically(t *testing.T) {
	cases := []struct {
		name     string
		rows     func(m *evalDashboardModel) []evalTableRowMeta
		forward  string
		backward string
	}{
		{
			name: "experiments",
			rows: func(m *evalDashboardModel) []evalTableRowMeta {
				_, _, meta := m.experimentRows()
				return meta
			},
			forward:  "exp-a,exp-b,exp-c",
			backward: "exp-c,exp-b,exp-a",
		},
		{
			name: "cases",
			rows: func(m *evalDashboardModel) []evalTableRowMeta {
				_, _, meta := m.caseRows()
				return meta
			},
			forward:  "case-1/exp-a,case-1/exp-b,case-1/exp-c,case-2/exp-a,case-2/exp-b,case-2/exp-c",
			backward: "case-2/exp-c,case-2/exp-b,case-2/exp-a,case-1/exp-c,case-1/exp-b,case-1/exp-a",
		},
		{
			name: "assertions",
			rows: func(m *evalDashboardModel) []evalTableRowMeta {
				_, _, meta := m.assertionRows()
				return meta
			},
			forward:  "exp-a/chrf,exp-a/fluency,exp-b/chrf,exp-b/fluency,exp-c/chrf,exp-c/fluency",
			backward: "exp-c/fluency,exp-c/chrf,exp-b/fluency,exp-b/chrf,exp-a/fluency,exp-a/chrf",
		},
	}
	for _, tc := range cases {
		for _, mode := range evalDashboardAllSortModes {
			for _, reverse := range []bool{false, true} {
				m := evalDashboardWithTiedRows()
				m.sortMode = mode
				m.reverse = reverse
				want := tc.forward
				if reverse {
					want = tc.backward
				}
				for range 3 {
					if got := evalTiedRowKeys(tc.rows(&m)); got != want {
						t.Fatalf("%s sort=%s reverse=%v order = %s, want %s", tc.name, m.sortModeLabel(), reverse, got, want)
					}
				}
			}
		}
	}

	for _, reverse := range []bool{false, true} {
		m := evalDashboardWithTiedRows()
		m.reverse = reverse
		want := "assertion:glossary,judge:fluency,transport:timeout"
		if reverse {
			want = "transport:timeout,judge:fluency,assertion:glossary"
		}
		for range 3 {
			_, rows, _ := m.errorRows()
			names := make([]string, 0, len(rows))
			for _, row := range rows {
				names = append(names, row[0])
			}
			if got := strings.Join(names, ","); got != want {
				t.Fatalf("errors reverse=%v order = %s, want %s", reverse, got, want)
			}
		}
	}
}

func TestEvalDashboardReverseKeepsPrimaryKeyAndFlipsTies(t *testing.T) {
	m := evalDashboardWithTiedRows()
	m.experiments["exp-b"].failedRuns = 2
	m.sortMode = evalDashboardSortFailures

	_, _, meta := m.experimentRows()
	if got := evalTiedRowKeys(meta); got != "exp-b,exp-a,exp-c" {
		t.Fatalf("failures order = %s", got)
	}
	m.reverse = true
	_, _, meta = m.experimentRows()
	if got := evalTiedRowKeys(meta); got != "exp-c,exp-a,exp-b" {
		t.Fatalf("reversed failures order = %s", got)
	}
}

func TestEvalDashboardFilteringAppliesAndClears(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)

	m = sendEval(t, m, evalKey("/"))
	if !m.filtering {
		t.Fatal("expected filtering mode after /")
	}
	m = sendEval(t, m, evalKey("b"))
	if got := strings.Join(evalTableColumn(m, 0), ","); got != "exp-b" {
		t.Fatalf("filtered rows = %s", got)
	}
	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))
	if m.filtering {
		t.Fatal("expected enter to leave filtering mode")
	}
	if view := evalViewText(m); !strings.Contains(view, "filter=b") {
		t.Fatalf("expected applied filter in view:\n%s", view)
	}

	m = sendEval(t, m, evalKey("/"), tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}))
	if m.filtering || m.filter.Value() != "" {
		t.Fatalf("expected esc to clear filter, value=%q", m.filter.Value())
	}
	if got := strings.Join(evalTableColumn(m, 0), ","); got != "exp-a,exp-b" {
		t.Fatalf("rows after clearing filter = %s", got)
	}
}

func TestEvalDashboardDrilldownAndBack(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyDown}), tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))
	view := evalViewText(m)
	if m.drillExperiment != "exp-b" || !strings.Contains(view, "Cases: exp-b") {
		t.Fatalf("expected drilldown into exp-b:\n%s", view)
	}
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "exp-b" {
		t.Fatalf("drilled case rows = %s", got)
	}
	if !strings.Contains(view, "reason=request timeout after 30s") || !strings.Contains(view, "assertions=glossary=fail") {
		t.Fatalf("expected failed case detail:\n%s", view)
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))
	if m.drillExperiment != "exp-b" || m.view != evalDashboardViewCases {
		t.Fatalf("enter on case row should keep case drilldown, got view=%v drill=%q", m.view, m.drillExperiment)
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}))
	if m.drillExperiment != "" || m.view != evalDashboardViewExperiments {
		t.Fatalf("expected esc to return to experiments, got view=%v drill=%q", m.view, m.drillExperiment)
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}))
	if m.view != evalDashboardViewExperiments {
		t.Fatalf("esc without drilldown should be a no-op, got %v", m.view)
	}
}

func TestEvalDashboardHelpWindowAndProgressFrames(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)

	m = sendEval(t, m, evalKey("?"))
	if !m.help.ShowAll {
		t.Fatal("expected full help")
	}
	m = sendEval(t, m, tea.WindowSizeMsg{Width: 30, Height: 10})
	if m.width != 30 || m.height != 10 || m.tbl.Width() != 72 {
		t.Fatalf("unexpected window sizing width=%d height=%d table=%d", m.width, m.height, m.tbl.Width())
	}
	m = sendEval(t, m, tea.WindowSizeMsg{Width: 140, Height: 50})
	if m.tbl.Width() != 138 {
		t.Fatalf("expected table width 138, got %d", m.tbl.Width())
	}

	next, _ := m.Update(progress.FrameMsg{})
	if _, ok := next.(evalDashboardModel); !ok {
		t.Fatalf("expected evalDashboardModel after frame, got %T", next)
	}
}

func TestEvalDashboardQuitCancelsRun(t *testing.T) {
	for _, msg := range []tea.KeyPressMsg{evalKey("q"), tea.KeyPressMsg(tea.Key{Code: 'c', Mod: tea.ModCtrl})} {
		cancelled := false
		m := newEvalDashboardModel(evalDashboardOptions{}, nil, func() { cancelled = true })
		_, cmd := m.Update(msg)
		if !cancelled {
			t.Fatalf("%s: expected cancel to be called", msg.String())
		}
		if cmd == nil {
			t.Fatalf("%s: expected quit command", msg.String())
		}
		if _, ok := cmd().(tea.QuitMsg); !ok {
			t.Fatalf("%s: expected tea.QuitMsg", msg.String())
		}
	}
}

func TestEvalDashboardFinishedShowsSummaryAndError(t *testing.T) {
	m := evalDashboardWithRuns(t, nil)
	m = sendEval(t, m, evalFinishedMsg{
		report: evalsvc.Report{
			Input:               evalsvc.Input{EvalSetPath: "final.json", OutputPath: "final-report.json"},
			Aggregate:           evalsvc.Aggregate{WeightedScore: 0.65},
			CaseSummaries:       []evalsvc.CaseSummary{{CaseID: "case-1"}},
			ExperimentSummaries: []evalsvc.ExperimentSummary{{ExperimentID: "exp-a"}, {ExperimentID: "exp-b"}},
		},
	})
	view := evalViewText(m)
	for _, want := range []string{
		"state=completed",
		"dataset=final.json",
		"eta=00:00  press q to exit",
		"summary: quality_score=0.650 source=heuristic cases=1 experiments=2 report=final-report.json",
	} {
		if !strings.Contains(view, want) {
			t.Fatalf("finished view missing %q:\n%s", want, view)
		}
	}

	m = sendEval(t, m, evalFinishedMsg{err: errors.New("judge quota exceeded")})
	view = evalViewText(m)
	if !strings.Contains(view, "state=failed") || !strings.Contains(view, "judge quota exceeded") {
		t.Fatalf("failed view missing error:\n%s", view)
	}
}

func TestEvalDashboardFinalSummaryReportsUnavailableLLMScore(t *testing.T) {
	m := newEvalDashboardModel(evalDashboardOptions{}, nil, func() {})
	m.done = true
	m.report = &evalsvc.Report{LLMEvaluation: &evalsvc.LLMEvaluation{Enabled: true, SkippedRuns: 2}}
	got := stripEvalANSI(m.finalSummaryLine())
	if !strings.HasPrefix(got, "summary: LLM evaluation enabled but aggregate score is unavailable: all 2 run(s) were skipped") {
		t.Fatalf("summary = %q", got)
	}

	m.report = &evalsvc.Report{LLMEvaluation: &evalsvc.LLMEvaluation{Enabled: true, AggregateScore: evalScore(0.88)}}
	if got := stripEvalANSI(m.finalSummaryLine()); !strings.Contains(got, "quality_score=0.880 source=llm") {
		t.Fatalf("summary = %q", got)
	}

	m.done = false
	if got := m.finalSummaryLine(); got != "" {
		t.Fatalf("expected empty summary while running, got %q", got)
	}
}

func TestEvalDashboardBaselineDeltaColumnAndDetail(t *testing.T) {
	baseline := &evalsvc.Report{
		Aggregate:           evalsvc.Aggregate{WeightedScore: 0.5},
		ExperimentSummaries: []evalsvc.ExperimentSummary{{ExperimentID: "exp-a", WeightedScore: 0.8}, {ExperimentID: "exp-b", WeightedScore: 0.4}},
	}
	m := evalDashboardWithRuns(t, baseline)

	if got := strings.Join(evalTableColumn(m, 9), ","); got != "+0.100,+0.000" {
		t.Fatalf("delta column = %s", got)
	}
	view := evalViewText(m)
	if !strings.Contains(view, "baseline=/tmp/reports/baseline.json") || !strings.Contains(view, "baseline delta=+0.100 vs baseline.json") {
		t.Fatalf("view missing baseline detail:\n%s", view)
	}

	if got := stripEvalANSI(m.renderDelta(evalScore(-0.2))); got != "-0.200" {
		t.Fatalf("negative delta = %q", got)
	}
	if m.renderDelta(nil) != "-" {
		t.Fatal("expected dash for nil delta")
	}
	if m.baselineExperimentDelta("exp-missing", evalScore(0.5)) != nil || m.baselineExperimentDelta("exp-a", nil) != nil {
		t.Fatal("expected nil delta for unknown experiment or nil score")
	}
}

func TestEvalDashboardPendingAndRunningStatuses(t *testing.T) {
	m := newEvalDashboardModel(evalDashboardOptions{}, nil, func() {})
	m = sendEval(t, m,
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventPlanned, CaseCount: 1, TotalRuns: 2, ExperimentIDs: []string{"exp-a", "exp-b"}}},
		evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventRunStarted, TotalRuns: 2, StartedRuns: 1, Run: &evalsvc.RunResult{CaseID: "c", ExperimentID: "exp-b"}}},
	)
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "pending,running" {
		t.Fatalf("status column = %s", got)
	}
	if got := m.etaString(); got != "--:--" {
		t.Fatalf("eta before completion = %q", got)
	}

	m = sendEval(t, m, evalProgressMsg{event: evalsvc.ProgressEvent{Kind: evalsvc.ProgressEventRunCompleted, TotalRuns: 2, StartedRuns: 1, CompletedRuns: 1, SuccessfulRuns: 1, Run: &evalsvc.RunResult{CaseID: "c", ExperimentID: "exp-b", Decision: "review"}}})
	if got := strings.Join(evalTableColumn(m, 1), ","); got != "pending,done" {
		t.Fatalf("status column after completion = %s", got)
	}
	if !strings.Contains(m.etaString(), ":") {
		t.Fatalf("expected formatted eta, got %q", m.etaString())
	}

	m = sendEval(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyTab}))
	if got := strings.Join(evalTableColumn(m, 3), ","); got != "review" {
		t.Fatalf("case status column = %s", got)
	}
}

func TestEvalDashboardHelpers(t *testing.T) {
	for input, want := range map[string]string{
		"Placeholder {name} dropped": "transport:placeholder",
		"ICU syntax error":           "transport:icu",
		"invariant violated":         "transport:icu",
		"context deadline: TIMEOUT":  "transport:timeout",
		"connection reset":           "transport:error",
	} {
		if got := classifyRunError(input); got != want {
			t.Fatalf("classifyRunError(%q) = %q, want %q", input, got, want)
		}
	}

	reasons := []struct {
		run  evalsvc.RunResult
		want string
	}{
		{run: evalsvc.RunResult{AssertionResults: []evalsvc.AssertionResult{{Type: "length"}}}, want: "length failed"},
		{run: evalsvc.RunResult{JudgeResults: map[string]evalsvc.JudgeResult{"judge:b": {Error: "late"}, "judge:a": {Error: "early"}}}, want: "a: early"},
		{run: evalsvc.RunResult{Quality: scoring.Result{HardFails: []string{"x", "y"}}}, want: "x,y"},
	}
	for _, tc := range reasons {
		if got := reasonForRun(tc.run); got != tc.want {
			t.Fatalf("reasonForRun = %q, want %q", got, tc.want)
		}
	}

	if got := summarizeAssertionResults([]evalsvc.AssertionResult{{Type: "a", Passed: true}, {Type: "b"}}); got != "a=pass, b=fail" {
		t.Fatalf("summarizeAssertionResults = %q", got)
	}
	if got := formatEvalDuration(3*time.Hour + 4*time.Minute + 5*time.Second); got != "03:04:05" {
		t.Fatalf("long duration = %q", got)
	}
	if got := formatEvalDuration(-time.Second); got != "00:00" {
		t.Fatalf("negative duration = %q", got)
	}
	if got := evalTrim("abcdef", 3); got != "abc" {
		t.Fatalf("evalTrim short width = %q", got)
	}
	if got := evalTrim("abcdef", 5); got != "ab..." {
		t.Fatalf("evalTrim ellipsis = %q", got)
	}
	if got := evalTrim("abc", 0); got != "abc" {
		t.Fatalf("evalTrim zero width = %q", got)
	}
	if evalDashboardAssertions(nil) != "-" || evalDashboardAssertions([]string{"a", "b"}) != "a,b" {
		t.Fatal("unexpected evalDashboardAssertions output")
	}
	if compareFloatPtrDesc(nil, nil) != 0 || compareFloatPtrDesc(evalScore(0.1), nil) != -1 || compareFloatPtrDesc(nil, evalScore(0.1)) != 1 {
		t.Fatal("unexpected compareFloatPtrDesc ordering")
	}
	if evalDashboardAverage(1, 0) != "-" || evalDashboardAverage(1, 4) != "0.250" {
		t.Fatal("unexpected evalDashboardAverage output")
	}

	m := newEvalDashboardModel(evalDashboardOptions{}, nil, func() {})
	for score, want := range map[float64]string{0.9: "0.900", 0.75: "0.750", 0.1: "0.100"} {
		if got := stripEvalANSI(m.renderScore(evalScore(score))); got != want {
			t.Fatalf("renderScore(%v) = %q", score, got)
		}
	}
	for rate, want := range map[float64]string{0.95: "95.0%", 0.8: "80.0%", 0.2: "20.0%"} {
		if got := stripEvalANSI(m.renderPassRate(evalScore(rate))); got != want {
			t.Fatalf("renderPassRate(%v) = %q", rate, got)
		}
	}
	if m.renderPassRate(nil) != "-" || m.renderScore(nil) != "-" {
		t.Fatal("expected dash for nil metrics")
	}
	if got := stripEvalANSI(m.renderDecision("")); got != "-" {
		t.Fatalf("renderDecision empty = %q", got)
	}
	if len(m.keys.ShortHelp()) != 6 || len(m.keys.FullHelp()[0]) != 8 {
		t.Fatal("unexpected eval key help bindings")
	}
}

func TestRunEvalDashboardRequiresTTY(t *testing.T) {
	err := runEvalDashboard(&bytes.Buffer{}, evalDashboardOptions{})
	if err == nil || err.Error() != "--interactive requires a TTY input and output" {
		t.Fatalf("expected TTY error, got %v", err)
	}
}
