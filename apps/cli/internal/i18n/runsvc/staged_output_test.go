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

func TestSnapshotAndDeleteStagedOutputsForPath(t *testing.T) {
	staged := map[string]stagedOutput{
		"locales/fr.json":                         {targetLocale: "fr"},
		"locales/fr.json.bak":                     {targetLocale: "fr"},
		stagedOutputKey("sheets/all.csv", "fr"):   {},
		stagedOutputKey("sheets/all.csv", "de"):   {},
		stagedOutputKey("sheets/other.csv", "fr"): {},
	}

	plain := snapshotStagedOutputsForPath(staged, "locales/fr.json")
	if len(plain) != 1 || plain[0].targetLocale != "fr" {
		t.Fatalf("unexpected plain snapshot: %+v", plain)
	}
	shared := snapshotStagedOutputsForPath(staged, "sheets/all.csv")
	if len(shared) != 2 || shared[0].targetLocale != "de" || shared[1].targetLocale != "fr" {
		t.Fatalf("unexpected shared snapshot: %+v", shared)
	}

	deleteStagedOutputsForPath(staged, "locales/fr.json")
	deleteStagedOutputsForPath(staged, "sheets/all.csv")
	if len(staged) != 2 {
		t.Fatalf("expected only unrelated outputs to remain, got %v", staged)
	}
	if _, ok := staged["locales/fr.json.bak"]; !ok {
		t.Fatal("expected sibling path to survive")
	}
	if _, ok := staged[stagedOutputKey("sheets/other.csv", "fr")]; !ok {
		t.Fatal("expected other workbook to survive")
	}
}

func TestStagedOutputHelpersEdgeCases(t *testing.T) {
	t.Run("shared path with bare and locale keys", func(t *testing.T) {
		staged := map[string]stagedOutput{
			"sheets/all.xlsx":                        {targetLocale: "en-GB"},
			stagedOutputKey("sheets/all.xlsx", "fr"): {},
		}
		outputs := snapshotStagedOutputsForPath(staged, "sheets/all.xlsx")
		if len(outputs) != 2 || outputs[0].targetLocale != "en-GB" || outputs[1].targetLocale != "fr" {
			t.Fatalf("unexpected outputs: %+v", outputs)
		}
		deleteStagedOutputsForPath(staged, "sheets/all.xlsx")
		if len(staged) != 0 {
			t.Fatalf("expected all workbook outputs removed, got %v", staged)
		}
	})
	t.Run("blank locale keeps the bare key", func(t *testing.T) {
		if got := stagedOutputKey("sheets/all.csv", "  "); got != "sheets/all.csv" {
			t.Fatalf("expected bare key, got %q", got)
		}
	})
	t.Run("extension match ignores case", func(t *testing.T) {
		staged := map[string]stagedOutput{stagedOutputKey("Sheets/All.TSV", "fr"): {}}
		if got := snapshotStagedOutputsForPath(staged, "Sheets/All.TSV"); len(got) != 1 || got[0].targetLocale != "fr" {
			t.Fatalf("expected locale key for upper-case extension, got %+v", got)
		}
	})
	t.Run("missing path", func(t *testing.T) {
		staged := map[string]stagedOutput{"a.json": {}}
		if got := snapshotStagedOutputsForPath(staged, "b.json"); len(got) != 0 {
			t.Fatalf("expected nothing, got %+v", got)
		}
		deleteStagedOutputsForPath(staged, "b.json")
		if len(staged) != 1 {
			t.Fatalf("expected unrelated entry kept, got %v", staged)
		}
	})
}
