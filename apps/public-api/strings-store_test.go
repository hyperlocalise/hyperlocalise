package main

import (
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestAccessibleProjectPredicateIncludesDefaultTeam(t *testing.T) {
	require.Contains(t, accessibleProjectPredicate, "p.team_id IS NULL AND t.slug = 'default'")
	require.Contains(t, projectTeamMemberPredicate, "t.organization_id = $1")
}

func TestTranslationWriteHelpers(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	userID := "user-1"

	t.Run("reviewer for approved and rejected", func(t *testing.T) {
		reviewedBy, reviewedAt := reviewerForTranslationStatus("approved", userID, now)
		require.Equal(t, userID, *reviewedBy)
		require.Equal(t, now, *reviewedAt)

		reviewedBy, reviewedAt = reviewerForTranslationStatus("rejected", userID, now)
		require.Equal(t, userID, *reviewedBy)
		require.Equal(t, now, *reviewedAt)

		reviewedBy, reviewedAt = reviewerForTranslationStatus("draft", userID, now)
		require.Nil(t, reviewedBy)
		require.Nil(t, reviewedAt)
	})

	t.Run("unchanged write skips upsert", func(t *testing.T) {
		before := &translationSnapshot{id: "t-1", text: "Bonjour", status: "draft"}
		require.True(t, translationWriteUnchanged(before, translationWrite{Text: "Bonjour", Status: "draft"}))
		require.False(t, translationWriteUnchanged(before, translationWrite{Text: "Salut", Status: "draft"}))
		require.False(t, translationWriteUnchanged(nil, translationWrite{Text: "Bonjour", Status: "draft"}))
	})
}

func TestIsUniqueViolation(t *testing.T) {
	require.True(t, isUniqueViolation(&pgconn.PgError{Code: "23505"}))
	require.False(t, isUniqueViolation(&pgconn.PgError{Code: "23503"}))
	require.False(t, isUniqueViolation(errors.New("insert string")))
}

func TestSourceTextChanged(t *testing.T) {
	require.False(t, sourceTextChanged("Home", "Home"))
	require.False(t, sourceTextChanged(" Home ", "Home"))
	require.True(t, sourceTextChanged("Home", "Home page"))
}

func TestPercentage(t *testing.T) {
	require.Equal(t, 0, percentage(10, 0))
	require.Equal(t, 0, percentage(0, 20))
	require.Equal(t, 50, percentage(1, 2))
	require.Equal(t, 100, percentage(3, 2))
}

func TestProjectScopeRequireNative(t *testing.T) {
	require.NoError(t, projectScope{Source: "native"}.requireNative())
	require.ErrorIs(t, projectScope{Source: "external_tms"}.requireNative(), errProjectNotNative)
}

func TestTranslationWriteOriginAfter(t *testing.T) {
	t.Run("caller label wins", func(t *testing.T) {
		before := &translationSnapshot{text: "Enregistrer", origin: "machine"}
		require.Equal(t, "human", translationWrite{Text: "Enregistrer", Origin: "human"}.originAfter(before))
	})
	t.Run("unchanged machine text stays machine", func(t *testing.T) {
		before := &translationSnapshot{text: "Enregistrer", origin: "machine"}
		require.Equal(t, "machine", translationWrite{Text: "Enregistrer"}.originAfter(before))
	})
	t.Run("editing machine text post-edits it", func(t *testing.T) {
		before := &translationSnapshot{text: "Enregistrer", origin: "machine"}
		require.Equal(t, "machine_post_edited", translationWrite{Text: "Sauvegarder"}.originAfter(before))
	})
	t.Run("empty translation is human", func(t *testing.T) {
		require.Equal(t, "human", translationWrite{Text: "Annuler"}.originAfter(nil))
	})
}

func TestSQLFilter(t *testing.T) {
	where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", "org", "proj")
	where.add("f.source_path = ?", "en.json")
	where.add("(k.key ILIKE ? OR k.source_text ILIKE ?)", "%home%")
	require.Equal(t, "k.organization_id = $1 AND k.project_id = $2 AND f.source_path = $3 AND (k.key ILIKE $4 OR k.source_text ILIKE $4)", where.sql())
	require.Equal(t, " LIMIT $5 OFFSET $6", where.page(25, 50))
	require.Equal(t, []any{"org", "proj", "en.json", "%home%", 25, 50}, where.args)

	set := newSQLFilter("updated_at = now()")
	addSourceTextChange(set, " Hello  World ")
	require.Equal(t, []string{
		"updated_at = now()",
		"source_text = $1",
		"normalized_source_text = $2",
		`imported_source_text = CASE WHEN repository_source_file_id IS NULL
		THEN imported_source_text ELSE coalesce(imported_source_text, source_text) END`,
	}, set.conditions)
	require.Equal(t, []any{" Hello  World ", "hello world"}, set.args)
}

func FuzzNormalizeSourceText(f *testing.F) {
	for _, seed := range []string{"", "  Hello\tＷide \n World ", "café", "ab\xffcd"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, input string) {
		got := normalizeSourceText(input)
		require.True(t, utf8.ValidString(got))
		require.Equal(t, strings.TrimSpace(got), got)
		require.Equal(t, strings.ToLower(got), got)
	})
}

func TestStringsStoreDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "en.json")
	home := f.createString(t, "en.json", "home.title", "Home", ptr(40))
	loose := f.createString(t, "", "loose.cta", "Start", nil)
	hidden, err := f.store.createString(ctx, f.actor, f.project, stringCreate{Key: "hidden.banner", SourceText: "Sale", Hidden: true})
	require.NoError(t, err)

	visible, total, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Equal(t, []string{"loose.cta", "home.title"}, []string{visible[0].Key, visible[1].Key})

	byFile, total, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{FilePath: "en.json", IncludeHidden: true, Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, home.ID, byFile[0].ID)

	found, total, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{Search: "start", IncludeHidden: true, Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, loose.ID, found[0].ID)

	keys, total, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{Keys: []string{"hidden.banner", "missing"}, IncludeHidden: true, Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, hidden.ID, keys[0].ID)

	got, err := f.store.getString(ctx, f.actor, f.project, home.ID)
	require.NoError(t, err)
	require.Equal(t, "Home", got.SourceText)
	require.Equal(t, 40, *got.MaxLength)
	_, err = f.store.getString(ctx, f.actor, f.project, "not-a-uuid")
	require.ErrorIs(t, err, errStringNotFound)

	saved, err := f.store.putTranslation(ctx, f.actor, f.project, home.ID, "fr", translationWrite{Text: "Accueil", Status: "approved"})
	require.NoError(t, err)
	require.Equal(t, "Accueil", saved.Text)
	require.Equal(t, "human", saved.Origin)
	require.Equal(t, "manual", saved.Provenance)
	_, err = f.store.putTranslation(ctx, f.actor, f.project, home.ID, "ja", translationWrite{Text: "ホーム", Status: "draft"})
	require.ErrorIs(t, err, errLocaleNotInProject)

	locales, err := f.store.getProjectLocales(ctx, f.actor, f.project)
	require.NoError(t, err)
	require.Equal(t, "en", *locales.SourceLocale)
	require.Len(t, locales.Locales, 2)
	require.Equal(t, "fr", locales.Locales[0].Locale)
	require.Equal(t, 2, locales.Locales[0].TotalStrings)
	require.Equal(t, 1, locales.Locales[0].TranslatedStrings)
	require.Equal(t, 1, locales.Locales[0].ApprovedStrings)
	require.Equal(t, 50, locales.Locales[0].TranslationProgress)

	f.exec(t, `INSERT INTO project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
		VALUES ($1, $2, 'fr', $3)`, f.actor.OrganizationID, f.project, home.ID)
	_, err = f.store.putTranslation(ctx, f.actor, f.project, home.ID, "fr", translationWrite{Text: "Maison", Status: "draft"})
	require.ErrorIs(t, err, errSegmentLocked)
	require.ErrorIs(t, f.store.deleteString(ctx, f.actor, f.project, home.ID), errSegmentLocked)

	_, err = f.store.createString(ctx, f.actor, f.project, stringCreate{Key: "home.title", SourceText: "Home", FilePath: ptr("en.json")})
	require.ErrorIs(t, err, errStringKeyConflict)

	tms := "project_" + uuid.NewString()[:8]
	f.exec(t, `INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales)
		VALUES ($1, $2, $3, 'Crowdin', $4, 'external_tms', 'en', '["fr"]'::jsonb)`,
		tms, f.actor.OrganizationID, f.actor.UserID, "C"+strings.ToUpper(uuid.NewString()[:8]))
	_, err = f.store.createString(ctx, f.actor, tms, stringCreate{Key: "x", SourceText: "X"})
	require.ErrorIs(t, err, errProjectNotNative)

	f.exec(t, `DELETE FROM project_cat_segment_locks WHERE external_string_id = $1`, home.ID)
	require.NoError(t, f.store.deleteString(ctx, f.actor, f.project, loose.ID))
	_, err = f.store.getString(ctx, f.actor, f.project, loose.ID)
	require.ErrorIs(t, err, errStringNotFound)
	require.ErrorIs(t, f.store.deleteString(ctx, f.actor, f.project, loose.ID), errStringNotFound)
}
