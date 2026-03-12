package cmd

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"charm.land/bubbles/v2/help"
	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/paginator"
	"charm.land/bubbles/v2/progress"
	"charm.land/bubbles/v2/table"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/runsvc"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/syncsvc"
	"github.com/sahilm/fuzzy"
)

type syncInteractiveExtra struct {
	forceConflicts bool
}

type syncInteractiveResult struct {
	options syncCommonOptions
	extra   syncInteractiveExtra
	execute bool
}

type syncInteractiveStep int

const (
	syncInteractiveStepLocale syncInteractiveStep = iota
	syncInteractiveStepFile
	syncInteractiveStepOptions
	syncInteractiveStepReview
	syncInteractiveStepRun
)

type syncInteractiveKeyMap struct {
	Back       key.Binding
	Quit       key.Binding
	Confirm    key.Binding
	TogglePick key.Binding
	ToggleAll  key.Binding
	Filter     key.Binding
	Inc        key.Binding
	Dec        key.Binding
	ToggleHelp key.Binding
}

func defaultSyncInteractiveKeyMap() syncInteractiveKeyMap {
	return syncInteractiveKeyMap{
		Back: key.NewBinding(
			key.WithKeys("esc"),
			key.WithHelp("esc", "back"),
		),
		Quit: key.NewBinding(
			key.WithKeys("q", "ctrl+c"),
			key.WithHelp("q", "quit"),
		),
		Confirm: key.NewBinding(
			key.WithKeys("enter"),
			key.WithHelp("enter", "confirm"),
		),
		TogglePick: key.NewBinding(
			key.WithKeys("space"),
			key.WithHelp("space", "toggle"),
		),
		ToggleAll: key.NewBinding(
			key.WithKeys("a"),
			key.WithHelp("a", "toggle all"),
		),
		Filter: key.NewBinding(
			key.WithKeys("/"),
			key.WithHelp("/", "filter"),
		),
		Inc: key.NewBinding(
			key.WithKeys("right", "+", "="),
			key.WithHelp("right/+", "next page"),
		),
		Dec: key.NewBinding(
			key.WithKeys("left", "-"),
			key.WithHelp("left/-", "prev page"),
		),
		ToggleHelp: key.NewBinding(
			key.WithKeys("?"),
			key.WithHelp("?", "toggle help"),
		),
	}
}

func (k syncInteractiveKeyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Confirm, k.TogglePick, k.ToggleAll, k.Filter, k.Back, k.ToggleHelp, k.Quit}
}

func (k syncInteractiveKeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{{k.Confirm, k.TogglePick, k.ToggleAll, k.Filter, k.Dec, k.Inc, k.Back, k.ToggleHelp, k.Quit}}
}

type syncInteractiveListItem struct {
	title       string
	description string
	value       string
}

func (i syncInteractiveListItem) Title() string       { return i.title }
func (i syncInteractiveListItem) Description() string { return i.description }
func (i syncInteractiveListItem) FilterValue() string {
	return i.title + " " + i.description + " " + i.value
}

type syncInteractiveModel struct {
	action string
	step   syncInteractiveStep

	catalog runsvc.SelectionCatalog
	options syncCommonOptions
	extra   syncInteractiveExtra

	selectedLocales map[string]struct{}
	selectedFiles   map[string]struct{}

	list   list.Model
	table  table.Model
	pager  paginator.Model
	bar    progress.Model
	filter textinput.Model
	help   help.Model
	keys   syncInteractiveKeyMap

	tableRows   []table.Row
	tableValues []string
	tableFilter string
	filtering   bool

	phase      string
	startedAt  time.Time
	finishedAt time.Time
	report     *syncsvc.Report
	runErr     error
	runStarted bool
	runMsgs    chan tea.Msg
	runCancel  context.CancelFunc
	runLogs    []string

	width   int
	height  int
	errMsg  string
	execute bool
	done    bool

	titleStyle  lipgloss.Style
	metaStyle   lipgloss.Style
	errorStyle  lipgloss.Style
	accentStyle lipgloss.Style
	okStyle     lipgloss.Style
	failStyle   lipgloss.Style
	warnStyle   lipgloss.Style
}

type syncExecutionStageMsg struct {
	phase    string
	complete int
	total    int
}

type syncExecutionPlanMsg struct {
	rows []table.Row
}

type syncExecutionFinishedMsg struct {
	report syncsvc.Report
	err    error
}

type syncExecutionLogMsg struct {
	line string
}

func runSyncInteractiveWizard(action string, seed syncCommonOptions, extra syncInteractiveExtra, output io.Writer) (syncInteractiveResult, error) {
	if !isTTYWriter(output) || !isTTYInput(os.Stdin) {
		return syncInteractiveResult{}, fmt.Errorf("--interactive requires a TTY input and output")
	}

	catalog, err := runsvc.BuildSelectionCatalog(seed.configPath)
	if err != nil {
		return syncInteractiveResult{}, err
	}

	m := newSyncInteractiveModel(action, catalog, seed, extra)
	p := tea.NewProgram(
		m,
		tea.WithOutput(output),
		tea.WithInput(os.Stdin),
	)
	finalModel, err := p.Run()
	if err != nil {
		return syncInteractiveResult{}, err
	}

	typed, ok := finalModel.(syncInteractiveModel)
	if !ok {
		return syncInteractiveResult{}, fmt.Errorf("unexpected interactive model type %T", finalModel)
	}
	if typed.runErr != nil {
		return syncInteractiveResult{}, typed.runErr
	}

	return syncInteractiveResult{
		options: typed.finalOptions(),
		extra:   typed.extra,
		execute: false,
	}, nil
}

func newSyncInteractiveModel(action string, catalog runsvc.SelectionCatalog, seed syncCommonOptions, extra syncInteractiveExtra) syncInteractiveModel {
	keys := defaultSyncInteractiveKeyMap()
	delegate := list.NewDefaultDelegate()
	l := list.New(nil, delegate, 0, 0)
	l.SetShowHelp(false)
	l.SetShowStatusBar(false)
	l.SetShowTitle(false)
	l.SetFilteringEnabled(true)
	l.AdditionalShortHelpKeys = keys.ShortHelp
	l.AdditionalFullHelpKeys = func() []key.Binding { return []key.Binding{keys.Back, keys.ToggleHelp, keys.Quit} }

	styles := table.DefaultStyles()
	styles.Header = styles.Header.Bold(true).Foreground(lipgloss.Color("39"))
	styles.Selected = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("230")).Background(lipgloss.Color("62"))
	tbl := table.New(
		table.WithFocused(true),
		table.WithStyles(styles),
		table.WithColumns([]table.Column{
			{Title: "Pick", Width: 7},
			{Title: "File", Width: 42},
			{Title: "Keys", Width: 8},
			{Title: "Targets", Width: 10},
		}),
	)

	pg := paginator.New()
	pg.Type = paginator.Arabic
	pg.PerPage = 8

	bar := progress.New(progress.WithWidth(40), progress.WithDefaultBlend())

	filter := textinput.New()
	filter.Prompt = "/ "
	filter.Placeholder = "fuzzy filter files"

	m := syncInteractiveModel{
		action:          action,
		step:            syncInteractiveStepLocale,
		catalog:         catalog,
		options:         seed,
		extra:           extra,
		selectedLocales: make(map[string]struct{}),
		selectedFiles:   make(map[string]struct{}),
		list:            l,
		table:           tbl,
		pager:           pg,
		bar:             bar,
		filter:          filter,
		help:            help.New(),
		keys:            keys,
		titleStyle:      lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("45")),
		metaStyle:       lipgloss.NewStyle().Foreground(lipgloss.Color("244")),
		errorStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true),
		accentStyle:     lipgloss.NewStyle().Foreground(lipgloss.Color("81")).Bold(true),
		okStyle:         lipgloss.NewStyle().Foreground(lipgloss.Color("42")).Bold(true),
		failStyle:       lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true),
		warnStyle:       lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true),
	}

	for _, locale := range m.catalogLocales() {
		selected := len(seed.locales) == 0 || containsString(seed.locales, locale)
		if m.action == "push" && locale == strings.TrimSpace(m.catalog.SourceLocale) {
			selected = true
		}
		if selected {
			m.selectedLocales[locale] = struct{}{}
		}
	}
	for _, path := range m.catalogFiles() {
		if len(seed.sourcePaths) == 0 || containsString(seed.sourcePaths, path) {
			m.selectedFiles[path] = struct{}{}
		}
	}
	m.refresh()
	return m
}

func (m syncInteractiveModel) Init() tea.Cmd { return nil }

func (m syncInteractiveModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.help.SetWidth(msg.Width)
		m.list.SetSize(msg.Width-2, max(8, msg.Height-10))
		m.table.SetWidth(max(40, msg.Width-2))
		m.table.SetHeight(max(8, msg.Height-14))
		m.pager.PerPage = max(5, msg.Height-16)
		m.bar.SetWidth(max(20, msg.Width-24))
		if m.step == syncInteractiveStepFile {
			m.applyPaginatedRows()
		}
		return m, nil
	case syncExecutionStageMsg:
		m.phase = msg.phase
		if msg.total > 0 {
			pct := float64(msg.complete) / float64(msg.total)
			cmd := m.bar.SetPercent(pct)
			return m, tea.Batch(cmd, waitForSyncInteractiveMsg(m.runMsgs))
		}
		return m, waitForSyncInteractiveMsg(m.runMsgs)
	case syncExecutionPlanMsg:
		if len(msg.rows) > 0 {
			m.tableRows = msg.rows
			m.pager.Page = 0
			m.applyPaginatedRows()
		}
		return m, waitForSyncInteractiveMsg(m.runMsgs)
	case syncExecutionLogMsg:
		if strings.TrimSpace(msg.line) != "" {
			m.runLogs = append(m.runLogs, msg.line)
		}
		return m, waitForSyncInteractiveMsg(m.runMsgs)
	case syncExecutionFinishedMsg:
		m.report = &msg.report
		m.runErr = msg.err
		m.finishedAt = time.Now()
		m.cancelRun()
		m.execute = msg.err == nil
		m.done = msg.err == nil
		if msg.err != nil {
			m.phase = "failed"
			m.runLogs = append(m.runLogs, "error: "+msg.err.Error())
		} else {
			m.phase = "completed"
			m.runLogs = append(m.runLogs, "sync completed")
		}
		for _, warning := range msg.report.Warnings {
			m.runLogs = append(m.runLogs, "warning: "+warning.Message)
		}
		m.tableRows, m.tableValues = m.executionRows()
		m.pager.Page = 0
		m.applyPaginatedRows()
		targetPercent := 1.0
		if msg.err != nil {
			targetPercent = 0.85
		}
		cmd := m.bar.SetPercent(targetPercent)
		return m, cmd
	case progress.FrameMsg:
		var cmd tea.Cmd
		m.bar, cmd = m.bar.Update(msg)
		return m, cmd
	case tea.KeyPressMsg:
		if m.filtering {
			switch msg.String() {
			case "esc":
				m.filtering = false
				m.tableFilter = ""
				m.filter.SetValue("")
				m.filter.Blur()
				m.refresh()
				m.table.SetCursor(0)
				return m, nil
			case "enter":
				m.filtering = false
				m.filter.Blur()
				m.tableFilter = strings.TrimSpace(m.filter.Value())
				m.refresh()
				m.table.SetCursor(0)
				return m, nil
			}
			var cmd tea.Cmd
			m.filter, cmd = m.filter.Update(msg)
			return m, cmd
		}

		switch {
		case key.Matches(msg, m.keys.Quit):
			m.cancelRun()
			m.done = true
			return m, tea.Quit
		case key.Matches(msg, m.keys.ToggleHelp):
			m.help.ShowAll = !m.help.ShowAll
			m.list.Help.ShowAll = m.help.ShowAll
			return m, nil
		case key.Matches(msg, m.keys.Back):
			if m.step == syncInteractiveStepLocale {
				m.done = true
				m.execute = false
				return m, tea.Quit
			}
			if m.step == syncInteractiveStepRun {
				m.cancelRun()
			}
			m.step--
			m.refresh()
			return m, nil
		case key.Matches(msg, m.keys.Filter):
			if m.step == syncInteractiveStepFile {
				m.filtering = true
				m.filter.SetValue(m.tableFilter)
				m.filter.Focus()
				m.table.SetCursor(0)
				return m, nil
			}
		}
	}

	switch m.step {
	case syncInteractiveStepFile:
		return m.updateFileStep(msg)
	case syncInteractiveStepRun:
		return m.updateRunStep(msg)
	default:
		return m.updateListStep(msg)
	}
}

func (m syncInteractiveModel) updateListStep(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	keyMsg, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return m, cmd
	}

	switch m.step {
	case syncInteractiveStepLocale:
		switch {
		case key.Matches(keyMsg, m.keys.TogglePick):
			m.toggleCurrentLocale()
			m.refresh()
			return m, nil
		case key.Matches(keyMsg, m.keys.Confirm):
			if len(m.selectedLocales) == 0 {
				m.errMsg = "select at least one locale"
				return m, nil
			}
			m.step = syncInteractiveStepFile
			m.refresh()
			return m, nil
		}
	case syncInteractiveStepOptions:
		if item, ok := m.list.SelectedItem().(syncInteractiveListItem); ok {
			switch {
			case key.Matches(keyMsg, m.keys.TogglePick):
				m.applyOption(item.value)
				m.refresh()
				return m, nil
			case key.Matches(keyMsg, m.keys.Confirm):
				if item.value == "continue" {
					m.step = syncInteractiveStepReview
				} else {
					m.applyOption(item.value)
				}
				m.refresh()
				return m, nil
			}
		}
	case syncInteractiveStepReview:
		if item, ok := m.list.SelectedItem().(syncInteractiveListItem); ok && key.Matches(keyMsg, m.keys.Confirm) {
			switch item.value {
			case "run":
				m.step = syncInteractiveStepRun
				m.refresh()
				return m, m.startRunCmd()
			case "back":
				m.step = syncInteractiveStepOptions
				m.refresh()
				return m, nil
			}
		}
	}

	return m, cmd
}

func (m syncInteractiveModel) updateRunStep(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyPressMsg)
	if ok {
		switch {
		case key.Matches(keyMsg, m.keys.Inc), key.Matches(keyMsg, m.pager.KeyMap.NextPage):
			m.pager.NextPage()
			m.applyPaginatedRows()
			return m, nil
		case key.Matches(keyMsg, m.keys.Dec), key.Matches(keyMsg, m.pager.KeyMap.PrevPage):
			m.pager.PrevPage()
			m.applyPaginatedRows()
			return m, nil
		case key.Matches(keyMsg, m.keys.Confirm) && (m.report != nil || m.runErr != nil):
			return m, tea.Quit
		}
	}
	var cmd tea.Cmd
	m.table, cmd = m.table.Update(msg)
	return m, cmd
}

func (m syncInteractiveModel) updateFileStep(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	keyMsg, ok := msg.(tea.KeyPressMsg)
	if ok {
		switch {
		case key.Matches(keyMsg, m.keys.Inc), key.Matches(keyMsg, m.pager.KeyMap.NextPage):
			m.pager.NextPage()
			m.applyPaginatedRows()
			return m, nil
		case key.Matches(keyMsg, m.keys.Dec), key.Matches(keyMsg, m.pager.KeyMap.PrevPage):
			m.pager.PrevPage()
			m.applyPaginatedRows()
			return m, nil
		case key.Matches(keyMsg, m.keys.TogglePick):
			m.toggleCurrentFile()
			m.refresh()
			return m, nil
		case key.Matches(keyMsg, m.keys.ToggleAll):
			m.toggleAllFiles()
			m.refresh()
			return m, nil
		case key.Matches(keyMsg, m.keys.Confirm):
			if len(m.selectedFiles) == 0 {
				m.errMsg = "select at least one file"
				return m, nil
			}
			m.step = syncInteractiveStepOptions
			m.refresh()
			return m, nil
		}
	}

	m.table, cmd = m.table.Update(msg)
	return m, cmd
}

func (m syncInteractiveModel) View() tea.View {
	title := m.titleStyle.Render("hyperlocalise sync interactive")
	meta := m.metaStyle.Render(fmt.Sprintf(
		"action=%s  locales=%d  files=%d  output=%s",
		m.action,
		len(m.selectedLocales),
		len(m.selectedFiles),
		m.options.output,
	))

	parts := []string{title, m.metaStyle.Render("config=" + emptyDash(m.catalog.ConfigPath)), meta, ""}
	if m.errMsg != "" {
		parts = append(parts, m.errorStyle.Render(m.errMsg), "")
	}

	switch m.step {
	case syncInteractiveStepFile:
		parts = append(parts, m.renderFileStep())
	case syncInteractiveStepRun:
		parts = append(parts, m.renderRunStep())
	default:
		parts = append(parts, m.renderListStep())
	}

	parts = append(parts, "", m.footer(), m.help.View(m.keys))
	view := tea.NewView(strings.Join(parts, "\n"))
	view.AltScreen = true
	return view
}

func (m *syncInteractiveModel) refresh() {
	m.errMsg = ""
	switch m.step {
	case syncInteractiveStepLocale:
		currentIndex := m.list.Index()
		m.list.Title = "Select locales"
		items := make([]list.Item, 0, len(m.catalogLocales()))
		for _, locale := range m.catalogLocales() {
			_, selected := m.selectedLocales[locale]
			items = append(items, syncInteractiveListItem{
				title:       checkboxTitle(selected, locale),
				description: "toggle with space, continue with enter",
				value:       locale,
			})
		}
		_ = m.list.SetItems(items)
		if len(items) > 0 {
			m.list.Select(clampIndex(currentIndex, len(items)))
		}
	case syncInteractiveStepFile:
		currentValue := m.currentTableValue()
		m.tableRows, m.tableValues = m.fileRows()
		m.applyPaginatedRows()
		m.restoreTableSelection(currentValue)
	case syncInteractiveStepOptions:
		currentIndex := m.list.Index()
		m.list.Title = "Sync options"
		items := []list.Item{
			syncInteractiveListItem{title: checkboxTitle(m.options.dryRun, "Dry run"), description: "preview without applying", value: "dry-run"},
			syncInteractiveListItem{title: checkboxTitle(m.options.failOnConflict, "Fail on conflict"), description: "return an error when conflicts exist", value: "fail-on-conflict"},
			syncInteractiveListItem{title: "Output: " + strings.ToLower(strings.TrimSpace(m.options.output)), description: "cycle text -> json -> markdown", value: "output"},
		}
		if m.action == "pull" {
			items = append(items, syncInteractiveListItem{
				title:       checkboxTitle(m.options.applyCuratedOverDraft, "Apply curated over draft"),
				description: "allow curated remote values to replace local draft entries",
				value:       "apply-curated-over-draft",
			})
		}
		if m.action == "push" {
			items = append(items, syncInteractiveListItem{
				title:       checkboxTitle(m.extra.forceConflicts, "Force conflicts"),
				description: "allow push despite mismatch conflict policies",
				value:       "force-conflicts",
			})
		}
		items = append(items, syncInteractiveListItem{
			title:       "Continue",
			description: "review selections and run",
			value:       "continue",
		})
		_ = m.list.SetItems(items)
		if len(items) > 0 {
			m.list.Select(clampIndex(currentIndex, len(items)))
		}
	case syncInteractiveStepReview:
		currentIndex := m.list.Index()
		m.list.Title = "Review"
		_ = m.list.SetItems([]list.Item{
			syncInteractiveListItem{title: "Run sync", description: "execute with the current selections", value: "run"},
			syncInteractiveListItem{title: "Back", description: "return to options", value: "back"},
		})
		if count := len(m.list.Items()); count > 0 {
			m.list.Select(clampIndex(currentIndex, count))
		}
	case syncInteractiveStepRun:
		m.phase = "starting"
		m.startedAt = time.Now()
		m.finishedAt = time.Time{}
		m.report = nil
		m.runErr = nil
		m.runStarted = false
		m.runMsgs = nil
		m.runCancel = nil
		m.runLogs = nil
		m.tableValues = nil
		m.tableRows = m.pendingExecutionRows()
		m.table.SetColumns([]table.Column{
			{Title: "Key", Width: 28},
			{Title: "Locale", Width: 10},
			{Title: "Status", Width: 14},
			{Title: "Detail", Width: max(20, m.width-60)},
		})
		m.pager.Page = 0
		m.applyPaginatedRows()
	}
}

func (m syncInteractiveModel) fileRows() ([]table.Row, []string) {
	files := m.catalogFiles()
	if m.tableFilter != "" {
		matches := fuzzy.Find(strings.ToLower(m.tableFilter), lowerStrings(files))
		filtered := make([]string, 0, len(matches))
		for _, match := range matches {
			filtered = append(filtered, files[match.Index])
		}
		files = filtered
	}

	rows := make([]table.Row, 0, len(files))
	values := make([]string, 0, len(files))
	for _, path := range files {
		file := m.catalogFile(path)
		_, selected := m.selectedFiles[path]
		rows = append(rows, table.Row{
			checkboxCell(selected),
			filepath.ToSlash(path),
			fmt.Sprintf("%d", m.catalogFileKeyCount(path)),
			fmt.Sprintf("%d", file.TargetCount),
		})
		values = append(values, path)
	}
	return rows, values
}

func (m *syncInteractiveModel) applyPaginatedRows() {
	m.pager.SetTotalPages(len(m.tableRows))
	if m.pager.Page >= m.pager.TotalPages && m.pager.TotalPages > 0 {
		m.pager.Page = m.pager.TotalPages - 1
	}
	if m.pager.Page < 0 {
		m.pager.Page = 0
	}
	start, end := m.pager.GetSliceBounds(len(m.tableRows))
	if start > end {
		start, end = 0, 0
	}
	m.table.SetRows(m.tableRows[start:end])
	m.table.SetCursor(0)
}

func (m syncInteractiveModel) currentTableValueIndex() int {
	index := m.table.Cursor()
	if index < 0 {
		return -1
	}
	start, _ := m.pager.GetSliceBounds(len(m.tableRows))
	return start + index
}

func (m syncInteractiveModel) currentTableValue() string {
	index := m.currentTableValueIndex()
	if index < 0 || index >= len(m.tableValues) {
		return ""
	}
	return m.tableValues[index]
}

func (m *syncInteractiveModel) restoreTableSelection(value string) {
	if value == "" {
		return
	}
	index := -1
	for i, candidate := range m.tableValues {
		if candidate == value {
			index = i
			break
		}
	}
	if index < 0 {
		return
	}
	perPage := max(1, m.pager.PerPage)
	m.pager.Page = index / perPage
	if m.pager.TotalPages > 0 && m.pager.Page >= m.pager.TotalPages {
		m.pager.Page = m.pager.TotalPages - 1
	}
	start, end := m.pager.GetSliceBounds(len(m.tableRows))
	if start > end {
		start, end = 0, 0
	}
	m.table.SetRows(m.tableRows[start:end])
	m.table.SetCursor(index - start)
}

func clampIndex(index, count int) int {
	if count <= 0 {
		return 0
	}
	if index < 0 {
		return 0
	}
	if index >= count {
		return count - 1
	}
	return index
}

func (m syncInteractiveModel) renderListStep() string {
	sections := []string{m.sectionTitle()}
	if m.step == syncInteractiveStepReview {
		sections = append(sections, m.reviewSummary())
	}
	sections = append(sections, m.list.View())
	return strings.Join(sections, "\n\n")
}

func (m syncInteractiveModel) renderFileStep() string {
	parts := []string{m.sectionTitle()}
	if m.filtering {
		parts = append(parts, m.filter.View())
	} else if m.tableFilter != "" {
		parts = append(parts, m.metaStyle.Render("filter="+m.tableFilter))
	}
	parts = append(parts,
		m.metaStyle.Render("space toggles current file, a toggles all files, / fuzzy-filters, left/right changes page, enter continues"),
		m.table.View(),
		m.metaStyle.Render(m.table.HelpView()+"  "+m.pagerSummary()),
	)
	return strings.Join(parts, "\n\n")
}

func (m syncInteractiveModel) sectionTitle() string {
	switch m.step {
	case syncInteractiveStepLocale:
		return m.accentStyle.Render("Locales")
	case syncInteractiveStepFile:
		return m.accentStyle.Render("Files")
	case syncInteractiveStepOptions:
		return m.accentStyle.Render("Flags")
	default:
		return m.accentStyle.Render("Review")
	}
}

func (m syncInteractiveModel) renderRunStep() string {
	elapsed := time.Since(m.startedAt)
	if !m.finishedAt.IsZero() {
		elapsed = m.finishedAt.Sub(m.startedAt)
	}
	status := m.metaStyle.Render(fmt.Sprintf("phase=%s  elapsed=%s", emptyDash(m.phase), elapsed.Round(time.Second)))
	if m.startedAt.IsZero() {
		status = m.metaStyle.Render("phase=" + emptyDash(m.phase))
	}
	parts := []string{
		m.accentStyle.Render("Sync Run"),
		m.bar.View(),
		status,
	}
	if summary := m.runSummary(); summary != "" {
		parts = append(parts, m.metaStyle.Render(summary))
	}
	if m.runErr != nil {
		parts = append(parts, m.failStyle.Render(m.runErr.Error()))
	}
	if logs := m.renderRunLogs(); logs != "" {
		parts = append(parts, logs)
	}
	parts = append(parts, m.table.View(), m.metaStyle.Render(m.table.HelpView()+"  "+m.pagerSummary()))
	if m.report != nil || m.runErr != nil {
		parts = append(parts, m.metaStyle.Render("enter closes, arrows/j/k move, left/right changes page"))
	}
	return strings.Join(parts, "\n\n")
}

func (m syncInteractiveModel) renderRunLogs() string {
	if len(m.runLogs) == 0 {
		return ""
	}
	start := 0
	if len(m.runLogs) > 8 {
		start = len(m.runLogs) - 8
	}
	lines := []string{m.accentStyle.Render("Log")}
	for _, line := range m.runLogs[start:] {
		lines = append(lines, m.metaStyle.Render(line))
	}
	return strings.Join(lines, "\n")
}

func (m syncInteractiveModel) runSummary() string {
	if m.report == nil {
		return ""
	}
	parts := []string{
		fmt.Sprintf(
			"creates=%d updates=%d unchanged=%d conflicts=%d applied=%d skipped=%d warnings=%d",
			len(m.report.Creates),
			len(m.report.Updates),
			len(m.report.Unchanged),
			len(m.report.Conflicts),
			len(m.report.Applied),
			len(m.report.Skipped),
			len(m.report.Warnings),
		),
	}
	if len(m.report.Warnings) > 0 {
		parts = append(parts, "warning="+m.report.Warnings[0].Message)
	}
	return strings.Join(parts, "\n")
}

func (m syncInteractiveModel) reviewSummary() string {
	lines := []string{
		fmt.Sprintf("Action: %s", m.action),
		fmt.Sprintf("Locales: %s", strings.Join(sortedMapKeys(m.selectedLocales), ", ")),
		fmt.Sprintf("Files: %d selected", len(m.selectedFiles)),
		fmt.Sprintf("Dry run: %t", m.options.dryRun),
		fmt.Sprintf("Fail on conflict: %t", m.options.failOnConflict),
		fmt.Sprintf("Output: %s", m.options.output),
	}
	if m.action == "pull" {
		lines = append(lines, fmt.Sprintf("Apply curated over draft: %t", m.options.applyCuratedOverDraft))
	}
	if m.action == "push" {
		lines = append(lines, fmt.Sprintf("Force conflicts: %t", m.extra.forceConflicts))
	}
	return strings.Join(lines, "\n")
}

func (m syncInteractiveModel) pagerSummary() string {
	total := len(m.tableRows)
	if total == 0 {
		return "page 0/0 rows 0-0 of 0"
	}
	start, end := m.pager.GetSliceBounds(total)
	return fmt.Sprintf("page %d/%d rows %d-%d of %d", m.pager.Page+1, max(1, m.pager.TotalPages), start+1, end, total)
}

func (m syncInteractiveModel) footer() string {
	switch m.step {
	case syncInteractiveStepLocale:
		return m.metaStyle.Render("Select locales to sync.")
	case syncInteractiveStepFile:
		return m.metaStyle.Render("Select source files to sync.")
	case syncInteractiveStepOptions:
		return m.metaStyle.Render("Toggle flags and continue.")
	case syncInteractiveStepRun:
		if m.report != nil || m.runErr != nil {
			return m.metaStyle.Render("Sync finished. Press enter or q to exit.")
		}
		return m.metaStyle.Render("Sync running...")
	default:
		return m.metaStyle.Render("Confirm to run or go back.")
	}
}

func (m *syncInteractiveModel) toggleCurrentLocale() {
	if item, ok := m.list.SelectedItem().(syncInteractiveListItem); ok {
		if m.action == "push" && strings.EqualFold(strings.TrimSpace(item.value), strings.TrimSpace(m.catalog.SourceLocale)) {
			m.selectedLocales[item.value] = struct{}{}
			return
		}
		toggleStringSet(m.selectedLocales, item.value)
	}
}

func (m *syncInteractiveModel) toggleCurrentFile() {
	index := m.currentTableValueIndex()
	if index < 0 || index >= len(m.tableValues) {
		return
	}
	toggleStringSet(m.selectedFiles, m.tableValues[index])
}

func (m *syncInteractiveModel) toggleAllFiles() {
	files := m.tableValues
	if len(files) == 0 {
		return
	}
	allSelected := true
	for _, file := range files {
		if _, ok := m.selectedFiles[file]; !ok {
			allSelected = false
			break
		}
	}
	if allSelected {
		for _, file := range files {
			delete(m.selectedFiles, file)
		}
		return
	}
	for _, file := range files {
		m.selectedFiles[file] = struct{}{}
	}
}

func (m *syncInteractiveModel) applyOption(value string) {
	switch value {
	case "dry-run":
		m.options.dryRun = !m.options.dryRun
	case "fail-on-conflict":
		m.options.failOnConflict = !m.options.failOnConflict
	case "apply-curated-over-draft":
		m.options.applyCuratedOverDraft = !m.options.applyCuratedOverDraft
	case "force-conflicts":
		m.extra.forceConflicts = !m.extra.forceConflicts
	case "output":
		m.options.output = nextSyncOutput(m.options.output)
	}
}

func (m *syncInteractiveModel) startRunCmd() tea.Cmd {
	if m.runStarted {
		return nil
	}
	m.runStarted = true
	m.runMsgs = make(chan tea.Msg, 8)
	ctx, cancel := context.WithCancel(context.Background())
	m.runCancel = cancel
	action := m.action
	options := m.finalOptions()
	extra := m.extra
	go func(ch chan tea.Msg) {
		defer close(ch)
		defer cancel()
		report, err := executeSyncInteractive(
			ctx,
			action,
			options,
			extra,
			func(rows []table.Row) {
				sendSyncInteractiveMsg(ctx, ch, syncExecutionPlanMsg{rows: rows})
			},
			func(line string) {
				sendSyncInteractiveMsg(ctx, ch, syncExecutionLogMsg{line: line})
			},
			func(phase string, complete, total int) {
				sendSyncInteractiveMsg(ctx, ch, syncExecutionStageMsg{phase: phase, complete: complete, total: total})
			},
		)
		sendSyncInteractiveMsg(ctx, ch, syncExecutionFinishedMsg{report: report, err: err})
	}(m.runMsgs)
	return waitForSyncInteractiveMsg(m.runMsgs)
}

func (m *syncInteractiveModel) cancelRun() {
	if m.runCancel != nil {
		m.runCancel()
		m.runCancel = nil
	}
}

func (m syncInteractiveModel) finalOptions() syncCommonOptions {
	out := m.options
	out.interactive = false
	out.locales = sortedMapKeys(m.selectedLocales)
	out.sourcePaths = sortedMapKeys(m.selectedFiles)
	return out
}

func (m syncInteractiveModel) pendingExecutionRows() []table.Row {
	m.table.SetColumns([]table.Column{
		{Title: "Key", Width: 28},
		{Title: "Locale", Width: 10},
		{Title: "Status", Width: 14},
		{Title: "Detail", Width: max(20, m.width-60)},
	})
	return []table.Row{{"-", "-", "pending", "preparing sync scope"}}
}

func (m syncInteractiveModel) executionRows() ([]table.Row, []string) {
	if m.report == nil {
		return m.pendingExecutionRows(), nil
	}
	type row struct {
		key    string
		locale string
		status string
		detail string
	}
	rows := make([]row, 0)
	for _, entry := range m.report.Creates {
		rows = append(rows, row{key: entry.Key, locale: entry.Locale, status: statusLabel("create", m.report, entry.ID()), detail: filepath.Base(entry.Namespace)})
	}
	for _, entry := range m.report.Updates {
		rows = append(rows, row{key: entry.Key, locale: entry.Locale, status: statusLabel("update", m.report, entry.ID()), detail: filepath.Base(entry.Namespace)})
	}
	for _, id := range m.report.Unchanged {
		rows = append(rows, row{key: id.Key, locale: id.Locale, status: "unchanged", detail: id.Context})
	}
	for _, conflict := range m.report.Conflicts {
		rows = append(rows, row{key: conflict.ID.Key, locale: conflict.ID.Locale, status: "conflict", detail: conflict.Reason})
	}
	if m.runErr != nil && len(rows) == 0 {
		rows = append(rows, row{key: "-", locale: "-", status: "failed", detail: m.runErr.Error()})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].locale == rows[j].locale {
			return rows[i].key < rows[j].key
		}
		return rows[i].locale < rows[j].locale
	})
	out := make([]table.Row, 0, len(rows))
	values := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, table.Row{row.key, row.locale, row.status, row.detail})
		values = append(values, row.locale+"\x00"+row.key)
	}
	if len(out) == 0 {
		out = append(out, table.Row{"-", "-", "empty", "no entries matched"})
	}
	m.table.SetColumns([]table.Column{
		{Title: "Key", Width: 28},
		{Title: "Locale", Width: 10},
		{Title: "Status", Width: 14},
		{Title: "Detail", Width: max(20, m.width-60)},
	})
	return out, values
}

func statusLabel(base string, report *syncsvc.Report, id storage.EntryID) string {
	for _, applied := range report.Applied {
		if applied == id {
			return "applied"
		}
	}
	for _, skipped := range report.Skipped {
		if skipped == id {
			return "skipped"
		}
	}
	return base
}

func waitForSyncInteractiveMsg(ch <-chan tea.Msg) tea.Cmd {
	return func() tea.Msg {
		msg, ok := <-ch
		if !ok {
			return nil
		}
		return msg
	}
}

func executeSyncInteractive(
	ctx context.Context,
	action string,
	options syncCommonOptions,
	extra syncInteractiveExtra,
	plan func([]table.Row),
	logf func(string),
	progress func(phase string, complete, total int),
) (syncsvc.Report, error) {
	log := func(line string) {
		if ctx.Err() != nil {
			return
		}
		if logf != nil {
			logf(line)
		}
	}
	if err := ctx.Err(); err != nil {
		return syncsvc.Report{}, err
	}
	if progress != nil {
		progress("initializing", 0, 5)
	}
	log("initializing sync runtime")
	rt, err := newSyncRuntime(options.configPath)
	if err != nil {
		return syncsvc.Report{}, fmt.Errorf("initialize sync runtime: %w", err)
	}

	readReq := syncsvc.LocalReadRequest{
		Locales:     options.locales,
		SourcePaths: options.sourcePaths,
	}
	if progress != nil {
		progress("loading local entries", 1, 5)
	}
	log(fmt.Sprintf("loading local entries: locales=%d files=%d", len(options.locales), len(options.sourcePaths)))
	if plan != nil {
		rows, err := executionPlanRows(action, rt, readReq)
		if err != nil {
			return syncsvc.Report{}, fmt.Errorf("build execution plan: %w", err)
		}
		plan(rows)
		log(fmt.Sprintf("queued entries: %d", len(rows)))
	}
	if err := ctx.Err(); err != nil {
		return syncsvc.Report{}, err
	}
	scope, err := rt.resolveScope(readReq)
	if err != nil {
		return syncsvc.Report{}, fmt.Errorf("resolve sync scope: %w", err)
	}
	log(fmt.Sprintf("resolved scope entries: %d", len(scope.Entries)))

	if progress != nil {
		progress("resolving scope", 2, 5)
		progress("syncing remote", 3, 5)
	}
	log("syncing remote storage")
	switch action {
	case "pull":
		report, err := rt.svc.Pull(ctx, syncsvc.PullInput{
			Adapter: rt.remote,
			Local:   rt.local,
			Request: storage.PullRequest{
				Locales:    options.locales,
				Namespaces: append([]string(nil), options.sourcePaths...),
			},
			Read: readReq,
			Options: syncsvc.PullOptions{
				DryRun:                options.dryRun,
				FailOnConflict:        options.failOnConflict,
				ApplyCuratedOverDraft: options.applyCuratedOverDraft,
			},
			Scope: scope,
		})
		if progress != nil {
			progress("finalizing", 5, 5)
		}
		log(fmt.Sprintf("pull result: creates=%d updates=%d conflicts=%d warnings=%d", len(report.Creates), len(report.Updates), len(report.Conflicts), len(report.Warnings)))
		return report, err
	default:
		report, err := rt.svc.Push(ctx, syncsvc.PushInput{
			Adapter: rt.remote,
			Local:   rt.local,
			Read:    readReq,
			Options: syncsvc.PushOptions{
				DryRun:         options.dryRun,
				FailOnConflict: options.failOnConflict,
				ForceConflicts: extra.forceConflicts,
			},
			Scope: scope,
		})
		if progress != nil {
			progress("finalizing", 5, 5)
		}
		log(fmt.Sprintf("push result: creates=%d updates=%d applied=%d conflicts=%d warnings=%d", len(report.Creates), len(report.Updates), len(report.Applied), len(report.Conflicts), len(report.Warnings)))
		return report, err
	}
}

func sendSyncInteractiveMsg(ctx context.Context, ch chan<- tea.Msg, msg tea.Msg) bool {
	select {
	case <-ctx.Done():
		return false
	case ch <- msg:
		return true
	}
}

func executionPlanRows(action string, rt *syncRuntime, readReq syncsvc.LocalReadRequest) ([]table.Row, error) {
	var (
		snapshot storage.CatalogSnapshot
		err      error
	)
	switch action {
	case "pull":
		snapshot, err = rt.local.ReadSnapshot(context.Background(), readReq)
	default:
		snapshot, err = rt.local.BuildPushSnapshot(context.Background(), readReq)
	}
	if err != nil {
		return nil, err
	}
	rows := make([]table.Row, 0, len(snapshot.Entries))
	sort.Slice(snapshot.Entries, func(i, j int) bool {
		if snapshot.Entries[i].Locale == snapshot.Entries[j].Locale {
			return snapshot.Entries[i].Key < snapshot.Entries[j].Key
		}
		return snapshot.Entries[i].Locale < snapshot.Entries[j].Locale
	})
	for _, entry := range snapshot.Entries {
		rows = append(rows, table.Row{
			entry.Key,
			entry.Locale,
			"queued",
			filepath.Base(entry.Namespace),
		})
	}
	if len(rows) == 0 {
		rows = append(rows, table.Row{"-", "-", "empty", "no local entries matched"})
	}
	return rows, nil
}

func (m syncInteractiveModel) catalogLocales() []string {
	locales := make([]string, 0, len(m.catalog.TargetLocales)+1)
	for _, target := range m.catalog.TargetLocales {
		locales = append(locales, target.Locale)
	}
	if m.action == "push" && strings.TrimSpace(m.catalog.SourceLocale) != "" && !containsString(locales, m.catalog.SourceLocale) {
		locales = append(locales, m.catalog.SourceLocale)
	}
	sort.Strings(locales)
	return locales
}

func (m syncInteractiveModel) catalogFiles() []string {
	files := make([]string, 0, len(m.catalog.Files))
	for _, file := range m.catalog.Files {
		files = append(files, filepath.Clean(file.Path))
	}
	sort.Strings(files)
	return files
}

func (m syncInteractiveModel) catalogFile(path string) runsvc.SelectionFile {
	for _, file := range m.catalog.Files {
		if filepath.Clean(file.Path) == filepath.Clean(path) {
			return file
		}
	}
	return runsvc.SelectionFile{Path: path}
}

func (m syncInteractiveModel) catalogFileKeyCount(path string) int {
	maxTasks := 0
	for _, task := range m.catalog.TaskIndex {
		if filepath.Clean(task.SourcePath) != filepath.Clean(path) {
			continue
		}
		if task.TaskCount > maxTasks {
			maxTasks = task.TaskCount
		}
	}
	return maxTasks
}

func nextSyncOutput(current string) string {
	switch strings.ToLower(strings.TrimSpace(current)) {
	case "json":
		return "markdown"
	case "markdown", "md":
		return "text"
	default:
		return "json"
	}
}

func checkboxTitle(selected bool, label string) string {
	return checkboxCell(selected) + " " + label
}

func checkboxCell(selected bool) string {
	if selected {
		return "[x]"
	}
	return "[ ]"
}

func toggleStringSet(values map[string]struct{}, value string) {
	if _, ok := values[value]; ok {
		delete(values, value)
		return
	}
	values[value] = struct{}{}
}

func lowerStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, strings.ToLower(value))
	}
	return out
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if filepath.Clean(value) == filepath.Clean(needle) {
			return true
		}
	}
	return false
}
