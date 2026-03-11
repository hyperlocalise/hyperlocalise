package cmd

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/runsvc"
)

func TestRunInteractiveRequiresTTY(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"run", "--interactive"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected TTY validation error")
	}
	if !strings.Contains(err.Error(), "--interactive requires a TTY input and output") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunInteractiveReviewRowsIncludeSeededOptions(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files:      []runsvc.SelectionFile{{Path: "/tmp/content/en/a.json"}},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 3},
			},
		},
		runOptions{
			configPath:                "/tmp/i18n.jsonc",
			dryRun:                    true,
			force:                     true,
			prune:                     true,
			workers:                   4,
			experimentalContextMemory: true,
			contextMemoryScope:        runsvc.ContextMemoryScopeBucket,
			contextMemoryMaxChars:     900,
		},
	)

	model.mode = runInteractiveModeGroup
	model.selectedGroup = "default"
	model.selectedBucket = "ui"
	model.selectedTarget = "fr"
	model.selectedFile = "/tmp/content/en/a.json"

	rows := model.reviewRows()
	rendered := make([]string, 0, len(rows))
	for _, row := range rows {
		rendered = append(rendered, strings.Join(row, " "))
	}
	output := strings.Join(rendered, "\n")

	for _, expected := range []string{
		"Dry run true",
		"Force true",
		"Prune true",
		"Workers 4",
		"Context memory true",
		"Context scope bucket",
		"Context max chars 900",
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("expected review rows to contain %q, got %s", expected, output)
		}
	}
}

func TestRunInteractiveFinalOptionsIncludeSelectedFileFilter(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files:      []runsvc.SelectionFile{{Path: filepath.ToSlash("/tmp/content/en/a.json")}},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: filepath.ToSlash("/tmp/content/en/a.json"), TaskCount: 2},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)

	model.selectedGroup = "default"
	model.selectedBucket = "ui"
	model.selectedTarget = "fr"
	model.selectedFile = filepath.ToSlash("/tmp/content/en/a.json")

	final := model.finalOptions()
	if final.group != "default" || final.bucket != "ui" {
		t.Fatalf("unexpected scope in final options: %+v", final)
	}
	if len(final.targetLocales) != 1 || final.targetLocales[0] != "fr" {
		t.Fatalf("unexpected target locales: %#v", final.targetLocales)
	}
	if len(final.sourcePaths) != 1 || final.sourcePaths[0] != filepath.ToSlash("/tmp/content/en/a.json") {
		t.Fatalf("unexpected source paths: %#v", final.sourcePaths)
	}
}

func TestRunInteractiveFinalOptionsIncludeMultipleSelectedFiles(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.selectedFiles["/tmp/content/en/a.json"] = struct{}{}
	model.selectedFiles["/tmp/content/en/b.json"] = struct{}{}

	final := model.finalOptions()
	if len(final.sourcePaths) != 2 {
		t.Fatalf("expected two source paths, got %#v", final.sourcePaths)
	}
}

func TestRunInteractiveFinalOptionsUseFilteredFilesWhenNoExplicitSelection(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files: []runsvc.SelectionFile{
				{Path: "/tmp/content/en/a.json"},
				{Path: "/tmp/content/en/b.json"},
			},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 1},
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/b.json", TaskCount: 1},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)

	model.mode = runInteractiveModeFile
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.refreshStep()
	model.tableFilter = "a.json"
	model.refreshStep()
	model.continueFromFileStep()

	final := model.finalOptions()
	if len(final.sourcePaths) != 1 || final.sourcePaths[0] != "/tmp/content/en/a.json" {
		t.Fatalf("expected filtered source path, got %#v", final.sourcePaths)
	}
}

func TestRunInteractiveSpaceTogglesFileSelection(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files:      []runsvc.SelectionFile{{Path: "/tmp/content/en/a.json"}},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.mode = runInteractiveModeFile
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.refreshStep()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeySpace}))
	typed := nextModel.(runInteractiveModel)
	if _, ok := typed.selectedFiles["/tmp/content/en/a.json"]; !ok {
		t.Fatalf("expected space to select the highlighted file")
	}
}

func TestRunInteractiveSpaceKeepsCurrentFilePage(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files: []runsvc.SelectionFile{
				{Path: "/tmp/content/en/a.json"},
				{Path: "/tmp/content/en/b.json"},
			},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 1},
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/b.json", TaskCount: 1},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.mode = runInteractiveModeFile
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.pager.PerPage = 1
	model.refreshStep()
	model.pager.Page = 1
	model.applyPaginatedRows()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeySpace}))
	typed := nextModel.(runInteractiveModel)
	if typed.pager.Page != 1 {
		t.Fatalf("expected to stay on page 2 after choosing a file, got page %d", typed.pager.Page+1)
	}
	if _, ok := typed.selectedFiles["/tmp/content/en/b.json"]; !ok {
		t.Fatalf("expected the file on page 2 to be selected")
	}
}

func TestRunInteractiveFilterResetsListSelectionBeforeFiltering(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.list.Select(4)

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Text: "/", Code: '/'}))
	typed := nextModel.(runInteractiveModel)
	if typed.list.Index() != 0 {
		t.Fatalf("expected list selection to reset before filtering, got %d", typed.list.Index())
	}
}

func TestRunInteractiveEscClearsTableFilter(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.mode = runInteractiveModeBucket
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.tableFilter = "ui"
	model.filtering = true
	model.filter.SetValue("ui")

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}))
	typed := nextModel.(runInteractiveModel)
	if typed.tableFilter != "" || typed.filter.Value() != "" || typed.filtering {
		t.Fatalf("expected esc to clear table filter state")
	}
}

func TestRunInteractiveEscClearsListFilter(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.list.SetFilterText("file")

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}))
	typed := nextModel.(runInteractiveModel)
	if typed.list.IsFiltered() || typed.list.FilterValue() != "" {
		t.Fatalf("expected esc to clear list filter")
	}
}

func TestRunInteractiveSlashStartsListFiltering(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.mode = runInteractiveModeGroup
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.refreshStep()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Text: "/", Code: '/'}))
	typed := nextModel.(runInteractiveModel)
	if typed.list.FilterState() != list.Filtering {
		t.Fatalf("expected list filtering state, got %v", typed.list.FilterState())
	}
}

func TestRunInteractiveTabSwitchesVisibleFilePane(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files:      []runsvc.SelectionFile{{Path: "/tmp/content/en/a.json"}},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.mode = runInteractiveModeFile
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.refreshStep()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyTab}))
	typed := nextModel.(runInteractiveModel)
	if typed.filePane != "picker" {
		t.Fatalf("expected picker pane, got %s", typed.filePane)
	}
	view := fmt.Sprint(typed.View())
	if !strings.Contains(view, "pick a directory to narrow the file list") {
		t.Fatalf("expected picker-focused view, got %s", view)
	}
}

func TestCommonPathPrefixRespectsPathBoundaries(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "foo", "bar", "one.json")
	second := filepath.Join(dir, "foo", "barbaz", "two.json")

	if err := os.MkdirAll(filepath.Dir(first), 0o755); err != nil {
		t.Fatalf("create first dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(second), 0o755); err != nil {
		t.Fatalf("create second dir: %v", err)
	}
	if err := os.WriteFile(first, []byte(`{}`), 0o600); err != nil {
		t.Fatalf("write first file: %v", err)
	}
	if err := os.WriteFile(second, []byte(`{}`), 0o600); err != nil {
		t.Fatalf("write second file: %v", err)
	}

	got := commonPathPrefix([]string{first, second})
	want := filepath.Join(dir, "foo")
	if got != want {
		t.Fatalf("expected path-boundary-safe common prefix %q, got %q", want, got)
	}
}

func TestRunInteractiveAllModeSkipsScopeFilters(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)

	model.applyListSelection(string(runInteractiveModeAll))
	if model.currentStep() != runInteractiveStepReview {
		t.Fatalf("expected all mode to jump to review, got %v", model.currentStep())
	}
}

func TestRunInteractiveFileModeSkipsGroupAndBucket(t *testing.T) {
	steps := runInteractiveStepsForMode(runInteractiveModeFile)
	for _, step := range steps {
		if step == runInteractiveStepGroup || step == runInteractiveStepBucket {
			t.Fatalf("file mode should not include group or bucket steps: %v", steps)
		}
	}
}

func TestRunInteractiveBucketModeSkipsGroup(t *testing.T) {
	steps := runInteractiveStepsForMode(runInteractiveModeBucket)
	for _, step := range steps {
		if step == runInteractiveStepGroup {
			t.Fatalf("bucket mode should not include group step: %v", steps)
		}
	}
}

func TestRunInteractiveConfigureBucketTableAfterFileTableDoesNotPanic(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files:      []runsvc.SelectionFile{{Path: "/tmp/content/en/a.json"}},
			TaskIndex: []runsvc.SelectionTaskIndex{
				{Group: "default", Bucket: "ui", TargetLocale: "fr", SourcePath: "/tmp/content/en/a.json", TaskCount: 2},
			},
		},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)

	model.configureFileTable()
	model.configureBucketTable()
}

func TestRunInteractiveExperimentalItemsAreSeparate(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)

	items := model.optionItems()
	rendered := make([]string, 0, len(items))
	for _, item := range items {
		rendered = append(rendered, item.title)
	}
	output := strings.Join(rendered, "\n")
	if !strings.Contains(output, "Experimental flags") {
		t.Fatalf("expected general options to include experimental flags entry, got %s", output)
	}
	if strings.Contains(output, "Context memory:") {
		t.Fatalf("expected experimental flags to be separated from general options, got %s", output)
	}
	if !strings.Contains(output, "Back to review") {
		t.Fatalf("expected general options to include a review return action, got %s", output)
	}
}

func TestRunInteractiveReviewCanOpenOptionsOverride(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc"},
	)
	model.mode = runInteractiveModeAll
	model.steps = runInteractiveStepsForMode(model.mode)
	model.stepPos = 1
	model.refreshStep()

	nextModel, _ := model.updateReviewStep(tea.KeyPressMsg(tea.Key{Code: tea.KeyDown}))
	typed := nextModel.(runInteractiveModel)
	nextModel, _ = typed.updateReviewStep(tea.KeyPressMsg(tea.Key{Code: tea.KeyDown}))
	typed = nextModel.(runInteractiveModel)
	nextModel, _ = typed.updateReviewStep(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))
	typed = nextModel.(runInteractiveModel)
	if typed.currentStep() != runInteractiveStepOptions {
		t.Fatalf("expected options override from review, got %v", typed.currentStep())
	}
}

func TestRunInteractiveRightAdjustsWorkers(t *testing.T) {
	model := newRunInteractiveModel(
		runsvc.SelectionCatalog{ConfigPath: "/tmp/i18n.jsonc"},
		runOptions{configPath: "/tmp/i18n.jsonc", workers: 2},
	)
	step := runInteractiveStepOptions
	model.override = &step
	model.refreshStep()
	model.list.Select(3)

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyRight}))
	typed := nextModel.(runInteractiveModel)
	if typed.options.workers != 3 {
		t.Fatalf("expected workers to increase to 3, got %d", typed.options.workers)
	}
}
