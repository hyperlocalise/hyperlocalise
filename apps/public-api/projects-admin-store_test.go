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
	events := f.activities(t, "project_settings_changed")
	require.Len(t, events, 1)
	require.Equal(t, map[string]any{"changedFields": []any{"name", "targetLocales"}, "projectId": f.project}, events[0].Payload)

	f.importedFile(t, "en.json", "files_page")
	existing := f.createString(t, "en.json", "home.title", "Home", nil)
	locked := f.createString(t, "en.json", "home.locked", "Locked", nil)
	f.exec(t, `INSERT INTO project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
		VALUES ($1, $2, 'fr', $3)`, f.actor.OrganizationID, f.project, locked.ID)

	// Source text in a file is edited here only with the project's setting on.
	f.setSourceTextEditable(t, true)
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
	events = f.activities(t, "project_strings_updated")
	require.Len(t, events, 1)
	require.Equal(t, map[string]any{"projectId": f.project, "created": float64(2), "updated": float64(2), "itemCount": float64(4)}, events[0].Payload)

	// A source-text change on a locked string fails the whole batch. (Shown again first: a hidden
	// string's source text isn't editable at all.)
	f.exec(t, `UPDATE project_translation_keys SET is_hidden = false WHERE id = $1`, locked.ID)
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

	// The failed batch rolled back its event with its strings.
	require.Len(t, f.activities(t, "project_strings_updated"), 1)

	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "missing.source"}})
	require.ErrorIs(t, err, errStringSourceTextRequired)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "x", SourceText: ptr("X"), FilePath: ptr("nope.json")}})
	require.ErrorIs(t, err, errSourceFileNotFound)
}

func TestStringWritesUseDefaultBranchFile(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	mainFile := f.sourceFile(t, "en.json")
	branchFile := func(path string) string {
		var id string
		require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO repository_source_files
			(organization_id, project_id, source_path, branch_name)
			VALUES ($1, $2, $3, 'feature-checkout') RETURNING id`,
			f.actor.OrganizationID, f.project, path).Scan(&id))
		return id
	}
	branchCopy := branchFile("en.json")
	branchFile("feature-only.json")
	stringFile := func(id string) (fileID, branch string) {
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT repository_source_file_id, branch_name
			FROM project_translation_keys WHERE id = $1`, id).Scan(&fileID, &branch))
		return fileID, branch
	}

	created := f.createString(t, "en.json", "home.title", "Home", nil)
	fileID, branch := stringFile(created.ID)
	require.Equal(t, mainFile, fileID)
	require.NotEqual(t, branchCopy, fileID)
	require.Equal(t, "main", branch)

	// A key on the version branch's copy does not block a create on main.
	f.exec(t, `INSERT INTO project_translation_keys
		(organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text, branch_name, imported_source_text)
		VALUES ($1, $2, $3, 'home.cta', 'Go', 'go', 'feature-checkout', 'Go')`,
		f.actor.OrganizationID, f.project, branchCopy)
	cta := f.createString(t, "en.json", "home.cta", "Go", nil)
	fileID, _ = stringFile(cta.ID)
	require.Equal(t, mainFile, fileID)

	_, err := f.store.createString(ctx, f.actor, f.project, stringCreate{Key: "x", SourceText: "X", FilePath: ptr("feature-only.json")})
	require.ErrorIs(t, err, errSourceFileNotFound)

	file := "en.json"
	result, err := f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{
		{Key: "home.subtitle", FilePath: &file, SourceText: ptr("Welcome")},
		{Key: "home.cta", FilePath: &file, Context: optionalString{Set: true, Value: ptr("Button")}},
	})
	require.NoError(t, err)
	require.Equal(t, 1, result.Created)
	require.Equal(t, 1, result.Updated)
	fileID, branch = stringFile(result.Strings[0].ID)
	require.Equal(t, mainFile, fileID)
	require.Equal(t, "main", branch)
	require.Equal(t, cta.ID, result.Strings[1].ID)

	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "x", SourceText: ptr("X"), FilePath: ptr("feature-only.json")}})
	require.ErrorIs(t, err, errSourceFileNotFound)
}

func TestStringWritesRejectProtectedBranch(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	title := f.createString(t, "en.json", "home.title", "Home", nil)
	var branchFile, branchKey string
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO repository_source_files
		(organization_id, project_id, source_path, branch_name)
		VALUES ($1, $2, 'en.json', 'feature-checkout') RETURNING id`,
		f.actor.OrganizationID, f.project).Scan(&branchFile))
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO project_translation_keys
		(organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text, branch_name, imported_source_text)
		VALUES ($1, $2, $3, 'home.title', 'Home', 'home', 'feature-checkout', 'Home') RETURNING id`,
		f.actor.OrganizationID, f.project, branchFile).Scan(&branchKey))
	f.exec(t, `UPDATE project_branches SET is_protected = true WHERE project_id = $1 AND name = 'main'`, f.project)

	file := "en.json"
	_, err := f.store.createString(ctx, f.actor, f.project, stringCreate{Key: "new", SourceText: "New", FilePath: &file})
	require.ErrorIs(t, err, errProtectedBranch)
	_, err = f.store.createString(ctx, f.actor, f.project, stringCreate{Key: "loose", SourceText: "Loose"})
	require.ErrorIs(t, err, errProtectedBranch)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "home.title", FilePath: &file, Hidden: ptr(true)}})
	require.ErrorIs(t, err, errProtectedBranch)
	_, err = f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{Hidden: ptr(true)})
	require.ErrorIs(t, err, errProtectedBranch)
	_, err = f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{Keys: []string{"home.title"}}, AddTags: []string{"checkout"},
	})
	require.ErrorIs(t, err, errProtectedBranch)
	require.ErrorIs(t, f.store.deleteString(ctx, f.actor, f.project, title.ID), errProtectedBranch)

	saved, err := f.store.getString(ctx, f.actor, f.project, title.ID)
	require.NoError(t, err)
	require.False(t, saved.Hidden)
	require.Empty(t, saved.Tags)

	// Strings on an unprotected branch stay writable.
	updated, err := f.store.updateString(ctx, f.actor, f.project, branchKey, stringPatch{Context: optionalString{Set: true, Value: ptr("Heading")}})
	require.NoError(t, err)
	require.Equal(t, "Heading", *updated.Context)
	changed, err := f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{StringIDs: []string{branchKey}}, AddTags: []string{"checkout"},
	})
	require.NoError(t, err)
	require.Equal(t, 1, changed)
	require.NoError(t, f.store.deleteString(ctx, f.actor, f.project, branchKey))
}
