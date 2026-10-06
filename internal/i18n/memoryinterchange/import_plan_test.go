package memoryinterchange

import "testing"

func strPtr(value string) *string { return &value }

func candidateImportPlan(overrides Candidate) Candidate {
	base := Candidate{
		SourceLocale: "en-US",
		TargetLocale: "fr-FR",
		MatchScore:   100,
		UnitIndex:    0,
	}
	if overrides.SourceLocale != "" {
		base.SourceLocale = overrides.SourceLocale
	}
	if overrides.TargetLocale != "" {
		base.TargetLocale = overrides.TargetLocale
	}
	if overrides.SourceText != "" {
		base.SourceText = overrides.SourceText
	}
	if overrides.TargetText != "" {
		base.TargetText = overrides.TargetText
	}
	if overrides.ExternalKey != nil {
		base.ExternalKey = overrides.ExternalKey
	}
	if overrides.Tuid != nil {
		base.Tuid = overrides.Tuid
	}
	if overrides.UnitIndex != 0 {
		base.UnitIndex = overrides.UnitIndex
	}
	base.IsVariant = overrides.IsVariant
	return base
}

func TestPlanImportActionsDuplicateTuidInFile(t *testing.T) {
	first := candidateImportPlan(Candidate{
		SourceText:  "Hello",
		TargetText:  "Bonjour",
		ExternalKey: strPtr("tmx:dup-1:fr-FR"),
		Tuid:        strPtr("dup-1"),
	})
	second := candidateImportPlan(Candidate{
		SourceText:  "Hello again",
		TargetText:  "Bonjour encore",
		ExternalKey: strPtr("tmx:dup-1:fr-FR"),
		Tuid:        strPtr("dup-1"),
		UnitIndex:   1,
	})

	planned := PlanImportActions([]Candidate{first, second}, map[string]ExistingEntry{}, map[string]ExistingEntry{})
	if len(planned) != 2 || planned[0].Action != ImportActionCreate || planned[1].Action != ImportActionSkip {
		t.Fatalf("PlanImportActions() = %+v, want create then skip", planned)
	}
}

func TestPlanImportActionsUpdatesExistingExternalKey(t *testing.T) {
	next := candidateImportPlan(Candidate{
		SourceText:  "Hello",
		TargetText:  "Salut",
		ExternalKey: strPtr("tmx:existing-1:fr-FR"),
		Tuid:        strPtr("existing-1"),
	})
	existingByExternalKey := map[string]ExistingEntry{
		"tmx:existing-1:fr-FR": {ID: "entry-1", ExternalKey: strPtr("tmx:existing-1:fr-FR")},
	}

	planned := PlanImportActions([]Candidate{next}, existingByExternalKey, map[string]ExistingEntry{})
	if len(planned) != 1 || planned[0].Action != ImportActionUpdate || planned[0].ExistingID != "entry-1" {
		t.Fatalf("PlanImportActions() = %+v, want update entry-1", planned)
	}
}

func TestPlanImportActionsAttachesExternalKeyToSourceMatch(t *testing.T) {
	next := candidateImportPlan(Candidate{
		SourceText:  "Hello",
		TargetText:  "Bonjour",
		ExternalKey: strPtr("tmx:attach-1:fr-FR"),
		Tuid:        strPtr("attach-1"),
	})
	sourceKey := SourceLookupKey("en-US", "fr-FR", "Hello")
	existingBySourceKey := map[string]ExistingEntry{
		sourceKey: {ID: "entry-2", ExternalKey: nil},
	}

	planned := PlanImportActions([]Candidate{next}, map[string]ExistingEntry{}, existingBySourceKey)
	if len(planned) != 1 || planned[0].Action != ImportActionUpdate || planned[0].ExistingID != "entry-2" {
		t.Fatalf("PlanImportActions() = %+v, want update entry-2", planned)
	}
}

func TestPlanImportActionsSkipsSourceDuplicateWithExternalKey(t *testing.T) {
	next := candidateImportPlan(Candidate{
		SourceText: "Hello",
		TargetText: "Bonjour",
	})
	sourceKey := SourceLookupKey("en-US", "fr-FR", "Hello")
	existingBySourceKey := map[string]ExistingEntry{
		sourceKey: {ID: "entry-3", ExternalKey: strPtr("tmx:other:fr-FR")},
	}

	planned := PlanImportActions([]Candidate{next}, map[string]ExistingEntry{}, existingBySourceKey)
	if len(planned) != 1 || planned[0].Action != ImportActionSkip {
		t.Fatalf("PlanImportActions() = %+v, want skip", planned)
	}
}

func TestPlanImportActionsVariantCreate(t *testing.T) {
	next := candidateImportPlan(Candidate{
		SourceText:  "Hello",
		TargetText:  "Bonjour alt",
		ExternalKey: strPtr("tmx:var-1:fr-FR"),
		Tuid:        strPtr("var-1"),
		IsVariant:   true,
	})

	planned := PlanImportActions([]Candidate{next}, map[string]ExistingEntry{}, map[string]ExistingEntry{})
	if len(planned) != 1 || planned[0].Action != ImportActionVariant {
		t.Fatalf("PlanImportActions() = %+v, want variant", planned)
	}
}
