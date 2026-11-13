package runsvc

import (
	"errors"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
)

func TestRollbackLockAfterFailedFlushClearsLaterUnwrittenTargets(t *testing.T) {
	first := "/tmp/a.json"
	later := "/tmp/b.json"
	written := "/tmp/0.json"
	firstID := taskIdentity(first, "ok")
	laterID := taskIdentity(later, "ok")
	writtenID := taskIdentity(written, "ok")
	lockState := &lockfile.File{
		RunCompleted: map[string]lockfile.RunCompletion{
			firstID:   {},
			laterID:   {},
			writtenID: {},
		},
		RunCheckpoint: map[string]lockfile.RunCheckpoint{
			firstID:   {},
			laterID:   {},
			writtenID: {},
		},
	}
	var saved lockfile.File
	svc := &Service{
		saveLock: func(_ string, f lockfile.File) error {
			saved = f
			return nil
		},
	}

	removed, err := svc.rollbackLockAfterFailedFlush("lock", lockState, []Task{
		{TargetPath: written, EntryKey: "ok"},
		{TargetPath: first, EntryKey: "ok"},
		{TargetPath: later, EntryKey: "ok"},
	}, &targetFlushError{
		TargetPath:       first,
		UnwrittenTargets: []string{first, later},
		Err:              errors.New("disk full"),
	})
	if err != nil {
		t.Fatalf("rollback lock after failed flush: %v", err)
	}
	if removed != 2 {
		t.Fatalf("removed = %d, want 2", removed)
	}
	if _, ok := saved.RunCompleted[writtenID]; !ok {
		t.Fatalf("expected already-written target lock entry to remain, got %+v", saved.RunCompleted)
	}
	if _, ok := saved.RunCompleted[firstID]; ok {
		t.Fatalf("expected failed target lock entry to be removed, got %+v", saved.RunCompleted)
	}
	if _, ok := saved.RunCompleted[laterID]; ok {
		t.Fatalf("expected later unwritten target lock entry to be removed, got %+v", saved.RunCompleted)
	}
}

func TestRollbackLockAfterFailedFlushKeepsPriorCompletedKeys(t *testing.T) {
	target := "/tmp/out.json"
	priorID := taskIdentity(target, "ok")
	thisRunID := taskIdentity(target, "retry")
	lockState := &lockfile.File{
		RunCompleted: map[string]lockfile.RunCompletion{
			priorID:   {},
			thisRunID: {},
		},
		RunCheckpoint: map[string]lockfile.RunCheckpoint{
			thisRunID: {},
		},
	}
	var saved lockfile.File
	svc := &Service{
		saveLock: func(_ string, f lockfile.File) error {
			saved = f
			return nil
		},
	}

	removed, err := svc.rollbackLockAfterFailedFlush("lock", lockState, []Task{
		{TargetPath: target, EntryKey: "retry"},
	}, &targetFlushError{
		TargetPath:       target,
		UnwrittenTargets: []string{target},
		Err:              errors.New("disk full"),
	})
	if err != nil {
		t.Fatalf("rollback lock after failed flush: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed = %d, want 1", removed)
	}
	if _, ok := saved.RunCompleted[priorID]; !ok {
		t.Fatalf("expected prior completed key to remain, got %+v", saved.RunCompleted)
	}
	if _, ok := saved.RunCompleted[thisRunID]; ok {
		t.Fatalf("expected this-run lock entry to be removed, got %+v", saved.RunCompleted)
	}
}
