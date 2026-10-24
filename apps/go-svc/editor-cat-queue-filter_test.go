package main

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestParseEditorCatAdvancedFilter(t *testing.T) {
	empty, err := parseEditorCatAdvancedFilter("   ")
	require.NoError(t, err)
	require.Nil(t, empty)

	_, err = parseEditorCatAdvancedFilter("{")
	var catErr *editorCatError
	require.ErrorAs(t, err, &catErr)
	require.Equal(t, 400, catErr.status)
	require.Equal(t, "invalid_project_payload", catErr.code)

	_, err = parseEditorCatAdvancedFilter(strings.Repeat("x", 4097))
	require.ErrorAs(t, err, &catErr)
	require.Equal(t, 400, catErr.status)

	compacted, err := parseEditorCatAdvancedFilter(`{
		"addedFrom":"2026-02-31",
		"stringType":"nope",
		"translationStatus":"done",
		"qaIssueType":"unknown",
		"visibility":"all"
	}`)
	require.NoError(t, err)
	require.Nil(t, compacted)

	filter, err := parseEditorCatAdvancedFilter(`{
		"addedFrom":"2024-02-29",
		"addedTo":"2026-03-01",
		"updatedFrom":"2026-01-01",
		"updatedTo":"2026-01-31",
		"stringType":"icu",
		"translationStatus":"untranslated",
		"approvalStatus":"approved",
		"qaIssues":"with",
		"qaIssueType":"spelling",
		"comments":"without",
		"visibility":"hidden"
	}`)
	require.NoError(t, err)
	require.Equal(t, &editorCatAdvancedFilter{
		AddedFrom:         "2024-02-29",
		AddedTo:           "2026-03-01",
		UpdatedFrom:       "2026-01-01",
		UpdatedTo:         "2026-01-31",
		StringType:        "icu",
		TranslationStatus: "untranslated",
		ApprovalStatus:    "approved",
		QaIssues:          "with",
		QaIssueType:       "spelling",
		Comments:          "without",
		Visibility:        "hidden",
	}, filter)
}

func TestParseEditorCatQueueFilterQualifier(t *testing.T) {
	require.Equal(t, "spelling", parseEditorCatQueueFilterQualifier(" spelling "))
	require.Empty(t, parseEditorCatQueueFilterQualifier(""))
	require.Empty(t, parseEditorCatQueueFilterQualifier("not-a-qualifier"))
}

func TestEditorCatQueueNeedsLocale(t *testing.T) {
	require.True(t, editorCatQueueNeedsLocale(editorCatQueueQuery{queueFilter: "untranslated"}))
	require.False(t, editorCatQueueNeedsLocale(editorCatQueueQuery{queueFilter: "hidden"}))
	require.True(t, editorCatQueueNeedsLocale(editorCatQueueQuery{
		advancedFilter: &editorCatAdvancedFilter{TranslationStatus: "translated"},
	}))
	require.True(t, editorCatQueueNeedsLocale(editorCatQueueQuery{
		advancedFilter: &editorCatAdvancedFilter{Comments: "with"},
	}))
	require.False(t, editorCatQueueNeedsLocale(editorCatQueueQuery{
		advancedFilter: &editorCatAdvancedFilter{Visibility: "hidden"},
	}))
}

func TestAppendEditorCatQueueFilterSQL(t *testing.T) {
	where, args := appendEditorCatQueueFilterSQL("where org=$1 and project=$2", []any{"org", "proj"}, editorCatQueueQuery{
		targetLocale: "fr-FR",
		queueFilter:  "qa_issues",
		advancedFilter: &editorCatAdvancedFilter{
			AddedFrom:         "2026-01-01",
			StringType:        "plain",
			TranslationStatus: "translated",
			Visibility:        "visible",
		},
	}, 1, 2)
	require.Equal(t, []any{"org", "proj", "fr-FR", "2026-01-01"}, args)
	require.Contains(t, where, "t.target_locale=$3")
	require.Contains(t, where, "k.created_at >= CAST($4 AS date)")
	require.Contains(t, where, "k.type in ('text', 'plain', 'string')")
	require.Contains(t, where, "k.is_hidden = false")

	hiddenWhere, hiddenArgs := appendEditorCatQueueFilterSQL("where org=$1", []any{"org"}, editorCatQueueQuery{
		queueFilter:    "hidden",
		advancedFilter: &editorCatAdvancedFilter{Visibility: "hidden"},
	}, 1, 2)
	require.Equal(t, []any{"org"}, hiddenArgs)
	require.Contains(t, hiddenWhere, "k.is_hidden = true")
	require.NotContains(t, hiddenWhere, "target_locale")
}

func TestEditorCatDateBoundSQL(t *testing.T) {
	args := []any{"org"}
	require.Empty(t, editorCatDateBoundSQL("k.created_at", "", "", &args))
	require.Equal(t, []any{"org"}, args)

	sql := editorCatDateBoundSQL("k.updated_at", "2026-01-01", "2026-01-31", &args)
	require.Equal(t, []any{"org", "2026-01-01", "2026-01-31"}, args)
	require.Contains(t, sql, "k.updated_at >= CAST($2 AS date)")
	require.Contains(t, sql, "k.updated_at < (CAST($3 AS date) + interval '1 day')")
}

func TestEditorCatStringTypeSQL(t *testing.T) {
	require.Empty(t, editorCatStringTypeSQL("unknown"))
	require.Equal(t, " and k.type = 'plural'", editorCatStringTypeSQL("plural"))
	require.Equal(t, " and k.type in ('asset', 'image', 'video')", editorCatStringTypeSQL("asset"))
}

func TestEditorCatWholeFileDateMatches(t *testing.T) {
	day := time.Date(2026, 3, 2, 15, 0, 0, 0, time.UTC)
	require.True(t, editorCatWholeFileDateMatches(day, "", ""))
	require.True(t, editorCatWholeFileDateMatches(day, "2026-03-02", "2026-03-02"))
	require.False(t, editorCatWholeFileDateMatches(day, "2026-03-03", ""))
	require.False(t, editorCatWholeFileDateMatches(day, "", "2026-03-01"))
	require.False(t, editorCatWholeFileDateMatches(time.Time{}, "2026-03-01", ""))
	require.False(t, editorCatWholeFileDateMatches(day, "not-a-date", ""))
}

func TestEditorCatWholeFileApprovalAndTranslation(t *testing.T) {
	require.True(t, editorCatWholeFileTranslationMatches(false, ""))
	require.True(t, editorCatWholeFileTranslationMatches(false, "untranslated"))
	require.False(t, editorCatWholeFileTranslationMatches(true, "untranslated"))
	require.True(t, editorCatWholeFileTranslationMatches(true, "translated"))
	require.True(t, editorCatWholeFileApprovalMatches(true, "approved", "approved"))
	require.False(t, editorCatWholeFileApprovalMatches(true, "needs_review", "approved"))
	require.True(t, editorCatWholeFileApprovalMatches(true, "needs_review", "not_approved"))
	require.False(t, editorCatWholeFileApprovalMatches(false, "", "not_approved"))
}

func TestParseEditorCatAdvancedFilterErrorIsEditorCatFailure(t *testing.T) {
	_, err := parseEditorCatAdvancedFilter("{")
	require.True(t, errors.As(err, new(*editorCatError)))
}
