package memoryinterchange

import (
	"fmt"
	"math/rand/v2"
	"reflect"
	"strings"
	"testing"
)

// referencePlanImportActions is the original PlanImportActions, which released
// source keys by scanning every owner. It is kept as an oracle for the indexed
// implementation; its output must not change.
func referencePlanImportActions(
	candidates []Candidate,
	existingByExternalKey map[string]ExistingEntry,
	existingBySourceKey map[string]ExistingEntry,
) []PlannedImport {
	planned := make([]PlannedImport, 0, len(candidates))
	reservedExternal := make(map[string]struct{}, len(existingByExternalKey))
	for key := range existingByExternalKey {
		reservedExternal[key] = struct{}{}
	}
	sourceKeyOwners := make(map[string]string, len(existingBySourceKey))
	for key, entry := range existingBySourceKey {
		if entry.ID != "" {
			sourceKeyOwners[key] = entry.ID
		}
	}
	takenByOther := func(key, exceptEntryID string) bool {
		owner, ok := sourceKeyOwners[key]
		if !ok {
			return false
		}
		return exceptEntryID == "" || owner != exceptEntryID
	}
	release := func(entryID string) {
		for key, owner := range sourceKeyOwners {
			if owner == entryID {
				delete(sourceKeyOwners, key)
			}
		}
	}

	for _, candidate := range candidates {
		nextSourceKey := SourceLookupKey(candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText)
		if candidate.ExternalKey != nil && *candidate.ExternalKey != "" && hasKey(reservedExternal, *candidate.ExternalKey) {
			existing := existingByExternalKey[*candidate.ExternalKey]
			if existing.ID == "" {
				planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionSkip})
				continue
			}
			if takenByOther(nextSourceKey, existing.ID) {
				planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionSkip})
				continue
			}
			release(existing.ID)
			planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionUpdate, ExistingID: existing.ID})
			sourceKeyOwners[nextSourceKey] = existing.ID
			continue
		}
		if takenByOther(nextSourceKey, "") {
			existing := existingBySourceKey[nextSourceKey]
			ownerID := sourceKeyOwners[nextSourceKey]
			if candidate.ExternalKey != nil && *candidate.ExternalKey != "" && ownerID != "" && existing.ID != "" && existing.ID == ownerID && (existing.ExternalKey == nil || strings.TrimSpace(*existing.ExternalKey) == "") {
				planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionUpdate, ExistingID: existing.ID})
				reservedExternal[*candidate.ExternalKey] = struct{}{}
				continue
			}
			planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionSkip})
			continue
		}
		sourceKeyOwners[nextSourceKey] = ""
		if candidate.ExternalKey != nil && *candidate.ExternalKey != "" {
			reservedExternal[*candidate.ExternalKey] = struct{}{}
		}
		action := ImportActionCreate
		if candidate.IsVariant {
			action = ImportActionVariant
		}
		planned = append(planned, PlannedImport{Candidate: candidate, Action: action})
	}
	return planned
}

// TestPlanImportActionsMatchesReference draws small pools of source texts,
// external keys, and entry IDs so that collisions, repeated updates to the same
// entry, and entries owning several source keys all happen often.
func TestPlanImportActionsMatchesReference(t *testing.T) {
	t.Parallel()
	for seed := uint64(0); seed < 2000; seed++ {
		rng := rand.New(rand.NewPCG(seed, seed*7919+1))
		candidates, byExternal, bySource := randomImportScenario(rng)
		want := referencePlanImportActions(candidates, byExternal, bySource)
		got := PlanImportActions(candidates, byExternal, bySource)
		if !reflect.DeepEqual(got, want) {
			for i := range want {
				if i >= len(got) || !reflect.DeepEqual(got[i], want[i]) {
					t.Fatalf("seed %d: candidate %d planned %+v, reference %+v", seed, i, safeIndex(got, i), want[i])
				}
			}
			t.Fatalf("seed %d: got %d plans, reference %d", seed, len(got), len(want))
		}
	}
}

// An entry that owns several source keys (allowed by existingBySourceKey) and
// is updated twice must release all of them each time.
func TestPlanImportActionsReleasesEveryKeyOfUpdatedEntry(t *testing.T) {
	t.Parallel()
	key := "tmx:1:fr"
	entry := ExistingEntry{ID: "e1", ExternalKey: &key}
	byExternal := map[string]ExistingEntry{key: entry}
	bySource := map[string]ExistingEntry{
		SourceLookupKey("en", "fr", "old one"): entry,
		SourceLookupKey("en", "fr", "old two"): entry,
	}
	candidates := []Candidate{
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "new", TargetText: "neuf", ExternalKey: &key},
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "newer", TargetText: "plus neuf", ExternalKey: &key},
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "old one", TargetText: "ancien"},
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "new", TargetText: "neuf encore"},
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "newer", TargetText: "doublon"},
	}
	got := PlanImportActions(candidates, byExternal, bySource)
	wantActions := []ImportAction{ImportActionUpdate, ImportActionUpdate, ImportActionCreate, ImportActionCreate, ImportActionSkip}
	for i, want := range wantActions {
		if got[i].Action != want {
			t.Fatalf("candidate %d action = %q, want %q (plan %+v)", i, got[i].Action, want, got)
		}
	}
	if !reflect.DeepEqual(got, referencePlanImportActions(candidates, byExternal, bySource)) {
		t.Fatal("plan differs from reference")
	}
}

func randomImportScenario(rng *rand.Rand) ([]Candidate, map[string]ExistingEntry, map[string]ExistingEntry) {
	texts := []string{"Save", "save ", "Open", "Close", "Delete", "Ｓave", "Cancel"}
	locales := []string{"fr", "de"}
	externalKeys := []string{"", "k1", "k2", "k3", "k4"}
	entryIDs := []string{"", "e1", "e2", "e3"}
	ptr := func(s string) *string {
		if s == "" && rng.IntN(2) == 0 {
			return nil
		}
		return &s
	}

	byExternal := map[string]ExistingEntry{}
	bySource := map[string]ExistingEntry{}
	for i := rng.IntN(5); i > 0; i-- {
		key := externalKeys[1+rng.IntN(len(externalKeys)-1)]
		byExternal[key] = ExistingEntry{ID: entryIDs[rng.IntN(len(entryIDs))], ExternalKey: ptr(key)}
	}
	for i := rng.IntN(6); i > 0; i-- {
		sourceKey := SourceLookupKey("en", locales[rng.IntN(len(locales))], texts[rng.IntN(len(texts))])
		bySource[sourceKey] = ExistingEntry{ID: entryIDs[rng.IntN(len(entryIDs))], ExternalKey: ptr(externalKeys[rng.IntN(len(externalKeys))])}
	}

	candidates := make([]Candidate, 0, 12)
	for i := rng.IntN(12); i > 0; i-- {
		candidates = append(candidates, Candidate{
			SourceLocale: "en",
			TargetLocale: locales[rng.IntN(len(locales))],
			SourceText:   texts[rng.IntN(len(texts))],
			TargetText:   fmt.Sprintf("t%d", i),
			ExternalKey:  ptr(externalKeys[rng.IntN(len(externalKeys))]),
			IsVariant:    rng.IntN(4) == 0,
			UnitIndex:    i,
		})
	}
	return candidates, byExternal, bySource
}

func safeIndex(plans []PlannedImport, i int) any {
	if i < len(plans) {
		return plans[i]
	}
	return "<missing>"
}
