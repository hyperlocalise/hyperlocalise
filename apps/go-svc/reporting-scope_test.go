package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReportingScopedProjectIDsNeverWidenAccess(t *testing.T) {
	scope := reportingScope{projectIDs: []string{"project_a", "project_b"}}
	require.Equal(t, []string{"project_a", "project_b"}, scope.scopedProjectIDs())

	scope.projectID = "project_b"
	require.Equal(t, []string{"project_b"}, scope.scopedProjectIDs())

	scope.projectID = "project_other"
	require.Empty(t, scope.scopedProjectIDs())
}

func TestReportingSummaryRowsStayEmptyWhenTheViewerCannotOpenTheProject(t *testing.T) {
	scope := reportingScope{
		organizationID: "org_1",
		projectIDs:     []string{"project_a"},
		projectID:      "project_other",
		jobIDs:         []string{"job_1"},
		targetLocale:   "vi-VN",
	}
	var args reportingArgs
	rows, ok := scope.summaryRows(&args, true)
	require.False(t, ok)
	require.Empty(t, rows.table)
	require.Empty(t, args)
}

func TestReportingSummaryRowsUseTheByTaskTableWhenAJobIsChosen(t *testing.T) {
	scope := reportingScope{
		organizationID: "org_1",
		projectIDs:     []string{"project_a", "project_b"},
		projectID:      "project_a",
		jobIDs:         []string{"job_1"},
		targetLocale:   "vi-VN",
	}
	var args reportingArgs
	rows, ok := scope.summaryRows(&args, false)
	require.True(t, ok)
	require.Equal(t, "reporting_daily_by_task s", rows.table)
	require.Equal(t,
		"s.organization_id = $1 and s.project_id = any($2::text[]) and s.job_id = any($3::text[]) and s.target_locale = $4",
		rows.where,
	)
	require.Equal(t, []any{"org_1", []string{"project_a"}, []string{"job_1"}, "vi-VN"}, []any(args))
}

func TestReportingValidTextRejectsNulAndInvalidUtf8(t *testing.T) {
	require.True(t, reportingValidText("Reports"))
	require.False(t, reportingValidText("bad\x00name"))
	require.False(t, reportingValidText(string([]byte{0xff, 0xfe})))
}

func TestReportingSummaryRowsStayOnTheProjectTableWithoutATaskFilter(t *testing.T) {
	scope := reportingScope{
		organizationID: "org_1",
		projectIDs:     []string{"project_a"},
	}
	var args reportingArgs
	rows, ok := scope.summaryRows(&args, false)
	require.True(t, ok)
	require.Equal(t, "reporting_daily_by_project s", rows.table)
	require.Equal(t, "s.organization_id = $1 and s.project_id = any($2::text[])", rows.where)
	require.Equal(t, []any{"org_1", []string{"project_a"}}, []any(args))
}
