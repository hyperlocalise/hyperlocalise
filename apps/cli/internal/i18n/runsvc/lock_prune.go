package runsvc

import (
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
)

func buildPlannedLockKeySet(planned []Task) map[string]map[string]struct{} {
	keep := map[string]map[string]struct{}{}
	for _, task := range planned {
		bucket := keep[task.TargetPath]
		if bucket == nil {
			bucket = map[string]struct{}{}
			keep[task.TargetPath] = bucket
		}
		bucket[task.EntryKey] = struct{}{}
	}
	return keep
}

func isUnscopedRun(in Input) bool {
	return strings.TrimSpace(in.Bucket) == "" &&
		strings.TrimSpace(in.Group) == "" &&
		len(in.TargetLocales) == 0 &&
		len(in.SourcePaths) == 0 &&
		len(in.FixTargets) == 0 &&
		len(in.FixMarkdownScopes) == 0
}

func shouldPruneLock(in Input) bool {
	return in.Prune || isUnscopedRun(in)
}

func pruneLockEntries(state *lockfile.File, keep map[string]map[string]struct{}) int {
	if state == nil || len(keep) == 0 {
		return 0
	}

	removed := 0
	for id := range state.RunCompleted {
		targetPath, entryKey, ok := strings.Cut(id, "::")
		if !ok {
			continue
		}
		keys, inScope := keep[targetPath]
		if !inScope {
			continue
		}
		if _, ok := keys[entryKey]; ok {
			continue
		}
		delete(state.RunCompleted, id)
		removed++
	}

	for id, checkpoint := range state.RunCheckpoint {
		targetPath, entryKey, ok := strings.Cut(id, "::")
		if !ok {
			targetPath = checkpoint.TargetPath
			entryKey = checkpoint.EntryKey
		}
		keys, inScope := keep[targetPath]
		if !inScope {
			continue
		}
		if _, ok := keys[entryKey]; ok {
			continue
		}
		delete(state.RunCheckpoint, id)
		removed++
	}
	return removed
}

func (s *Service) reconcileLockEntries(in Input, planned []Task, state *lockfile.File) int {
	if !shouldPruneLock(in) {
		return 0
	}
	return pruneLockEntries(state, buildPlannedLockKeySet(planned))
}
