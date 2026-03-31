package cmd

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"charm.land/bubbles/v2/help"
	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/progress"
	"charm.land/bubbles/v2/table"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/evalsvc"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/evalsvc/scoring"
)

type evalDashboardOptions struct {
	Input        evalsvc.Input
	BaselinePath string
}

type evalDashboardView int

const (
	evalDashboardViewExperiments evalDashboardView = iota
	evalDashboardViewCases
	evalDashboardViewAssertions
	evalDashboardViewErrors
)

type evalDashboardSortMode int

const (
	evalDashboardSortDefault evalDashboardSortMode = iota
	evalDashboardSortScore
	evalDashboardSortPassRate
	evalDashboardSortFailures
	evalDashboardSortLatency
)

type evalDashboardKeyMap struct {
	ToggleHelp key.Binding
	Quit       key.Binding
	NextView   key.Binding
	Sort       key.Binding
	Reverse    key.Binding
	Filter     key.Binding
	Drilldown  key.Binding
	Back       key.Binding
}

func defaultEvalDashboardKeyMap() evalDashboardKeyMap {
	return evalDashboardKeyMap{
		ToggleHelp: key.NewBinding(
			key.WithKeys("?"),
			key.WithHelp("?", "toggle help"),
		),
		Quit: key.NewBinding(
			key.WithKeys("q", "ctrl+c"),
			key.WithHelp("q", "quit"),
		),
		NextView: key.NewBinding(
			key.WithKeys("tab"),
			key.WithHelp("tab", "next view"),
		),
		Sort: key.NewBinding(
			key.WithKeys("s"),
			key.WithHelp("s", "sort"),
		),
		Reverse: key.NewBinding(
			key.WithKeys("r"),
			key.WithHelp("r", "reverse"),
		),
		Filter: key.NewBinding(
			key.WithKeys("/"),
			key.WithHelp("/", "filter"),
		),
		Drilldown: key.NewBinding(
			key.WithKeys("enter"),
			key.WithHelp("enter", "drill down"),
		),
		Back: key.NewBinding(
			key.WithKeys("esc"),
			key.WithHelp("esc", "back"),
		),
	}
}

func (k evalDashboardKeyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.NextView, k.Sort, k.Filter, k.Drilldown, k.Back, k.Quit}
}

func (k evalDashboardKeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{{k.NextView, k.Sort, k.Reverse, k.Filter, k.Drilldown, k.Back, k.ToggleHelp, k.Quit}}
}

type evalExperimentProgress struct {
	experimentID          string
	totalRuns             int
	startedRuns           int
	completedRuns         int
	successfulRuns        int
	failedRuns            int
	passCount             int
	reviewCount           int
	failCount             int
	placeholderViolations int
	judgeFailures         int
	transportFailures     int
	assertionFailures     int
	latencySumMS          float64
	weightedScoreSum      float64
	finalScoreSum         float64
	scoreSums             map[string]float64
	scoreCounts           map[string]int
}

type evalFailureBucket struct {
	name        string
	count       int
	examples    []string
	lastMessage string
}

type evalProgressMsg struct {
	event evalsvc.ProgressEvent
}

type evalFinishedMsg struct {
	report evalsvc.Report
	err    error
}

type evalTableRowMeta struct {
	experimentID string
	caseID       string
	assertion    string
	errorType    string
}

type evalDashboardModel struct {
	opts   evalDashboardOptions
	input  evalsvc.Input
	cancel context.CancelFunc

	keys   evalDashboardKeyMap
	help   help.Model
	bar    progress.Model
	tbl    table.Model
	filter textinput.Model

	width  int
	height int

	startedAt time.Time

	caseCount      int
	totalRuns      int
	startedRuns    int
	completedRuns  int
	successfulRuns int
	failedRuns     int

	experimentOrder []string
	experiments     map[string]*evalExperimentProgress
	scoreColumns    []string
	runs            []evalsvc.RunResult
	runIndex        map[string]evalsvc.RunResult
	failureBuckets  map[string]*evalFailureBucket

	view            evalDashboardView
	sortMode        evalDashboardSortMode
	reverse         bool
	filtering       bool
	drillExperiment string
	rowMeta         []evalTableRowMeta

	report   *evalsvc.Report
	runErr   error
	done     bool
	baseline *evalsvc.Report

	titleStyle   lipgloss.Style
	sectionStyle lipgloss.Style
	metaStyle    lipgloss.Style
	errorStyle   lipgloss.Style
	successStyle lipgloss.Style
	failStyle    lipgloss.Style
	warnStyle    lipgloss.Style
	pendingStyle lipgloss.Style
	detailStyle  lipgloss.Style
}

func runEvalDashboard(w io.Writer, opts evalDashboardOptions) error {
	if !isTTYWriter(w) || !isTTYInput(os.Stdin) {
		return fmt.Errorf("--interactive requires a TTY input and output")
	}

	var baseline *evalsvc.Report
	if strings.TrimSpace(opts.BaselinePath) != "" {
		report, err := loadEvalReport(opts.BaselinePath)
		if err != nil {
			return fmt.Errorf("load baseline: %w", err)
		}
		baseline = &report
	}

	ctx, cancel := context.WithCancel(backgroundContext())
	defer cancel()

	model := newEvalDashboardModel(opts, baseline, cancel)
	program := tea.NewProgram(
		model,
		tea.WithOutput(w),
		tea.WithInput(os.Stdin),
	)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		report, err := evalRunWithProgressFunc(ctx, opts.Input, func(event evalsvc.ProgressEvent) {
			program.Send(evalProgressMsg{event: event})
		})
		program.Send(evalFinishedMsg{report: report, err: err})
	}()

	finalModel, err := program.Run()
	cancel()
	if err != nil {
		wg.Wait()
		return err
	}
	wg.Wait()

	typed, ok := finalModel.(evalDashboardModel)
	if !ok {
		return fmt.Errorf("unexpected eval dashboard model type %T", finalModel)
	}
	if typed.runErr != nil {
		return typed.runErr
	}

	return nil
}

func newEvalDashboardModel(opts evalDashboardOptions, baseline *evalsvc.Report, cancel context.CancelFunc) evalDashboardModel {
	keyMap := defaultEvalDashboardKeyMap()
	styles := table.DefaultStyles()
	styles.Header = styles.Header.Bold(true).Foreground(lipgloss.Color("39"))
	styles.Selected = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("230")).Background(lipgloss.Color("62"))

	tbl := table.New(
		table.WithFocused(true),
		table.WithStyles(styles),
		table.WithColumns(evalExperimentTableColumns(nil, baseline != nil)),
		table.WithHeight(12),
	)
	bar := progress.New(progress.WithWidth(40), progress.WithDefaultBlend())
	filter := textinput.New()
	filter.Prompt = "/ "
	filter.Placeholder = "filter rows"

	return evalDashboardModel{
		opts:           opts,
		input:          opts.Input,
		cancel:         cancel,
		keys:           keyMap,
		help:           help.New(),
		bar:            bar,
		tbl:            tbl,
		filter:         filter,
		startedAt:      time.Now(),
		view:           evalDashboardViewExperiments,
		experiments:    map[string]*evalExperimentProgress{},
		runIndex:       map[string]evalsvc.RunResult{},
		failureBuckets: map[string]*evalFailureBucket{},
		baseline:       baseline,
		titleStyle:     lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("45")),
		sectionStyle:   lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("39")),
		metaStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("244")),
		errorStyle:     lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true),
		successStyle:   lipgloss.NewStyle().Foreground(lipgloss.Color("42")),
		failStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("203")),
		warnStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("214")),
		pendingStyle:   lipgloss.NewStyle().Foreground(lipgloss.Color("244")),
		detailStyle:    lipgloss.NewStyle().Foreground(lipgloss.Color("111")),
	}
}

func (m evalDashboardModel) Init() tea.Cmd { return nil }

func (m evalDashboardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case progress.FrameMsg:
		bar, cmd := m.bar.Update(msg)
		m.bar = bar
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
		return m, tea.Batch(cmds...)
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.bar.SetWidth(max(20, msg.Width-24))
		m.tbl.SetWidth(max(72, msg.Width-2))
		m.tbl.SetHeight(max(8, msg.Height-15))
		m.help.SetWidth(msg.Width)
		return m, nil
	case tea.KeyPressMsg:
		if m.filtering {
			switch msg.String() {
			case "esc":
				m.filtering = false
				m.filter.SetValue("")
				m.refreshTable()
				return m, nil
			case "enter":
				m.filtering = false
				m.refreshTable()
				return m, nil
			}
			var cmd tea.Cmd
			m.filter, cmd = m.filter.Update(msg)
			if cmd != nil {
				cmds = append(cmds, cmd)
			}
			m.refreshTable()
			return m, tea.Batch(cmds...)
		}
		switch {
		case key.Matches(msg, m.keys.Quit):
			m.cancel()
			return m, tea.Quit
		case key.Matches(msg, m.keys.ToggleHelp):
			m.help.ShowAll = !m.help.ShowAll
			return m, nil
		case key.Matches(msg, m.keys.NextView):
			m.view = (m.view + 1) % 4
			m.refreshTable()
			return m, nil
		case key.Matches(msg, m.keys.Sort):
			m.sortMode = (m.sortMode + 1) % 5
			m.refreshTable()
			return m, nil
		case key.Matches(msg, m.keys.Reverse):
			m.reverse = !m.reverse
			m.refreshTable()
			return m, nil
		case key.Matches(msg, m.keys.Filter):
			m.filtering = true
			m.filter.Focus()
			return m, nil
		case key.Matches(msg, m.keys.Drilldown):
			m.drilldown()
			m.refreshTable()
			return m, nil
		case key.Matches(msg, m.keys.Back):
			if m.drillExperiment != "" {
				m.drillExperiment = ""
				m.view = evalDashboardViewExperiments
				m.refreshTable()
				return m, nil
			}
		}
	case evalProgressMsg:
		if cmd := m.applyProgress(msg.event); cmd != nil {
			cmds = append(cmds, cmd)
		}
		return m, tea.Batch(cmds...)
	case evalFinishedMsg:
		m.done = true
		if msg.report.Input.EvalSetPath != "" {
			m.input = msg.report.Input
			m.report = &msg.report
		}
		m.runErr = msg.err
		m.refreshTable()
		return m, nil
	}

	var cmd tea.Cmd
	m.tbl, cmd = m.tbl.Update(msg)
	if cmd != nil {
		cmds = append(cmds, cmd)
	}
	return m, tea.Batch(cmds...)
}

func (m evalDashboardModel) View() tea.View {
	title := m.titleStyle.Render("hyperlocalise eval dashboard")
	state := "running"
	if m.done {
		state = "completed"
	}
	if m.runErr != nil {
		state = "failed"
	}
	scope := m.metaStyle.Render(fmt.Sprintf(
		"state=%s  view=%s  sort=%s  reverse=%t  dataset=%s",
		state,
		m.viewLabel(),
		m.sortModeLabel(),
		m.reverse,
		emptyDash(m.input.EvalSetPath),
	))
	judgeLine := m.metaStyle.Render(fmt.Sprintf(
		"judge=%s/%s  assertions=%s  report=%s  baseline=%s",
		emptyDash(m.input.EvalProvider),
		emptyDash(m.input.EvalModel),
		evalDashboardAssertions(m.input.Assertions),
		emptyDash(m.input.OutputPath),
		emptyDash(m.opts.BaselinePath),
	))
	progressLine := strings.Join([]string{
		fmt.Sprintf("started=%d/%d", m.startedRuns, m.totalRuns),
		fmt.Sprintf("completed=%d/%d", m.completedRuns, m.totalRuns),
		m.successStyle.Render(fmt.Sprintf("transport_ok=%d", m.successfulRuns)),
		m.failStyle.Render(fmt.Sprintf("transport_failed=%d", m.failedRuns)),
		fmt.Sprintf("elapsed=%s", formatEvalDuration(time.Since(m.startedAt))),
		fmt.Sprintf("eta=%s", m.etaString()),
	}, "  ")
	progressBar := m.bar.View()
	if m.done {
		progressLine = progressLine + "  press q to exit"
	}
	legend := m.metaStyle.Render("legend: status done/running/pending | score >=0.85 green, >=0.70 amber, else red | pass_rate >=0.90 green, >=0.70 amber, else red")

	parts := []string{title, scope, judgeLine, progressBar, progressLine, legend}
	if m.filtering {
		parts = append(parts, m.filter.View())
	} else if value := strings.TrimSpace(m.filter.Value()); value != "" {
		parts = append(parts, m.metaStyle.Render("filter="+value))
	}
	if summary := m.finalSummaryLine(); summary != "" {
		parts = append(parts, summary)
	}
	parts = append(parts, "", m.sectionStyle.Render(m.viewTitle()), m.tbl.View())
	if detail := m.selectedDetail(); detail != "" {
		parts = append(parts, "", m.detailStyle.Render(detail))
	}
	if m.runErr != nil {
		parts = append(parts, "", m.errorStyle.Render(m.runErr.Error()))
	}
	parts = append(parts, "", m.metaStyle.Render(m.tbl.HelpView()), m.help.View(m.keys))
	view := tea.NewView(strings.Join(parts, "\n"))
	view.AltScreen = true
	return view
}

func (m *evalDashboardModel) applyProgress(event evalsvc.ProgressEvent) tea.Cmd {
	switch event.Kind {
	case evalsvc.ProgressEventPlanned:
		m.caseCount = event.CaseCount
		m.totalRuns = event.TotalRuns
		m.experimentOrder = append([]string(nil), event.ExperimentIDs...)
		for _, experimentID := range event.ExperimentIDs {
			m.ensureExperiment(experimentID).totalRuns = event.CaseCount
		}
	case evalsvc.ProgressEventRunStarted:
		m.totalRuns = event.TotalRuns
		m.startedRuns = event.StartedRuns
		if event.Run != nil {
			m.applyRunStarted(*event.Run)
		}
	case evalsvc.ProgressEventRunCompleted:
		m.totalRuns = event.TotalRuns
		m.startedRuns = event.StartedRuns
		m.completedRuns = event.CompletedRuns
		m.successfulRuns = event.SuccessfulRuns
		m.failedRuns = event.FailedRuns
		if event.Run != nil {
			m.applyRun(*event.Run)
		}
	}
	m.refreshTable()
	return m.setProgressCmd()
}

func (m *evalDashboardModel) setProgressCmd() tea.Cmd {
	if m.totalRuns <= 0 {
		return nil
	}
	completed := m.completedRuns
	if completed < 0 {
		completed = 0
	}
	if completed > m.totalRuns {
		completed = m.totalRuns
	}
	return m.bar.SetPercent(float64(completed) / float64(m.totalRuns))
}

func (m *evalDashboardModel) ensureExperiment(experimentID string) *evalExperimentProgress {
	row, ok := m.experiments[experimentID]
	if ok {
		return row
	}
	row = &evalExperimentProgress{
		experimentID: experimentID,
		scoreSums:    map[string]float64{},
		scoreCounts:  map[string]int{},
	}
	m.experiments[experimentID] = row
	if !slicesContains(m.experimentOrder, experimentID) {
		m.experimentOrder = append(m.experimentOrder, experimentID)
	}
	return row
}

func (m *evalDashboardModel) applyRunStarted(run evalsvc.RunResult) {
	row := m.ensureExperiment(run.ExperimentID)
	if row.totalRuns == 0 && m.caseCount > 0 {
		row.totalRuns = m.caseCount
	}
	row.startedRuns++
}

func (m *evalDashboardModel) applyRun(run evalsvc.RunResult) {
	row := m.ensureExperiment(run.ExperimentID)
	if row.totalRuns == 0 && m.caseCount > 0 {
		row.totalRuns = m.caseCount
	}
	row.completedRuns++
	if strings.TrimSpace(run.Error) == "" {
		row.successfulRuns++
	} else {
		row.failedRuns++
		row.transportFailures++
	}
	switch run.Decision {
	case "pass":
		row.passCount++
	case "review":
		row.reviewCount++
	case "fail":
		row.failCount++
	}
	row.latencySumMS += run.LatencyMS
	row.weightedScoreSum += run.Quality.WeightedAggregate
	row.finalScoreSum += run.FinalScore
	for _, hardFail := range run.Quality.HardFails {
		if hardFail == scoring.HardFailPlaceholderDrop {
			row.placeholderViolations++
		}
	}
	for _, result := range run.AssertionResults {
		if !result.Passed {
			row.assertionFailures++
		}
	}
	for name, score := range run.Scores {
		m.addScore(row, experimentScoreLabel(name), score)
	}
	for name, result := range run.JudgeResults {
		if result.Score != nil {
			m.addScore(row, experimentScoreLabel(name), *result.Score)
		}
		if strings.TrimSpace(result.Error) != "" {
			row.judgeFailures++
		}
	}

	m.runs = append(m.runs, run)
	m.runIndex[runKey(run)] = run
	m.recordFailureBuckets(run)
}

func (m *evalDashboardModel) addScore(row *evalExperimentProgress, label string, score float64) {
	row.scoreSums[label] += score
	row.scoreCounts[label]++
	if slicesContains(m.scoreColumns, label) {
		return
	}
	m.scoreColumns = append(m.scoreColumns, label)
	sort.Strings(m.scoreColumns)
}

func (m *evalDashboardModel) recordFailureBuckets(run evalsvc.RunResult) {
	record := func(name string, message string) {
		bucket, ok := m.failureBuckets[name]
		if !ok {
			bucket = &evalFailureBucket{name: name}
			m.failureBuckets[name] = bucket
		}
		bucket.count++
		bucket.lastMessage = message
		if len(bucket.examples) < 3 {
			bucket.examples = append(bucket.examples, fmt.Sprintf("%s @ %s", run.CaseID, run.ExperimentID))
		}
	}
	if strings.TrimSpace(run.Error) != "" {
		record(classifyRunError(run.Error), run.Error)
	}
	judgeNames := make([]string, 0, len(run.JudgeResults))
	for name := range run.JudgeResults {
		judgeNames = append(judgeNames, name)
	}
	sort.Strings(judgeNames)
	for _, name := range judgeNames {
		result := run.JudgeResults[name]
		if strings.TrimSpace(result.Error) != "" {
			record("judge:"+experimentScoreLabel(name), result.Error)
		}
	}
	for _, result := range run.AssertionResults {
		if !result.Passed {
			message := result.Type
			if result.Error != "" {
				message = message + ": " + result.Error
			}
			record("assertion:"+result.Type, message)
		}
	}
	for _, hardFail := range run.Quality.HardFails {
		record("quality:"+hardFail, hardFail)
	}
}

func classifyRunError(err string) string {
	msg := strings.ToLower(strings.TrimSpace(err))
	switch {
	case strings.Contains(msg, "placeholder"):
		return "transport:placeholder"
	case strings.Contains(msg, "icu") || strings.Contains(msg, "invariant"):
		return "transport:icu"
	case strings.Contains(msg, "timeout"):
		return "transport:timeout"
	default:
		return "transport:error"
	}
}

func (m *evalDashboardModel) refreshTable() {
	var cols []table.Column
	var rows []table.Row
	var meta []evalTableRowMeta

	switch m.view {
	case evalDashboardViewCases:
		cols, rows, meta = m.caseRows()
	case evalDashboardViewAssertions:
		cols, rows, meta = m.assertionRows()
	case evalDashboardViewErrors:
		cols, rows, meta = m.errorRows()
	default:
		cols, rows, meta = m.experimentRows()
	}

	m.tbl.SetRows(nil)
	m.tbl.SetColumns(cols)
	m.rowMeta = meta
	cursor := m.tbl.Cursor()
	m.tbl.SetRows(rows)
	if cursor >= len(rows) {
		cursor = len(rows) - 1
	}
	if cursor < 0 {
		cursor = 0
	}
	m.tbl.SetCursor(cursor)
}

func (m *evalDashboardModel) experimentRows() ([]table.Column, []table.Row, []evalTableRowMeta) {
	type row struct {
		progress evalExperimentProgress
	}
	list := make([]row, 0, len(m.experimentOrder))
	for _, experimentID := range m.experimentOrder {
		progress := m.experiments[experimentID]
		if progress == nil {
			progress = &evalExperimentProgress{experimentID: experimentID, totalRuns: m.caseCount}
		}
		if !m.matchesFilter(experimentID) {
			continue
		}
		list = append(list, row{progress: *progress})
	}
	sort.SliceStable(list, func(i, j int) bool {
		return m.compareExperiments(list[i].progress, list[j].progress)
	})

	cols := evalExperimentTableColumns(m.scoreColumns, m.baseline != nil)
	rows := make([]table.Row, 0, len(list))
	meta := make([]evalTableRowMeta, 0, len(list))
	for _, item := range list {
		progress := item.progress
		progressTotal := progress.totalRuns
		if progressTotal == 0 {
			progressTotal = m.caseCount
		}
		status := "pending"
		switch {
		case progress.completedRuns >= progressTotal && progressTotal > 0:
			status = "done"
		case progress.startedRuns > progress.completedRuns:
			status = "running"
		}
		row := table.Row{
			progress.experimentID,
			m.renderStatus(status),
			fmt.Sprintf("%d/%d", progress.completedRuns, progressTotal),
			fmt.Sprintf("%d", progress.successfulRuns),
			fmt.Sprintf("%d", progress.failedRuns),
			m.renderScore(evalDashboardAverageValue(progress.weightedScoreSum, progress.completedRuns)),
			m.renderPassRate(evalDashboardPercentValue(progress.passCount, progress.completedRuns)),
			fmt.Sprintf("%d", progress.placeholderViolations),
			evalDashboardAverage(progress.latencySumMS, progress.completedRuns),
		}
		if m.baseline != nil {
			row = append(row, m.renderDelta(m.baselineExperimentDelta(progress.experimentID, evalDashboardAverageValue(progress.weightedScoreSum, progress.completedRuns))))
		}
		for _, column := range m.scoreColumns {
			row = append(row, m.renderAssertionMetric(evalDashboardAverageValue(progress.scoreSums[column], progress.scoreCounts[column])))
		}
		rows = append(rows, row)
		meta = append(meta, evalTableRowMeta{experimentID: progress.experimentID})
	}
	return cols, rows, meta
}

func evalExperimentTableColumns(scoreColumns []string, hasBaseline bool) []table.Column {
	cols := []table.Column{
		{Title: "Experiment", Width: 30},
		{Title: "Status", Width: 10},
		{Title: "Progress", Width: 10},
		{Title: "OK", Width: 6},
		{Title: "Fail", Width: 6},
		{Title: "Score", Width: 8},
		{Title: "Pass Rate", Width: 10},
		{Title: "Placeholder", Width: 12},
		{Title: "Latency ms", Width: 10},
	}
	if hasBaseline {
		cols = append(cols, table.Column{Title: "Delta", Width: 8})
	}
	for _, column := range scoreColumns {
		cols = append(cols, table.Column{Title: column, Width: 12})
	}
	return cols
}

func (m *evalDashboardModel) caseRows() ([]table.Column, []table.Row, []evalTableRowMeta) {
	type row struct{ run evalsvc.RunResult }
	list := make([]row, 0, len(m.runs))
	for _, run := range m.runs {
		if m.drillExperiment != "" && run.ExperimentID != m.drillExperiment {
			continue
		}
		if !m.matchesFilter(run.CaseID + " " + run.ExperimentID + " " + run.Decision + " " + run.Error) {
			continue
		}
		list = append(list, row{run: run})
	}
	sort.SliceStable(list, func(i, j int) bool {
		return m.compareRuns(list[i].run, list[j].run)
	})
	cols := []table.Column{
		{Title: "Case", Width: 24},
		{Title: "Experiment", Width: 24},
		{Title: "Decision", Width: 10},
		{Title: "Status", Width: 10},
		{Title: "Final", Width: 8},
		{Title: "Score", Width: 8},
		{Title: "Latency", Width: 8},
		{Title: "Reason", Width: 20},
	}
	rows := make([]table.Row, 0, len(list))
	meta := make([]evalTableRowMeta, 0, len(list))
	for _, item := range list {
		run := item.run
		status := "ok"
		if strings.TrimSpace(run.Error) != "" {
			status = "failed"
		} else if run.Decision == "review" || run.Decision == "fail" {
			status = run.Decision
		}
		rows = append(rows, table.Row{
			run.CaseID,
			run.ExperimentID,
			m.renderDecision(run.Decision),
			m.renderCaseStatus(status),
			m.renderScore(floatPtr(run.FinalScore)),
			m.renderScore(floatPtr(run.Quality.WeightedAggregate)),
			fmt.Sprintf("%.1f", run.LatencyMS),
			evalTrim(reasonForRun(run), 22),
		})
		meta = append(meta, evalTableRowMeta{caseID: run.CaseID, experimentID: run.ExperimentID})
	}
	return cols, rows, meta
}

func (m *evalDashboardModel) assertionRows() ([]table.Column, []table.Row, []evalTableRowMeta) {
	type row struct {
		experiment string
		assertion  string
		score      *float64
		coverage   int
	}
	list := make([]row, 0)
	for _, experimentID := range m.experimentOrder {
		progress := m.experiments[experimentID]
		if progress == nil {
			continue
		}
		for _, assertion := range m.scoreColumns {
			coverage := progress.scoreCounts[assertion]
			if coverage == 0 {
				continue
			}
			if !m.matchesFilter(experimentID + " " + assertion) {
				continue
			}
			list = append(list, row{
				experiment: experimentID,
				assertion:  assertion,
				score:      evalDashboardAverageValue(progress.scoreSums[assertion], coverage),
				coverage:   coverage,
			})
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		switch m.sortMode {
		case evalDashboardSortFailures:
			return sortBoolWithReverse(list[i].coverage > list[j].coverage, m.reverse)
		case evalDashboardSortScore:
			return compareFloatPtr(list[i].score, list[j].score, m.reverse)
		default:
			less := list[i].experiment < list[j].experiment
			if list[i].experiment == list[j].experiment {
				less = list[i].assertion < list[j].assertion
			}
			if m.reverse {
				return !less
			}
			return less
		}
	})
	cols := []table.Column{
		{Title: "Experiment", Width: 28},
		{Title: "Assertion", Width: 18},
		{Title: "Avg Score", Width: 10},
		{Title: "Coverage", Width: 10},
	}
	rows := make([]table.Row, 0, len(list))
	meta := make([]evalTableRowMeta, 0, len(list))
	for _, item := range list {
		rows = append(rows, table.Row{
			item.experiment,
			item.assertion,
			m.renderAssertionMetric(item.score),
			fmt.Sprintf("%d", item.coverage),
		})
		meta = append(meta, evalTableRowMeta{experimentID: item.experiment, assertion: item.assertion})
	}
	return cols, rows, meta
}

func (m *evalDashboardModel) errorRows() ([]table.Column, []table.Row, []evalTableRowMeta) {
	keys := make([]string, 0, len(m.failureBuckets))
	for name := range m.failureBuckets {
		if m.matchesFilter(name + " " + m.failureBuckets[name].lastMessage) {
			keys = append(keys, name)
		}
	}
	sort.SliceStable(keys, func(i, j int) bool {
		left := m.failureBuckets[keys[i]]
		right := m.failureBuckets[keys[j]]
		if left.count == right.count {
			less := keys[i] < keys[j]
			if m.reverse {
				return !less
			}
			return less
		}
		if m.reverse {
			return left.count < right.count
		}
		return left.count > right.count
	})
	cols := []table.Column{
		{Title: "Category", Width: 26},
		{Title: "Count", Width: 8},
		{Title: "Example", Width: 30},
		{Title: "Last Message", Width: 30},
	}
	rows := make([]table.Row, 0, len(keys))
	meta := make([]evalTableRowMeta, 0, len(keys))
	for _, name := range keys {
		bucket := m.failureBuckets[name]
		example := "-"
		if len(bucket.examples) > 0 {
			example = bucket.examples[0]
		}
		rows = append(rows, table.Row{
			name,
			fmt.Sprintf("%d", bucket.count),
			evalTrim(example, 32),
			evalTrim(bucket.lastMessage, 32),
		})
		meta = append(meta, evalTableRowMeta{errorType: name})
	}
	return cols, rows, meta
}

func (m *evalDashboardModel) drilldown() {
	rowIndex := m.tbl.Cursor()
	if rowIndex < 0 || rowIndex >= len(m.rowMeta) {
		return
	}
	meta := m.rowMeta[rowIndex]
	switch m.view {
	case evalDashboardViewExperiments:
		if meta.experimentID != "" {
			m.drillExperiment = meta.experimentID
			m.view = evalDashboardViewCases
		}
	case evalDashboardViewCases:
		if meta.experimentID != "" {
			m.drillExperiment = meta.experimentID
		}
	}
}

func (m evalDashboardModel) selectedDetail() string {
	rowIndex := m.tbl.Cursor()
	if rowIndex < 0 || rowIndex >= len(m.rowMeta) {
		return ""
	}
	meta := m.rowMeta[rowIndex]
	switch m.view {
	case evalDashboardViewExperiments:
		progress := m.experiments[meta.experimentID]
		if progress == nil {
			return ""
		}
		lines := []string{
			fmt.Sprintf("selected experiment=%s", meta.experimentID),
			fmt.Sprintf("quality pass=%d review=%d fail=%d transport_failed=%d judge_failures=%d assertion_failures=%d", progress.passCount, progress.reviewCount, progress.failCount, progress.transportFailures, progress.judgeFailures, progress.assertionFailures),
			"next action: enter to inspect case-level runs; tab for assertions/errors",
		}
		if m.baseline != nil {
			if delta := m.baselineExperimentDelta(meta.experimentID, evalDashboardAverageValue(progress.weightedScoreSum, progress.completedRuns)); delta != nil {
				lines = append(lines, fmt.Sprintf("baseline delta=%+.3f vs %s", *delta, filepath.Base(m.opts.BaselinePath)))
			}
		}
		return strings.Join(lines, "\n")
	case evalDashboardViewCases:
		run, ok := m.runIndex[meta.caseID+"|"+meta.experimentID]
		if !ok {
			return ""
		}
		lines := []string{
			fmt.Sprintf("selected case=%s  experiment=%s", run.CaseID, run.ExperimentID),
			fmt.Sprintf("decision=%s final=%.3f heuristic=%.3f latency=%.1fms", emptyDash(run.Decision), run.FinalScore, run.Quality.WeightedAggregate, run.LatencyMS),
			fmt.Sprintf("reason=%s", reasonForRun(run)),
		}
		if len(run.AssertionResults) > 0 {
			lines = append(lines, fmt.Sprintf("assertions=%s", summarizeAssertionResults(run.AssertionResults)))
		}
		return strings.Join(lines, "\n")
	case evalDashboardViewAssertions:
		return fmt.Sprintf("selected assertion=%s  experiment=%s", meta.assertion, meta.experimentID)
	case evalDashboardViewErrors:
		bucket := m.failureBuckets[meta.errorType]
		if bucket == nil {
			return ""
		}
		return fmt.Sprintf("selected error bucket=%s  count=%d  examples=%s", meta.errorType, bucket.count, strings.Join(bucket.examples, ", "))
	default:
		return ""
	}
}

func summarizeAssertionResults(results []evalsvc.AssertionResult) string {
	parts := make([]string, 0, len(results))
	for _, result := range results {
		state := "pass"
		if !result.Passed {
			state = "fail"
		}
		parts = append(parts, result.Type+"="+state)
	}
	return strings.Join(parts, ", ")
}

func reasonForRun(run evalsvc.RunResult) string {
	if strings.TrimSpace(run.Error) != "" {
		return run.Error
	}
	for _, result := range run.AssertionResults {
		if !result.Passed {
			if result.Error != "" {
				return result.Type + ": " + result.Error
			}
			return result.Type + " failed"
		}
	}
	judgeNames := make([]string, 0, len(run.JudgeResults))
	for name := range run.JudgeResults {
		judgeNames = append(judgeNames, name)
	}
	sort.Strings(judgeNames)
	for _, name := range judgeNames {
		result := run.JudgeResults[name]
		if strings.TrimSpace(result.Error) != "" {
			return experimentScoreLabel(name) + ": " + result.Error
		}
	}
	if len(run.Quality.HardFails) > 0 {
		return strings.Join(run.Quality.HardFails, ",")
	}
	return "no critical issues"
}

func (m evalDashboardModel) finalSummaryLine() string {
	if !m.done || m.report == nil {
		return ""
	}
	score, source, err := selectCompareScore(*m.report)
	if err != nil {
		return m.errorStyle.Render("summary: " + err.Error())
	}
	summary := fmt.Sprintf(
		"summary: quality_score=%.3f source=%s cases=%d experiments=%d report=%s",
		score,
		source,
		len(m.report.CaseSummaries),
		len(m.report.ExperimentSummaries),
		emptyDash(m.input.OutputPath),
	)
	if m.baseline != nil {
		bScore, _, bErr := selectCompareScore(*m.baseline)
		if bErr == nil {
			summary += fmt.Sprintf(" baseline_delta=%+.3f", score-bScore)
		}
	}
	return m.metaStyle.Render(summary)
}

func (m evalDashboardModel) etaString() string {
	if m.done {
		return "00:00"
	}
	if m.completedRuns <= 0 {
		return "--:--"
	}
	elapsed := time.Since(m.startedAt)
	perRun := elapsed / time.Duration(m.completedRuns)
	remaining := m.totalRuns - m.completedRuns
	if remaining < 0 {
		remaining = 0
	}
	return formatEvalDuration(perRun * time.Duration(remaining))
}

func formatEvalDuration(d time.Duration) string {
	totalSeconds := int(d.Seconds())
	if totalSeconds < 0 {
		totalSeconds = 0
	}
	minutes := totalSeconds / 60
	seconds := totalSeconds % 60
	if minutes >= 60 {
		hours := minutes / 60
		minutes = minutes % 60
		return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, seconds)
	}
	return fmt.Sprintf("%02d:%02d", minutes, seconds)
}

func (m evalDashboardModel) matchesFilter(value string) bool {
	filter := strings.ToLower(strings.TrimSpace(m.filter.Value()))
	if filter == "" {
		return true
	}
	return strings.Contains(strings.ToLower(value), filter)
}

func (m evalDashboardModel) viewLabel() string {
	switch m.view {
	case evalDashboardViewCases:
		return "cases"
	case evalDashboardViewAssertions:
		return "assertions"
	case evalDashboardViewErrors:
		return "errors"
	default:
		return "experiments"
	}
}

func (m evalDashboardModel) viewTitle() string {
	switch m.view {
	case evalDashboardViewCases:
		if strings.TrimSpace(m.drillExperiment) != "" {
			return fmt.Sprintf("Cases: %s", m.drillExperiment)
		}
		return "Cases"
	case evalDashboardViewAssertions:
		return "Assertions"
	case evalDashboardViewErrors:
		return "Errors"
	default:
		return "Experiments"
	}
}

func (m evalDashboardModel) sortModeLabel() string {
	switch m.sortMode {
	case evalDashboardSortScore:
		return "score"
	case evalDashboardSortPassRate:
		return "pass_rate"
	case evalDashboardSortFailures:
		return "failures"
	case evalDashboardSortLatency:
		return "latency"
	default:
		return "default"
	}
}

func (m evalDashboardModel) compareExperiments(left, right evalExperimentProgress) bool {
	var less bool
	switch m.sortMode {
	case evalDashboardSortScore:
		less = compareFloatPtrRaw(evalDashboardAverageValue(left.weightedScoreSum, left.completedRuns), evalDashboardAverageValue(right.weightedScoreSum, right.completedRuns))
	case evalDashboardSortPassRate:
		less = compareFloatPtrRaw(evalDashboardPercentValue(left.passCount, left.completedRuns), evalDashboardPercentValue(right.passCount, right.completedRuns))
	case evalDashboardSortFailures:
		if left.failedRuns == right.failedRuns {
			less = left.experimentID < right.experimentID
		} else {
			less = left.failedRuns > right.failedRuns
		}
	case evalDashboardSortLatency:
		less = compareFloatPtrRaw(evalDashboardAverageValue(left.latencySumMS, left.completedRuns), evalDashboardAverageValue(right.latencySumMS, right.completedRuns))
	default:
		less = left.experimentID < right.experimentID
	}
	if m.reverse {
		return !less
	}
	return less
}

func (m evalDashboardModel) compareRuns(left, right evalsvc.RunResult) bool {
	var less bool
	switch m.sortMode {
	case evalDashboardSortScore:
		less = compareFloatPtrRaw(floatPtr(left.FinalScore), floatPtr(right.FinalScore))
	case evalDashboardSortFailures:
		less = severityForRun(left) > severityForRun(right)
	case evalDashboardSortLatency:
		less = left.LatencyMS > right.LatencyMS
	default:
		if left.CaseID == right.CaseID {
			less = left.ExperimentID < right.ExperimentID
		} else {
			less = left.CaseID < right.CaseID
		}
	}
	if m.reverse {
		return !less
	}
	return less
}

func severityForRun(run evalsvc.RunResult) int {
	switch {
	case strings.TrimSpace(run.Error) != "":
		return 4
	case run.Decision == "fail":
		return 3
	case run.Decision == "review":
		return 2
	default:
		return 1
	}
}

func compareFloatPtrRaw(left, right *float64) bool {
	leftValue := -1.0
	rightValue := -1.0
	if left != nil {
		leftValue = *left
	}
	if right != nil {
		rightValue = *right
	}
	if leftValue == rightValue {
		return false
	}
	return leftValue > rightValue
}

func compareFloatPtr(left, right *float64, reverse bool) bool {
	less := compareFloatPtrRaw(left, right)
	if reverse {
		return !less
	}
	return less
}

func sortBoolWithReverse(less bool, reverse bool) bool {
	if reverse {
		return !less
	}
	return less
}

func (m evalDashboardModel) renderStatus(status string) string {
	switch status {
	case "done":
		return m.successStyle.Render(status)
	case "running":
		return m.warnStyle.Render(status)
	default:
		return m.pendingStyle.Render(status)
	}
}

func (m evalDashboardModel) renderDecision(decision string) string {
	switch decision {
	case "pass":
		return m.successStyle.Render(decision)
	case "review":
		return m.warnStyle.Render(decision)
	case "fail":
		return m.failStyle.Render(decision)
	default:
		return m.pendingStyle.Render(emptyDash(decision))
	}
}

func (m evalDashboardModel) renderCaseStatus(status string) string {
	switch status {
	case "ok":
		return m.successStyle.Render(status)
	case "review":
		return m.warnStyle.Render(status)
	default:
		return m.failStyle.Render(status)
	}
}

func (m evalDashboardModel) renderScore(score *float64) string {
	if score == nil {
		return "-"
	}
	text := fmt.Sprintf("%.3f", *score)
	switch {
	case *score >= 0.85:
		return m.successStyle.Render(text)
	case *score >= 0.70:
		return m.warnStyle.Render(text)
	default:
		return m.failStyle.Render(text)
	}
}

func (m evalDashboardModel) renderPassRate(passRate *float64) string {
	if passRate == nil {
		return "-"
	}
	text := fmt.Sprintf("%.1f%%", *passRate*100)
	switch {
	case *passRate >= 0.90:
		return m.successStyle.Render(text)
	case *passRate >= 0.70:
		return m.warnStyle.Render(text)
	default:
		return m.failStyle.Render(text)
	}
}

func (m evalDashboardModel) renderAssertionMetric(score *float64) string {
	return m.renderScore(score)
}

func (m evalDashboardModel) renderDelta(delta *float64) string {
	if delta == nil {
		return "-"
	}
	text := fmt.Sprintf("%+.3f", *delta)
	switch {
	case *delta > 0:
		return m.successStyle.Render(text)
	case *delta < 0:
		return m.failStyle.Render(text)
	default:
		return m.pendingStyle.Render(text)
	}
}

func (m evalDashboardModel) baselineExperimentDelta(experimentID string, score *float64) *float64 {
	if m.baseline == nil || score == nil {
		return nil
	}
	for _, summary := range m.baseline.ExperimentSummaries {
		if summary.ExperimentID != experimentID {
			continue
		}
		delta := *score - summary.WeightedScore
		return &delta
	}
	return nil
}

func evalDashboardAverage(sum float64, count int) string {
	score := evalDashboardAverageValue(sum, count)
	if score == nil {
		return "-"
	}
	return fmt.Sprintf("%.3f", *score)
}

func evalDashboardAverageValue(sum float64, count int) *float64 {
	if count <= 0 {
		return nil
	}
	value := sum / float64(count)
	return &value
}

func evalDashboardPercentValue(numerator, denominator int) *float64 {
	if denominator <= 0 {
		return nil
	}
	value := float64(numerator) / float64(denominator)
	return &value
}

func evalDashboardAssertions(assertions []string) string {
	if len(assertions) == 0 {
		return "-"
	}
	return strings.Join(assertions, ",")
}

func floatPtr(v float64) *float64 { return &v }

func runKey(run evalsvc.RunResult) string { return run.CaseID + "|" + run.ExperimentID }

func evalTrim(value string, maxWidth int) string {
	runes := []rune(value)
	if maxWidth <= 0 || len(runes) <= maxWidth {
		return value
	}
	if maxWidth <= 3 {
		return string(runes[:maxWidth])
	}
	return string(runes[:maxWidth-3]) + "..."
}

func slicesContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
