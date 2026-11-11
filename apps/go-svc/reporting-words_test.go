package main

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func seedReportingWords(t *testing.T) *testenv.Scope {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	_, err := scope.Pool.Exec(t.Context(), `update projects set name = 'Docs' where id = $1`, scope.ProjectID)
	require.NoError(t, err)
	return scope
}

func wordCounts(t *testing.T, scope *testenv.Scope, query string) map[string]any {
	t.Helper()
	return reportingReadJSON(t, scope, "admin", "/reports/words?"+reportingTestWeek+"&"+query)["wordCounts"].(map[string]any)
}

func wordSeries(t *testing.T, scope *testenv.Scope, query string) map[string]any {
	t.Helper()
	return reportingReadJSON(t, scope, "admin", "/reports/words/series?"+reportingTestWeek+"&"+query)["wordSeries"].(map[string]any)
}

func rowValues(rows any, keys ...string) [][]any {
	result := [][]any{}
	for _, row := range rows.([]any) {
		values := []any{}
		for _, key := range keys {
			values = append(values, row.(map[string]any)[key])
		}
		result = append(result, values)
	}
	return result
}

func groupKeys(series map[string]any, key string) []any {
	keys := []any{}
	for _, group := range series["groups"].([]any) {
		value := group.(map[string]any)[key]
		if value == nil {
			value = "Other"
		}
		keys = append(keys, value)
	}
	return keys
}

func units(values ...float64) []any {
	result := []any{}
	for _, value := range values {
		result = append(result, value)
	}
	return result
}

func point(start string, values ...float64) map[string]any {
	return map[string]any{"start": start, "units": units(values...)}
}

func TestReportingWordsAnswerInTheirOwnEnvelopes(t *testing.T) {
	scope := seedReportingWords(t)
	counts := reportingReadJSON(t, scope, "admin", "/reports/words?groupBy=task&unit=characters")["wordCounts"].(map[string]any)
	require.Equal(t, []any{}, counts["rows"])
	require.Equal(t, "task", counts["groupBy"])
	require.Equal(t, "characters", counts["unit"])
	require.Equal(t, "arrived", counts["mode"])
	require.Equal(t, map[string]any{}, counts["bandTotals"])
	// The page reads the chart apart, so the table's answer carries none.
	require.NotContains(t, counts, "series")
	for _, groupBy := range []string{"language", "task_step"} {
		require.Equal(t, []any{}, reportingReadJSON(t, scope, "admin", "/reports/words?groupBy="+groupBy)["wordCounts"].(map[string]any)["rows"])
	}
	// The chart is its own read: by project and the period's own bar length unless asked.
	series := reportingReadJSON(t, scope, "admin", "/reports/words/series")["wordSeries"].(map[string]any)
	require.Equal(t, "project", series["split"])
	require.Equal(t, "day", series["per"])
	require.Equal(t, []any{}, series["groups"])
	require.Len(t, series["points"], 28)
	// Over 45 days, weeks by default; with no project to read, every bar is still there, empty.
	long := reportingReadJSON(t, scope, "admin", "/reports/words/series?from=2026-04-01&to=2026-06-15")["wordSeries"].(map[string]any)
	require.Equal(t, "week", long["per"])
	require.Equal(t, point("2026-03-30"), long["points"].([]any)[0])
	monthly := reportingReadJSON(t, scope, "admin", "/reports/words/series?split=task_step&per=month&mode=finished")["wordSeries"].(map[string]any)
	require.Equal(t, "task_step", monthly["split"])
	require.Equal(t, "month", monthly["per"])
	require.Equal(t, "finished", monthly["mode"])

	for _, path := range []string{"/reports/words?unit=pages", "/reports/words?groupBy=file", "/reports/words/series?split=person", "/reports/words/series?per=quarter", "/reports/words?page=0"} {
		status, _ := reportingSend(t, scope, "admin", http.MethodGet, path, "")
		require.Equal(t, http.StatusBadRequest, status, path)
	}
	for _, role := range []string{"translator", "member"} {
		for _, path := range []string{"/reports/words", "/reports/words/series"} {
			status, _ := reportingSend(t, scope, role, http.MethodGet, path, "")
			require.Equal(t, http.StatusForbidden, status, role, path)
		}
	}
}

func TestReportingWordsGroupByWeekAndProjectWithTheWeeksInOrder(t *testing.T) {
	scope := seedReportingWords(t)
	other := mustReportingNamedProject(t, scope, "rp_other", "Other")
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: "2026-06-09", arrived: 10},
		{targetLocale: "fr-FR", day: "2026-06-11", arrived: 5},
		{projectID: other, targetLocale: "fr-FR", day: "2026-06-13", arrived: 7},
		{targetLocale: "fr-FR", day: "2026-06-03", arrived: 40},
	})
	counts := reportingReadJSON(t, scope, "admin", "/reports/words?from=2026-06-01&to=2026-06-14&groupBy=week")["wordCounts"].(map[string]any)
	// Weeks start on Monday: 1 June and 8 June 2026; projects by name within a week.
	require.Equal(t, [][]any{
		{"2026-06-01", "Docs", float64(40)},
		{"2026-06-08", "Docs", float64(15)},
		{"2026-06-08", "Other", float64(7)},
	}, rowValues(counts["rows"], "week", "projectName", "total"))
	require.Equal(t, float64(2), counts["groupCount"])
	require.Equal(t, float64(62), counts["total"])
}

func TestReportingWordSeriesChartsTheLargestFiveProjectsThenOtherWithEmptyWeeks(t *testing.T) {
	scope := seedReportingWords(t)
	ids := map[string]string{}
	for _, name := range []string{"Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"} {
		ids[name] = mustReportingNamedProject(t, scope, "rp_"+name, name)
	}
	// Three weeks up to "today" (15 June in these tests): the first and third have work.
	week1, week3 := "2026-05-26", "2026-06-10"
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: week1, arrived: 40},
		{projectID: ids["Alpha"], targetLocale: "fr-FR", day: week1, arrived: 30},
		{projectID: ids["Alpha"], targetLocale: "de-DE", day: week3, arrived: 5},
		{projectID: ids["Beta"], targetLocale: "fr-FR", day: week3, arrived: 20, finished: 9},
		{projectID: ids["Gamma"], targetLocale: "fr-FR", day: week1, arrived: 10},
		{projectID: ids["Delta"], targetLocale: "fr-FR", day: week3, arrived: 8},
		{projectID: ids["Epsilon"], targetLocale: "fr-FR", day: week1, arrived: 3},
		{projectID: ids["Zeta"], targetLocale: "fr-FR", day: week3, arrived: 2},
		// Outside the period.
		{projectID: ids["Zeta"], targetLocale: "fr-FR", day: "2026-06-30", arrived: 500},
	})
	read := func(query string) map[string]any {
		return reportingReadJSON(t, scope, "admin", "/reports/words/series?from=2026-05-25&to=2026-06-14&per=week&"+query)["wordSeries"].(map[string]any)
	}
	arrived := read("split=project")
	require.Equal(t, []any{"Docs", "Alpha", "Beta", "Gamma", "Delta", "Other"}, groupKeys(arrived, "name"))
	require.Equal(t, map[string]any{"key": nil, "name": nil, "other": true}, arrived["groups"].([]any)[5])
	// The middle week has nothing and is still a point; Other is Epsilon and Zeta together.
	require.Equal(t, []any{
		point("2026-05-25", 40, 30, 0, 10, 0, 3),
		point("2026-06-01", 0, 0, 0, 0, 0, 0),
		point("2026-06-08", 0, 5, 20, 0, 8, 2),
	}, arrived["points"])
	// Finished work is its own measure, with no Other when every project fits.
	finished := read("mode=finished")
	require.Equal(t, []any{map[string]any{"key": ids["Beta"], "name": "Beta", "other": false}}, finished["groups"])
	require.Equal(t, []any{point("2026-05-25", 0), point("2026-06-01", 0), point("2026-06-08", 9)}, finished["points"])
	// A language filter narrows every project; a project with nothing left drops out.
	german := read("targetLocale=de-DE")
	require.Equal(t, []any{"Alpha"}, groupKeys(german, "name"))
	require.Equal(t, []any{point("2026-05-25", 0), point("2026-06-01", 0), point("2026-06-08", 5)}, german["points"])
}

func TestReportingWordSeriesChartsLanguagesPerDayAndPerMonth(t *testing.T) {
	scope := seedReportingWords(t)
	var rows []reportingSummaryRow
	for i, locale := range []string{"da-DK", "de-DE", "es-ES", "fr-FR", "it-IT", "ja-JP", "nl-NL"} {
		day := "2026-06-10"
		if i%2 == 1 {
			day = "2026-06-09"
		}
		rows = append(rows, reportingSummaryRow{targetLocale: locale, day: day, arrived: 70 - i*10})
	}
	mustReportingSummary(t, scope, rows)
	daily := wordSeries(t, scope, "split=language&per=day")
	// Languages have no name of their own; Japanese and Dutch are the two smallest.
	require.Equal(t, []any{"da-DK", "de-DE", "es-ES", "fr-FR", "it-IT", "Other"}, groupKeys(daily, "key"))
	for _, group := range daily["groups"].([]any) {
		require.Nil(t, group.(map[string]any)["name"])
	}
	points := daily["points"].([]any)
	require.Len(t, points, 7)
	require.Equal(t, "2026-06-08", points[0].(map[string]any)["start"])
	require.Equal(t, units(0, 60, 0, 40, 0, 20), points[1].(map[string]any)["units"])
	require.Equal(t, units(70, 0, 50, 0, 30, 10), points[2].(map[string]any)["units"])
	// A month starts on its first day, before the period here.
	monthly := wordSeries(t, scope, "split=language&per=month")
	require.Equal(t, []any{point("2026-06-01", 70, 60, 50, 40, 30, 30)}, monthly["points"])
}

func TestReportingWordSeriesChartsMatchBandsInTiers(t *testing.T) {
	scope := seedReportingWords(t)
	day := "2026-06-10"
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: day, bucket: "repetition", arrived: 4},
		{targetLocale: "fr-FR", day: day, bucket: "100", arrived: 6},
		{targetLocale: "fr-FR", day: day, bucket: "85-94", arrived: 3},
		{targetLocale: "fr-FR", day: day, bucket: "75-84", arrived: 2},
		{targetLocale: "fr-FR", day: day, bucket: "new", arrived: 20},
		{targetLocale: "fr-FR", day: day, bucket: "unavailable", arrived: 1},
	})
	series := wordSeries(t, scope, "split=band&per=week")
	// No 95-99% or 50-74% work, so those tiers are left out; the order is fixed, not by size.
	require.Equal(t, []any{"exact", "fuzzy", "new"}, groupKeys(series, "key"))
	require.Equal(t, []any{point("2026-06-08", 10, 5, 21)}, series["points"])
}

func TestReportingWordsByTaskStepWithWorkOutsideAnyTaskApart(t *testing.T) {
	scope := seedReportingWords(t)
	translate := mustReportingTask(t, scope, "job_translate", scope.ProjectID, "translation", "running", "", "")
	postEdit := mustReportingTask(t, scope, "job_post_edit", scope.ProjectID, "proofread", "running", "", "edit")
	proofread := mustReportingTask(t, scope, "job_proofread", scope.ProjectID, "proofread", "running", "", "proofread")
	day := "2026-06-10"
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{jobID: translate, targetLocale: "fr-FR", day: day, arrived: 30},
		{jobID: postEdit, targetLocale: "fr-FR", day: day, step: "review", arrived: 12},
		{jobID: proofread, targetLocale: "de-DE", day: day, step: "review", arrived: 8},
		{jobID: proofread, targetLocale: "fr-FR", day: day, step: "review", arrived: 5},
		{targetLocale: "fr-FR", day: day, step: "review", arrived: 3},
	})
	// Review work: post-edit and proofread tasks, and editor work outside any task.
	series := wordSeries(t, scope, "step=review&split=task_step&per=week")
	require.Equal(t, []any{"post_edit", "proofread", "no_task"}, groupKeys(series, "key"))
	require.Equal(t, []any{point("2026-06-08", 12, 13, 3)}, series["points"])
	counts := wordCounts(t, scope, "step=review&groupBy=task_step")
	require.Equal(t, [][]any{
		{"post_edit", "fr-FR", float64(12)},
		{"proofread", "de-DE", float64(8)},
		{"proofread", "fr-FR", float64(5)},
		{"no_task", "fr-FR", float64(3)},
	}, rowValues(counts["rows"], "taskStep", "targetLocale", "total"))
	for _, row := range counts["rows"].([]any) {
		require.Nil(t, row.(map[string]any)["projectId"])
	}
	require.Equal(t, float64(3), counts["groupCount"])
	require.Equal(t, float64(28), counts["total"])
	// Translation work is the translate task's alone.
	translation := wordCounts(t, scope, "groupBy=task_step")
	require.Equal(t, [][]any{{"translate", float64(30)}}, rowValues(translation["rows"], "taskStep", "total"))
}

func TestReportingWordsTotalTaskStepRowsOncePerProjectAndReadADeletedTaskByItsPricingStep(t *testing.T) {
	scope := seedReportingWords(t)
	postEdit := mustReportingTask(t, scope, "job_post_edit", scope.ProjectID, "proofread", "running", "", "edit")
	proofread := mustReportingTask(t, scope, "job_proofread", scope.ProjectID, "proofread", "running", "", "proofread")
	day := "2026-06-10"
	// The same 12 words reviewed in two tasks, and 5 more reviewed and 7 translated in a task
	// deleted since.
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{jobID: postEdit, targetLocale: "fr-FR", day: day, step: "review", arrived: 12},
		{jobID: proofread, targetLocale: "fr-FR", day: day, step: "review", arrived: 12},
		{jobID: "job_deleted", targetLocale: "fr-FR", day: day, step: "review", arrived: 5},
		{jobID: "job_deleted", targetLocale: "fr-FR", day: day, arrived: 7},
	})
	// The per-project summary counts the string the two tasks share once.
	_, err := scope.Pool.Exec(t.Context(), `update reporting_daily_by_project set arrived_words = arrived_words - 12 where organization_id = $1 and step = 'review'`, scope.OrganizationID)
	require.NoError(t, err)
	counts := wordCounts(t, scope, "step=review&groupBy=task_step")
	require.Equal(t, [][]any{{"post_edit", float64(12)}, {"proofread", float64(17)}}, rowValues(counts["rows"], "taskStep", "total"))
	require.Equal(t, float64(17), counts["total"])
	require.Equal(t, map[string]any{"new": float64(17)}, counts["bandTotals"])
	// The same total as grouped by project; by language and in the charts but by task step,
	// each string once.
	require.Equal(t, float64(17), wordCounts(t, scope, "step=review&groupBy=project")["total"])
	require.Equal(t, [][]any{{float64(17)}}, rowValues(wordCounts(t, scope, "step=review&groupBy=language")["rows"], "total"))
	for _, split := range []string{"project", "language", "band"} {
		chart := wordSeries(t, scope, "step=review&split="+split+"&per=day")
		require.Equal(t, point(day, 17), chart["points"].([]any)[2], split)
	}
	// The deleted task's translation work is translate.
	require.Equal(t, [][]any{{"translate", float64(7)}}, rowValues(wordCounts(t, scope, "groupBy=task_step")["rows"], "taskStep", "total"))
	// A task filter reads that task alone, in the chart too.
	series := wordSeries(t, scope, "step=review&split=task_step&per=day&jobId="+postEdit)
	require.Equal(t, []any{"post_edit"}, groupKeys(series, "key"))
	require.Equal(t, point(day, 12), series["points"].([]any)[2])
}

func TestReportingWordSeriesChartsMonthsOfDifferentLengthsAndDaysFromThePeriodsFirstDay(t *testing.T) {
	scope := seedReportingWords(t)
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: "2026-05-31", arrived: 1},
		{targetLocale: "fr-FR", day: "2026-06-30", arrived: 2},
		{targetLocale: "fr-FR", day: "2026-07-01", arrived: 4},
	})
	// The period runs past "today" (15 June in these tests), so it ends there.
	read := func(per string) map[string]any {
		return reportingReadJSON(t, scope, "admin", "/reports/words/series?from=2026-05-20&to=2026-06-14&per="+per)["wordSeries"].(map[string]any)
	}
	monthly := read("month")
	require.Equal(t, []any{point("2026-05-01", 1), point("2026-06-01", 0)}, monthly["points"])
	// The period starts on a Wednesday; days start there, not on its week's Monday.
	daily := read("day")
	points := daily["points"].([]any)
	require.Equal(t, "2026-05-20", points[0].(map[string]any)["start"])
	require.Equal(t, "2026-06-14", points[len(points)-1].(map[string]any)["start"])
	require.Len(t, points, 26)
}

func TestReportingWordsGroupByLanguageAcrossProjects(t *testing.T) {
	scope := seedReportingWords(t)
	other := mustReportingNamedProject(t, scope, "rp_other", "Other")
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: "2026-06-09", bucket: "100", arrived: 10},
		{projectID: other, targetLocale: "fr-FR", day: "2026-06-10", arrived: 5},
		{projectID: other, targetLocale: "de-DE", day: "2026-06-10", arrived: 7},
	})
	counts := wordCounts(t, scope, "groupBy=language")
	require.Equal(t, [][]any{
		{"de-DE", nil, map[string]any{"new": float64(7)}},
		{"fr-FR", nil, map[string]any{"100": float64(10), "new": float64(5)}},
	}, rowValues(counts["rows"], "targetLocale", "projectId", "bands"))
	require.Equal(t, float64(2), counts["groupCount"])
	require.Equal(t, float64(22), counts["total"])
}

func TestReportingWordsCountByProjectAndLanguageInAnyUnit(t *testing.T) {
	scope := seedReportingWords(t)
	help := mustReportingNamedProject(t, scope, "rp_help", "Help centre")
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "ja-JP", bucket: "new", day: "2026-06-10", arrived: 12, arrivedStrings: 2, arrivedCharacters: 40, arrivedCharactersWithSpaces: 44},
		{targetLocale: "ja-JP", bucket: "100", day: "2026-06-12", arrived: 8, arrivedStrings: 1, arrivedCharacters: 30, arrivedCharactersWithSpaces: 33},
		{projectID: help, targetLocale: "fr-FR", day: "2026-06-11", arrived: 5, uncounted: 1},
	})
	characters := wordCounts(t, scope, "groupBy=project&unit=characters")
	require.Equal(t, []any{map[string]any{
		"week": nil, "projectId": scope.ProjectID, "projectName": "Docs", "jobId": nil, "jobTitle": nil, "taskStep": nil,
		"targetLocale": "ja-JP", "bands": map[string]any{"new": float64(40), "100": float64(30)}, "total": float64(70),
	}}, characters["rows"])
	require.Equal(t, map[string]any{"new": float64(40), "100": float64(30)}, characters["bandTotals"])
	require.Equal(t, float64(70), characters["total"])

	words := wordCounts(t, scope, "groupBy=project&unit=words")
	require.Equal(t, [][]any{{"Docs", float64(20)}, {"Help centre", float64(5)}}, rowValues(words["rows"], "projectName", "total"))
	require.Equal(t, float64(25), words["total"])
	require.Equal(t, float64(1), words["uncounted"])
	require.Equal(t, float64(2), words["groupCount"])
}

func TestReportingWordsPageTasksLargestFirstAndKeepTotalsAcrossEveryPage(t *testing.T) {
	scope := seedReportingWords(t)
	var rows []reportingSummaryRow
	var first string
	for i := range reportingWordCountPageSize + 2 {
		id := mustReportingTask(t, scope, fmt.Sprintf("job_%d", i), scope.ProjectID, "translation", "running", fmt.Sprintf("Task %d", i), "")
		if i == 0 {
			first = id
		}
		rows = append(rows, reportingSummaryRow{jobID: id, targetLocale: "fr-FR", day: "2026-06-10", finished: i + 1})
	}
	// Saved in the content editor outside any task.
	rows = append(rows, reportingSummaryRow{targetLocale: "fr-FR", day: "2026-06-10", finished: 1000})
	mustReportingSummary(t, scope, rows)
	query := "mode=finished&groupBy=task"
	page1 := wordCounts(t, scope, query+"&page=1")
	page1Rows := page1["rows"].([]any)
	require.Len(t, page1Rows, reportingWordCountPageSize)
	require.Nil(t, page1Rows[0].(map[string]any)["jobId"])
	require.Equal(t, float64(1000), page1Rows[0].(map[string]any)["total"])
	require.Equal(t, fmt.Sprintf("Task %d", reportingWordCountPageSize+1), page1Rows[1].(map[string]any)["jobTitle"])
	allWords := float64(1000 + (reportingWordCountPageSize+2)*(reportingWordCountPageSize+3)/2)
	require.Equal(t, float64(reportingWordCountPageSize+3), page1["groupCount"])
	require.Equal(t, allWords, page1["total"])
	require.Equal(t, float64(reportingWordCountPageSize), page1["pageSize"])

	page2 := wordCounts(t, scope, query+"&page=2")
	require.Equal(t, [][]any{{"Task 2"}, {"Task 1"}, {"Task 0"}}, rowValues(page2["rows"], "jobTitle"))
	require.Equal(t, allWords, page2["total"])

	// A download lists every task on one page.
	lines := reportingReadCSV(t, scope, "admin", "/reports/words?"+reportingTestWeek+"&"+query+"&format=csv")
	require.Equal(t, `"projectName","jobTitle","jobId","targetLocale","new","total"`, lines[0])
	require.Len(t, lines, reportingWordCountPageSize+4)

	// One task chosen: only its rows.
	one := wordCounts(t, scope, query+"&jobId="+first)
	require.Equal(t, [][]any{{first, float64(1)}}, rowValues(one["rows"], "jobId", "total"))
}

func TestReportingWordCountsCSVNamesEachRowByItsGrouping(t *testing.T) {
	str := func(s string) *string { return &s }
	row := func(fields reportingWordCountRow) reportingWordCountRow {
		base := reportingWordCountRow{ProjectID: str("project_web"), ProjectName: str("Web app"), TargetLocale: "de-DE", Bands: map[string]float64{"new": 10}, Total: 10}
		if fields.Week != nil {
			base.Week = fields.Week
		}
		if fields.JobID != nil {
			base.JobID, base.JobTitle = fields.JobID, fields.JobTitle
		}
		if fields.TaskStep != nil {
			base.TaskStep, base.ProjectID, base.ProjectName = fields.TaskStep, nil, nil
		}
		if fields.TargetLocale != "" {
			base.TargetLocale = fields.TargetLocale
		}
		if fields.Bands != nil {
			base.Bands = fields.Bands
		}
		if fields.Total != 0 {
			base.Total = fields.Total
		}
		return base
	}
	counts := func(groupBy string, rows ...reportingWordCountRow) reportingWordCounts {
		return reportingWordCounts{GroupBy: groupBy, Rows: rows, BandTotals: map[string]float64{"100": 5, "new": 25}, Total: 30}
	}
	require.Equal(t, []string{
		`"taskStep","targetLocale","100","new","total"`,
		`"post_edit","de-DE","5","5","10"`,
		`"no_task","fr-FR","0","20","20"`,
	}, reportingCSVLines(t, reportingWordCountsCSV(counts("task_step",
		row(reportingWordCountRow{TaskStep: str("post_edit"), Bands: map[string]float64{"100": 5, "new": 5}}),
		row(reportingWordCountRow{TaskStep: str("no_task"), TargetLocale: "fr-FR", Bands: map[string]float64{"new": 20}, Total: 20}),
	))))
	// A band only a task row holds still gets its column.
	bandOnly := counts("task", row(reportingWordCountRow{JobID: str("job_1"), Bands: map[string]float64{"95-99": 10}}))
	bandOnly.BandTotals = map[string]float64{}
	require.Equal(t, []string{
		`"projectName","jobTitle","jobId","targetLocale","95-99","total"`,
		`"Web app","","job_1","de-DE","10","10"`,
	}, reportingCSVLines(t, reportingWordCountsCSV(bandOnly)))
	require.Equal(t, []string{
		`"week","projectName","targetLocale","100","new","total"`,
		`"2026-10-12","Web app","de-DE","0","10","10"`,
	}, reportingCSVLines(t, reportingWordCountsCSV(counts("week", row(reportingWordCountRow{Week: str("2026-10-12")})))))
	require.Equal(t, []string{
		`"projectName","jobTitle","jobId","targetLocale","100","new","total"`,
		`"Web app","Release","job_1","de-DE","0","10","10"`,
	}, reportingCSVLines(t, reportingWordCountsCSV(counts("task", row(reportingWordCountRow{JobID: str("job_1"), JobTitle: str("Release")})))))
}
