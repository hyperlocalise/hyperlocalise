package main

import (
	"errors"
	"fmt"
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

	mixedDates, err := parseEditorCatAdvancedFilter(`{
		"addedFrom":"2026-02-29",
		"addedTo":"2026-02-28",
		"updatedFrom":"2026-1-01",
		"updatedTo":"2100-02-29"
	}`)
	require.NoError(t, err)
	require.Equal(t, &editorCatAdvancedFilter{AddedTo: "2026-02-28"}, mixedDates)

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

func TestValidEditorCatISODate(t *testing.T) {
	cases := []struct {
		value string
		want  bool
	}{
		{"2026-01-01", true},
		{"2026-12-31", true},
		{"0000-01-01", true},
		{"9999-12-31", true},
		{"2024-02-29", true},
		{"2000-02-29", true},
		{"1600-02-29", true},
		{"2026-02-28", true},
		{"2026-04-30", true},
		{"2026-06-30", true},
		{"2026-09-30", true},
		{"2026-11-30", true},
		{"2026-01-31", true},
		{"2026-03-31", true},
		{"2026-05-31", true},
		{"2026-07-31", true},
		{"2026-08-31", true},
		{"2026-10-31", true},

		{"2026-02-29", false},
		{"1900-02-29", false},
		{"2100-02-29", false},
		{"2024-02-30", false},
		{"2026-02-31", false},
		{"2026-04-31", false},
		{"2026-06-31", false},
		{"2026-09-31", false},
		{"2026-11-31", false},
		{"2026-01-32", false},
		{"2026-00-10", false},
		{"2026-13-01", false},
		{"2026-99-01", false},
		{"2026-01-00", false},
		{"2026-01-99", false},

		{"", false},
		{"2026-1-01", false},
		{"2026-01-1", false},
		{"26-01-01", false},
		{"02026-01-01", false},
		{"2026-01-011", false},
		{" 2026-01-01", false},
		{"2026-01-01 ", false},
		{"2026/01/01", false},
		{"2026_01_01", false},
		{"20260-1-01", false},
		{"2026--01-01", false},
		{"+026-01-01", false},
		{"-026-01-01", false},
		{"2026-+1-01", false},
		{"2026-01-+1", false},
		{"2026-0a-01", false},
		{"2026-01-0a", false},
		{"20x6-01-01", false},
		{"2026-01-01T00:00:00Z", false},
		{"2026-01-01Z", false},
		{"2026-01-/1", false},
		{"2026-01-:1", false},
		{"２026-01-01", false},
		{"2026-01-0\x00", false},
		{"2026-01-0\xff", false},
	}
	for _, tc := range cases {
		require.Equalf(t, tc.want, validEditorCatISODate(tc.value), "value %q", tc.value)
	}
}

func referenceEditorCatISODate(value string) bool {
	if len(value) != 10 || value[4] != '-' || value[7] != '-' {
		return false
	}
	for i := 0; i < len(value); i++ {
		if i == 4 || i == 7 {
			continue
		}
		if value[i] < '0' || value[i] > '9' {
			return false
		}
	}
	_, err := time.Parse(time.DateOnly, value)
	return err == nil
}

func TestValidEditorCatISODateMatchesTimeParse(t *testing.T) {
	years := []int{0, 1, 4, 100, 400, 1582, 1600, 1700, 1800, 1900, 1999, 2000, 2023, 2024, 2025, 2026, 2100, 2400, 9996, 9999}
	for _, year := range years {
		for month := 0; month <= 99; month++ {
			for day := 0; day <= 99; day++ {
				value := fmt.Sprintf("%04d-%02d-%02d", year, month, day)
				require.Equalf(t, referenceEditorCatISODate(value), validEditorCatISODate(value), "value %q", value)
			}
		}
	}
}

func FuzzValidEditorCatISODate(f *testing.F) {
	for _, seed := range []string{"2024-02-29", "2026-02-29", "0000-01-01", "9999-12-31", "2026-13-01", "2026/01/01", "", "2026-01-0\xff"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, value string) {
		if got, want := validEditorCatISODate(value), referenceEditorCatISODate(value); got != want {
			t.Fatalf("validEditorCatISODate(%q) = %v, want %v", value, got, want)
		}
	})
}

func TestParseEditorCatQueueFilterQualifier(t *testing.T) {
	require.Equal(t, "spelling", parseEditorCatQueueFilterQualifier(" spelling "))
	require.Empty(t, parseEditorCatQueueFilterQualifier(""))
	require.Empty(t, parseEditorCatQueueFilterQualifier("not-a-qualifier"))
}

func TestEditorCatQueueNeedsLocale(t *testing.T) {
	require.True(t, editorCatQueueNeedsLocale(editorCatQueueQuery{queueFilter: "untranslated"}))
	require.True(t, editorCatQueueNeedsLocale(editorCatQueueQuery{queueFilter: "origin"}))
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

	originWhere, originArgs := appendEditorCatQueueFilterSQL("where org=$1 and project=$2", []any{"org", "proj"}, editorCatQueueQuery{
		targetLocale:         "fr-FR",
		queueFilter:          "origin",
		queueFilterQualifier: "machine_post_edited",
	}, 1, 2)
	require.Equal(t, []any{"org", "proj", "fr-FR", "machine_post_edited"}, originArgs)
	require.Contains(t, originWhere, "t.target_locale=$3")
	require.Contains(t, originWhere, "t.origin::text=$4")

	anyOriginWhere, anyOriginArgs := appendEditorCatQueueFilterSQL("where org=$1 and project=$2", []any{"org", "proj"}, editorCatQueueQuery{
		targetLocale: "de",
		queueFilter:  "origin",
	}, 1, 2)
	require.Equal(t, []any{"org", "proj", "de"}, anyOriginArgs)
	require.Contains(t, anyOriginWhere, "trim(t.text) != ''")
	require.NotContains(t, anyOriginWhere, "t.origin::text=")
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

func TestEditorCatAdvancedFilterSQLBranches(t *testing.T) {
	require.Empty(t, editorCatAdvancedFilterSQL(nil, 1, 2, 3, &[]any{}))

	args := []any{"org", "proj", "fr"}
	sql := editorCatAdvancedFilterSQL(&editorCatAdvancedFilter{
		UpdatedFrom:       "2026-02-01",
		UpdatedTo:         "2026-02-28",
		StringType:        "asset",
		TranslationStatus: "partially_translated",
		ApprovalStatus:    "approved",
		QaIssues:          "with",
		QaIssueType:       "spelling",
		Comments:          "with",
		Visibility:        "hidden",
	}, 1, 2, 3, &args)
	require.Equal(t, []any{"org", "proj", "fr", "2026-02-01", "2026-02-28", "spelling"}, args)
	require.Contains(t, sql, "k.updated_at >= CAST($4 AS date)")
	require.Contains(t, sql, "k.type in ('asset', 'image', 'video')")
	require.Contains(t, sql, "exists (select 1 from project_translations t where")
	require.Contains(t, sql, "t.status='approved'")
	require.Contains(t, sql, "q.check_type=$6")
	require.Contains(t, sql, "from project_translation_comments c")
	require.Contains(t, sql, "k.is_hidden = true")

	partial := editorCatAdvancedFilterSQL(&editorCatAdvancedFilter{
		ApprovalStatus: "partially_approved",
	}, 1, 2, 3, &[]any{"org", "proj", "fr"})
	require.Contains(t, partial, "t.status != 'approved'")
}

func TestEditorCatQueueKindAndDownloadPath(t *testing.T) {
	require.Equal(t, "all_files", editorCatQueueKind("*"))
	require.Equal(t, "office", editorCatQueueKind("brief.docx"))
	require.Equal(t, "pdf", editorCatQueueKind("docs/Handbook.PDF"))
	require.Equal(t, "whole_file", editorCatQueueKind("hero.png"))
	require.Equal(t, "document", editorCatQueueKind("guide.md"))
	require.Equal(t, "text", editorCatQueueKind("locales/en.json"))

	path := editorCatGeneratedDownloadPath("acme/prod", "proj 1", "a b.json", "pt-BR")
	require.Equal(t, "/api/orgs/acme%2Fprod/projects/proj%201/files/translations/download?sourcePath=a+b.json&locale=pt-BR", path)
}

func TestEditorCatAdvancedFilterTagsAndJob(t *testing.T) {
	filter, err := parseEditorCatAdvancedFilter(`{
		"includeLabelMode":"include_any",
		"includeLabelIds":["checkout","checkout","has space","release-7"],
		"excludeLabelIds":["old"],
		"jobId":" job_1 "
	}`)
	require.NoError(t, err)
	require.Equal(t, &editorCatAdvancedFilter{
		IncludeLabelMode: "include_any",
		IncludeLabelIDs:  []string{"checkout", "release-7"},
		ExcludeLabelMode: "exclude_all",
		ExcludeLabelIDs:  []string{"old"},
		JobID:            "job_1",
	}, filter)

	args := []any{"org", "proj"}
	sql := editorCatAdvancedFilterSQL(filter, 1, 2, 0, &args)
	require.Equal(t, []any{"org", "proj", []string{"checkout", "release-7"}, []string{"old"}, "job_1"}, args)
	require.Contains(t, sql, "k.tags && $3::text[]")
	require.Contains(t, sql, "not (k.tags @> $4::text[])")
	require.Contains(t, sql, "jk.job_id = $5 and jk.translation_key_id = k.id")
	jobOnly := &editorCatAdvancedFilter{JobID: "job_1"}
	where, _ := appendEditorCatQueueFilterSQL("", []any{"org", "proj"}, editorCatQueueQuery{advancedFilter: jobOnly}, 1, 2)
	require.Contains(t, where, "k.is_hidden = false")
	hiddenPreset, _ := appendEditorCatQueueFilterSQL("", []any{"org", "proj"}, editorCatQueueQuery{advancedFilter: jobOnly, queueFilter: "hidden"}, 1, 2)
	require.Contains(t, hiddenPreset, "k.is_hidden = true")
	require.NotContains(t, hiddenPreset, "k.is_hidden = false")
	hiddenAdvanced, _ := appendEditorCatQueueFilterSQL("", []any{"org", "proj"}, editorCatQueueQuery{
		advancedFilter: &editorCatAdvancedFilter{JobID: "job_1", Visibility: "hidden"},
	}, 1, 2)
	require.NotContains(t, hiddenAdvanced, "k.is_hidden = false")

	allOf := editorCatAdvancedFilterSQL(&editorCatAdvancedFilter{
		IncludeLabelIDs: []string{"a"}, IncludeLabelMode: "include_all",
		ExcludeLabelIDs: []string{"b"}, ExcludeLabelMode: "exclude_any",
	}, 1, 2, 0, &[]any{"org", "proj"})
	require.Contains(t, allOf, "k.tags @> $3::text[]")
	require.Contains(t, allOf, "not (k.tags && $4::text[])")

	require.False(t, editorCatWholeFileMatchesAdvanced(editorCatWholeFileSubject{}, &editorCatAdvancedFilter{JobID: "job_1"}))
	require.False(t, editorCatWholeFileMatchesAdvanced(editorCatWholeFileSubject{}, &editorCatAdvancedFilter{IncludeLabelIDs: []string{"a"}}))
	require.False(t, editorCatWholeFileMatchesAdvanced(editorCatWholeFileSubject{}, &editorCatAdvancedFilter{ExcludeLabelIDs: []string{"a"}}))
}
