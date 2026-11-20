package main

import (
	"testing"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/stretchr/testify/require"
)

func TestBilingualRoundTripDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	title := f.createString(t, "en.json", "home.title", "Home", nil)
	short := f.createString(t, "en.json", "home.cta", "Go", ptr(3))
	locked := f.createString(t, "en.json", "home.locked", "Locked", nil)
	loose := f.createString(t, "", "loose", "Loose", nil)
	_, err := f.store.putTranslation(ctx, f.actor, f.project, title.ID, "fr", translationWrite{Text: "Maison", Status: "draft"})
	require.NoError(t, err)
	f.exec(t, `INSERT INTO project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
		VALUES ($1, $2, 'fr', $3)`, f.actor.OrganizationID, f.project, locked.ID)

	rows, err := f.store.exportBilingualRows(ctx, f.actor, f.project, bilingualExportQuery{Locale: "fr"})
	require.NoError(t, err)
	require.Equal(t, []editor_export.Row{
		{Key: "loose", SourceText: "Loose", SourceLocale: "en", TargetLocale: "fr"},
		{Key: "home.cta", SourceText: "Go", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json"},
		{Key: "home.locked", SourceText: "Locked", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json"},
		{Key: "home.title", SourceText: "Home", TargetText: "Maison", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json", Origin: "human"},
	}, rows)

	rows, err = f.store.exportBilingualRows(ctx, f.actor, f.project, bilingualExportQuery{Locale: "fr", FilePath: ptr("en.json")})
	require.NoError(t, err)
	require.Len(t, rows, 3)

	_, err = f.store.exportBilingualRows(ctx, f.actor, f.project, bilingualExportQuery{Locale: "ja"})
	require.ErrorIs(t, err, errLocaleNotInProject)

	counts, err := f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale: "fr",
		Rows: []editor_export.Row{
			{Key: "home.title", TargetText: "Accueil", SourcePath: "en.json"},
			{Key: "home.cta", TargetText: "Allez-y", SourcePath: "en.json"},
			{Key: "home.locked", TargetText: "Verrou", SourcePath: "en.json"},
			{Key: "missing", TargetText: "Absent", SourcePath: "en.json"},
			{Key: "loose", TargetText: "Libre"},
			{Key: "home.title", TargetText: "Bonjour", TargetLocale: "de", SourcePath: "en.json"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, bilingualImportCounts{Matched: 4, Imported: 2, Skipped: 4, Files: 2}, counts)
	events := f.activities(t, "file_translations_imported")
	require.Len(t, events, 1)
	require.Equal(t, f.project+":en.json", events[0].TargetID)
	require.Equal(t, "file", events[0].TargetKind)
	require.Equal(t, map[string]any{"fileName": "en.json", "name": "en.json", "projectId": f.project, "sourcePath": "en.json", "targetLocale": "fr"}, events[0].Payload)

	saved, err := f.store.getStringTranslation(ctx, f.actor, f.project, title.ID, "fr")
	require.NoError(t, err)
	require.Equal(t, "Accueil", saved.Text)
	require.Equal(t, "approved", saved.Status)
	require.Equal(t, "import", saved.Provenance)
	require.Equal(t, f.actor.UserID, *saved.ReviewedByUserID)

	saved, err = f.store.getStringTranslation(ctx, f.actor, f.project, loose.ID, "fr")
	require.NoError(t, err)
	require.Equal(t, "Libre", saved.Text)

	_, err = f.store.getStringTranslation(ctx, f.actor, f.project, short.ID, "fr")
	require.ErrorIs(t, err, errTranslationNotFound)
	_, err = f.store.getStringTranslation(ctx, f.actor, f.project, locked.ID, "fr")
	require.ErrorIs(t, err, errTranslationNotFound)

	var revisions int
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM project_translation_revisions WHERE translation_key_id = $1`, title.ID).Scan(&revisions))
	// putTranslation's revision, then the import's.
	require.Equal(t, 2, revisions)

	// The same file again changes nothing and records no revision.
	counts, err = f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale:   "fr",
		FilePath: ptr("en.json"),
		Rows:     []editor_export.Row{{Key: "home.title", TargetText: "Accueil"}},
	})
	require.NoError(t, err)
	require.Equal(t, bilingualImportCounts{Matched: 1, Imported: 1, Files: 1}, counts)
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM project_translation_revisions WHERE translation_key_id = $1`, title.ID).Scan(&revisions))
	require.Equal(t, 2, revisions)

	_, err = f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale:   "fr",
		FilePath: ptr("nope.json"),
		Rows:     []editor_export.Row{{Key: "home.title", TargetText: "Accueil"}},
	})
	require.ErrorIs(t, err, errSourceFileNotFound)
}

func TestBilingualImportStaysOnNamedBranch(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	main := f.createString(t, "en.json", "home.title", "Home", nil)

	var cloneFile string
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO repository_source_files
		(organization_id, project_id, source_path, branch_name)
		VALUES ($1, $2, 'en.json', 'feature-checkout') RETURNING id`,
		f.actor.OrganizationID, f.project).Scan(&cloneFile))
	var clone string
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO project_translation_keys
		(organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text, branch_name, imported_source_text)
		SELECT organization_id, project_id, $1, key, source_text, normalized_source_text, 'feature-checkout', imported_source_text
		FROM project_translation_keys WHERE id = $2
		RETURNING id`, cloneFile, main.ID).Scan(&clone))

	rows, err := f.store.exportBilingualRows(ctx, f.actor, f.project, bilingualExportQuery{Locale: "fr"})
	require.NoError(t, err)
	require.Equal(t, []editor_export.Row{
		{Key: "home.title", SourceText: "Home", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json"},
	}, rows)

	rows, err = f.store.exportBilingualRows(ctx, f.actor, f.project, bilingualExportQuery{Locale: "fr", Branch: "feature-checkout"})
	require.NoError(t, err)
	require.Equal(t, []editor_export.Row{
		{Key: "home.title", SourceText: "Home", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json"},
	}, rows)

	counts, err := f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale: "fr",
		Branch: "feature-checkout",
		Rows:   []editor_export.Row{{Key: "home.title", TargetText: "Accueil", SourcePath: "en.json"}},
	})
	require.NoError(t, err)
	require.Equal(t, bilingualImportCounts{Matched: 1, Imported: 1, Files: 1}, counts)

	saved, err := f.store.getStringTranslation(ctx, f.actor, f.project, clone, "fr")
	require.NoError(t, err)
	require.Equal(t, "Accueil", saved.Text)
	_, err = f.store.getStringTranslation(ctx, f.actor, f.project, main.ID, "fr")
	require.ErrorIs(t, err, errTranslationNotFound)

	counts, err = f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale:   "fr",
		FilePath: ptr("en.json"),
		Rows:     []editor_export.Row{{Key: "home.title", TargetText: "Maison"}},
	})
	require.NoError(t, err)
	require.Equal(t, bilingualImportCounts{Matched: 1, Imported: 1, Files: 1}, counts)

	saved, err = f.store.getStringTranslation(ctx, f.actor, f.project, main.ID, "fr")
	require.NoError(t, err)
	require.Equal(t, "Maison", saved.Text)
	saved, err = f.store.getStringTranslation(ctx, f.actor, f.project, clone, "fr")
	require.NoError(t, err)
	require.Equal(t, "Accueil", saved.Text)

	_, err = f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale:   "fr",
		FilePath: ptr("en.json"),
		Branch:   "missing-branch",
		Rows:     []editor_export.Row{{Key: "home.title", TargetText: "Accueil"}},
	})
	require.ErrorIs(t, err, errSourceFileNotFound)
}
