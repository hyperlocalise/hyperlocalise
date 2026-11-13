package main

import (
	"testing"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/stretchr/testify/require"
)

// seedMachineTranslation writes a translation as a translation job would.
func (f dbFixture) seedMachineTranslation(t *testing.T, stringID, locale, text string) {
	t.Helper()
	f.exec(t, `INSERT INTO project_translations (organization_id, project_id, translation_key_id, target_locale, text, status, provenance, origin)
		VALUES ($1, $2, $3, $4, $5, 'needs_review', 'translation_job', 'machine')`,
		f.actor.OrganizationID, f.project, stringID, locale, text)
}

func (f dbFixture) latestRevisionOrigin(t *testing.T, stringID, locale string) string {
	t.Helper()
	var origin string
	require.NoError(t, f.pool.QueryRow(t.Context(), `SELECT origin::text FROM project_translation_revisions
		WHERE translation_key_id = $1 AND target_locale = $2 ORDER BY created_at DESC, id DESC LIMIT 1`,
		stringID, locale).Scan(&origin))
	return origin
}

func TestPutTranslationOriginDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	machine := f.createString(t, "", "machine", "Save", nil)
	f.seedMachineTranslation(t, machine.ID, "fr", "Enregistrer")

	// Approving machine text unchanged keeps it machine text.
	saved, err := f.store.putTranslation(ctx, f.actor, f.project, machine.ID, "fr", translationWrite{Text: "Enregistrer", Status: "approved"})
	require.NoError(t, err)
	require.Equal(t, "manual", saved.Provenance)
	require.Equal(t, "machine", saved.Origin)
	require.Equal(t, "machine", f.latestRevisionOrigin(t, machine.ID, "fr"))

	// Changing it post-edits it, and further edits stay post-edited.
	saved, err = f.store.putTranslation(ctx, f.actor, f.project, machine.ID, "fr", translationWrite{Text: "Sauvegarder", Status: "approved"})
	require.NoError(t, err)
	require.Equal(t, "machine_post_edited", saved.Origin)
	saved, err = f.store.putTranslation(ctx, f.actor, f.project, machine.ID, "fr", translationWrite{Text: "Sauver", Status: "draft"})
	require.NoError(t, err)
	require.Equal(t, "machine_post_edited", saved.Origin)
	require.Equal(t, "machine_post_edited", f.latestRevisionOrigin(t, machine.ID, "fr"))

	// A person's text into an empty translation is human; a caller may label its own MT.
	human := f.createString(t, "", "human", "Cancel", nil)
	saved, err = f.store.putTranslation(ctx, f.actor, f.project, human.ID, "fr", translationWrite{Text: "Annuler", Status: "draft"})
	require.NoError(t, err)
	require.Equal(t, "human", saved.Origin)
	saved, err = f.store.putTranslation(ctx, f.actor, f.project, human.ID, "de", translationWrite{Text: "Abbrechen", Status: "draft", Origin: "machine"})
	require.NoError(t, err)
	require.Equal(t, "machine", saved.Origin)

	// Relabelling the same text is a write, not a no-op.
	saved, err = f.store.putTranslation(ctx, f.actor, f.project, human.ID, "de", translationWrite{Text: "Abbrechen", Status: "draft", Origin: "human"})
	require.NoError(t, err)
	require.Equal(t, "human", saved.Origin)

	items, total, err := f.store.listTranslations(ctx, f.actor, f.project, translationFilters{Origin: "machine_post_edited", Limit: 50})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, machine.ID, items[0].StringID)
}

func TestBilingualOriginDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	kept := f.createString(t, "en.json", "kept", "Save", nil)
	edited := f.createString(t, "en.json", "edited", "Open", nil)
	f.seedMachineTranslation(t, kept.ID, "fr", "Enregistrer")
	f.seedMachineTranslation(t, edited.ID, "fr", "Ouvrir")

	rows, err := f.store.exportBilingualRows(ctx, f.actor, f.project, bilingualExportQuery{Locale: "fr"})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	for _, row := range rows {
		require.Equal(t, "machine", row.Origin)
	}
	require.Contains(t, string(editor_export.SerializeXLIFF(rows)), `state-qualifier="mt-suggestion"`)

	// A corrected file is a person's edit: unchanged machine text stays machine, changed text is
	// post-edited.
	_, err = f.store.importBilingualRows(ctx, f.actor, f.project, bilingualImportInput{
		Locale: "fr",
		Rows: []editor_export.Row{
			{Key: "kept", TargetText: "Enregistrer", SourcePath: "en.json"},
			{Key: "edited", TargetText: "Ouvrir le fichier", SourcePath: "en.json"},
		},
	})
	require.NoError(t, err)
	saved, err := f.store.getStringTranslation(ctx, f.actor, f.project, kept.ID, "fr")
	require.NoError(t, err)
	require.Equal(t, "machine", saved.Origin)
	saved, err = f.store.getStringTranslation(ctx, f.actor, f.project, edited.ID, "fr")
	require.NoError(t, err)
	require.Equal(t, "machine_post_edited", saved.Origin)
	require.Equal(t, "machine_post_edited", f.latestRevisionOrigin(t, edited.ID, "fr"))
}
