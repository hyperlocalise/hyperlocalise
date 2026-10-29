package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
)

// Word counts for the Reports page, read from the daily summary only. Sums are read as float8
// so a large workspace's totals cannot overflow a 32-bit integer.

const (
	reportingWordCountPageSize = 50
	// How many projects or languages the volume chart shows on their own; the rest are one "Other".
	reportingWordCountChartGroups = 5
)

var (
	reportingWordCountGroupings = []string{"project", "task", "week", "language", "task_step"}
	reportingWordCountSplits    = []string{"project", "language", "band", "task_step"}
	reportingWordCountIntervals = []string{"day", "week", "month"}
	reportingWordModes          = []string{"arrived", "finished"}
	// The tiers the volume chart draws match bands in, strongest memory match first.
	reportingBandTierOrder = []string{"exact", "high", "fuzzy", "low", "new"}
	reportingBandTierOf    = map[string]string{
		"repetition": "exact", "100": "exact", "95-99": "high", "85-94": "fuzzy", "75-84": "fuzzy",
		"50-74": "low", "new": "new", "unavailable": "new",
	}
)

// reportingWordTaskStepSQL is what a by-task summary row's task is for; rows outside any task are
// no_task. A deleted task's work goes by the pricing step the rows are read for: review as
// proofread, the plain review task, and translation as translate.
func reportingWordTaskStepSQL(step string) string {
	deleted := "translate"
	if step == "review" {
		deleted = "proofread"
	}
	return fmt.Sprintf(`case when s.job_id is null then 'no_task' when j.id is null then '%s' else %s end`,
		deleted, reportingTaskStepSQL("j"))
}

const reportingTaskJoin = "left join jobs j on j.id = s.job_id"

type reportingWordFilters struct {
	from, to, projectID, jobID, targetLocale string
	unit, step, mode                         string
}

func (q *reportingQuery) wordFilters() reportingWordFilters {
	var filters reportingWordFilters
	filters.from, filters.to = q.dates()
	filters.projectID, filters.jobID, filters.targetLocale = q.scope()
	filters.unit = q.unit()
	filters.step = q.step("translation")
	filters.mode = q.choice("mode", "arrived", reportingWordModes...)
	return filters
}

type reportingWordCountRow struct {
	// The Monday of the week, as a date, when grouped by week; null otherwise.
	Week *string `json:"week"`
	// Null when grouped by language or by task step.
	ProjectID   *string `json:"projectId"`
	ProjectName *string `json:"projectName"`
	// Null for work saved in the content editor outside any task, and unless grouped by task.
	JobID *string `json:"jobId"`
	// Null when the task was deleted.
	JobTitle *string `json:"jobTitle"`
	// What the work's task is for, when grouped by task step; null otherwise.
	TaskStep     *string            `json:"taskStep"`
	TargetLocale string             `json:"targetLocale"`
	Bands        map[string]float64 `json:"bands"`
	Total        float64            `json:"total"`
}

type reportingWordCounts struct {
	Period     reportingPeriod         `json:"period"`
	Unit       string                  `json:"unit"`
	Step       string                  `json:"step"`
	Mode       string                  `json:"mode"`
	GroupBy    string                  `json:"groupBy"`
	Rows       []reportingWordCountRow `json:"rows"`
	BandTotals map[string]float64      `json:"bandTotals"`
	Total      float64                 `json:"total"`
	// Strings that arrived whose units could not be counted (only for mode arrived).
	Uncounted float64 `json:"uncounted"`
	// Tasks across every page when grouped by task; projects, weeks, languages or task steps for
	// the other groupings.
	GroupCount int `json:"groupCount"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
}

type reportingWordCountInput struct {
	scope   reportingScope
	period  reportingPeriod
	filters reportingWordFilters
	groupBy string
	page    int
	all     bool
}

// reportingWordFiltersSQL narrows summary rows (s) to the scope, step and period.
func reportingWordFiltersSQL(args *reportingArgs, in reportingWordCountInput, projectIDs []string) string {
	where := fmt.Sprintf("s.organization_id = %s and s.project_id = any(%s::text[])", args.add(in.scope.organizationID), args.add(projectIDs))
	if len(in.scope.jobIDs) > 0 {
		where += " and s.job_id = any(" + args.add(in.scope.jobIDs) + "::text[])"
	}
	if in.scope.targetLocale != "" {
		where += " and s.target_locale = " + args.add(in.scope.targetLocale)
	}
	return fmt.Sprintf("%s and s.step = %s and s.day between %s and %s", where, args.add(in.filters.step), args.add(in.period.From), args.add(in.period.To))
}

// queryReportingWordCounts reads units that arrived, or were finished, in a period, by match
// band and target language, grouped by project, by task, by week and project, by language alone,
// or by task step. Tasks come largest first, a page of 50 at a time; totals cover every page.
// Rows by task or by task step count a string in each task that holds it, so they can add up to
// more than the totals, which count it once per project.
func queryReportingWordCounts(ctx context.Context, db dictionaryDB, in reportingWordCountInput) (reportingWordCounts, error) {
	counts := reportingWordCounts{
		Period: in.period, Unit: in.filters.unit, Step: in.filters.step, Mode: in.filters.mode, GroupBy: in.groupBy,
		Rows: []reportingWordCountRow{}, BandTotals: map[string]float64{}, Page: in.page, PageSize: reportingWordCountPageSize,
	}
	projectIDs := in.scope.scopedProjectIDs()
	if len(projectIDs) == 0 {
		return counts, nil
	}
	var args reportingArgs
	column := reportingMeasure(in.filters.mode, in.filters.unit)
	filters := reportingWordFiltersSQL(&args, in, projectIDs)
	// Totals over every task can come from the smaller by-project table unless tasks are chosen.
	totalsTable := "reporting_daily_by_project s"
	if len(in.scope.jobIDs) > 0 {
		totalsTable = "reporting_daily_by_task s"
	}
	// Read from a bands table of bucket, units and uncounted strings.
	bandColumns := `(select json_object_agg(bucket, units::float8) filter (where units > 0) from bands) as band_totals,
        (select coalesce(sum(uncounted), 0) from bands)::float8 as uncounted`
	var statement string
	if in.groupBy != "task" {
		// Every grouping but by task is one grouping over a summary table: the totals table, or
		// the by-task table with each row's task for task steps.
		weekly, byTaskStep := in.groupBy == "week", in.groupBy == "task_step"
		byProject := in.groupBy == "project" || weekly
		week, project, taskStep, from := "null::date", "null::text", "null::text", totalsTable
		if weekly {
			week = "date_trunc('week', s.day)::date"
		}
		if byProject {
			project = "s.project_id"
		}
		if byTaskStep {
			taskStep = reportingWordTaskStepSQL(in.filters.step)
			from = "reporting_daily_by_task s " + reportingTaskJoin
		}
		// Task step rows count a string in each task that holds it; the totals, as By task's,
		// count it once per project.
		bands := "select bucket, sum(units) as units, sum(uncounted) as uncounted from grouped group by 1"
		if byTaskStep {
			bands = fmt.Sprintf("select s.bucket, sum(%s) as units, sum(s.arrived_uncounted) as uncounted from %s where %s group by 1", column, totalsTable, filters)
		}
		groupKey := map[string]string{"project": "project_id", "week": "week", "language": "target_locale", "task_step": "task_step"}[in.groupBy]
		statement = fmt.Sprintf(`
            with grouped as (
                select %s as week, %s as project_id, %s as task_step,
                    s.target_locale, s.bucket, sum(%s) as units, sum(s.arrived_uncounted) as uncounted
                from %s
                where %s
                group by 1, 2, 3, 4, 5
            ), bands as (%s)
            select (select count(*) from (
                    select %s from grouped group by 1 having sum(units) > 0
                ) groups)::integer as group_count, %s,
                (select coalesce(json_agg(json_build_object(
                    'week', g.week::text, 'projectId', g.project_id, 'jobId', null,
                    'taskStep', g.task_step, 'targetLocale', g.target_locale, 'bucket', g.bucket,
                    'units', g.units::float8
                  )), '[]') from grouped g where g.units > 0) as rows`,
			week, project, taskStep, column, from, filters, bands, groupKey, bandColumns)
	} else {
		// Tasks are ranked by a total each, and only the page's tasks are read in full, task by
		// task through the summary's task index.
		pageLimit := ""
		if !in.all {
			pageLimit = fmt.Sprintf("limit %d offset %d", reportingWordCountPageSize, (in.page-1)*reportingWordCountPageSize)
		}
		statement = fmt.Sprintf(`
            with task_totals as (
                select s.job_id, sum(%[1]s) as total from reporting_daily_by_task s where %[2]s
                group by 1 having sum(%[1]s) > 0
            ), page as (
                select job_id, total from task_totals order by total desc, job_id nulls first %[3]s
            ), page_rows as (
                select s.job_id, s.project_id, s.target_locale, s.bucket, sum(%[1]s) as units
                from page p cross join lateral (
                    select s.* from reporting_daily_by_task s where s.job_id = p.job_id and %[2]s
                    offset 0
                ) s
                group by 1, 2, 3, 4
                union all
                select null, s.project_id, s.target_locale, s.bucket, sum(%[1]s)
                from reporting_daily_by_task s
                where exists (select 1 from page where job_id is null) and s.job_id is null and %[2]s
                group by 2, 3, 4
            ), bands as (
                select s.bucket, sum(%[1]s) as units, sum(s.arrived_uncounted) as uncounted
                from %[4]s where %[2]s group by 1
            )
            select (select count(*) from task_totals)::integer as group_count, %[5]s,
                (select coalesce(json_agg(json_build_object(
                    'week', null, 'projectId', r.project_id, 'jobId', r.job_id, 'taskStep', null,
                    'targetLocale', r.target_locale, 'bucket', r.bucket, 'units', r.units::float8
                  ) order by p.total desc, p.job_id nulls first), '[]')
                  from page_rows r join page p on p.job_id is not distinct from r.job_id
                  where r.units > 0) as rows`,
			column, filters, pageLimit, totalsTable, bandColumns)
	}
	var bandTotals, rowsJSON []byte
	var uncounted float64
	if err := db.QueryRow(ctx, statement, args...).Scan(&counts.GroupCount, &bandTotals, &uncounted, &rowsJSON); err != nil {
		return counts, fmt.Errorf("read word counts: %w", err)
	}
	if bandTotals != nil {
		if err := json.Unmarshal(bandTotals, &counts.BandTotals); err != nil {
			return counts, fmt.Errorf("decode word count bands: %w", err)
		}
	}
	type unitRow struct {
		Week, ProjectID, JobID, TaskStep *string
		TargetLocale, Bucket             string
		Units                            float64
	}
	var rows []unitRow
	if err := json.Unmarshal(rowsJSON, &rows); err != nil {
		return counts, fmt.Errorf("decode word count rows: %w", err)
	}
	names, err := reportingGroupNames(ctx, db, rows, func(r unitRow) (*string, *string) { return r.ProjectID, r.JobID })
	if err != nil {
		return counts, err
	}
	// One row per week, task, project, task step and language, its bands as columns.
	merged := map[string]*reportingWordCountRow{}
	var order []string
	for _, row := range rows {
		key := strings.Join([]string{reportingOptional(row.Week), reportingOptional(row.JobID), reportingOptional(row.ProjectID), reportingOptional(row.TaskStep), row.TargetLocale}, "\x00")
		entry, ok := merged[key]
		if !ok {
			entry = &reportingWordCountRow{Week: row.Week, ProjectID: row.ProjectID, JobID: row.JobID, TaskStep: row.TaskStep, TargetLocale: row.TargetLocale, Bands: map[string]float64{}}
			if row.JobID != nil {
				entry.JobTitle = names.jobTitles[*row.JobID]
			}
			if row.ProjectID != nil {
				entry.ProjectName = names.projectNames[*row.ProjectID]
			}
			merged[key] = entry
			order = append(order, key)
		}
		entry.Bands[row.Bucket] += row.Units
		entry.Total += row.Units
	}
	for _, key := range order {
		counts.Rows = append(counts.Rows, *merged[key])
	}
	if in.groupBy != "task" {
		stepOrder := func(step *string) int {
			if step == nil {
				return -1
			}
			return slices.Index(reportingWordTaskSteps, *step)
		}
		slices.SortStableFunc(counts.Rows, func(a, b reportingWordCountRow) int {
			if c := compareReportingNames(reportingOptional(a.Week), reportingOptional(b.Week)); c != 0 {
				return c
			}
			if c := compareReportingNames(reportingOptional(a.ProjectName), reportingOptional(b.ProjectName)); c != 0 {
				return c
			}
			if c := stepOrder(a.TaskStep) - stepOrder(b.TaskStep); c != 0 {
				return c
			}
			return compareReportingNames(a.TargetLocale, b.TargetLocale)
		})
	}
	for _, bucket := range reportingMatchBucket {
		counts.Total += counts.BandTotals[bucket]
	}
	if in.filters.mode == "arrived" {
		counts.Uncounted = uncounted
	}
	if in.groupBy != "task" || in.all {
		counts.PageSize = counts.GroupCount
	}
	return counts, nil
}

type reportingGroupNameSet struct {
	jobTitles, projectNames map[string]*string
}

// reportingGroupNames looks up the titles of the tasks and the names of the projects rows name.
func reportingGroupNames[T any](ctx context.Context, db dictionaryDB, rows []T, ids func(T) (projectID, jobID *string)) (reportingGroupNameSet, error) {
	names := reportingGroupNameSet{jobTitles: map[string]*string{}, projectNames: map[string]*string{}}
	var jobIDs, projectIDs []string
	for _, row := range rows {
		projectID, jobID := ids(row)
		if jobID != nil && !slices.Contains(jobIDs, *jobID) {
			jobIDs = append(jobIDs, *jobID)
		}
		if projectID != nil && !slices.Contains(projectIDs, *projectID) {
			projectIDs = append(projectIDs, *projectID)
		}
	}
	fill := func(statement string, idList []string, into map[string]*string) error {
		if len(idList) == 0 {
			return nil
		}
		rows, err := db.Query(ctx, statement, idList)
		if err != nil {
			return fmt.Errorf("read report names: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var id, name string
			if err := rows.Scan(&id, &name); err != nil {
				return fmt.Errorf("scan report name: %w", err)
			}
			into[id] = &name
		}
		return rows.Err()
	}
	if err := fill("select j.id, "+reportingTaskTitleSQL("j")+" as title from jobs j where j.id = any($1::text[])", jobIDs, names.jobTitles); err != nil {
		return names, err
	}
	err := fill("select id, name from projects where id = any($1::text[])", projectIDs, names.projectNames)
	return names, err
}

type reportingSeriesGroup struct {
	Key   *string `json:"key"`
	Name  *string `json:"name"`
	Other bool    `json:"other"`
}

type reportingSeriesUnits struct {
	Start string    `json:"start"`
	Units []float64 `json:"units"`
}

type reportingWordSeries struct {
	Period reportingPeriod `json:"period"`
	Unit   string          `json:"unit"`
	Step   string          `json:"step"`
	Mode   string          `json:"mode"`
	Split  string          `json:"split"`
	Per    string          `json:"per"`
	// The series, bottom to top: the largest projects or languages over the period, largest
	// first, then "Other" when there are more; or each band tier or task step with units, in
	// their order. Key is the project id, language, band tier or task step; name a project's.
	Groups []reportingSeriesGroup `json:"groups"`
	// One point per day, week (its Monday) or month (its first day), with units in the order of
	// the groups.
	Points []reportingSeriesUnits `json:"points"`
}

// queryReportingWordSeries reads units that arrived, or were finished, each day, week or month
// of a period, split by project, language, band tier or task step, with a point for every day,
// week or month even when nothing happened. Weeks start on Monday and months on the first, in
// UTC; the first may begin before the period does. Split by task step, a string counts in each
// task that holds it, as the table grouped by task step counts it.
func queryReportingWordSeries(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, filters reportingWordFilters, split, per string) (reportingWordSeries, error) {
	series := reportingWordSeries{Period: period, Unit: filters.unit, Step: filters.step, Mode: filters.mode, Split: split, Per: per, Groups: []reportingSeriesGroup{}, Points: []reportingSeriesUnits{}}
	var args reportingArgs
	byTaskStep := split == "task_step"
	rows, ok := scope.summaryRows(&args, byTaskStep)
	column := reportingMeasure(filters.mode, filters.unit)
	start, starts := reportingSeriesBars(&args, per, period)
	key := map[string]string{"project": "s.project_id", "language": "s.target_locale", "band": "s.bucket", "task_step": reportingWordTaskStepSQL(filters.step)}[split]
	// No project the viewer can open: every bar, with nothing in it.
	grouped := "grouped as (select null::date as start, null::text as key, 0::numeric as units where false)"
	if ok {
		join := ""
		if byTaskStep {
			join = " " + reportingTaskJoin
		}
		// Each row's task is joined for its step. Grouping by task first was faster over a year
		// but slower over 90 days, where its sort spilled to disk.
		grouped = fmt.Sprintf(`grouped as (
            select %s as start, %s as key, sum(%s) as units
            from %s%s
            where %s and s.step = %s and s.day between %s and %s
            group by 1, 2 having sum(%s) > 0)`,
			start, key, column, rows.table, join, rows.where, args.add(filters.step), args.add(period.From), args.add(period.To), column)
	}
	// Projects and languages can be many, so the largest are kept and the rest drawn as one.
	ranks := split == "project" || split == "language"
	ranked, slot, joinRanked := "", "null::integer as slot, g.key", ""
	if ranks {
		ranked = `, ranked as (
            select key, (row_number() over (order by sum(units) desc, key))::integer as slot
            from grouped group by 1)`
		slot = "case when g.key is null then null else coalesce(r.slot, 0) end as slot, r.key"
		joinRanked = fmt.Sprintf("left join ranked r on r.key = g.key and r.slot <= %d", reportingWordCountChartGroups)
	}
	type seriesRow struct {
		start string
		// Projects and languages: 1 to 5 for the largest, 0 for the rest; nil for an empty bar.
		slot *int
		// The project or language for slots 1 to 5, else the band or task step; nil for the rest.
		key   *string
		units float64
	}
	result, err := db.Query(ctx, fmt.Sprintf(`
        with %s%s
        select b.start::date::text as start, %s, coalesce(sum(g.units), 0)::float8 as units
        from %s b(start)
        left join grouped g on g.start = b.start::date
        %s
        group by 1, 2, 3
        order by 1, 2`, grouped, ranked, slot, starts, joinRanked), args...)
	if err != nil {
		return series, fmt.Errorf("read word series: %w", err)
	}
	defer result.Close()
	var found []seriesRow
	for result.Next() {
		var row seriesRow
		if err := result.Scan(&row.start, &row.slot, &row.key, &row.units); err != nil {
			return series, fmt.Errorf("scan word series: %w", err)
		}
		found = append(found, row)
	}
	if err := result.Err(); err != nil {
		return series, fmt.Errorf("read word series: %w", err)
	}
	// Each row's series: by rank for projects and languages ("Other" last), else by fixed order.
	var seriesOf func(seriesRow) int
	if ranks {
		var slots []int
		keyOf := map[int]string{}
		for _, row := range found {
			if row.slot != nil && !slices.Contains(slots, *row.slot) {
				slots = append(slots, *row.slot)
				keyOf[*row.slot] = reportingOptional(row.key)
			}
		}
		slices.SortFunc(slots, func(a, b int) int {
			// "Other" (slot 0) last.
			if a == 0 || b == 0 {
				return b - a
			}
			return a - b
		})
		names := reportingGroupNameSet{projectNames: map[string]*string{}}
		if split == "project" {
			if names, err = reportingGroupNames(ctx, db, slots, func(slot int) (*string, *string) {
				if slot == 0 {
					return nil, nil
				}
				key := keyOf[slot]
				return &key, nil
			}); err != nil {
				return series, err
			}
		}
		position := map[int]int{}
		for i, s := range slots {
			position[s] = i
			if s == 0 {
				series.Groups = append(series.Groups, reportingSeriesGroup{Other: true})
				continue
			}
			key := keyOf[s]
			series.Groups = append(series.Groups, reportingSeriesGroup{Key: &key, Name: names.projectNames[key]})
		}
		seriesOf = func(row seriesRow) int {
			if row.slot == nil {
				return -1
			}
			return position[*row.slot]
		}
	} else {
		order := reportingWordTaskSteps
		seriesKey := func(key string) string { return key }
		if split == "band" {
			order = reportingBandTierOrder
			seriesKey = func(key string) string { return reportingBandTierOf[key] }
		}
		var present []string
		for _, name := range order {
			if slices.ContainsFunc(found, func(row seriesRow) bool { return row.key != nil && seriesKey(*row.key) == name }) {
				present = append(present, name)
				group := name
				series.Groups = append(series.Groups, reportingSeriesGroup{Key: &group})
			}
		}
		seriesOf = func(row seriesRow) int {
			if row.key == nil {
				return -1
			}
			return slices.Index(present, seriesKey(*row.key))
		}
	}
	points := map[string]int{}
	for _, row := range found {
		index, ok := points[row.start]
		if !ok {
			index = len(series.Points)
			points[row.start] = index
			series.Points = append(series.Points, reportingSeriesUnits{Start: row.start, Units: make([]float64, len(series.Groups))})
		}
		if at := seriesOf(row); at >= 0 {
			series.Points[index].Units[at] += row.units
		}
	}
	return series, nil
}

// words is the Word counts tab's table: units by match band, grouped as asked, a page of tasks
// at a time, or every row for a download.
func (api *reportingAPI) words(r *http.Request, actor reportingActor) (any, int, error) {
	q := readReportingQuery(r)
	filters := q.wordFilters()
	groupBy := q.choice("groupBy", "project", reportingWordCountGroupings...)
	page := q.page()
	format := q.format()
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var counts reportingWordCounts
	err := api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		counts, err = queryReportingWordCounts(ctx, db, reportingWordCountInput{
			scope:   view.scope(filters.projectID, filters.jobID, filters.targetLocale),
			period:  view.period(filters.from, filters.to),
			filters: filters, groupBy: groupBy, page: page, all: format == "csv",
		})
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if format == "csv" {
		return reportingWordCountsCSV(counts), http.StatusOK, nil
	}
	return map[string]any{"wordCounts": counts}, http.StatusOK, nil
}

// wordSeries is the Word counts tab's volume chart: units each day, week or month, split one way;
// by project and the period's own bar length unless asked.
func (api *reportingAPI) wordSeries(r *http.Request, actor reportingActor) (any, int, error) {
	q := readReportingQuery(r)
	filters := q.wordFilters()
	split := q.choice("split", "project", reportingWordCountSplits...)
	per := q.choice("per", "", reportingWordCountIntervals...)
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var series reportingWordSeries
	err := api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		period := view.period(filters.from, filters.to)
		if per == "" {
			per = period.Interval
		}
		series, err = queryReportingWordSeries(ctx, db, view.scope(filters.projectID, filters.jobID, filters.targetLocale), period, filters, split, per)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"wordSeries": series}, http.StatusOK, nil
}

// reportingWordCountsCSV names each row by its grouping, with only the bands that have units.
func reportingWordCountsCSV(counts reportingWordCounts) reportingCSV {
	return reportingCSV{filename: "word-counts.csv", write: func(w *reportingCSVWriter) error {
		// Rows by task or task step can hold a band the totals, counted once per project, do not.
		var bands []string
		for _, bucket := range reportingMatchBucket {
			if counts.BandTotals[bucket] > 0 || slices.ContainsFunc(counts.Rows, func(row reportingWordCountRow) bool { return row.Bands[bucket] > 0 }) {
				bands = append(bands, bucket)
			}
		}
		// By language and by task step, rows span projects, so they name none.
		groupBy := counts.GroupBy
		byProject := groupBy != "language" && groupBy != "task_step"
		cells := func(row *reportingWordCountRow) []string {
			var line []string
			add := func(header string, value func() string) {
				if row == nil {
					line = append(line, header)
				} else {
					line = append(line, value())
				}
			}
			if groupBy == "week" {
				add("week", func() string { return reportingOptional(row.Week) })
			}
			if byProject {
				add("projectName", func() string { return reportingOptional(row.ProjectName) })
			}
			if groupBy == "task" {
				add("jobTitle", func() string { return reportingOptional(row.JobTitle) })
				add("jobId", func() string { return reportingOptional(row.JobID) })
			}
			if groupBy == "task_step" {
				add("taskStep", func() string { return reportingOptional(row.TaskStep) })
			}
			add("targetLocale", func() string { return row.TargetLocale })
			for _, bucket := range bands {
				add(bucket, func() string { return reportingNumber(row.Bands[bucket]) })
			}
			add("total", func() string { return reportingNumber(row.Total) })
			return line
		}
		if err := w.row(cells(nil)...); err != nil {
			return err
		}
		for i := range counts.Rows {
			if err := w.row(cells(&counts.Rows[i])...); err != nil {
				return err
			}
		}
		return nil
	}}
}
