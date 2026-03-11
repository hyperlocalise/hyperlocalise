package cmd

import (
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/runsvc"
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

func TestSyncInteractivePushLocalesAlwaysSelectSource(t *testing.T) {
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
	if _, ok := model.selectedLocales["en"]; !ok {
		t.Fatalf("expected source locale selected by default for push, got %#v", model.selectedLocales)
	}
	if _, ok := model.selectedLocales["fr"]; !ok {
		t.Fatalf("expected target locale selected by default for push, got %#v", model.selectedLocales)
	}
}

func TestSyncInteractivePushSourceLocaleCannotBeDeselected(t *testing.T) {
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

	nextModel, _ := model.Update(tea.KeyPressMsg(tea.Key{Text: " "}))
	typed := nextModel.(syncInteractiveModel)
	if _, ok := typed.selectedLocales["en"]; !ok {
		t.Fatalf("expected source locale to remain selected, got %#v", typed.selectedLocales)
	}
}
