package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// translationState reads a translation's status, text and reviewer.
func (f dbFixture) translationState(t *testing.T, keyID, locale string) (status, text string, reviewed bool) {
	t.Helper()
	require.NoError(t, f.pool.QueryRow(t.Context(), `SELECT status::text, text, reviewed_by_user_id IS NOT NULL OR reviewed_at IS NOT NULL
		FROM project_translations WHERE translation_key_id = $1 AND target_locale = $2`, keyID, locale).Scan(&status, &text, &reviewed))
	return status, text, reviewed
}

// revisionStatuses lists a translation's revision statuses and actor kinds, oldest first.
func (f dbFixture) revisionStatuses(t *testing.T, keyID, locale string) []string {
	t.Helper()
	rows, err := f.pool.Query(t.Context(), `SELECT status::text || ':' || actor_kind FROM project_translation_revisions
		WHERE translation_key_id = $1 AND target_locale = $2 ORDER BY created_at, id`, keyID, locale)
	require.NoError(t, err)
	defer rows.Close()
	var out []string
	for rows.Next() {
		var item string
		require.NoError(t, rows.Scan(&item))
		out = append(out, item)
	}
	require.NoError(t, rows.Err())
	return out
}

func (f dbFixture) insertTranslation(t *testing.T, keyID, locale, text, status string) {
	t.Helper()
	f.exec(t, `INSERT INTO project_translations (organization_id, project_id, translation_key_id, target_locale, text, status, provenance, reviewed_by_user_id, reviewed_at)
		VALUES ($1, $2, $3, $4, $5, $6::text::project_translation_status, 'manual',
			CASE WHEN $6::text = 'approved' THEN $7::uuid END, CASE WHEN $6::text = 'approved' THEN now() END)`,
		f.actor.OrganizationID, f.project, keyID, locale, text, status, f.actor.UserID)
}

func (f dbFixture) setSourceChangeNeedsReview(t *testing.T) {
	t.Helper()
	f.exec(t, `UPDATE projects SET approved_translations_on_source_change = 'needs_review' WHERE id = $1`, f.project)
}

func TestSourceChangeKeepsApprovedTranslationsByDefault(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()

	title := f.createString(t, "", "home.title", "Home", nil)
	f.insertTranslation(t, title.ID, "fr", "Accueil", "approved")
	_, err := f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Home page")})
	require.NoError(t, err)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "home.title", SourceText: ptr("Start page")}})
	require.NoError(t, err)
	status, _, reviewed := f.translationState(t, title.ID, "fr")
	require.Equal(t, "approved", status)
	require.True(t, reviewed)
	require.Empty(t, f.revisionStatuses(t, title.ID, "fr"))
}

func TestSourceChangeSendsApprovedTranslationsToReview(t *testing.T) {
	f := newDBFixture(t)
	f.setSourceChangeNeedsReview(t)
	ctx := t.Context()

	title := f.createString(t, "", "home.title", "Home", nil)
	f.insertTranslation(t, title.ID, "fr", "Accueil", "approved")
	f.insertTranslation(t, title.ID, "de", "Startseite", "draft")

	// The same source text, or other fields alone, leave the review state alone.
	_, err := f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Home"), Context: optionalString{Set: true, Value: ptr("Header")}})
	require.NoError(t, err)
	status, _, reviewed := f.translationState(t, title.ID, "fr")
	require.Equal(t, "approved", status)
	require.True(t, reviewed)
	require.Empty(t, f.revisionStatuses(t, title.ID, "fr"))

	_, err = f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Home page")})
	require.NoError(t, err)
	status, text, reviewed := f.translationState(t, title.ID, "fr")
	require.Equal(t, "needs_review", status)
	require.Equal(t, "Accueil", text)
	require.False(t, reviewed)
	require.Equal(t, []string{"approved:user", "needs_review:api_key"}, f.revisionStatuses(t, title.ID, "fr"))
	status, _, _ = f.translationState(t, title.ID, "de")
	require.Equal(t, "draft", status)
	require.Empty(t, f.revisionStatuses(t, title.ID, "de"))

	cta := f.createString(t, "", "home.cta", "Start", nil)
	f.insertTranslation(t, cta.ID, "fr", "Commencer", "approved")
	footer := f.createString(t, "", "home.footer", "Footer", nil)
	f.insertTranslation(t, footer.ID, "fr", "Pied de page", "approved")
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{
		{Key: "home.cta", SourceText: ptr("Get started")},
		{Key: "home.footer", SourceText: ptr("Footer"), MaxLength: optionalInt{Set: true, Value: ptr(20)}},
	})
	require.NoError(t, err)
	status, _, _ = f.translationState(t, cta.ID, "fr")
	require.Equal(t, "needs_review", status)
	require.Equal(t, []string{"approved:user", "needs_review:api_key"}, f.revisionStatuses(t, cta.ID, "fr"))
	status, _, _ = f.translationState(t, footer.ID, "fr")
	require.Equal(t, "approved", status)
}

func TestSourceChangeKeepApprovedSkipsTheReset(t *testing.T) {
	f := newDBFixture(t)
	f.setSourceChangeNeedsReview(t)
	ctx := t.Context()

	title := f.createString(t, "", "home.title", "Hom", nil)
	f.insertTranslation(t, title.ID, "fr", "Accueil", "approved")
	_, err := f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Home"), KeepApproved: true})
	require.NoError(t, err)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "home.title", SourceText: ptr("Home!"), KeepApproved: true}})
	require.NoError(t, err)
	status, _, reviewed := f.translationState(t, title.ID, "fr")
	require.Equal(t, "approved", status)
	require.True(t, reviewed)
	require.Empty(t, f.revisionStatuses(t, title.ID, "fr"))
}

func TestSourceChangeLeavesOtherStatusesAndWhitespaceAlone(t *testing.T) {
	f := newDBFixture(t)
	f.setSourceChangeNeedsReview(t)
	ctx := t.Context()

	title := f.createString(t, "", "home.title", "Home", nil)
	f.insertTranslation(t, title.ID, "fr", "Accueil", "needs_review")
	f.insertTranslation(t, title.ID, "de", "Startseite", "rejected")
	_, err := f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Home page")})
	require.NoError(t, err)
	status, _, _ := f.translationState(t, title.ID, "fr")
	require.Equal(t, "needs_review", status)
	status, _, _ = f.translationState(t, title.ID, "de")
	require.Equal(t, "rejected", status)
	require.Empty(t, f.revisionStatuses(t, title.ID, "fr"))
	require.Empty(t, f.revisionStatuses(t, title.ID, "de"))

	// An import can store surrounding spaces and the API trims what it receives, so a
	// whitespace-only difference is not a change: the stored text stays and nothing goes to review.
	total := f.createString(t, "", "cart.total", "Total:", nil)
	f.exec(t, `UPDATE project_translation_keys SET source_text = 'Total: ' WHERE id = $1`, total.ID)
	f.insertTranslation(t, total.ID, "fr", "Total :", "approved")
	storedText := func() string {
		var stored string
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT source_text FROM project_translation_keys WHERE id = $1`, total.ID).Scan(&stored))
		return stored
	}
	_, err = f.store.updateString(ctx, f.actor, f.project, total.ID, stringPatch{SourceText: ptr("Total:")})
	require.NoError(t, err)
	require.Equal(t, "Total: ", storedText())
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "cart.total", SourceText: ptr("Total:")}})
	require.NoError(t, err)
	require.Equal(t, "Total: ", storedText())
	status, _, _ = f.translationState(t, total.ID, "fr")
	require.Equal(t, "approved", status)
	require.Empty(t, f.revisionStatuses(t, total.ID, "fr"))
}

// importedFile is a source file whose last import came through the given surface.
func (f dbFixture) importedFile(t *testing.T, path, surface string) string {
	t.Helper()
	fileID := f.sourceFile(t, path)
	storedID := "file_" + uuid.NewString()
	f.exec(t, `INSERT INTO stored_files (id, organization_id, role, source_kind, storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256)
		VALUES ($1, $2, 'source', 'repository_file', 'test', $1, $1, 'x.json', 'application/json', 2, 'x')`, storedID, f.actor.OrganizationID)
	var versionID string
	require.NoError(t, f.pool.QueryRow(t.Context(), `INSERT INTO repository_source_file_versions (organization_id, project_id, repository_source_file_id, source_path, stored_file_id, source_hash, upload_surface)
		VALUES ($1, $2, $3, $4, $5, 'sha256:x', $6) RETURNING id`, f.actor.OrganizationID, f.project, fileID, path, storedID, surface).Scan(&versionID))
	f.exec(t, `UPDATE repository_source_files SET reconciled_source_file_version_id = $2 WHERE id = $1`, fileID, versionID)
	return fileID
}

func (f dbFixture) setSourceTextEditable(t *testing.T, editable bool) {
	t.Helper()
	f.exec(t, `UPDATE projects SET source_text_editable = $2 WHERE id = $1`, f.project, editable)
}

func TestSourceTextOfFileStringsIsEditableOnlyWithTheSetting(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.importedFile(t, "locales/en.json", "files_page")

	inFile := f.createString(t, "locales/en.json", "home.title", "Home", nil)
	apiOnly := f.createString(t, "", "promo.banner", "Sale", nil)

	// Off: a file's next import would replace the edit, so it is refused; the same text, or the
	// same text with other spaces around it (the API trims), is not an edit.
	_, err := f.store.updateString(ctx, f.actor, f.project, inFile.ID, stringPatch{SourceText: ptr("Home page")})
	require.ErrorIs(t, err, errSourceTextNotEditable)
	_, err = f.store.updateString(ctx, f.actor, f.project, inFile.ID, stringPatch{SourceText: ptr("Home"), Context: optionalString{Set: true, Value: ptr("Header")}})
	require.NoError(t, err)
	filePath := "locales/en.json"
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "home.title", FilePath: &filePath, SourceText: ptr("Start")}})
	require.ErrorIs(t, err, errSourceTextNotEditable)
	// A string in no file has no import to lose it to.
	_, err = f.store.updateString(ctx, f.actor, f.project, apiOnly.ID, stringPatch{SourceText: ptr("Big sale")})
	require.NoError(t, err)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "promo.banner", SourceText: ptr("Bigger sale")}})
	require.NoError(t, err)

	// On: the first edit records the text before it as the base the next import compares with.
	f.setSourceTextEditable(t, true)
	f.exec(t, `UPDATE project_translation_keys SET imported_source_text = NULL WHERE id = $1`, inFile.ID)
	updated, err := f.store.updateString(ctx, f.actor, f.project, inFile.ID, stringPatch{SourceText: ptr("Home page")})
	require.NoError(t, err)
	require.Equal(t, "Home page", updated.SourceText)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "home.title", FilePath: &filePath, SourceText: ptr("Start")}})
	require.NoError(t, err)
	var imported *string
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT imported_source_text FROM project_translation_keys WHERE id = $1`, inFile.ID).Scan(&imported))
	require.NotNil(t, imported)
	require.Equal(t, "Home", *imported)
}

func TestSourceTextEditsFollowTheFileAndTheRole(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.setSourceTextEditable(t, true)
	f.importedFile(t, "locales/en.yaml", "files_page")
	jsonFile := f.importedFile(t, "locales/app.json", "braze_automation")
	yaml := f.createString(t, "locales/en.yaml", "home.title", "Home", nil)
	json := f.createString(t, "locales/app.json", "home.title", "Home", nil)

	// No writer for YAML yet, so its file stays the source of truth.
	_, err := f.store.updateString(ctx, f.actor, f.project, yaml.ID, stringPatch{SourceText: ptr("Start")})
	require.ErrorIs(t, err, errSourceTextNotEditable)

	// An integration's file belongs to its service.
	_, err = f.store.updateString(ctx, f.actor, f.project, json.ID, stringPatch{SourceText: ptr("Start")})
	require.ErrorIs(t, err, errSourceTextNotEditable)
	f.exec(t, `UPDATE repository_source_file_versions SET upload_surface = 'gitlab_content_sync' WHERE repository_source_file_id = $1`, jsonFile)

	translator := f.actor
	translator.Role = "translator"
	_, err = f.store.updateString(ctx, translator, f.project, json.ID, stringPatch{SourceText: ptr("Start")})
	require.ErrorIs(t, err, errSourceTextForbidden)
	_, err = f.store.updateString(ctx, f.actor, f.project, json.ID, stringPatch{SourceText: ptr("Start")})
	require.NoError(t, err)
}

func TestResendingTheSourceTextOfALockedStringIsAccepted(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	title := f.createString(t, "", "home.title", "Home", nil)
	f.exec(t, `INSERT INTO project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
		VALUES ($1, $2, 'fr', $3)`, f.actor.OrganizationID, f.project, title.ID)
	_, err := f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Home"), Context: optionalString{Set: true, Value: ptr("Header")}})
	require.NoError(t, err)
	_, err = f.store.updateString(ctx, f.actor, f.project, title.ID, stringPatch{SourceText: ptr("Start")})
	require.ErrorIs(t, err, errSegmentLocked)
}

func TestSourceTextWithInternalMarkersIsRefusedOnlyAsAChange(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	page := f.createString(t, "", "html.p", "Hi there", nil)
	f.exec(t, `UPDATE project_translation_keys SET source_text = $2 WHERE id = $1`, page.ID, "Hi \x1eHLHTPH_AB_0\x1f there")
	// Sent back as read, it is not a change.
	_, err := f.store.updateString(ctx, f.actor, f.project, page.ID, stringPatch{SourceText: ptr("Hi \x1eHLHTPH_AB_0\x1f there"), Context: optionalString{Set: true, Value: ptr("Hero")}})
	require.NoError(t, err)
	_, err = f.store.updateString(ctx, f.actor, f.project, page.ID, stringPatch{SourceText: ptr("Hello \x1eHLHTPH_AB_0\x1f there")})
	require.ErrorIs(t, err, errSourceTextInvalid)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "new.one", SourceText: ptr("Bad \x00")}})
	require.ErrorIs(t, err, errSourceTextInvalid)
}
