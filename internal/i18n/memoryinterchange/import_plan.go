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
	sourceKeyOwners := make(map[string]string, len(existingBySourceKey))
	for key, entry := range existingBySourceKey {
		if entry.ID != "" {
			sourceKeyOwners[key] = entry.ID
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
			if sourceKeyTakenByOther(sourceKeyOwners, nextSourceKey, existing.ID) {
				planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionSkip})
				continue
			}
			releaseSourceKeysForEntry(sourceKeyOwners, existing.ID)
			planned = append(planned, PlannedImport{Candidate: candidate, Action: ImportActionUpdate, ExistingID: existing.ID})
			sourceKeyOwners[nextSourceKey] = existing.ID
			continue
		}
		if sourceKeyTakenByOther(sourceKeyOwners, nextSourceKey, "") {
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

func hasKey(set map[string]struct{}, key string) bool {
	_, ok := set[key]
	return ok
}

func sourceKeyTakenByOther(owners map[string]string, key, exceptEntryID string) bool {
	owner, ok := owners[key]
	if !ok {
		return false
	}
	if exceptEntryID != "" && owner == exceptEntryID {
		return false
	}
	return true
}

func releaseSourceKeysForEntry(owners map[string]string, entryID string) {
	for key, owner := range owners {
		if owner == entryID {
			delete(owners, key)
		}
	}
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
