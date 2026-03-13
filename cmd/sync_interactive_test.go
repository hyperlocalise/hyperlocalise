package cmd

import (
	"bytes"
	"testing"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/runsvc"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/syncsvc"
)

func TestSyncInteractiveToggleAllFilesSelectsEveryFile(t *testing.T) {
	model := newSyncInteractiveModel(
		"pull",
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files: []runsvc.SelectionFile{
				{Path: "/tmp/content/en/a.json"},
				{Path: "/tmp/content/en/b.json"},
			},
		},
		syncCommonOptions{configPath: "/tmp/i18n.jsonc"},
		syncInteractiveExtra{},
	)
	model.step = syncInteractiveStepFile
	model.selectedFiles = map[string]struct{}{}
	model.refresh()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Text: "a"}))
	typed := nextModel.(syncInteractiveModel)
	if len(typed.selectedFiles) != 2 {
		t.Fatalf("expected all files selected, got %#v", typed.selectedFiles)
	}
}

func TestSyncInteractiveToggleAllFilesClearsEveryFile(t *testing.T) {
	model := newSyncInteractiveModel(
		"push",
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			Files: []runsvc.SelectionFile{
				{Path: "/tmp/content/en/a.json"},
				{Path: "/tmp/content/en/b.json"},
			},
		},
		syncCommonOptions{configPath: "/tmp/i18n.jsonc"},
		syncInteractiveExtra{},
	)
	model.step = syncInteractiveStepFile
	model.selectedFiles = map[string]struct{}{
		"/tmp/content/en/a.json": {},
		"/tmp/content/en/b.json": {},
	}
	model.refresh()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Text: "a"}))
	typed := nextModel.(syncInteractiveModel)
	if len(typed.selectedFiles) != 0 {
		t.Fatalf("expected all files cleared, got %#v", typed.selectedFiles)
	}
}

func TestSyncInteractivePushDefaultsExcludeSourceLocale(t *testing.T) {
	model := newSyncInteractiveModel(
		"push",
		runsvc.SelectionCatalog{
			ConfigPath:   "/tmp/i18n.jsonc",
			SourceLocale: "en",
			TargetLocales: []runsvc.SelectionTargetLocale{
				{Locale: "fr"},
			},
		},
		syncCommonOptions{configPath: "/tmp/i18n.jsonc"},
		syncInteractiveExtra{},
	)

	locales := model.catalogLocales()
	if len(locales) != 2 || locales[0] != "en" || locales[1] != "fr" {
		t.Fatalf("expected source locale listed in push selector, got %#v", locales)
	}
	if _, ok := model.selectedLocales["en"]; ok {
		t.Fatalf("did not expect source locale selected by default for push, got %#v", model.selectedLocales)
	}
	if _, ok := model.selectedLocales["fr"]; !ok {
		t.Fatalf("expected target locale selected by default for push, got %#v", model.selectedLocales)
	}
}

func TestSyncInteractivePushSourceLocaleCanBeToggled(t *testing.T) {
	model := newSyncInteractiveModel(
		"push",
		runsvc.SelectionCatalog{
			ConfigPath:   "/tmp/i18n.jsonc",
			SourceLocale: "en",
			TargetLocales: []runsvc.SelectionTargetLocale{
				{Locale: "fr"},
			},
		},
		syncCommonOptions{configPath: "/tmp/i18n.jsonc"},
		syncInteractiveExtra{},
	)
	model.step = syncInteractiveStepLocale
	model.refresh()

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeySpace, Text: " "}))
	typed := nextModel.(syncInteractiveModel)
	if _, ok := typed.selectedLocales["en"]; !ok {
		t.Fatalf("expected source locale to be selectable, got %#v", typed.selectedLocales)
	}

	nextModel, _ = typed.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeySpace, Text: " "}))
	typed = nextModel.(syncInteractiveModel)
	if _, ok := typed.selectedLocales["en"]; ok {
		t.Fatalf("expected source locale to be deselectable, got %#v", typed.selectedLocales)
	}
}

func TestSyncInteractiveBackClearsListFilterBeforeLeavingStep(t *testing.T) {
	model := newSyncInteractiveModel(
		"pull",
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			TargetLocales: []runsvc.SelectionTargetLocale{
				{Locale: "fr"},
			},
		},
		syncCommonOptions{configPath: "/tmp/i18n.jsonc"},
		syncInteractiveExtra{},
	)
	model.step = syncInteractiveStepOptions
	model.refresh()
	model.list.SetFilterText("dry")
	model.list.SetFilterState(list.Filtering)

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape }))
	typed := nextModel.(syncInteractiveModel)
	if typed.step != syncInteractiveStepOptions {
		t.Fatalf("expected to stay on options step, got %v", typed.step)
	}
	if typed.list.SettingFilter() || typed.list.IsFiltered() {
		t.Fatalf("expected filter to be cleared")
	}
}

func TestSyncInteractiveQuitDoesNotExitWhileTypingListFilter(t *testing.T) {
	model := newSyncInteractiveModel(
		"pull",
		runsvc.SelectionCatalog{
			ConfigPath: "/tmp/i18n.jsonc",
			TargetLocales: []runsvc.SelectionTargetLocale{
				{Locale: "fr"},
			},
		},
		syncCommonOptions{configPath: "/tmp/i18n.jsonc"},
		syncInteractiveExtra{},
	)
	model.step = syncInteractiveStepOptions
	model.refresh()
	model.list.SetFilterState(list.Filtering)

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Text: "q"}))
	typed := nextModel.(syncInteractiveModel)
	if typed.done {
		t.Fatalf("expected filter input to consume q instead of quitting")
	}
	if got := typed.list.FilterInput.Value(); got != "q" {
		t.Fatalf("expected q to be added to filter input, got %q", got)
	}
}

func TestFinalizeSyncInteractiveResultWritesStructuredReport(t *testing.T) {
	model := syncInteractiveModel{
		options: syncCommonOptions{output: "json"},
		report:  &syncsvc.Report{Action: "push"},
	}

	var out bytes.Buffer
	result, err := finalizeSyncInteractiveResult(model, &out)
	if err != nil {
		t.Fatalf("finalizeSyncInteractiveResult() error = %v", err)
	}
	if result.execute {
		t.Fatalf("expected interactive result to avoid re-execution")
	}
	if got := out.String(); got == "" || !bytes.Contains([]byte(got), []byte(`"action": "push"`)) {
		t.Fatalf("expected JSON report output, got %q", got)
	}
}
