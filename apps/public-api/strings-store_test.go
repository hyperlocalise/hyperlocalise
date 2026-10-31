package main

import (
	"errors"
	"testing"
	"time"

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
