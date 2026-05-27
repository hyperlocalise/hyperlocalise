package runsvc

import (
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
