package main

import (
	"fmt"
	"slices"
	"strconv"
)

// What a Reports section is limited to. projectIDs are the projects the viewer can open; the
// filters narrow them and never widen them.
type reportingScope struct {
	organizationID string
	projectIDs     []string
	projectID      string
	jobIDs         []string
	targetLocale   string
}

// scopedProjectIDs are the projects a section reads: the accessible ones, or the filtered one if
// it is accessible.
func (s reportingScope) scopedProjectIDs() []string {
	if s.projectID == "" {
		return s.projectIDs
	}
	if slices.Contains(s.projectIDs, s.projectID) {
		return []string{s.projectID}
	}
	return []string{}
}

// reportingArgs numbers a statement's parameters as they are added.
type reportingArgs []any

func (a *reportingArgs) add(value any) string {
	*a = append(*a, value)
	return "$" + strconv.Itoa(len(*a))
}

// reportingSummaryRows names the daily summary rows a section reads (`s`): by project unless a
// task is chosen or byTask is asked for, since only the by-task table has tasks. Nothing when the
// viewer can open none of the chosen projects.
type reportingSummaryRows struct {
	table, where string
}

func (s reportingScope) summaryRows(args *reportingArgs, byTask bool) (reportingSummaryRows, bool) {
	projectIDs := s.scopedProjectIDs()
	if len(projectIDs) == 0 {
		return reportingSummaryRows{}, false
	}
	rows := reportingSummaryRows{table: "reporting_daily_by_project s"}
	if byTask || len(s.jobIDs) > 0 {
		rows.table = "reporting_daily_by_task s"
	}
	rows.where = fmt.Sprintf("s.organization_id = %s and s.project_id = any(%s::text[])",
		args.add(s.organizationID), args.add(projectIDs))
	if len(s.jobIDs) > 0 {
		rows.where += " and s.job_id = any(" + args.add(s.jobIDs) + "::text[])"
	}
	if s.targetLocale != "" {
		rows.where += " and s.target_locale = " + args.add(s.targetLocale)
	}
	return rows, true
}
