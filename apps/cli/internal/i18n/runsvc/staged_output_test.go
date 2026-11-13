package runsvc

import (
	"strings"
	"testing"
)

func TestNewExecutorStateAllowsSharedWorkbookLocales(t *testing.T) {
	t.Parallel()
	path := "copy/strings.xlsx"
	tasks := []Task{
		{TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "fr", EntryKey: "greeting"},
		{TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "es-419", EntryKey: "greeting"},
	}
	state, err := newExecutorState(tasks, "", nil, nil, contextMemoryPlan{}, false)
	if err != nil {
		t.Fatalf("newExecutorState: %v", err)
	}
	if state.pendingByTarget[path] != 2 {
		t.Fatalf("pendingByTarget[%q]=%d, want 2", path, state.pendingByTarget[path])
	}
	if state.localeByTarget[stagedOutputKey(path, "fr")] != "fr" {
		t.Fatalf("missing french locale key")
	}
	if state.localeByTarget[stagedOutputKey(path, "es-419")] != "es-419" {
		t.Fatalf("missing es-419 locale key")
	}
}

func TestNewExecutorStateRejectsConflictingJSONLocales(t *testing.T) {
	t.Parallel()
	path := "locales/messages.json"
	_, err := newExecutorState([]Task{
		{TargetPath: path, SourcePath: "locales/en.json", SourceLocale: "en", TargetLocale: "fr", EntryKey: "a"},
		{TargetPath: path, SourcePath: "locales/en.json", SourceLocale: "en", TargetLocale: "es-419", EntryKey: "a"},
	}, "", nil, nil, contextMemoryPlan{}, false)
	if err == nil || !strings.Contains(err.Error(), "conflicting target locales") {
		t.Fatalf("newExecutorState error = %v, want conflicting target locales", err)
	}
}

func TestStageTaskOutputSeparatesSharedWorkbookLocales(t *testing.T) {
	t.Parallel()
	path := "copy/strings.xlsx"
	staged := map[string]stagedOutput{}
	french := Task{TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "fr", EntryKey: "greeting"}
	spanish := Task{TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "es-419", EntryKey: "greeting"}
	if err := stageTaskOutput(staged, french, "Bonjour", nil); err != nil {
		t.Fatalf("stage french: %v", err)
	}
	if err := stageTaskOutput(staged, spanish, "Hola", nil); err != nil {
		t.Fatalf("stage spanish: %v", err)
	}
	if got := staged[stagedOutputKey(path, "fr")].entries["greeting"]; got != "Bonjour" {
		t.Fatalf("french greeting = %q, want Bonjour", got)
	}
	if got := staged[stagedOutputKey(path, "es-419")].entries["greeting"]; got != "Hola" {
		t.Fatalf("spanish greeting = %q, want Hola", got)
	}
}

func TestBuildPlannedTargetMetadataAllowsSharedWorkbookLocales(t *testing.T) {
	t.Parallel()
	path := "copy/strings.xlsx"
	_, err := buildPlannedTargetMetadata([]Task{
		{TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "fr", EntryKey: "greeting"},
		{TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "es-419", EntryKey: "greeting"},
	})
	if err != nil {
		t.Fatalf("buildPlannedTargetMetadata: %v", err)
	}
}

func TestTaskLockIdentitySeparatesSharedWorkbookLocales(t *testing.T) {
	t.Parallel()
	path := "copy/strings.xlsx"
	french := taskLockIdentity("", path, "fr", "greeting")
	spanish := taskLockIdentity("", path, "es-419", "greeting")
	if french == spanish {
		t.Fatalf("expected distinct lock identities, got %q", french)
	}
	if !strings.HasSuffix(french, "::fr") || !strings.HasSuffix(spanish, "::es-419") {
		t.Fatalf("identities = %q, %q", french, spanish)
	}
	jsonID := taskLockIdentity("", "locales/fr.json", "fr", "greeting")
	if jsonID != taskIdentity("locales/fr.json", "greeting") {
		t.Fatalf("json lock identity = %q, want path::key", jsonID)
	}
}
