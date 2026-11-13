package memoryinterchange

import "strings"

// ExistingEntry is a minimal row snapshot used when planning import actions.
type ExistingEntry struct {
	ID          string
	ExternalKey *string
}

type ImportAction string

const (
	ImportActionCreate  ImportAction = "create"
	ImportActionUpdate  ImportAction = "update"
	ImportActionVariant ImportAction = "variant"
	ImportActionSkip    ImportAction = "skip"
)

type PlannedImport struct {
	Candidate  Candidate
	Action     ImportAction
	ExistingID string
}

// SourceLookupKey matches the web importer's sourceKey() tuple.
func SourceLookupKey(sourceLocale, targetLocale, sourceText string) string {
	return sourceLocale + "\x00" + targetLocale + "\x00" + NormalizeSourceText(sourceText)
}

// PlanImportActions mirrors planImportActions from the removed inline importer.
func PlanImportActions(
	candidates []Candidate,
	existingByExternalKey map[string]ExistingEntry,
	existingBySourceKey map[string]ExistingEntry,
) []PlannedImport {
	planned := make([]PlannedImport, 0, len(candidates))
	reservedExternal := make(map[string]struct{}, len(existingByExternalKey))
	for key := range existingByExternalKey {
		reservedExternal[key] = struct{}{}
	}
	owners := newSourceKeyOwners(len(existingBySourceKey))
	for key, entry := range existingBySourceKey {
		if entry.ID != "" {
			owners.assign(key, entry.ID)
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
			if owners.takenByOther(nextSourceKey, existing.ID) {
				planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionSkip})
				continue
			}
			owners.release(existing.ID)
			planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionUpdate, ExistingID: existing.ID})
			owners.assign(nextSourceKey, existing.ID)
			continue
		}
		if owners.takenByOther(nextSourceKey, "") {
			existing := existingBySourceKey[nextSourceKey]
			ownerID := owners.byKey[nextSourceKey]
			if candidate.ExternalKey != nil && *candidate.ExternalKey != "" && ownerID != "" && existing.ID != "" && existing.ID == ownerID && (existing.ExternalKey == nil || strings.TrimSpace(*existing.ExternalKey) == "") {
				planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionUpdate, ExistingID: existing.ID})
				reservedExternal[*candidate.ExternalKey] = struct{}{}
				continue
			}
			planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionSkip})
			continue
		}
		owners.assign(nextSourceKey, "")
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

func hasKey(set map[string]struct{}, key string) bool {
	_, ok := set[key]
	return ok
}

// sourceKeyOwners tracks which existing entry owns each source key. A key owned
// by "" was claimed by a row created earlier in the same import.
//
// keysByEntry indexes the keys each entry was assigned so that release does not
// scan every key: an import updating n entries by external key would otherwise
// cost O(n * keys). A key only changes owner after release has cleared it, so
// the index never lists a key another entry owns; release still checks
// ownership before deleting so a future caller cannot free someone else's key.
type sourceKeyOwners struct {
	byKey       map[string]string
	keysByEntry map[string][]string
}

func newSourceKeyOwners(capacity int) *sourceKeyOwners {
	return &sourceKeyOwners{
		byKey:       make(map[string]string, capacity),
		keysByEntry: make(map[string][]string, capacity),
	}
}

func (o *sourceKeyOwners) assign(key, entryID string) {
	o.byKey[key] = entryID
	if entryID != "" {
		o.keysByEntry[entryID] = append(o.keysByEntry[entryID], key)
	}
}

func (o *sourceKeyOwners) takenByOther(key, exceptEntryID string) bool {
	owner, ok := o.byKey[key]
	if !ok {
		return false
	}
	if exceptEntryID != "" && owner == exceptEntryID {
		return false
	}
	return true
}

// release frees every source key entryID owns.
func (o *sourceKeyOwners) release(entryID string) {
	for _, key := range o.keysByEntry[entryID] {
		if o.byKey[key] == entryID {
			delete(o.byKey, key)
		}
	}
	delete(o.keysByEntry, entryID)
}

// CountPlannedImportActions returns report counters for a dry-run plan.
func CountPlannedImportActions(planned []PlannedImport) (created, updated, variantCreated, skipped int) {
	for _, item := range planned {
		switch item.Action {
		case ImportActionCreate:
			created++
		case ImportActionUpdate:
			updated++
		case ImportActionVariant:
			variantCreated++
		case ImportActionSkip:
			skipped++
		}
	}
	return created, updated, variantCreated, skipped
}
