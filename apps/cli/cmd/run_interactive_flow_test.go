package cmd

import (
	"bytes"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"
)

func flowCatalog() runsvc.SelectionCatalog {
	return runsvc.SelectionCatalog{
		ConfigPath: "/tmp/i18n.jsonc",
		Files: []runsvc.SelectionFile{
			{Path: "/tmp/content/en/a.json"},
			{Path: "/tmp/content/en/b.json"},
			{Path: "/tmp/content/en/docs/c.json"},
		},
		TaskIndex: []runsvc.SelectionTaskIndex{
			{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			{Group: "default", Bucket: "ui", TargetLocale: "de", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			{Group: "default", Bucket: "marketing", TargetLocale: "fr", SourcePath: "/tmp/content/en/b.json", TaskCount: 3},
			{Group: "docs", Bucket: "guides", TargetLocale: "fr", SourcePath: "/tmp/content/en/docs/c.json", TaskCount: 5},
		},
	}
}

func newFlowModel(t *testing.T, seed runOptions) runInteractiveModel {
	t.Helper()
	if seed.configPath == "" {
		seed.configPath = "/tmp/i18n.jsonc"
	}
	m := newRunInteractiveModel(flowCatalog(), seed)
	return sendRunInteractive(t, m, tea.WindowSizeMsg{Width: 120, Height: 40})
}

func sendRunInteractive(t *testing.T, m runInteractiveModel, msgs ...tea.Msg) runInteractiveModel {
	t.Helper()
	for _, msg := range msgs {
		next, _ := m.Update(msg)
		typed, ok := next.(runInteractiveModel)
		if !ok {
			t.Fatalf("expected runInteractiveModel, got %T", next)
		}
		m = typed
	}
	return m
}

func runInteractiveKey(code rune) tea.KeyPressMsg {
	return tea.KeyPressMsg(tea.Key{Code: code})
}

func runInteractiveText(text string) tea.KeyPressMsg {
	return tea.KeyPressMsg(tea.Key{Text: text, Code: []rune(text)[0]})
}

func expectQuit(t *testing.T, cmd tea.Cmd) {
	t.Helper()
	if cmd == nil {
		t.Fatal("expected quit command")
	}
	if _, ok := cmd().(tea.QuitMsg); !ok {
		t.Fatal("expected tea.QuitMsg")
	}
}

func viewOf(m runInteractiveModel) string {
	return fmt.Sprint(m.View())
}

func TestRunInteractiveGroupFlowEndsInDryRun(t *testing.T) {
	m := newFlowModel(t, runOptions{workers: 2})
	enter := runInteractiveKey(tea.KeyEnter)
	down := runInteractiveKey(tea.KeyDown)

	view := viewOf(m)
	for _, want := range []string{"hyperlocalise run interactive", "config=/tmp/i18n.jsonc", "mode=-  tasks=12  files=3  locales=2", "5 modes", "enter chooses a mode"} {
		if !strings.Contains(view, want) {
			t.Fatalf("mode view missing %q:\n%s", want, view)
		}
	}

	m = sendRunInteractive(t, m, down, enter)
	if m.mode != runInteractiveModeGroup || m.currentStep() != runInteractiveStepGroup {
		t.Fatalf("expected group step, got mode=%s step=%v", m.mode, m.currentStep())
	}
	if view := viewOf(m); !strings.Contains(view, "2 groups") || !strings.Contains(view, "use / to filter") {
		t.Fatalf("group view:\n%s", view)
	}

	m = sendRunInteractive(t, m, enter)
	if m.selectedGroup != "default" || m.currentStep() != runInteractiveStepBucket {
		t.Fatalf("expected bucket step for default group, got group=%q step=%v", m.selectedGroup, m.currentStep())
	}
	if got := strings.Join(m.tableValues, ","); got != ",marketing,ui" {
		t.Fatalf("bucket values = %q", got)
	}
	if view := viewOf(m); !strings.Contains(view, "3 buckets") || !strings.Contains(view, "page 1/1 rows 1-3 of 3") {
		t.Fatalf("bucket view:\n%s", view)
	}

	m = sendRunInteractive(t, m, down, down, enter)
	if m.selectedBucket != "ui" || m.currentStep() != runInteractiveStepTarget {
		t.Fatalf("expected ui bucket then target step, got bucket=%q step=%v", m.selectedBucket, m.currentStep())
	}
	if view := viewOf(m); !strings.Contains(view, "3 targets") {
		t.Fatalf("target view:\n%s", view)
	}

	m = sendRunInteractive(t, m, down, enter)
	if m.selectedTarget != "de" || m.currentStep() != runInteractiveStepFile {
		t.Fatalf("expected de target then file step, got target=%q step=%v", m.selectedTarget, m.currentStep())
	}
	if view := viewOf(m); !strings.Contains(view, "pane=table") || !strings.Contains(view, "2 visible files") {
		t.Fatalf("file view:\n%s", view)
	}

	m = sendRunInteractive(t, m, enter)
	if m.currentStep() != runInteractiveStepReview {
		t.Fatalf("expected review step, got %v", m.currentStep())
	}
	view = viewOf(m)
	for _, want := range []string{"Review", "2 tasks  1 files  1 locales", "scope group=default bucket=ui target=de file=all files", "Dry run"} {
		if !strings.Contains(view, want) {
			t.Fatalf("review view missing %q:\n%s", want, view)
		}
	}

	next, cmd := m.Update(enter)
	m = next.(runInteractiveModel)
	expectQuit(t, cmd)
	if !m.done || !m.execute || !m.options.dryRun {
		t.Fatalf("expected dry-run execution, got done=%v execute=%v dryRun=%v", m.done, m.execute, m.options.dryRun)
	}
	final := m.finalOptions()
	if final.group != "default" || final.bucket != "ui" || strings.Join(final.targetLocales, ",") != "de" || final.sourcePaths != nil {
		t.Fatalf("unexpected final options: %+v", final)
	}
}

func TestRunInteractiveReviewActions(t *testing.T) {
	newReview := func(t *testing.T) runInteractiveModel {
		t.Helper()
		m := newFlowModel(t, runOptions{dryRun: true})
		return sendRunInteractive(t, m, runInteractiveKey(tea.KeyEnter))
	}
	down := runInteractiveKey(tea.KeyDown)
	enter := runInteractiveKey(tea.KeyEnter)

	m := newReview(t)
	if m.currentStep() != runInteractiveStepReview {
		t.Fatalf("expected all mode to land on review, got %v", m.currentStep())
	}
	next, cmd := sendRunInteractive(t, m, down).Update(enter)
	m = next.(runInteractiveModel)
	expectQuit(t, cmd)
	if !m.execute || m.options.dryRun {
		t.Fatalf("expected run without dry-run, got execute=%v dryRun=%v", m.execute, m.options.dryRun)
	}

	m = sendRunInteractive(t, newReview(t), down, down, down, enter)
	if m.currentStep() != runInteractiveStepExperimental {
		t.Fatalf("expected experimental override, got %v", m.currentStep())
	}
	if view := viewOf(m); !strings.Contains(view, "4 settings") || !strings.Contains(view, "left/right adjusts values") {
		t.Fatalf("experimental view:\n%s", view)
	}

	m = sendRunInteractive(t, newReview(t), down, down, down, down, enter)
	if m.currentStep() != runInteractiveStepMode || m.stepPos != 0 {
		t.Fatalf("expected back to mode step, got %v pos=%d", m.currentStep(), m.stepPos)
	}
}

func TestRunInteractiveOptionsMutations(t *testing.T) {
	m := newFlowModel(t, runOptions{workers: 2})
	step := runInteractiveStepOptions
	m.override = &step
	m.refreshStep()
	enter := runInteractiveKey(tea.KeyEnter)
	down := runInteractiveKey(tea.KeyDown)
	left := runInteractiveKey(tea.KeyLeft)

	if view := viewOf(m); !strings.Contains(view, "6 settings") || !strings.Contains(view, "Workers: 2") {
		t.Fatalf("options view:\n%s", view)
	}

	m = sendRunInteractive(t, m, enter)
	if !m.options.dryRun {
		t.Fatal("expected enter to toggle dry run")
	}
	m = sendRunInteractive(t, m, down, enter, down, enter)
	if !m.options.force || !m.options.prune {
		t.Fatalf("expected force and prune toggled, got %+v", m.options)
	}

	m = sendRunInteractive(t, m, down, enter)
	if m.options.workers != 2 {
		t.Fatalf("enter on workers must not change value, got %d", m.options.workers)
	}
	m = sendRunInteractive(t, m, left, left, left)
	if m.options.workers != 1 {
		t.Fatalf("expected workers clamped to 1, got %d", m.options.workers)
	}
	m = sendRunInteractive(t, m, runInteractiveText("+"))
	if m.options.workers != 2 {
		t.Fatalf("expected + to increase workers, got %d", m.options.workers)
	}
	if m.list.Index() != 3 {
		t.Fatalf("expected cursor to stay on workers, got index %d", m.list.Index())
	}

	m = sendRunInteractive(t, m, down, down, enter)
	if m.override != nil || m.currentStep() != runInteractiveStepMode {
		t.Fatalf("expected back to review route, got override=%v step=%v", m.override, m.currentStep())
	}

	m.override = &step
	m.refreshStep()
	m.list.Select(4)
	m = sendRunInteractive(t, m, down, runInteractiveKey(tea.KeyUp), enter)
	if m.currentStep() != runInteractiveStepExperimental {
		t.Fatalf("expected experimental override from options, got %v", m.currentStep())
	}
}

func TestRunInteractiveExperimentalMutations(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	step := runInteractiveStepExperimental
	m.override = &step
	m.refreshStep()
	enter := runInteractiveKey(tea.KeyEnter)
	right := runInteractiveKey(tea.KeyRight)
	left := runInteractiveKey(tea.KeyLeft)
	down := runInteractiveKey(tea.KeyDown)

	m = sendRunInteractive(t, m, enter)
	if !m.options.experimentalContextMemory {
		t.Fatal("expected context memory toggled on")
	}

	if m.options.contextMemoryScope != runsvc.ContextMemoryScopeFile {
		t.Fatalf("expected default scope file, got %q", m.options.contextMemoryScope)
	}
	m = sendRunInteractive(t, m, down, right)
	if m.options.contextMemoryScope != runsvc.ContextMemoryScopeBucket {
		t.Fatalf("expected scope bucket, got %q", m.options.contextMemoryScope)
	}
	m = sendRunInteractive(t, m, left, left)
	if m.options.contextMemoryScope != runsvc.ContextMemoryScopeGroup {
		t.Fatalf("expected scope to wrap to group, got %q", m.options.contextMemoryScope)
	}
	m = sendRunInteractive(t, m, enter)
	if m.options.contextMemoryScope != runsvc.ContextMemoryScopeFile {
		t.Fatalf("expected enter to cycle scope forward to file, got %q", m.options.contextMemoryScope)
	}
	m.options.contextMemoryScope = "unknown"
	m.mutateExperimentalOption("context-scope", 1)
	if m.options.contextMemoryScope != runsvc.ContextMemoryScopeBucket {
		t.Fatalf("expected unknown scope to restart from file, got %q", m.options.contextMemoryScope)
	}

	m = sendRunInteractive(t, m, down, enter)
	if m.options.contextMemoryMaxChars != 0 {
		t.Fatalf("enter on context max must not change value, got %d", m.options.contextMemoryMaxChars)
	}
	m = sendRunInteractive(t, m, right)
	if m.options.contextMemoryMaxChars != 1300 {
		t.Fatalf("expected default 1200 + 100, got %d", m.options.contextMemoryMaxChars)
	}
	m.options.contextMemoryMaxChars = 150
	m = sendRunInteractive(t, m, left, left)
	if m.options.contextMemoryMaxChars != 100 {
		t.Fatalf("expected context max clamped to 100, got %d", m.options.contextMemoryMaxChars)
	}

	m = sendRunInteractive(t, m, down, enter)
	if m.override != nil {
		t.Fatal("expected review action to clear experimental override")
	}
}

func TestRunInteractiveOptionsKeepCursorOnRepeatedAdjust(t *testing.T) {
	m := newFlowModel(t, runOptions{workers: 2})
	step := runInteractiveStepOptions
	m.override = &step
	m.refreshStep()
	down := runInteractiveKey(tea.KeyDown)
	right := runInteractiveKey(tea.KeyRight)

	m = sendRunInteractive(t, m, down, down, down, right, right)
	if m.options.workers != 4 {
		t.Fatalf("expected workers 4 after two right presses, got %d", m.options.workers)
	}
	if m.options.dryRun || m.options.force || m.options.prune {
		t.Fatalf("expected toggles untouched, got %+v", m.options)
	}
	if item, ok := m.list.SelectedItem().(runInteractiveListItem); !ok || item.value != "workers" {
		t.Fatalf("expected cursor on workers, got %+v", m.list.SelectedItem())
	}
}

func TestRunInteractiveExperimentalKeepCursorOnRepeatedAdjust(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	step := runInteractiveStepExperimental
	m.override = &step
	m.refreshStep()
	left := runInteractiveKey(tea.KeyLeft)

	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyDown), left, left)
	if m.options.contextMemoryScope != runsvc.ContextMemoryScopeBucket {
		t.Fatalf("expected scope bucket after two left presses from file, got %q", m.options.contextMemoryScope)
	}
	if m.options.experimentalContextMemory {
		t.Fatal("expected context memory toggle untouched")
	}
	if item, ok := m.list.SelectedItem().(runInteractiveListItem); !ok || item.value != "context-scope" {
		t.Fatalf("expected cursor on context scope, got %+v", m.list.SelectedItem())
	}
}

func TestRunInteractiveStepNavigationResetsCursorAndClamps(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	step := runInteractiveStepOptions
	m.override = &step
	m.refreshStep()
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyDown), runInteractiveKey(tea.KeyDown), runInteractiveKey(tea.KeyDown))

	experimental := runInteractiveStepExperimental
	m.override = &experimental
	m.refreshStep()
	if m.list.Index() != 0 {
		t.Fatalf("expected new step to start at top, got index %d", m.list.Index())
	}

	m.list.Select(99)
	m.refreshStepPreservingSelection()
	if want := len(m.list.Items()) - 1; m.list.Index() != want {
		t.Fatalf("expected index clamped to %d, got %d", want, m.list.Index())
	}
}

func TestRunInteractiveBackNavigationAndQuit(t *testing.T) {
	esc := runInteractiveKey(tea.KeyEscape)

	m := newFlowModel(t, runOptions{})
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyDown), runInteractiveKey(tea.KeyEnter))
	m = sendRunInteractive(t, m, esc)
	if m.stepPos != 0 || m.currentStep() != runInteractiveStepMode {
		t.Fatalf("expected esc to go back to mode, got pos=%d step=%v", m.stepPos, m.currentStep())
	}
	next, cmd := m.Update(esc)
	expectQuit(t, cmd)
	if typed := next.(runInteractiveModel); !typed.done || typed.execute {
		t.Fatalf("expected esc at first step to quit without executing")
	}

	m = newFlowModel(t, runOptions{})
	step := runInteractiveStepOptions
	m.override = &step
	m.refreshStep()
	m.errMsg = "stale"
	m = sendRunInteractive(t, m, esc)
	if m.override != nil || m.errMsg != "" {
		t.Fatalf("expected esc to drop override and error, got override=%v err=%q", m.override, m.errMsg)
	}

	for _, quit := range []tea.KeyPressMsg{runInteractiveText("q"), tea.KeyPressMsg(tea.Key{Code: 'c', Mod: tea.ModCtrl})} {
		next, cmd := newFlowModel(t, runOptions{}).Update(quit)
		expectQuit(t, cmd)
		if typed := next.(runInteractiveModel); !typed.done || typed.execute {
			t.Fatalf("%s: expected quit without execution", quit.String())
		}
	}
}

func TestRunInteractiveHelpToggleAndWindowSize(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	m = sendRunInteractive(t, m, runInteractiveText("?"))
	if !m.help.ShowAll || !m.list.Help.ShowAll {
		t.Fatal("expected full help on both help models")
	}
	m = sendRunInteractive(t, m, runInteractiveText("?"))
	if m.help.ShowAll {
		t.Fatal("expected help toggled off")
	}

	m.mode = runInteractiveModeBucket
	m.steps = runInteractiveStepsForMode(m.mode)
	m.stepPos = 1
	m.refreshStep()
	m = sendRunInteractive(t, m, tea.WindowSizeMsg{Width: 30, Height: 10})
	if m.width != 30 || m.height != 10 || m.pager.PerPage != 5 || m.table.Width() != 40 {
		t.Fatalf("unexpected sizing width=%d height=%d perPage=%d table=%d", m.width, m.height, m.pager.PerPage, m.table.Width())
	}
}

func TestRunInteractiveBucketPagingAndTableFilter(t *testing.T) {
	catalog := runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"}
	for i := range 7 {
		catalog.TaskIndex = append(catalog.TaskIndex, runsvc.SelectionTaskIndex{
			Group:        "default",
			Bucket:       fmt.Sprintf("bucket-%d", i),
			TargetLocale: "fr",
			SourcePath:   fmt.Sprintf("/tmp/content/en/%d.json", i),
			TaskCount:    1,
		})
	}
	m := newRunInteractiveModel(catalog, runOptions{configPath: catalog.ConfigPath})
	m.mode = runInteractiveModeBucket
	m.steps = runInteractiveStepsForMode(m.mode)
	m.stepPos = 1
	m.refreshStep()
	m = sendRunInteractive(t, m, tea.WindowSizeMsg{Width: 100, Height: 10})

	if m.pager.TotalPages != 2 {
		t.Fatalf("expected two pages, got %d", m.pager.TotalPages)
	}
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyRight))
	if m.pager.Page != 1 || !strings.Contains(viewOf(m), "page 2/2 rows 6-7 of 7") {
		t.Fatalf("expected second page, got page=%d\n%s", m.pager.Page, viewOf(m))
	}
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyEnter))
	if m.selectedBucket != "bucket-5" || m.currentStep() != runInteractiveStepTarget {
		t.Fatalf("expected bucket-5 selected from page 2, got %q step=%v", m.selectedBucket, m.currentStep())
	}

	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyEscape))
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyRight), runInteractiveText("-"))
	if m.pager.Page != 0 {
		t.Fatalf("expected - to go back a page, got %d", m.pager.Page)
	}

	m = sendRunInteractive(t, m, runInteractiveText("/"))
	if !m.filtering {
		t.Fatal("expected / to start table filtering")
	}
	if !strings.Contains(viewOf(m), "/ ") {
		t.Fatalf("expected filter input in view:\n%s", viewOf(m))
	}
	m = sendRunInteractive(t, m, runInteractiveText("3"), runInteractiveKey(tea.KeyEnter))
	if m.filtering || m.tableFilter != "3" {
		t.Fatalf("expected applied filter 3, got filtering=%v filter=%q", m.filtering, m.tableFilter)
	}
	if got := strings.Join(m.tableValues, ","); got != "bucket-3" {
		t.Fatalf("filtered bucket values = %q", got)
	}
	if view := viewOf(m); !strings.Contains(view, "filter=3") || !strings.Contains(view, "tasks=1  files=1  locales=1") {
		t.Fatalf("expected filtered meta in view:\n%s", view)
	}
}

func TestRunInteractiveFileStepSelectionAndPicker(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	m.mode = runInteractiveModeFile
	m.steps = runInteractiveStepsForMode(m.mode)
	m.stepPos = 1
	m.refreshStep()
	space := runInteractiveKey(tea.KeySpace)
	down := runInteractiveKey(tea.KeyDown)

	m = sendRunInteractive(t, m, space, down, space)
	if len(m.selectedFiles) != 2 {
		t.Fatalf("expected two files selected, got %v", m.selectedFiles)
	}
	view := viewOf(m)
	if !strings.Contains(view, "2 files selected") || !strings.Contains(view, "file=2 files (/tmp/content/en/a.json, /tmp/content/en/b.json)") {
		t.Fatalf("file selection view:\n%s", view)
	}

	m.directoryScope = "/tmp/content/en/docs"
	if view := viewOf(m); !strings.Contains(view, "directory filter=/tmp/content/en/docs") || !strings.Contains(view, "directory=/tmp/content/en/docs") {
		t.Fatalf("expected directory scope in view:\n%s", view)
	}
	m.directoryScope = ""

	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyEnter))
	if m.currentStep() != runInteractiveStepTarget || len(m.finalOptions().sourcePaths) != 2 {
		t.Fatalf("expected target step with two source paths, got step=%v paths=%v", m.currentStep(), m.finalOptions().sourcePaths)
	}

	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyEscape))
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyTab), down)
	if m.filePane != "picker" {
		t.Fatalf("expected picker pane, got %s", m.filePane)
	}
	if m.selectedFiles == nil {
		t.Fatal("picker navigation must keep file selection map")
	}
	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeyTab))
	if m.filePane != "table" {
		t.Fatalf("expected tab to return to table pane, got %s", m.filePane)
	}
}

func TestRunInteractiveFileModeSingleSelectionBecomesSelectedFile(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	m.mode = runInteractiveModeFile
	m.steps = runInteractiveStepsForMode(m.mode)
	m.stepPos = 1
	m.refreshStep()

	m = sendRunInteractive(t, m, runInteractiveKey(tea.KeySpace), runInteractiveKey(tea.KeyEnter))
	if m.selectedFile != "/tmp/content/en/a.json" {
		t.Fatalf("expected single selection promoted to selectedFile, got %q", m.selectedFile)
	}
	if m.fileSelectionMarker("/tmp/content/en/a.json") != "[x]" {
		t.Fatal("expected selected marker for chosen file")
	}

	m.stepPos = 1
	m.refreshStep()
	m.selectedFiles = map[string]struct{}{}
	m.selectedFile = "/tmp/content/en/a.json"
	if m.fileSelectionMarker("/tmp/content/en/a.json") != "[x]" || m.fileSelectionMarker("") != "[ ]" {
		t.Fatal("unexpected markers for single selected file")
	}
	m.applyTableSelection("")
	if m.selectedFile != "" || len(m.selectedFiles) != 0 {
		t.Fatalf("expected all-files row to clear selection, got file=%q files=%v", m.selectedFile, m.selectedFiles)
	}
}

func TestRunInteractiveHelpBindingsPerStep(t *testing.T) {
	m := newFlowModel(t, runOptions{})
	cases := []struct {
		step      runInteractiveStep
		pane      string
		wantShort int
	}{
		{step: runInteractiveStepMode, wantShort: 5},
		{step: runInteractiveStepBucket, wantShort: 6},
		{step: runInteractiveStepFile, pane: "table", wantShort: 7},
		{step: runInteractiveStepFile, pane: "picker", wantShort: 5},
		{step: runInteractiveStepOptions, wantShort: 6},
		{step: runInteractiveStepExperimental, wantShort: 6},
		{step: runInteractiveStepReview, wantShort: 4},
	}
	for _, tc := range cases {
		step := tc.step
		m.override = &step
		m.filePane = tc.pane
		bindings := m.helpBindings()
		if len(bindings.ShortHelp()) != tc.wantShort || len(bindings.FullHelp()) != 1 {
			t.Fatalf("%s/%s: short=%d full=%d", stepTitle(tc.step), tc.pane, len(bindings.ShortHelp()), len(bindings.FullHelp()))
		}
	}

	if len(m.keys.ShortHelp()) != 6 || len(m.keys.FullHelp()[0]) != 8 {
		t.Fatal("unexpected run interactive key map help")
	}
}

func TestRunInteractiveStepTitlesAndHelpers(t *testing.T) {
	titles := map[runInteractiveStep]string{
		runInteractiveStepMode:         "Mode",
		runInteractiveStepGroup:        "Group",
		runInteractiveStepBucket:       "Bucket",
		runInteractiveStepTarget:       "Target language",
		runInteractiveStepFile:         "File",
		runInteractiveStepOptions:      "Run options",
		runInteractiveStepExperimental: "Experimental flags",
		runInteractiveStepReview:       "Review",
		runInteractiveStep(99):         "Mode",
	}
	for step, want := range titles {
		if got := stepTitle(step); got != want {
			t.Fatalf("stepTitle(%d) = %q, want %q", step, got, want)
		}
	}

	if got := summarizeSlice([]string{"a", "b", "c", "d"}, 2); got != "a, b +2 more" {
		t.Fatalf("summarizeSlice = %q", got)
	}
	if got := summarizeSlice(nil, 2); got != "-" {
		t.Fatalf("summarizeSlice empty = %q", got)
	}

	item := runInteractiveListItem{title: "Group", description: "Pick a group", value: "group"}
	if item.Title() != "Group" || item.Description() != "Pick a group" || item.FilterValue() != "Group Pick a group group" {
		t.Fatalf("unexpected list item accessors: %+v", item)
	}

	m := newFlowModel(t, runOptions{})
	if !m.isAllowedDirectory("/tmp/content/en/") || !m.isAllowedDirectory(filepath.FromSlash("/tmp/content")) {
		t.Fatal("expected configured content directories to be allowed")
	}
	if m.isAllowedDirectory("/tmp/elsewhere") {
		t.Fatal("expected unrelated directory to be rejected")
	}

	m.selectedTarget = "fr"
	if got := strings.Join(sortedStringKeysFromSet(m.availableTargetSet()), ","); got != "de,fr" {
		t.Fatalf("available targets ignore the target filter, got %s", got)
	}
	m.selectedGroup = "docs"
	if got := strings.Join(sortedStringKeysFromSet(m.availableFileSet()), ","); got != "/tmp/content/en/docs/c.json" {
		t.Fatalf("available files = %s", got)
	}
}

func TestRunInteractiveWizardRequiresTTY(t *testing.T) {
	_, err := runInteractiveWizard(runOptions{}, &bytes.Buffer{})
	if err == nil || err.Error() != "--interactive requires a TTY input and output" {
		t.Fatalf("expected TTY error, got %v", err)
	}
}
