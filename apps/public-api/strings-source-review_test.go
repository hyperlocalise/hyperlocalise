package main

import (
	"testing"

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

	// An import can store surrounding spaces and the API trims what it receives: the text is
	// written as sent, but a whitespace-only difference does not send translations to review.
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
	require.Equal(t, "Total:", storedText())
	f.exec(t, `UPDATE project_translation_keys SET source_text = 'Total: ' WHERE id = $1`, total.ID)
	_, err = f.store.upsertStrings(ctx, f.actor, f.project, []stringUpsert{{Key: "cart.total", SourceText: ptr("Total:")}})
	require.NoError(t, err)
	require.Equal(t, "Total:", storedText())
	status, _, _ = f.translationState(t, total.ID, "fr")
	require.Equal(t, "approved", status)
	require.Empty(t, f.revisionStatuses(t, total.ID, "fr"))
}
