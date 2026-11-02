package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestProjectsAdminDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()

	name := "Web app"
	updated, err := f.store.updateProject(ctx, f.actor, f.project, projectPatch{Name: &name, TargetLocales: []string{"fr", "es-419", "AZ"}})
	require.NoError(t, err)
	require.Equal(t, "Web app", updated.Name)
	require.Equal(t, []string{"fr", "es-419", "az"}, updated.TargetLocales)
	_, err = f.store.updateProject(ctx, f.actor, f.project, projectPatch{TargetLocales: []string{"EN"}})
	require.ErrorIs(t, err, errSourceInTargets)

	f.sourceFile(t, "en.json")
	existing := f.createString(t, "en.json", "home.title", "Home", nil)
	locked := f.createString(t, "en.json", "home.locked", "Locked", nil)
	f.exec(t, `INSERT INTO project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
		VALUES ($1, $2, 'fr', $3)`, f.actor.OrganizationID, f.project, locked.ID)

	file := "en.json"
	result, err := f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{
		{Key: "home.title", FilePath: &file, SourceText: ptr("Home page"), MaxLength: optionalInt{Set: true, Value: ptr(40)}},
		{Key: "home.cta", FilePath: &file, SourceText: ptr("Start"), Context: optionalString{Set: true, Value: ptr("Button")}},
		{Key: "loose", SourceText: ptr("Loose")},
		{Key: "home.locked", FilePath: &file, Hidden: ptr(true)},
	})
	require.NoError(t, err)
	require.Equal(t, 2, result.Created)
	require.Equal(t, 2, result.Updated)
	require.Equal(t, existing.ID, result.Strings[0].ID)
	require.Equal(t, "Home page", result.Strings[0].SourceText)
	require.Equal(t, 40, *result.Strings[0].MaxLength)
	require.Equal(t, "Button", *result.Strings[1].Context)
	require.Nil(t, result.Strings[2].FilePath)
	require.True(t, result.Strings[3].Hidden)

	// A source-text change on a locked string fails the whole batch.
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{
		{Key: "new.one", SourceText: ptr("New")},
		{Key: "home.locked", FilePath: &file, SourceText: ptr("Changed")},
	})
	var item errStringBatchItem
	require.ErrorAs(t, err, &item)
	require.Equal(t, 1, item.index)
	require.ErrorIs(t, err, errSegmentLocked)
	items, _, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{Keys: []string{"new.one", "loose"}, IncludeHidden: true, Limit: 10})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, "loose", items[0].Key)

	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "missing.source"}})
	require.ErrorIs(t, err, errStringSourceTextRequired)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "x", SourceText: ptr("X"), FilePath: ptr("nope.json")}})
	require.ErrorIs(t, err, errSourceFileNotFound)
}
