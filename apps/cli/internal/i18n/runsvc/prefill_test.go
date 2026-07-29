package runsvc

import (
	"strings"
	"testing"
)

func TestApplyPrefilledEntriesFlatRequiresTargetPath(t *testing.T) {
	t.Parallel()
	tasks := []Task{{TargetPath: "out-fr.json", TargetLocale: "fr", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"}}
	_, _, _, err := applyPrefilledEntries(tasks, map[string]stagedOutput{}, map[string]string{"hello": "bonjour"}, nil, "")
	if err == nil || !strings.Contains(err.Error(), "prefilled-target-path is required") {
		t.Fatalf("expected flat target path error, got %v", err)
	}
}

func TestApplyPrefilledEntriesLocaleKeyedRejectsTargetPath(t *testing.T) {
	t.Parallel()
	tasks := []Task{{TargetPath: "out-fr.json", TargetLocale: "fr", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"}}
	_, _, _, err := applyPrefilledEntries(tasks, map[string]stagedOutput{}, nil, map[string]map[string]string{
		"fr": {"hello": "bonjour"},
	}, "out-fr.json")
	if err == nil || !strings.Contains(err.Error(), "must not be set") {
		t.Fatalf("expected locale-keyed target path error, got %v", err)
	}
}

func TestApplyPrefilledEntriesLocaleKeyedAcrossLocales(t *testing.T) {
	t.Parallel()
	tasks := []Task{
		{TargetPath: "out-fr.json", TargetLocale: "fr", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"},
		{TargetPath: "out-fr.json", TargetLocale: "fr", EntryKey: "bye", SourcePath: "in.json", SourceLocale: "en"},
		{TargetPath: "out-de.json", TargetLocale: "de", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"},
		{TargetPath: "out-de.json", TargetLocale: "de", EntryKey: "bye", SourcePath: "in.json", SourceLocale: "en"},
	}
	staged := map[string]stagedOutput{}
	filtered, reused, warnings, err := applyPrefilledEntries(tasks, staged, nil, map[string]map[string]string{
		"fr": {"hello": "bonjour"},
		"de": {"hello": "hallo", "bye": "tschüss"},
		"es": {"hello": "hola"},
	}, "")
	if err != nil {
		t.Fatalf("applyPrefilledEntries: %v", err)
	}
	if reused != 3 {
		t.Fatalf("expected 3 reused entries, got %d", reused)
	}
	if len(filtered) != 1 || filtered[0].EntryKey != "bye" || filtered[0].TargetLocale != "fr" {
		t.Fatalf("expected only fr/bye remaining, got %+v", filtered)
	}
	fr := staged["out-fr.json"]
	if fr.entries["hello"] != "bonjour" {
		t.Fatalf("expected fr hello staged, got %+v", fr.entries)
	}
	de := staged["out-de.json"]
	if de.entries["hello"] != "hallo" || de.entries["bye"] != "tschüss" {
		t.Fatalf("expected de entries staged, got %+v", de.entries)
	}
	joined := strings.Join(warnings, "\n")
	if !strings.Contains(joined, "prefilled_entries_unknown_locale locale=es") {
		t.Fatalf("expected unknown locale warning, got %v", warnings)
	}
	if !strings.Contains(joined, "prefilled_entries_reused_by_locale count=3") {
		t.Fatalf("expected reuse warning, got %v", warnings)
	}
}

func TestApplyPrefilledEntriesLocaleKeyedErrorsWhenNoLocalesMatch(t *testing.T) {
	t.Parallel()
	tasks := []Task{{TargetPath: "out-fr.json", TargetLocale: "fr", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"}}
	_, _, warnings, err := applyPrefilledEntries(tasks, map[string]stagedOutput{}, nil, map[string]map[string]string{
		"es": {"hello": "hola"},
	}, "")
	if err == nil || !strings.Contains(err.Error(), "matched no planned locales") {
		t.Fatalf("expected no-match error, got %v", err)
	}
	if len(warnings) == 0 || !strings.Contains(warnings[0], "unknown_locale") {
		t.Fatalf("expected unknown locale warning, got %v", warnings)
	}
}

func TestApplyPrefilledEntriesFlatStillWorks(t *testing.T) {
	t.Parallel()
	tasks := []Task{
		{TargetPath: "out-fr.json", TargetLocale: "fr", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"},
		{TargetPath: "out-de.json", TargetLocale: "de", EntryKey: "hello", SourcePath: "in.json", SourceLocale: "en"},
	}
	staged := map[string]stagedOutput{}
	filtered, reused, warnings, err := applyPrefilledEntries(tasks, staged, map[string]string{"hello": "bonjour"}, nil, "out-fr.json")
	if err != nil {
		t.Fatalf("applyPrefilledEntries: %v", err)
	}
	if reused != 1 || len(filtered) != 1 || filtered[0].TargetLocale != "de" {
		t.Fatalf("unexpected flat result reused=%d filtered=%+v", reused, filtered)
	}
	if !strings.Contains(strings.Join(warnings, "\n"), "prefilled_entries_reused target=out-fr.json count=1") {
		t.Fatalf("expected flat reuse warning, got %v", warnings)
	}
}
