package cmd

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"charm.land/bubbles/v2/filepicker"
	"charm.land/bubbles/v2/help"
	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/paginator"
	"charm.land/bubbles/v2/table"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/mattn/go-isatty"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/runsvc"
)

type runInteractiveResult struct {
	options runOptions
	execute bool
}

type runInteractiveMode string

const (
	runInteractiveModeAll    runInteractiveMode = "all"
	runInteractiveModeGroup  runInteractiveMode = "group"
	runInteractiveModeBucket runInteractiveMode = "bucket"
	runInteractiveModeTarget runInteractiveMode = "target"
	runInteractiveModeFile   runInteractiveMode = "file"
)

type runInteractiveStep int

const (
	runInteractiveStepMode runInteractiveStep = iota
	runInteractiveStepGroup
	runInteractiveStepBucket
	runInteractiveStepTarget
	runInteractiveStepFile
	runInteractiveStepOptions
	runInteractiveStepExperimental
	runInteractiveStepReview
)

type runInteractiveKeyMap struct {
	Back       key.Binding
	Quit       key.Binding
	Confirm    key.Binding
	TogglePick key.Binding
	ToggleHelp key.Binding
	Filter     key.Binding
	TogglePane key.Binding
	Inc        key.Binding
	Dec        key.Binding
}

func defaultRunInteractiveKeyMap() runInteractiveKeyMap {
	return runInteractiveKeyMap{
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
		ToggleHelp: key.NewBinding(
			key.WithKeys("?"),
			key.WithHelp("?", "toggle help"),
		),
		Filter: key.NewBinding(
			key.WithKeys("/"),
			key.WithHelp("/", "filter"),
		),
		TogglePane: key.NewBinding(
			key.WithKeys("tab"),
			key.WithHelp("tab", "switch pane"),
		),
		Inc: key.NewBinding(
			key.WithKeys("right", "+", "="),
			key.WithHelp("right/+", "increase"),
		),
		Dec: key.NewBinding(
			key.WithKeys("left", "-"),
			key.WithHelp("left/-", "decrease"),
		),
	}
}

func (k runInteractiveKeyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Confirm, k.Back, k.Filter, k.TogglePane, k.ToggleHelp, k.Quit}
}

func (k runInteractiveKeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{{k.Confirm, k.Back, k.Filter, k.TogglePane, k.Inc, k.Dec, k.ToggleHelp, k.Quit}}
}

type runInteractiveListItem struct {
	title       string
	description string
	value       string
}

type runInteractiveHelp struct {
	short []key.Binding
	full  [][]key.Binding
}

func (i runInteractiveListItem) Title() string       { return i.title }
func (i runInteractiveListItem) Description() string { return i.description }
func (i runInteractiveListItem) FilterValue() string {
	return strings.TrimSpace(i.title + " " + i.description + " " + i.value)
}

func (h runInteractiveHelp) ShortHelp() []key.Binding  { return h.short }
func (h runInteractiveHelp) FullHelp() [][]key.Binding { return h.full }

type runInteractiveModel struct {
	catalog runsvc.SelectionCatalog
	options runOptions

	steps    []runInteractiveStep
	stepPos  int
	override *runInteractiveStep

	mode           runInteractiveMode
	selectedGroup  string
	selectedBucket string
	selectedTarget string
	selectedFile   string
	selectedFiles  map[string]struct{}
	directoryScope string

	list       list.Model
	table      table.Model
	pager      paginator.Model
	filepicker filepicker.Model
	filter     textinput.Model
	help       help.Model
	keys       runInteractiveKeyMap

	tableRows   []table.Row
	tableValues []string
	tableFilter string
	filtering   bool
	filePane    string

	width  int
	height int

	errMsg  string
	execute bool
	done    bool

	titleStyle   lipgloss.Style
	metaStyle    lipgloss.Style
	errorStyle   lipgloss.Style
	footerStyle  lipgloss.Style
	sectionStyle lipgloss.Style
	accentStyle  lipgloss.Style
}

func runInteractiveWizard(seed runOptions, output io.Writer) (runInteractiveResult, error) {
	if !isTTYWriter(output) || !isTTYInput(os.Stdin) {
		return runInteractiveResult{}, fmt.Errorf("--interactive requires a TTY input and output")
	}

	catalog, err := runsvc.BuildSelectionCatalog(seed.configPath)
	if err != nil {
		return runInteractiveResult{}, err
	}

	m := newRunInteractiveModel(catalog, seed)
	p := tea.NewProgram(
		m,
		tea.WithOutput(output),
		tea.WithInput(os.Stdin),
	)
	finalModel, err := p.Run()
	if err != nil {
		return runInteractiveResult{}, err
	}

	typed, ok := finalModel.(runInteractiveModel)
	if !ok {
		return runInteractiveResult{}, fmt.Errorf("unexpected interactive model type %T", finalModel)
	}

	return runInteractiveResult{
		options: typed.finalOptions(),
		execute: typed.execute,
	}, nil
}

func newRunInteractiveModel(catalog runsvc.SelectionCatalog, seed runOptions) runInteractiveModel {
	keys := defaultRunInteractiveKeyMap()
	delegate := list.NewDefaultDelegate()
	modeList := list.New(nil, delegate, 0, 0)
	modeList.SetShowHelp(false)
	modeList.SetShowStatusBar(false)
	modeList.SetFilteringEnabled(true)
	modeList.SetShowPagination(true)
	modeList.SetShowTitle(false)
	modeList.AdditionalShortHelpKeys = keys.ShortHelp
	modeList.AdditionalFullHelpKeys = func() []key.Binding {
		return []key.Binding{keys.Back, keys.Filter, keys.ToggleHelp, keys.Quit}
	}

	styles := table.DefaultStyles()
	styles.Header = styles.Header.Bold(true).Foreground(lipgloss.Color("39"))
	styles.Selected = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("230")).Background(lipgloss.Color("62"))

	tbl := table.New(
		table.WithFocused(true),
		table.WithStyles(styles),
		table.WithColumns([]table.Column{{Title: "Value", Width: 24}, {Title: "Meta", Width: 24}, {Title: "Tasks", Width: 10}}),
	)

	pg := paginator.New()
	pg.Type = paginator.Arabic
	pg.PerPage = 8

	fp := filepicker.New()
	fp.FileAllowed = false
	fp.DirAllowed = true
	fp.AutoHeight = true
	fp.ShowHidden = false

	filter := textinput.New()
	filter.Prompt = "/ "
	filter.Placeholder = "filter rows"

	m := runInteractiveModel{
		catalog:       catalog,
		options:       seed,
		steps:         []runInteractiveStep{runInteractiveStepMode},
		selectedFiles: map[string]struct{}{},
		list:          modeList,
		table:         tbl,
		pager:         pg,
		filepicker:    fp,
		filter:        filter,
		help:          help.New(),
		keys:          keys,
		filePane:      "table",
		titleStyle:    lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("45")),
		metaStyle:     lipgloss.NewStyle().Foreground(lipgloss.Color("244")),
		errorStyle:    lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true),
		footerStyle:   lipgloss.NewStyle().Foreground(lipgloss.Color("111")),
		sectionStyle: lipgloss.NewStyle().
			Foreground(lipgloss.Color("214")).
			Bold(true),
		accentStyle: lipgloss.NewStyle().
			Foreground(lipgloss.Color("81")).
			Bold(true),
	}
	if m.options.workers == 0 {
		m.options.workers = runtime.NumCPU()
	}
	if strings.TrimSpace(m.options.contextMemoryScope) == "" {
		m.options.contextMemoryScope = runsvc.ContextMemoryScopeFile
	}
	m.refreshStep()
	return m
}

func (m runInteractiveModel) Init() tea.Cmd {
	return m.filepicker.Init()
}

func (m runInteractiveModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.help.SetWidth(msg.Width)
		m.list.SetSize(msg.Width-2, max(8, msg.Height-10))
		m.table.SetWidth(max(40, msg.Width-2))
		m.table.SetHeight(max(8, msg.Height-14))
		m.pager.PerPage = max(5, msg.Height-16)
		m.filepicker.SetHeight(max(6, msg.Height/3))
		if m.currentStep() == runInteractiveStepBucket || m.currentStep() == runInteractiveStepFile {
			m.applyPaginatedRows()
		}
		return m, nil
	case tea.KeyPressMsg:
		if m.filtering {
			switch msg.String() {
			case "esc":
				m.filtering = false
				m.tableFilter = ""
				m.filter.SetValue("")
				m.filter.Blur()
				m.refreshStep()
				m.table.SetCursor(0)
				return m, nil
			case "enter":
				m.filtering = false
				m.filter.Blur()
				m.tableFilter = strings.TrimSpace(m.filter.Value())
				m.refreshStep()
				m.table.SetCursor(0)
				return m, nil
			}
			var cmd tea.Cmd
			m.filter, cmd = m.filter.Update(msg)
			return m, cmd
		}

		switch {
		case key.Matches(msg, m.keys.Quit):
			if m.list.SettingFilter() {
				break
			}
			m.done = true
			m.execute = false
			return m, tea.Quit
		case key.Matches(msg, m.keys.ToggleHelp):
			if m.list.SettingFilter() {
				break
			}
			m.help.ShowAll = !m.help.ShowAll
			m.list.Help.ShowAll = m.help.ShowAll
			return m, nil
		case key.Matches(msg, m.keys.Back):
			if m.currentStep() != runInteractiveStepBucket && m.currentStep() != runInteractiveStepFile {
				if m.list.SettingFilter() || m.list.IsFiltered() {
					m.list.ResetFilter()
					m.list.ResetSelected()
					return m, nil
				}
			}
			if m.override != nil {
				m.override = nil
				m.errMsg = ""
				m.refreshStep()
				return m, nil
			}
			if m.stepPos == 0 {
				m.done = true
				m.execute = false
				return m, tea.Quit
			}
			m.errMsg = ""
			m.stepPos--
			m.refreshStep()
			return m, nil
		case key.Matches(msg, m.keys.Filter):
			if m.currentStep() == runInteractiveStepBucket || m.currentStep() == runInteractiveStepFile {
				m.filtering = true
				m.filter.SetValue(m.tableFilter)
				m.table.SetCursor(0)
				m.filter.Focus()
				return m, nil
			}
			if m.currentStep() == runInteractiveStepMode || m.currentStep() == runInteractiveStepGroup || m.currentStep() == runInteractiveStepTarget || m.currentStep() == runInteractiveStepOptions || m.currentStep() == runInteractiveStepExperimental {
				m.list.ResetSelected()
				m.list.SetFilterState(list.Filtering)
				m.list.FilterInput.Focus()
				return m, nil
			}
		case key.Matches(msg, m.keys.TogglePane):
			if m.currentStep() == runInteractiveStepFile {
				if m.filePane == "table" {
					m.filePane = "picker"
				} else {
					m.filePane = "table"
				}
				return m, nil
			}
		}
	}

	switch m.currentStep() {
	case runInteractiveStepMode, runInteractiveStepGroup, runInteractiveStepTarget, runInteractiveStepOptions, runInteractiveStepExperimental:
		return m.updateListStep(msg)
	case runInteractiveStepBucket, runInteractiveStepFile:
		return m.updateTableStep(msg)
	case runInteractiveStepReview:
		return m.updateReviewStep(msg)
	}

	return m, nil
}

func (m runInteractiveModel) updateListStep(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	keyMsg, ok := msg.(tea.KeyPressMsg)
	if ok && (m.currentStep() == runInteractiveStepOptions || m.currentStep() == runInteractiveStepExperimental) {
		switch {
		case key.Matches(keyMsg, m.keys.Inc):
			if item, ok := m.list.SelectedItem().(runInteractiveListItem); ok {
				m.adjustListSelection(item.value, 1)
			}
			return m, nil
		case key.Matches(keyMsg, m.keys.Dec):
			if item, ok := m.list.SelectedItem().(runInteractiveListItem); ok {
				m.adjustListSelection(item.value, -1)
			}
			return m, nil
		}
	}
	m.list, cmd = m.list.Update(msg)
	keyMsg, ok = msg.(tea.KeyPressMsg)
	if ok && key.Matches(keyMsg, m.keys.Confirm) {
		if item, ok := m.list.SelectedItem().(runInteractiveListItem); ok {
			m.applyListSelection(item.value)
		}
		return m, cmd
	}
	return m, cmd
}

func (m runInteractiveModel) updateTableStep(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	keyMsg, isKey := msg.(tea.KeyPressMsg)

	if m.currentStep() == runInteractiveStepFile && m.filePane == "picker" {
		m.filepicker, cmd = m.filepicker.Update(msg)
		if ok, path := m.filepicker.DidSelectFile(msg); ok {
			cleaned := filepath.Clean(path)
			if m.isAllowedDirectory(cleaned) {
				m.directoryScope = cleaned
				m.filePane = "table"
				m.refreshStep()
				return m, cmd
			}
			m.errMsg = fmt.Sprintf("directory %s does not contain configured run files", cleaned)
			return m, cmd
		}
		if ok, path := m.filepicker.DidSelectDisabledFile(msg); ok {
			m.errMsg = fmt.Sprintf("%s is not a selectable directory scope", filepath.Clean(path))
			return m, cmd
		}
		return m, cmd
	}

	if isKey {
		switch {
		case (m.currentStep() == runInteractiveStepBucket || m.currentStep() == runInteractiveStepFile) && key.Matches(keyMsg, m.keys.Inc):
			m.pager.NextPage()
			m.applyPaginatedRows()
			return m, nil
		case (m.currentStep() == runInteractiveStepBucket || m.currentStep() == runInteractiveStepFile) && key.Matches(keyMsg, m.keys.Dec):
			m.pager.PrevPage()
			m.applyPaginatedRows()
			return m, nil
		case key.Matches(keyMsg, m.pager.KeyMap.NextPage):
			m.pager.NextPage()
			m.applyPaginatedRows()
			return m, nil
		case key.Matches(keyMsg, m.pager.KeyMap.PrevPage):
			m.pager.PrevPage()
			m.applyPaginatedRows()
			return m, nil
		case m.currentStep() == runInteractiveStepFile && key.Matches(keyMsg, m.keys.TogglePick):
			if index := m.currentTableValueIndex(); index >= 0 && index < len(m.tableValues) {
				m.applyTableSelection(m.tableValues[index])
			}
			return m, nil
		case m.currentStep() == runInteractiveStepFile && key.Matches(keyMsg, m.keys.Confirm):
			m.continueFromFileStep()
			return m, nil
		}
	}

	m.table, cmd = m.table.Update(msg)
	if isKey && key.Matches(keyMsg, m.keys.Confirm) {
		if valueIndex := m.currentTableValueIndex(); valueIndex >= 0 && valueIndex < len(m.tableValues) {
			m.applyTableSelection(m.tableValues[valueIndex])
		}
		return m, cmd
	}
	return m, cmd
}

func (m runInteractiveModel) currentTableValueIndex() int {
	index := m.table.Cursor()
	if index < 0 {
		return -1
	}
	start, _ := m.pager.GetSliceBounds(len(m.tableRows))
	return start + index
}

func (m runInteractiveModel) updateReviewStep(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	keyMsg, ok := msg.(tea.KeyPressMsg)
	if ok && key.Matches(keyMsg, m.keys.Confirm) {
		if item, ok := m.list.SelectedItem().(runInteractiveListItem); ok {
			switch item.value {
			case "dry-run":
				m.options.dryRun = true
				m.execute = true
				m.done = true
				return m, tea.Quit
			case "run":
				m.options.dryRun = false
				m.execute = true
				m.done = true
				return m, tea.Quit
			case "edit-options":
				step := runInteractiveStepOptions
				m.override = &step
				m.refreshStep()
				return m, nil
			case "edit-experimental":
				step := runInteractiveStepExperimental
				m.override = &step
				m.refreshStep()
				return m, nil
			case "back":
				m.stepPos--
				m.refreshStep()
				return m, nil
			}
		}
	}
	return m, cmd
}

func (m runInteractiveModel) View() tea.View {
	selection := m.selectionSummary()
	title := m.titleStyle.Render("hyperlocalise run interactive")
	meta := m.metaStyle.Render(fmt.Sprintf(
		"%s  %s  %s  %s",
		"mode="+emptyDash(string(m.mode)),
		"tasks="+fmt.Sprintf("%d", selection.TaskCount),
		"files="+fmt.Sprintf("%d", selection.FileCount),
		"locales="+fmt.Sprintf("%d", selection.TargetCount),
	))

	var body string
	switch m.currentStep() {
	case runInteractiveStepBucket, runInteractiveStepFile:
		body = m.renderTableStep()
	case runInteractiveStepReview:
		body = m.renderReviewStep()
	default:
		body = m.renderListStep()
	}

	parts := []string{title, m.metaStyle.Render("config=" + emptyDash(m.catalog.ConfigPath)), meta, ""}
	if m.errMsg != "" {
		parts = append(parts, m.errorStyle.Render(m.errMsg), "")
	}
	parts = append(parts, body, "", m.footer(), m.help.View(m.helpBindings()))
	view := tea.NewView(strings.Join(parts, "\n"))
	view.AltScreen = true
	return view
}

func (m *runInteractiveModel) refreshStep() {
	m.errMsg = ""
	step := m.currentStep()
	switch step {
	case runInteractiveStepMode:
		m.list.Title = "Choose mode"
		_ = m.list.SetItems([]list.Item{
			runInteractiveListItem{title: "All configured work", description: "Run everything in the config with no scope filter.", value: string(runInteractiveModeAll)},
			runInteractiveListItem{title: "Group", description: "Pick a group, then narrow by bucket, target, and file.", value: string(runInteractiveModeGroup)},
			runInteractiveListItem{title: "Bucket", description: "Pick a bucket, then narrow by target and file.", value: string(runInteractiveModeBucket)},
			runInteractiveListItem{title: "Target language", description: "Pick a target locale, then narrow by group, bucket, and file.", value: string(runInteractiveModeTarget)},
			runInteractiveListItem{title: "File", description: "Pick one or more source files, optionally narrow by target, then review.", value: string(runInteractiveModeFile)},
		})
		m.list.Select(0)
	case runInteractiveStepGroup:
		m.list.Title = "Choose group"
		m.setListItems(m.groupItems())
	case runInteractiveStepTarget:
		m.list.Title = "Choose target language"
		m.setListItems(m.targetItems())
	case runInteractiveStepOptions:
		m.list.Title = "Run options"
		m.setListItems(m.optionItems())
	case runInteractiveStepExperimental:
		m.list.Title = "Experimental flags"
		m.setListItems(m.experimentalItems())
	case runInteractiveStepBucket:
		m.configureBucketTable()
	case runInteractiveStepFile:
		m.configureFileTable()
	case runInteractiveStepReview:
		m.configureReview()
	}
}

func (m *runInteractiveModel) setListItems(items []runInteractiveListItem) {
	listItems := make([]list.Item, 0, len(items))
	for _, item := range items {
		listItems = append(listItems, item)
	}
	_ = m.list.SetItems(listItems)
	m.list.ResetSelected()
}

func (m *runInteractiveModel) configureBucketTable() {
	columns := []table.Column{
		{Title: "Bucket", Width: 24},
		{Title: "Files / Targets", Width: 22},
		{Title: "Tasks", Width: 10},
	}
	rows, values := m.bucketRows()
	m.replaceTable(columns, rows)
	m.tableRows = rows
	m.tableValues = values
	m.pager.Page = 0
	m.applyPaginatedRows()
}

func (m *runInteractiveModel) configureFileTable() {
	columns := []table.Column{
		{Title: "Pick", Width: 6},
		{Title: "File", Width: max(20, m.width-48)},
		{Title: "Buckets / Targets", Width: 22},
		{Title: "Tasks", Width: 10},
	}
	rows, values := m.fileRows()
	m.replaceTable(columns, rows)
	m.tableRows = rows
	m.tableValues = values
	m.pager.Page = 0
	m.applyPaginatedRows()

	commonRoot := commonPathPrefix(filePathsFromCatalog(m.catalog.Files))
	if commonRoot == "" {
		commonRoot = "."
	}
	if m.directoryScope != "" && m.isAllowedDirectory(m.directoryScope) {
		m.filepicker.CurrentDirectory = m.directoryScope
	} else {
		m.filepicker.CurrentDirectory = commonRoot
	}
}

func (m *runInteractiveModel) configureReview() {
	columns := []table.Column{
		{Title: "Field", Width: 22},
		{Title: "Value", Width: max(24, m.width-30)},
	}
	m.replaceTable(columns, m.reviewRows())
	m.table.SetCursor(0)
	m.table.SetHeight(max(8, m.height-18))

	m.list.Title = "Confirm"
	_ = m.list.SetItems([]list.Item{
		runInteractiveListItem{title: "Dry run", description: "Preview the run without writing output files.", value: "dry-run"},
		runInteractiveListItem{title: "Run", description: "Execute the selected scope with the current options.", value: "run"},
		runInteractiveListItem{title: "Edit run options", description: "Change dry run, force, prune, and workers.", value: "edit-options"},
		runInteractiveListItem{title: "Edit experimental flags", description: "Change context-memory experimental settings.", value: "edit-experimental"},
		runInteractiveListItem{title: "Back to scope", description: "Return to the previous scope step.", value: "back"},
	})
	m.list.ResetSelected()
	m.list.Select(0)
}

func (m *runInteractiveModel) replaceTable(columns []table.Column, rows []table.Row) {
	m.table.SetRows(nil)
	m.table.SetColumns(columns)
	m.table.SetRows(rows)
}

func (m *runInteractiveModel) applyPaginatedRows() {
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

func (m *runInteractiveModel) currentStep() runInteractiveStep {
	if m.override != nil {
		return *m.override
	}
	return m.steps[m.stepPos]
}

func (m *runInteractiveModel) advance() {
	if m.stepPos < len(m.steps)-1 {
		m.stepPos++
		m.refreshStep()
	}
}

func (m *runInteractiveModel) applyListSelection(value string) {
	switch m.currentStep() {
	case runInteractiveStepMode:
		m.mode = runInteractiveMode(value)
		m.steps = runInteractiveStepsForMode(m.mode)
		m.stepPos = 1
	case runInteractiveStepGroup:
		m.selectedGroup = value
		m.clearSelectionsAfter(runInteractiveStepGroup)
		m.advance()
		return
	case runInteractiveStepTarget:
		m.selectedTarget = value
		m.clearSelectionsAfter(runInteractiveStepTarget)
		m.advance()
		return
	case runInteractiveStepOptions:
		m.mutateOption(value, 0)
		return
	case runInteractiveStepExperimental:
		m.mutateExperimentalOption(value, 0)
		return
	}
	m.refreshStep()
}

func (m *runInteractiveModel) applyTableSelection(value string) {
	switch m.currentStep() {
	case runInteractiveStepBucket:
		m.selectedBucket = value
		m.clearSelectionsAfter(runInteractiveStepBucket)
	case runInteractiveStepFile:
		currentIndex := m.currentTableValueIndex()
		currentPage := m.pager.Page
		if len(m.selectedFiles) == 0 && m.selectedFile != "" {
			m.selectedFiles[m.selectedFile] = struct{}{}
			m.selectedFile = ""
		}
		if value == "" {
			m.selectedFiles = map[string]struct{}{}
			m.selectedFile = ""
			m.directoryScope = ""
		} else {
			m.toggleFileSelection(value)
		}
		m.refreshFileTablePreservingPosition(currentPage, currentIndex)
		return
	}
	m.advance()
}

func (m *runInteractiveModel) continueFromFileStep() {
	if len(m.selectedFiles) == 1 {
		for path := range m.selectedFiles {
			m.selectedFile = path
		}
	}
	m.advance()
}

func (m *runInteractiveModel) toggleFileSelection(path string) {
	if _, ok := m.selectedFiles[path]; ok {
		delete(m.selectedFiles, path)
	} else {
		m.selectedFiles[path] = struct{}{}
	}
	if len(m.selectedFiles) == 0 {
		m.selectedFile = ""
	}
}

func (m *runInteractiveModel) refreshFileTablePreservingPosition(page int, absoluteIndex int) {
	rows, values := m.fileRows()
	m.tableRows = rows
	m.tableValues = values
	m.pager.Page = page
	m.applyPaginatedRows()

	if len(m.tableValues) == 0 {
		return
	}
	if absoluteIndex < 0 {
		absoluteIndex = 0
	}
	if absoluteIndex >= len(m.tableValues) {
		absoluteIndex = len(m.tableValues) - 1
	}

	start, end := m.pager.GetSliceBounds(len(m.tableRows))
	if absoluteIndex < start || absoluteIndex >= end {
		m.pager.Page = absoluteIndex / max(1, m.pager.PerPage)
		m.applyPaginatedRows()
		start, end = m.pager.GetSliceBounds(len(m.tableRows))
	}

	cursor := absoluteIndex - start
	if cursor < 0 {
		cursor = 0
	}
	if visible := end - start; visible > 0 && cursor >= visible {
		cursor = visible - 1
	}
	m.table.SetCursor(cursor)
}

func (m *runInteractiveModel) clearSelectionsAfter(step runInteractiveStep) {
	switch step {
	case runInteractiveStepGroup:
		m.selectedBucket = ""
		m.selectedTarget = ""
		m.selectedFile = ""
		m.selectedFiles = map[string]struct{}{}
		m.directoryScope = ""
	case runInteractiveStepBucket:
		m.selectedTarget = ""
		m.selectedFile = ""
		m.selectedFiles = map[string]struct{}{}
		m.directoryScope = ""
	case runInteractiveStepTarget:
		m.selectedFile = ""
		m.selectedFiles = map[string]struct{}{}
		m.directoryScope = ""
	case runInteractiveStepFile:
		m.selectedFile = ""
		m.selectedFiles = map[string]struct{}{}
	}
}

func (m *runInteractiveModel) adjustListSelection(value string, delta int) {
	switch m.currentStep() {
	case runInteractiveStepOptions:
		m.mutateOption(value, delta)
	case runInteractiveStepExperimental:
		m.mutateExperimentalOption(value, delta)
	}
}

func (m *runInteractiveModel) mutateOption(value string, delta int) {
	switch value {
	case "dry-run":
		m.options.dryRun = !m.options.dryRun
	case "force":
		m.options.force = !m.options.force
	case "prune":
		m.options.prune = !m.options.prune
	case "workers":
		if delta == 0 {
			delta = 1
		}
		m.options.workers = max(1, m.options.workers+delta)
	case "experimental":
		step := runInteractiveStepExperimental
		m.override = &step
		m.refreshStep()
		return
	case "review":
		m.override = nil
		m.refreshStep()
		return
	}
	m.refreshStep()
}

func (m *runInteractiveModel) mutateExperimentalOption(value string, delta int) {
	switch value {
	case "context-memory":
		m.options.experimentalContextMemory = !m.options.experimentalContextMemory
	case "context-scope":
		scopes := []string{runsvc.ContextMemoryScopeFile, runsvc.ContextMemoryScopeBucket, runsvc.ContextMemoryScopeGroup}
		current := slices.Index(scopes, m.options.contextMemoryScope)
		if current == -1 {
			current = 0
		}
		if delta < 0 {
			current = (current - 1 + len(scopes)) % len(scopes)
		} else {
			current = (current + 1) % len(scopes)
		}
		m.options.contextMemoryScope = scopes[current]
	case "context-max":
		if delta == 0 {
			delta = 1
		}
		if m.options.contextMemoryMaxChars == 0 {
			m.options.contextMemoryMaxChars = 1200
		}
		m.options.contextMemoryMaxChars = max(100, m.options.contextMemoryMaxChars+(delta*100))
	case "review":
		m.override = nil
		m.refreshStep()
		return
	}
	m.refreshStep()
}

func runInteractiveStepsForMode(mode runInteractiveMode) []runInteractiveStep {
	switch mode {
	case runInteractiveModeAll:
		return []runInteractiveStep{runInteractiveStepMode, runInteractiveStepReview}
	case runInteractiveModeBucket:
		return []runInteractiveStep{runInteractiveStepMode, runInteractiveStepBucket, runInteractiveStepTarget, runInteractiveStepFile, runInteractiveStepReview}
	case runInteractiveModeTarget:
		return []runInteractiveStep{runInteractiveStepMode, runInteractiveStepTarget, runInteractiveStepGroup, runInteractiveStepBucket, runInteractiveStepFile, runInteractiveStepReview}
	case runInteractiveModeFile:
		return []runInteractiveStep{runInteractiveStepMode, runInteractiveStepFile, runInteractiveStepTarget, runInteractiveStepReview}
	default:
		return []runInteractiveStep{runInteractiveStepMode, runInteractiveStepGroup, runInteractiveStepBucket, runInteractiveStepTarget, runInteractiveStepFile, runInteractiveStepReview}
	}
}

type runSelectionSummary struct {
	TaskCount   int
	FileCount   int
	TargetCount int
}

func (m runInteractiveModel) selectionSummary() runSelectionSummary {
	files := map[string]struct{}{}
	targets := map[string]struct{}{}
	tasks := 0
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "") {
			continue
		}
		tasks += task.TaskCount
		files[task.SourcePath] = struct{}{}
		targets[task.TargetLocale] = struct{}{}
	}
	return runSelectionSummary{TaskCount: tasks, FileCount: len(files), TargetCount: len(targets)}
}

func (m runInteractiveModel) matchesTask(task runsvc.SelectionTaskIndex, ignore string) bool {
	if ignore != "group" && m.selectedGroup != "" && task.Group != m.selectedGroup {
		return false
	}
	if ignore != "bucket" && m.selectedBucket != "" && task.Bucket != m.selectedBucket {
		return false
	}
	if ignore != "target" && m.selectedTarget != "" && task.TargetLocale != m.selectedTarget {
		return false
	}
	if ignore != "file" {
		if len(m.selectedFiles) > 0 {
			if _, ok := m.selectedFiles[task.SourcePath]; !ok {
				return false
			}
		} else if m.selectedFile != "" && task.SourcePath != m.selectedFile {
			return false
		}
	}
	return true
}

func (m runInteractiveModel) isPrimaryStep(step runInteractiveStep) bool {
	route := runInteractiveStepsForMode(m.mode)
	return len(route) > 1 && route[1] == step
}

func (m runInteractiveModel) groupItems() []runInteractiveListItem {
	counter := map[string]int{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "group") {
			continue
		}
		counter[task.Group] += task.TaskCount
	}
	items := make([]runInteractiveListItem, 0, len(counter)+1)
	if !m.isPrimaryStep(runInteractiveStepGroup) {
		items = append(items, runInteractiveListItem{title: "All groups", description: fmt.Sprintf("%d matched tasks", sumIntMap(counter)), value: ""})
	}
	keys := sortedStringKeys(counter)
	for _, name := range keys {
		items = append(items, runInteractiveListItem{title: name, description: fmt.Sprintf("%d tasks", counter[name]), value: name})
	}
	return items
}

func (m runInteractiveModel) targetItems() []runInteractiveListItem {
	counter := map[string]int{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "target") {
			continue
		}
		counter[task.TargetLocale] += task.TaskCount
	}
	items := make([]runInteractiveListItem, 0, len(counter)+1)
	if !m.isPrimaryStep(runInteractiveStepTarget) {
		items = append(items, runInteractiveListItem{title: "All targets", description: fmt.Sprintf("%d matched tasks", sumIntMap(counter)), value: ""})
	}
	keys := sortedStringKeys(counter)
	for _, locale := range keys {
		items = append(items, runInteractiveListItem{title: locale, description: fmt.Sprintf("%d tasks", counter[locale]), value: locale})
	}
	return items
}

func (m runInteractiveModel) bucketRows() ([]table.Row, []string) {
	type bucketSummary struct {
		files   map[string]struct{}
		targets map[string]struct{}
		tasks   int
	}
	byBucket := map[string]*bucketSummary{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "bucket") {
			continue
		}
		entry := byBucket[task.Bucket]
		if entry == nil {
			entry = &bucketSummary{files: map[string]struct{}{}, targets: map[string]struct{}{}}
			byBucket[task.Bucket] = entry
		}
		entry.files[task.SourcePath] = struct{}{}
		entry.targets[task.TargetLocale] = struct{}{}
		entry.tasks += task.TaskCount
	}

	rows := make([]table.Row, 0, len(byBucket)+1)
	values := make([]string, 0, len(byBucket)+1)
	if !m.isPrimaryStep(runInteractiveStepBucket) {
		total := m.selectionSummary()
		rows = append(rows, table.Row{"All buckets", fmt.Sprintf("%d files / %d targets", total.FileCount, total.TargetCount), fmt.Sprintf("%d", total.TaskCount)})
		values = append(values, "")
	}
	keys := sortedMapKeys(byBucket)
	for _, name := range keys {
		summary := byBucket[name]
		if m.tableFilter != "" && !strings.Contains(strings.ToLower(name), strings.ToLower(m.tableFilter)) {
			continue
		}
		rows = append(rows, table.Row{name, fmt.Sprintf("%d files / %d targets", len(summary.files), len(summary.targets)), fmt.Sprintf("%d", summary.tasks)})
		values = append(values, name)
	}
	return rows, values
}

func (m runInteractiveModel) fileRows() ([]table.Row, []string) {
	type fileSummary struct {
		buckets map[string]struct{}
		targets map[string]struct{}
		tasks   int
	}
	byFile := map[string]*fileSummary{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "file") {
			continue
		}
		if m.directoryScope != "" && !isWithinPath(task.SourcePath, m.directoryScope) {
			continue
		}
		entry := byFile[task.SourcePath]
		if entry == nil {
			entry = &fileSummary{buckets: map[string]struct{}{}, targets: map[string]struct{}{}}
			byFile[task.SourcePath] = entry
		}
		entry.buckets[task.Bucket] = struct{}{}
		entry.targets[task.TargetLocale] = struct{}{}
		entry.tasks += task.TaskCount
	}

	rows := make([]table.Row, 0, len(byFile)+1)
	values := make([]string, 0, len(byFile)+1)
	fileTaskTotal := 0
	for _, summary := range byFile {
		fileTaskTotal += summary.tasks
	}
	if !m.isPrimaryStep(runInteractiveStepFile) {
		rows = append(rows, table.Row{m.fileSelectionMarker(""), "All files", fmt.Sprintf("%d buckets / %d targets", len(m.availableBuckets()), len(m.availableTargetSet())), fmt.Sprintf("%d", fileTaskTotal)})
		values = append(values, "")
	}
	keys := sortedMapKeys(byFile)
	for _, path := range keys {
		if m.tableFilter != "" && !strings.Contains(strings.ToLower(path), strings.ToLower(m.tableFilter)) {
			continue
		}
		summary := byFile[path]
		rows = append(rows, table.Row{m.fileSelectionMarker(path), path, fmt.Sprintf("%d buckets / %d targets", len(summary.buckets), len(summary.targets)), fmt.Sprintf("%d", summary.tasks)})
		values = append(values, path)
	}
	return rows, values
}

func (m runInteractiveModel) fileSelectionMarker(path string) string {
	if path == "" {
		if len(m.selectedFiles) == 0 && m.selectedFile == "" {
			return "[x]"
		}
		return "[ ]"
	}
	if _, ok := m.selectedFiles[path]; ok {
		return "[x]"
	}
	if len(m.selectedFiles) == 0 && m.selectedFile == path {
		return "[x]"
	}
	return "[ ]"
}

func (m runInteractiveModel) availableBuckets() []string {
	seen := map[string]struct{}{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "bucket") {
			continue
		}
		seen[task.Bucket] = struct{}{}
	}
	return sortedStringKeysFromSet(seen)
}

func (m runInteractiveModel) optionItems() []runInteractiveListItem {
	return []runInteractiveListItem{
		{title: fmt.Sprintf("Dry run: %t", m.options.dryRun), description: "Toggle preview-only execution.", value: "dry-run"},
		{title: fmt.Sprintf("Force: %t", m.options.force), description: "Toggle lockfile bypass.", value: "force"},
		{title: fmt.Sprintf("Prune: %t", m.options.prune), description: "Toggle stale key pruning.", value: "prune"},
		{title: fmt.Sprintf("Workers: %d", max(1, m.options.workers)), description: "Use left/right to decrease or increase worker count.", value: "workers"},
		{title: "Experimental flags", description: "Open experimental settings.", value: "experimental"},
		{title: "Back to review", description: "Return to the review screen.", value: "review"},
	}
}

func (m runInteractiveModel) experimentalItems() []runInteractiveListItem {
	return []runInteractiveListItem{
		{title: fmt.Sprintf("Context memory: %t", m.options.experimentalContextMemory), description: "Toggle experimental context memory.", value: "context-memory"},
		{title: fmt.Sprintf("Context scope: %s", m.options.contextMemoryScope), description: "Use left/right to cycle file, bucket, and group.", value: "context-scope"},
		{title: fmt.Sprintf("Context max chars: %d", m.options.contextMemoryMaxChars), description: "Use left/right to adjust the character budget.", value: "context-max"},
		{title: "Back to review", description: "Open the final review screen.", value: "review"},
	}
}

func (m runInteractiveModel) reviewRows() []table.Row {
	selection := m.selectionSummary()
	var targets []string
	if m.selectedTarget != "" {
		targets = []string{m.selectedTarget}
	} else {
		targets = sortedStringKeysFromSet(m.availableTargetSet())
	}
	var files []string
	if len(m.selectedFiles) > 0 {
		files = sortedStringKeysFromSet(m.selectedFiles)
	} else if m.selectedFile != "" {
		files = []string{m.selectedFile}
	} else {
		files = sortedStringKeysFromSet(m.availableFileSet())
	}
	return []table.Row{
		{"Mode", emptyDash(string(m.mode))},
		{"Group", m.scopeLabel(m.selectedGroup, "groups")},
		{"Bucket", m.scopeLabel(m.selectedBucket, "buckets")},
		{"Target", m.scopeLabel(m.selectedTarget, "targets")},
		{"File", m.fileScopeLabel()},
		{"Matched source files", fmt.Sprintf("%d (%s)", selection.FileCount, summarizeSlice(files, 2))},
		{"Matched target locales", fmt.Sprintf("%d (%s)", selection.TargetCount, summarizeSlice(targets, 3))},
		{"Estimated planned tasks", fmt.Sprintf("%d", selection.TaskCount)},
		{"Dry run", fmt.Sprintf("%t", m.options.dryRun)},
		{"Force", fmt.Sprintf("%t", m.options.force)},
		{"Prune", fmt.Sprintf("%t", m.options.prune)},
		{"Workers", fmt.Sprintf("%d", max(1, m.options.workers))},
		{"Context memory", fmt.Sprintf("%t", m.options.experimentalContextMemory)},
		{"Context scope", m.options.contextMemoryScope},
		{"Context max chars", fmt.Sprintf("%d", m.options.contextMemoryMaxChars)},
	}
}

func (m runInteractiveModel) availableTargetSet() map[string]struct{} {
	seen := map[string]struct{}{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "target") {
			continue
		}
		seen[task.TargetLocale] = struct{}{}
	}
	return seen
}

func (m runInteractiveModel) availableFileSet() map[string]struct{} {
	seen := map[string]struct{}{}
	for _, task := range m.catalog.TaskIndex {
		if !m.matchesTask(task, "file") {
			continue
		}
		seen[task.SourcePath] = struct{}{}
	}
	return seen
}

func (m runInteractiveModel) renderListStep() string {
	hint := "use / to filter, enter to choose, esc to go back"
	if m.currentStep() == runInteractiveStepOptions || m.currentStep() == runInteractiveStepExperimental {
		hint = "enter toggles or opens, left/right adjusts values, esc returns"
	} else if m.currentStep() == runInteractiveStepReview {
		hint = "enter runs or opens an edit action, esc returns"
	} else if m.currentStep() == runInteractiveStepMode {
		hint = "enter chooses a mode, / filters the list, esc quits"
	}
	summary := []string{}
	switch m.currentStep() {
	case runInteractiveStepMode:
		summary = append(summary, m.accentStyle.Render(fmt.Sprintf("%d modes", len(m.list.Items()))))
	case runInteractiveStepGroup:
		summary = append(summary, m.accentStyle.Render(fmt.Sprintf("%d groups", len(m.list.Items()))))
	case runInteractiveStepTarget:
		summary = append(summary, m.accentStyle.Render(fmt.Sprintf("%d targets", len(m.list.Items()))))
	case runInteractiveStepOptions, runInteractiveStepExperimental:
		summary = append(summary, m.accentStyle.Render(fmt.Sprintf("%d settings", len(m.list.Items()))))
	}
	parts := []string{m.sectionStyle.Render(stepTitle(m.currentStep()))}
	if len(summary) > 0 {
		parts = append(parts, strings.Join(summary, "  "))
	}
	parts = append(parts, m.metaStyle.Render(hint), m.list.View())
	return strings.Join(parts, "\n")
}

func (m runInteractiveModel) renderTableStep() string {
	parts := []string{m.sectionStyle.Render(stepTitle(m.currentStep()))}
	if m.currentStep() == runInteractiveStepBucket {
		parts = append(parts, m.accentStyle.Render(fmt.Sprintf("%d buckets", len(m.tableRows))))
	}
	if m.filtering {
		parts = append(parts, m.filter.View())
	} else if m.tableFilter != "" {
		parts = append(parts, m.metaStyle.Render("filter="+m.tableFilter))
	}
	if m.currentStep() == runInteractiveStepFile {
		parts = append(parts, m.accentStyle.Render(m.fileSelectionSummary()))
		parts = append(parts, m.metaStyle.Render(fmt.Sprintf("pane=%s  tab switches between file list and directory picker", m.filePane)))
		if m.directoryScope != "" {
			parts = append(parts, m.metaStyle.Render("directory filter="+m.directoryScope))
		}
		parts = append(parts, m.metaStyle.Render("space selects files, enter continues, left/right changes page"))
	}
	if m.currentStep() == runInteractiveStepFile {
		switch m.filePane {
		case "picker":
			parts = append(parts,
				m.metaStyle.Render("pick a directory to narrow the file list, then return to the table"),
				"",
				m.sectionStyle.Render("Directory Picker"),
				m.filepicker.View(),
			)
		default:
			parts = append(parts,
				m.table.View(),
				m.metaStyle.Render(m.table.HelpView()+"  "+m.pagerSummary()),
			)
		}
		return strings.Join(parts, "\n")
	}
	parts = append(parts, m.table.View(), m.metaStyle.Render(m.table.HelpView()+"  "+m.pagerSummary()))
	return strings.Join(parts, "\n")
}

func (m runInteractiveModel) renderReviewStep() string {
	return strings.Join([]string{
		m.sectionStyle.Render("Review"),
		m.accentStyle.Render(fmt.Sprintf("%d tasks  %d files  %d locales", m.selectionSummary().TaskCount, m.selectionSummary().FileCount, m.selectionSummary().TargetCount)),
		m.metaStyle.Render("Run now, or edit options and experimental flags first."),
		m.table.View(),
		"",
		m.list.View(),
	}, "\n")
}

func (m runInteractiveModel) fileSelectionSummary() string {
	count := len(m.selectedFiles)
	if count == 0 && m.selectedFile != "" {
		count = 1
	}
	if count == 0 {
		return fmt.Sprintf("%d visible files", len(m.tableRows))
	}
	return fmt.Sprintf("%d files selected", count)
}

func (m runInteractiveModel) helpBindings() runInteractiveHelp {
	switch m.currentStep() {
	case runInteractiveStepFile:
		if m.filePane == "picker" {
			return runInteractiveHelp{
				short: []key.Binding{m.keys.Confirm, m.keys.TogglePane, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit},
				full:  [][]key.Binding{{m.keys.Confirm, m.keys.TogglePane, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit}},
			}
		}
		return runInteractiveHelp{
			short: []key.Binding{m.keys.TogglePick, m.keys.Confirm, m.keys.Dec, m.keys.Inc, m.keys.TogglePane, m.keys.Back, m.keys.Quit},
			full:  [][]key.Binding{{m.keys.TogglePick, m.keys.Confirm, m.keys.Filter, m.keys.Dec, m.keys.Inc, m.keys.TogglePane, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit}},
		}
	case runInteractiveStepBucket:
		return runInteractiveHelp{
			short: []key.Binding{m.keys.Confirm, m.keys.Filter, m.keys.Dec, m.keys.Inc, m.keys.Back, m.keys.Quit},
			full:  [][]key.Binding{{m.keys.Confirm, m.keys.Filter, m.keys.Dec, m.keys.Inc, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit}},
		}
	case runInteractiveStepOptions, runInteractiveStepExperimental:
		return runInteractiveHelp{
			short: []key.Binding{m.keys.Confirm, m.keys.Inc, m.keys.Dec, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit},
			full:  [][]key.Binding{{m.keys.Confirm, m.keys.Inc, m.keys.Dec, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit}},
		}
	case runInteractiveStepReview:
		return runInteractiveHelp{
			short: []key.Binding{m.keys.Confirm, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit},
			full:  [][]key.Binding{{m.keys.Confirm, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit}},
		}
	default:
		return runInteractiveHelp{
			short: []key.Binding{m.keys.Confirm, m.keys.Filter, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit},
			full:  [][]key.Binding{{m.keys.Confirm, m.keys.Filter, m.keys.Back, m.keys.ToggleHelp, m.keys.Quit}},
		}
	}
}

func (m runInteractiveModel) pagerSummary() string {
	total := len(m.tableRows)
	if total == 0 {
		return "page 0/0 rows 0-0 of 0"
	}
	start, end := m.pager.GetSliceBounds(total)
	return fmt.Sprintf("page %d/%d rows %d-%d of %d", m.pager.Page+1, max(1, m.pager.TotalPages), start+1, end, total)
}

func (m runInteractiveModel) footer() string {
	footer := fmt.Sprintf(
		"scope group=%s bucket=%s target=%s file=%s",
		m.scopeLabel(m.selectedGroup, "groups"),
		m.scopeLabel(m.selectedBucket, "buckets"),
		m.scopeLabel(m.selectedTarget, "targets"),
		m.fileScopeLabel(),
	)
	if m.directoryScope != "" {
		footer += fmt.Sprintf(" directory=%s", m.directoryScope)
	}
	return m.footerStyle.Render(footer)
}

func (m runInteractiveModel) finalOptions() runOptions {
	final := m.options
	final.group = m.selectedGroup
	final.bucket = m.selectedBucket
	if m.selectedTarget != "" {
		final.targetLocales = []string{m.selectedTarget}
	} else {
		final.targetLocales = nil
	}
	if len(m.selectedFiles) > 0 {
		final.sourcePaths = sortedStringKeysFromSet(m.selectedFiles)
	} else if m.selectedFile != "" {
		final.sourcePaths = []string{m.selectedFile}
	} else {
		final.sourcePaths = nil
	}
	return final
}

func (m runInteractiveModel) scopeLabel(value, plural string) string {
	if strings.TrimSpace(value) == "" {
		return "all " + plural
	}
	return value
}

func (m runInteractiveModel) fileScopeLabel() string {
	if len(m.selectedFiles) > 0 {
		files := sortedStringKeysFromSet(m.selectedFiles)
		return fmt.Sprintf("%d files (%s)", len(files), summarizeSlice(files, 2))
	}
	return m.scopeLabel(m.selectedFile, "files")
}

func (m runInteractiveModel) isAllowedDirectory(path string) bool {
	cleaned := filepath.Clean(path)
	for _, file := range m.catalog.Files {
		if isWithinPath(file.Path, cleaned) {
			return true
		}
	}
	return false
}

func stepTitle(step runInteractiveStep) string {
	switch step {
	case runInteractiveStepMode:
		return "Mode"
	case runInteractiveStepGroup:
		return "Group"
	case runInteractiveStepBucket:
		return "Bucket"
	case runInteractiveStepTarget:
		return "Target language"
	case runInteractiveStepFile:
		return "File"
	case runInteractiveStepOptions:
		return "Run options"
	case runInteractiveStepExperimental:
		return "Experimental flags"
	case runInteractiveStepReview:
		return "Review"
	default:
		return "Mode"
	}
}

func sortedStringKeys(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func sortedMapKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func sortedStringKeysFromSet(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func sumIntMap(values map[string]int) int {
	total := 0
	for _, value := range values {
		total += value
	}
	return total
}

func summarizeSlice(values []string, limit int) string {
	if len(values) == 0 {
		return "-"
	}
	if len(values) <= limit {
		return strings.Join(values, ", ")
	}
	return strings.Join(values[:limit], ", ") + fmt.Sprintf(" +%d more", len(values)-limit)
}

func commonPathPrefix(paths []string) string {
	if len(paths) == 0 {
		return ""
	}
	prefix := commonPathCandidate(paths[0])
	for _, path := range paths[1:] {
		current := commonPathCandidate(path)
		for prefix != "" && prefix != string(filepath.Separator) && prefix != "." && !isWithinPath(current, prefix) {
			next := filepath.Dir(prefix)
			if next == prefix {
				prefix = ""
				break
			}
			prefix = next
		}
	}
	if prefix == "." {
		return ""
	}
	return prefix
}

func commonPathCandidate(path string) string {
	cleaned := filepath.Clean(path)
	if info, err := os.Stat(cleaned); err == nil && !info.IsDir() {
		return filepath.Dir(cleaned)
	}
	return cleaned
}

func filePathsFromCatalog(files []runsvc.SelectionFile) []string {
	paths := make([]string, 0, len(files))
	for _, file := range files {
		paths = append(paths, file.Path)
	}
	return paths
}

func isWithinPath(path, dir string) bool {
	cleanPath := filepath.Clean(path)
	cleanDir := filepath.Clean(dir)
	if cleanPath == cleanDir {
		return true
	}
	rel, err := filepath.Rel(cleanDir, cleanPath)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func isTTYInput(f *os.File) bool {
	fd := f.Fd()
	return isatty.IsTerminal(fd) || isatty.IsCygwinTerminal(fd)
}
