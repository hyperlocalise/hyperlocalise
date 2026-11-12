package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func (f dbFixture) translation(t *testing.T, stringID, locale, text, status string) {
	t.Helper()
	f.exec(t, `INSERT INTO project_translations (organization_id, project_id, translation_key_id, target_locale, text, status)
		VALUES ($1, $2, $3, $4, $5, $6)`, f.actor.OrganizationID, f.project, stringID, locale, text, status)
}

func (f dbFixture) status(t *testing.T, stringID, locale string) string {
	t.Helper()
	var status string
	require.NoError(t, f.pool.QueryRow(t.Context(), `SELECT status::text FROM project_translations
		WHERE translation_key_id = $1 AND target_locale = $2`, stringID, locale).Scan(&status))
	return status
}

// keyJob inserts an open key job on the given strings and returns its id.
func (f dbFixture) keyJob(t *testing.T, locales string, stringIDs ...string) string {
	t.Helper()
	id := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, created_by_user_id, kind, status, input_payload)
		VALUES ($1, $2, $3, $4, 'proofread', 'waiting_for_review', jsonb_build_object('sourceLocale', 'en', 'targetLocales', $5::jsonb))`,
		id, f.actor.OrganizationID, f.project, f.actor.UserID, locales)
	f.exec(t, `INSERT INTO translation_job_details (job_id, type) VALUES ($1, 'keys')`, id)
	for _, stringID := range stringIDs {
		f.exec(t, `INSERT INTO translation_job_keys (job_id, translation_key_id) VALUES ($1, $2)`, id, stringID)
	}
	return id
}

func TestBulkUpdateStringsDB(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	a := f.createString(t, "", "checkout.title", "Checkout", nil)
	b := f.createString(t, "", "checkout.cta", "Pay", nil)
	f.createString(t, "", "home.title", "Home", nil)

	link := "https://figma.com/file/abc"
	updated, err := f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{StringIDs: []string{a.ID, b.ID}}, AddTags: []string{"release-7", "checkout"},
		DesignURL: optionalString{Set: true, Value: &link},
	})
	require.NoError(t, err)
	require.Equal(t, 2, updated)

	items, total, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{Tags: []string{"checkout", "release-7"}, Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Equal(t, []string{"checkout", "release-7"}, items[0].Tags)
	require.Equal(t, link, *items[0].DesignURL)

	// Nothing changes the second time, so nothing is counted or logged.
	updated, err = f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{Tags: []string{"checkout"}}, AddTags: []string{"checkout"},
	})
	require.NoError(t, err)
	require.Zero(t, updated)
	require.Len(t, f.activities(t, "project_strings_updated"), 1)

	updated, err = f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{Keys: []string{"checkout.cta"}}, RemoveTags: []string{"checkout"},
		DesignURL: optionalString{Set: true},
	})
	require.NoError(t, err)
	require.Equal(t, 1, updated)
	got, err := f.store.getString(ctx, f.actor, f.project, b.ID)
	require.NoError(t, err)
	require.Equal(t, []string{"release-7"}, got.Tags)
	require.Nil(t, got.DesignURL)

	_, err = f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{Keys: []string{"missing"}}, AddTags: []string{"x"},
	})
	require.ErrorIs(t, err, errNoStringsMatched)

	// A tag can pick more strings than a call may change.
	f.exec(t, `INSERT INTO project_translation_keys (organization_id, project_id, key, source_text, normalized_source_text, tags)
		SELECT $1, $2, 'bulk.' || n, 'x', 'x', '{bulk}' FROM generate_series(1, $3::int) n`,
		f.actor.OrganizationID, f.project, maxSelectedStrings+1)
	_, err = f.store.bulkUpdateStrings(ctx, f.actor, f.project, stringBulkUpdate{
		Select: stringSelector{Tags: []string{"bulk"}}, AddTags: []string{"x"},
	})
	require.ErrorIs(t, err, errTooManyStringsSelected)
}

func TestReviewTranslationsDB(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	maxLength := 5
	a := f.createString(t, "", "a", "A", nil)
	b := f.createString(t, "", "b", "B", &maxLength)
	c := f.createString(t, "", "c", "C", nil)
	d := f.createString(t, "", "d", "D", nil)
	f.exec(t, `UPDATE project_translation_keys SET tags = '{release-7}' WHERE id = ANY($1::uuid[])`, []string{a.ID, b.ID, c.ID, d.ID})
	f.translation(t, a.ID, "fr", "Un", "needs_review")
	f.translation(t, a.ID, "de", "Ein", "draft")
	f.translation(t, b.ID, "fr", "Beaucoup trop long", "needs_review")
	f.translation(t, c.ID, "fr", "Ce", "rejected")
	f.translation(t, c.ID, "de", "   ", "draft")
	f.translation(t, d.ID, "fr", " ", "needs_review")

	approved, err := f.store.reviewTranslations(ctx, f.actor, f.project, stringSelector{Tags: []string{"release-7"}}, nil, reviewApprove)
	require.NoError(t, err)
	require.Equal(t, 2, approved)
	require.Equal(t, "approved", f.status(t, a.ID, "fr"))
	require.Equal(t, "approved", f.status(t, a.ID, "de"))
	require.Equal(t, "needs_review", f.status(t, b.ID, "fr"), "over max length")
	require.Equal(t, "rejected", f.status(t, c.ID, "fr"))
	require.Equal(t, "draft", f.status(t, c.ID, "de"), "blank draft")
	require.Equal(t, "needs_review", f.status(t, d.ID, "fr"), "blank translation waiting for review")
	var reviewer string
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT reviewed_by_user_id::text FROM project_translations
		WHERE translation_key_id = $1 AND target_locale = 'fr'`, a.ID).Scan(&reviewer))
	require.Equal(t, f.actor.UserID, reviewer)

	f.exec(t, `INSERT INTO project_cat_segment_locks (organization_id, project_id, external_string_id, target_locale, locked_by_user_id)
		VALUES ($1, $2, $3, 'de', $4)`, f.actor.OrganizationID, f.project, a.ID, f.actor.UserID)
	sentBack, err := f.store.reviewTranslations(ctx, f.actor, f.project, stringSelector{Keys: []string{"a"}}, nil, reviewSendToReview)
	require.NoError(t, err)
	require.Equal(t, 1, sentBack)
	require.Equal(t, "needs_review", f.status(t, a.ID, "fr"))
	require.Equal(t, "approved", f.status(t, a.ID, "de"), "locked segment")

	var revisions int
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM project_translation_revisions
		WHERE translation_key_id = $1 AND target_locale = 'fr'`, a.ID).Scan(&revisions))
	require.Equal(t, 3, revisions, "baseline, approve, send to review")

	_, err = f.store.reviewTranslations(ctx, f.actor, f.project, stringSelector{Keys: []string{"a"}}, []string{"ja"}, reviewApprove)
	require.ErrorIs(t, err, errLocaleNotInProject)

	approved, err = f.store.reviewTranslations(ctx, f.actor, f.project, stringSelector{Keys: []string{"a"}}, []string{"FR"}, reviewApprove)
	require.NoError(t, err)
	require.Equal(t, 1, approved)
	require.Equal(t, "approved", f.status(t, a.ID, "fr"))
}

func TestKeyJobsDB(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	a := f.createString(t, "en.json", "a", "A", nil)
	b := f.createString(t, "en.json", "b", "B", nil)
	c := f.createString(t, "en.json", "c", "C", nil)
	// A string in no file can't join a key job: the content editor can't show it.
	f.createString(t, "", "loose", "Loose", nil)
	f.exec(t, `UPDATE project_translation_keys SET is_hidden = true WHERE id = $1`, c.ID)
	jobID := f.keyJob(t, `["fr"]`, a.ID)
	f.translation(t, a.ID, "fr", "Un", "approved")
	f.translation(t, b.ID, "fr", "Bé", "needs_review")

	added, err := f.store.addJobStrings(ctx, f.actor, jobID, stringSelector{Keys: []string{"a", "b", "c", "loose"}})
	require.NoError(t, err)
	require.Equal(t, 1, added, "a is already in, c is hidden, loose has no file")

	f.translation(t, a.ID, "de", "Abgelehnt", "rejected")
	locales, err := f.store.addJobLocale(ctx, f.actor, jobID, "de")
	require.NoError(t, err)
	require.Equal(t, []jobLocaleProgress{
		{Locale: "fr", TotalStrings: 2, TranslatedStrings: 2, ApprovedStrings: 1, NeedsReviewStrings: 1},
		{Locale: "de", TotalStrings: 2},
	}, locales)
	_, err = f.store.addJobLocale(ctx, f.actor, jobID, "ja")
	require.ErrorIs(t, err, errLocaleNotInProject)

	// A key hidden after joining stays in the job but leaves its progress.
	f.exec(t, `UPDATE project_translation_keys SET is_hidden = true WHERE id = $1`, b.ID)
	locales, err = f.store.jobLocales(ctx, f.actor, jobID)
	require.NoError(t, err)
	require.Equal(t, 1, locales[0].TotalStrings)
	items, total, err := f.store.listJobStrings(ctx, f.actor, jobID, 10, 0)
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, items, 2)

	removed, err := f.store.removeJobStrings(ctx, f.actor, jobID, stringSelector{StringIDs: []string{b.ID}})
	require.NoError(t, err)
	require.Equal(t, 1, removed)
	_, err = f.store.removeJobStrings(ctx, f.actor, jobID, stringSelector{StringIDs: []string{a.ID}})
	require.ErrorIs(t, err, errKeyJobNeedsStrings)

	locales, err = f.store.removeJobLocale(ctx, f.actor, jobID, "fr")
	require.NoError(t, err)
	require.Equal(t, "de", locales[0].Locale)
	_, err = f.store.removeJobLocale(ctx, f.actor, jobID, "de")
	require.ErrorIs(t, err, errKeyJobNeedsLocale)

	f.exec(t, `UPDATE jobs SET status = 'succeeded' WHERE id = $1`, jobID)
	_, err = f.store.addJobStrings(ctx, f.actor, jobID, stringSelector{Keys: []string{"b"}})
	require.ErrorIs(t, err, errKeyJobClosed)
	_, err = f.store.jobLocales(ctx, f.actor, jobID)
	require.NoError(t, err, "a finished job can still be read")

	_, err = f.store.jobLocales(ctx, f.actor, "job_missing")
	require.ErrorIs(t, err, errJobNotFound)
}

func TestRemoveJobStringsIgnoresUnselectedProjectMatches(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	keep := f.createString(t, "en.json", "keep", "Keep", nil)
	tagged := f.createString(t, "en.json", "tagged", "Tagged", nil)
	f.exec(t, `UPDATE project_translation_keys SET tags = '{wide}' WHERE id = $1`, tagged.ID)
	f.exec(t, `INSERT INTO project_translation_keys (organization_id, project_id, key, source_text, normalized_source_text, tags)
		SELECT $1, $2, 'wide.' || n, 'x', 'x', '{wide}' FROM generate_series(1, $3::int) n`,
		f.actor.OrganizationID, f.project, maxSelectedStrings+1)
	jobID := f.keyJob(t, `["fr"]`, keep.ID, tagged.ID)

	removed, err := f.store.removeJobStrings(ctx, f.actor, jobID, stringSelector{Tags: []string{"wide"}})
	require.NoError(t, err)
	require.Equal(t, 1, removed)
	items, total, err := f.store.listJobStrings(ctx, f.actor, jobID, 10, 0)
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, keep.ID, items[0].ID)
}

func TestJobLocaleMatchesProjectSpelling(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	a := f.createString(t, "en.json", "a", "A", nil)
	jobID := f.keyJob(t, `["fr"]`, a.ID)

	locales, err := f.store.addJobLocale(ctx, f.actor, jobID, "DE")
	require.NoError(t, err)
	require.Equal(t, []string{"fr", "de"}, []string{locales[0].Locale, locales[1].Locale})

	locales, err = f.store.removeJobLocale(ctx, f.actor, jobID, "FR")
	require.NoError(t, err)
	require.Equal(t, "de", locales[0].Locale)
}

func TestLocaleIn(t *testing.T) {
	locales := []string{"en-US", "fr"}
	spelling, ok := localeIn(locales, "en-us")
	require.True(t, ok)
	require.Equal(t, "en-US", spelling)
	spelling, ok = localeIn(locales, "FR")
	require.True(t, ok)
	require.Equal(t, "fr", spelling)
	_, ok = localeIn(locales, "de")
	require.False(t, ok)
}
