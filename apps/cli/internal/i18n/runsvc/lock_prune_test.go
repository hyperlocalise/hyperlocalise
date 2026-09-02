package runsvc

import (
	"path/filepath"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
)

func TestPruneLockEntriesRemovesStaleKeysForInScopeTargets(t *testing.T) {
	targetPath := "/tmp/out.json"
	keep := map[string]map[string]struct{}{
		targetPath: {
			"hello": {},
		},
	}
	state := &lockfile.File{
		RunCompleted: map[string]lockfile.RunCompletion{
			taskIdentity(targetPath, "hello"):      {SourceHash: "a"},
			taskIdentity(targetPath, "legacy"):     {SourceHash: "b"},
			taskIdentity(targetPath, "nested.old"): {SourceHash: "c"},
			taskIdentity("/other.json", "bye"):     {SourceHash: "d"},
		},
		RunCheckpoint: map[string]lockfile.RunCheckpoint{
			taskIdentity(targetPath, "legacy"): {TargetPath: targetPath, EntryKey: "legacy"},
		},
	}

	removed := pruneLockEntries(state, keep)
	if removed != 3 {
		t.Fatalf("removed = %d, want 3", removed)
	}
	if _, ok := state.RunCompleted[taskIdentity(targetPath, "hello")]; !ok {
		t.Fatalf("expected hello completion to remain")
	}
	if _, ok := state.RunCompleted[taskIdentity(targetPath, "legacy")]; ok {
		t.Fatalf("expected legacy completion to be pruned")
	}
	if _, ok := state.RunCompleted[taskIdentity("/other.json", "bye")]; !ok {
		t.Fatalf("expected out-of-scope completion to remain")
	}
	if len(state.RunCheckpoint) != 0 {
		t.Fatalf("expected stale checkpoint to be pruned, got %+v", state.RunCheckpoint)
	}
}

func TestShouldPruneLock(t *testing.T) {
	if !shouldPruneLock(Input{}) {
		t.Fatal("expected unscoped full run to prune lock")
	}
	if !shouldPruneLock(Input{Prune: true, Bucket: "docs"}) {
		t.Fatal("expected scoped prune run to prune lock")
	}
	if shouldPruneLock(Input{Bucket: "docs"}) {
		t.Fatal("expected scoped run without prune to skip lock pruning")
	}
}

func TestRollbackLockForTargetUsesPreferredIdentity(t *testing.T) {
	projectDir := t.TempDir()
	targetAbs := filepath.Join(projectDir, "dist", "fr", "strings.json")
	task := Task{TargetPath: targetAbs, EntryKey: "hello"}

	state, err := newExecutorState([]Task{task}, projectDir, nil, nil, contextMemoryPlan{}, false)
	if err != nil {
		t.Fatalf("newExecutorState: %v", err)
	}

	identity := preferredTaskIdentity(projectDir, targetAbs, "hello")
	lockState := &lockfile.File{
		RunCompleted: map[string]lockfile.RunCompletion{
			identity: {SourceHash: "abc"},
		},
	}

	removed, changed := (&Service{}).rollbackLockForTarget(lockState, targetAbs, map[string]struct{}{}, state)
	if !changed || removed != 1 {
		t.Fatalf("rollbackLockForTarget() = (%d, %v), want (1, true)", removed, changed)
	}
	if _, ok := lockState.RunCompleted[identity]; ok {
		t.Fatalf("expected completion %q to be rolled back", identity)
	}
}

func TestBuildPlannedLockKeySetUsesRelativeTargetPath(t *testing.T) {
	projectDir := t.TempDir()
	targetAbs := filepath.Join(projectDir, "dist", "fr", "strings.json")
	keep := buildPlannedLockKeySet([]Task{{TargetPath: targetAbs, EntryKey: "hello"}}, projectDir)
	if _, ok := keep["dist/fr/strings.json"]; !ok {
		t.Fatalf("expected relative target path key, got %+v", keep)
	}
	if _, ok := keep[targetAbs]; ok {
		t.Fatalf("did not expect absolute target path key, got %+v", keep)
	}
}
