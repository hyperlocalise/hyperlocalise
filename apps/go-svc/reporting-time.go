package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strconv"
)

// Time for the Reports page: time people logged on tasks, and how long automated work ran.
// Logged time counts each entry on its work date; automated time on the day the work finished.

const reportingLoggedTimePageSize = 50

var (
	reportingTaskSteps     = []string{"translate", "post_edit", "proofread", "other"}
	reportingWordTaskSteps = []string{"translate", "post_edit", "proofread", "other", "no_task"}
	reportingTaskRunStages = []string{"preparing", "reusing_memory", "translating", "finishing", "other"}
)

// reportingTaskStepSQL is what a task is for: post-edit for a proofread-kind task a visual
// workflow made for editing machine output, proofread for the other tasks that review, translate
// for translation tasks, other for the rest (research, sync, assets). alias names a jobs row,
// which may be missing (a deleted task): then translate.
func reportingTaskStepSQL(alias string) string {
	return fmt.Sprintf(`case
        when %[1]s.kind = 'proofread' and %[1]s.input_payload->'metadata'->>'workflowTaskStep' = 'edit' then 'post_edit'
        when %[1]s.kind in ('proofread', 'review') then 'proofread'
        when %[1]s.kind = 'translation' or %[1]s.kind is null then 'translate'
        else 'other' end`, alias)
}

// reportingDayStart and reportingDayEnd are the first instant of a UTC day, and the first after it.
func reportingDayStart(param string) string {
	return "(" + param + "::date::timestamp at time zone 'UTC')"
}

func reportingDayEnd(param string) string {
	return "((" + param + "::date + 1)::timestamp at time zone 'UTC')"
}

type reportingLoggedTimeRow struct {
	JobID string `json:"jobId"`
	// Null when the task was deleted.
	JobTitle  *string `json:"jobTitle"`
	ProjectID string  `json:"projectId"`
	// What the task is for: translate, post-edit or proofread.
	TaskStep string `json:"taskStep"`
	// The step the time is costed as: translation or review.
	Step         string  `json:"step"`
	TargetLocale string  `json:"targetLocale"`
	Minutes      float64 `json:"minutes"`
	People       int     `json:"people"`
}

type reportingLoggedTimeTotals struct {
	Minutes float64 `json:"minutes"`
	People  int     `json:"people"`
	Tasks   int     `json:"tasks"`
}

type reportingLoggedTime struct {
	Rows            []reportingLoggedTimeRow  `json:"rows"`
	RowCount        int                       `json:"rowCount"`
	Page            int                       `json:"page"`
	PageSize        int                       `json:"pageSize"`
	Totals          reportingLoggedTimeTotals `json:"totals"`
	PreviousMinutes float64                   `json:"previousMinutes"`
}

// reportingLoggedTimeWhere narrows time entries to a scope and days; contributorID narrows them
// to one person, a viewer who may not see what others' work costs.
func reportingLoggedTimeWhere(args *reportingArgs, scope reportingScope, projectIDs []string, from, to, contributorID string) string {
	where := fmt.Sprintf("e.organization_id = %s and e.project_id = any(%s::text[]) and not e.voided and e.work_date >= %s and e.work_date < %s",
		args.add(scope.organizationID), args.add(projectIDs), reportingDayStart(args.add(from)), reportingDayEnd(args.add(to)))
	if len(scope.jobIDs) > 0 {
		where += " and e.job_id = any(" + args.add(scope.jobIDs) + "::text[])"
	}
	if scope.targetLocale != "" {
		where += " and e.target_locale = " + args.add(scope.targetLocale)
	}
	if contributorID != "" {
		where += " and e.contributor_id = " + args.add(contributorID)
	}
	return where
}

// queryReportingLoggedTime reads time logged in a period by task, step and language, most time
// first, 50 rows a page, or every row on one page for a download.
func queryReportingLoggedTime(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, page int, all bool, contributorID string) (reportingLoggedTime, error) {
	time := reportingLoggedTime{Rows: []reportingLoggedTimeRow{}, Page: page, PageSize: reportingLoggedTimePageSize}
	projectIDs := scope.scopedProjectIDs()
	if len(projectIDs) == 0 {
		return time, nil
	}
	var args reportingArgs
	current := reportingLoggedTimeWhere(&args, scope, projectIDs, period.From, period.To, contributorID)
	limit := ""
	if !all {
		limit = fmt.Sprintf("limit %d offset %d", reportingLoggedTimePageSize, (page-1)*reportingLoggedTimePageSize)
	}
	previous := reportingLoggedTimeWhere(&args, scope, projectIDs, period.PreviousFrom, period.PreviousTo, contributorID)
	var rows, totals []byte
	err := db.QueryRow(ctx, fmt.Sprintf(`
        with grouped as (
            select e.job_id, e.project_id, e.step, e.target_locale, sum(e.minutes) as minutes,
                count(distinct e.contributor_id) as people
            from reporting_time_entries e where %[1]s
            group by 1, 2, 3, 4
        ), page as (
            select * from grouped order by minutes desc, job_id, step, target_locale %[2]s
        )
        select
            (select coalesce(json_agg(json_build_object(
                'jobId', p.job_id, 'jobTitle', %[3]s, 'projectId', p.project_id,
                'taskStep', %[4]s, 'step', p.step, 'targetLocale', p.target_locale,
                'minutes', p.minutes::float8, 'people', p.people
              ) order by p.minutes desc, p.job_id, p.step, p.target_locale), '[]')
              from page p left join jobs j on j.id = p.job_id) as rows,
            (select count(*) from grouped)::integer as row_count,
            (select json_build_object(
                'minutes', coalesce(sum(e.minutes), 0)::float8,
                'people', count(distinct e.contributor_id),
                'tasks', count(distinct e.job_id))
              from reporting_time_entries e where %[1]s) as totals,
            (select coalesce(sum(e.minutes), 0)::float8 from reporting_time_entries e where %[5]s) as previous_minutes`,
		current, limit, reportingTaskTitleSQL("j"), reportingTaskStepSQL("j"), previous), args...).
		Scan(&rows, &time.RowCount, &totals, &time.PreviousMinutes)
	if err != nil {
		return time, fmt.Errorf("read logged time: %w", err)
	}
	if err := json.Unmarshal(rows, &time.Rows); err != nil {
		return time, fmt.Errorf("decode logged time: %w", err)
	}
	if err := json.Unmarshal(totals, &time.Totals); err != nil {
		return time, fmt.Errorf("decode logged time totals: %w", err)
	}
	if all {
		time.PageSize = time.RowCount
	}
	return time, nil
}

type reportingWorkflowStepTime struct {
	NodeType     string  `json:"nodeType"`
	Milliseconds float64 `json:"milliseconds"`
	Runs         int     `json:"runs"`
}

type reportingStageTime struct {
	Stage        string  `json:"stage"`
	Milliseconds float64 `json:"milliseconds"`
}

// reportingTaskRuns are runs of translation tasks, from start to finish, and the same time by
// stage (every stage, in order, other included). With a language chosen, only runs that reached
// that language count; reusing_memory and translating are that language's own, the other stages
// and the total the whole run's, and other is 0.
type reportingTaskRuns struct {
	Milliseconds float64              `json:"milliseconds"`
	Runs         int                  `json:"runs"`
	Stages       []reportingStageTime `json:"stages"`
}

type reportingAutomatedTime struct {
	// Visual workflow steps, by step type.
	WorkflowSteps []reportingWorkflowStepTime `json:"workflowSteps"`
	TaskRuns      reportingTaskRuns           `json:"taskRuns"`
}

func reportingNoTaskRuns() reportingTaskRuns {
	stages := make([]reportingStageTime, 0, len(reportingTaskRunStages))
	for _, stage := range reportingTaskRunStages {
		stages = append(stages, reportingStageTime{Stage: stage})
	}
	return reportingTaskRuns{Stages: stages}
}

// queryReportingAutomatedTime reads how long automated work that finished in a period ran.
// Workflows outside any project are counted only when includeUnattributed is set; test runs
// with mock data never are.
func queryReportingAutomatedTime(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, includeUnattributed bool) (reportingAutomatedTime, error) {
	projectIDs := scope.scopedProjectIDs()
	var args reportingArgs
	start, end := reportingDayStart(args.add(period.From)), reportingDayEnd(args.add(period.To))
	projectFilter := "false"
	if len(projectIDs) > 0 {
		projectFilter = "w.project_id = any(" + args.add(projectIDs) + "::text[])"
	}
	workflowProjects := projectFilter
	if includeUnattributed && scope.projectID == "" {
		workflowProjects = "(" + projectFilter + " or w.project_id is null)"
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select n.node_type,
            (sum(extract(epoch from n.finished_at - n.started_at)) * 1000)::float8 as milliseconds,
            count(*)::integer as runs
        from visual_workflow_node_runs n
        join visual_workflow_runs r on r.id = n.run_id
        join visual_workflows w on w.id = r.visual_workflow_id
        where n.organization_id = %s
            and n.finished_at >= %s and n.finished_at < %s and n.started_at is not null
            and r.mode = 'live' and %s
        group by 1 order by 2 desc, 1`, args.add(scope.organizationID), start, end, workflowProjects), args...)
	if err != nil {
		return reportingAutomatedTime{}, fmt.Errorf("read workflow step time: %w", err)
	}
	defer rows.Close()
	automated := reportingAutomatedTime{WorkflowSteps: []reportingWorkflowStepTime{}, TaskRuns: reportingNoTaskRuns()}
	for rows.Next() {
		var step reportingWorkflowStepTime
		if err := rows.Scan(&step.NodeType, &step.Milliseconds, &step.Runs); err != nil {
			return automated, fmt.Errorf("scan workflow step time: %w", err)
		}
		automated.WorkflowSteps = append(automated.WorkflowSteps, step)
	}
	if err := rows.Err(); err != nil {
		return automated, fmt.Errorf("read workflow step time: %w", err)
	}
	rows.Close()
	if len(projectIDs) > 0 {
		if automated.TaskRuns, err = queryReportingTaskRuns(ctx, db, scope, projectIDs, period); err != nil {
			return automated, err
		}
	}
	return automated, nil
}

// queryReportingTaskRuns reads translation task runs that ended in the period: the run from its
// first event to its last, and the time between the stage boundaries the file translation
// workflow records (job_started, strings_extracted, translations_reused and locale_progress per
// language, job_succeeded or job_failed). Languages run side by side, so translating runs from
// the last memory reuse to the last language's last progress; the languages' finished events are
// written together after every file is stored, so they mark nothing per language. Only runs with
// a job_started event count: a string job's failed run records the failure alone.
func queryReportingTaskRuns(ctx context.Context, db dictionaryDB, scope reportingScope, projectIDs []string, period reportingPeriod) (reportingTaskRuns, error) {
	var args reportingArgs
	start, end := reportingDayStart(args.add(period.From)), reportingDayEnd(args.add(period.To))
	forLocale, hasLanguage, onlyWithLanguage := "", "", ""
	other := "coalesce(sum(extract(epoch from greatest(took - preparing - reusing_memory - translating - finishing, interval '0'))) * 1000, 0)::float8"
	if scope.targetLocale != "" {
		locale := args.add(scope.targetLocale)
		forLocale = " and e.locale = " + locale
		hasLanguage = ", bool_or(e.locale = " + locale + ") as has_language"
		onlyWithLanguage = " and has_language"
		other = "0::float8"
	}
	ms := func(value string) string {
		return "coalesce(sum(extract(epoch from " + value + ")) * 1000, 0)::float8"
	}
	runs := reportingNoTaskRuns()
	var stages [5]float64
	err := db.QueryRow(ctx, fmt.Sprintf(`
        with runs as (
            select max(e.created_at) - min(e.created_at) as took,
                max(e.created_at) filter (where e.type in ('job_succeeded', 'job_failed')) as ended,
                min(e.created_at) filter (where e.type = 'job_started') as started,
                min(e.created_at) filter (where e.type = 'strings_extracted') as extracted,
                max(e.created_at) filter (where e.type = 'translations_reused'%[1]s) as reused,
                max(e.created_at) filter (where e.type = 'translations_reused') as all_reused,
                max(e.created_at) filter (where e.type = 'locale_progress'%[1]s) as translated,
                max(e.created_at) filter (where e.type = 'locale_progress') as all_translated
                %[2]s
            from jobs j join job_events e on e.job_id = j.id
            where j.organization_id = %[3]s
                and j.project_id = any(%[4]s::text[]) and j.kind = 'translation'
                and (j.completed_at is null or j.completed_at >= %[5]s)
                and e.workflow_run_id is not null and e.created_at < %[6]s
            group by e.job_id, e.workflow_run_id
        ), staged as (
            select took,
                greatest(extracted - started, interval '0') as preparing,
                greatest(reused - extracted, interval '0') as reusing_memory,
                greatest(translated - coalesce(reused, all_reused, extracted), interval '0') as translating,
                greatest(ended - coalesce(all_translated, all_reused, extracted), interval '0') as finishing
            from runs
            where started is not null and ended >= %[5]s and ended < %[6]s%[7]s
        )
        select %[8]s as milliseconds, count(*)::integer as runs,
            %[9]s as preparing, %[10]s as reusing_memory, %[11]s as translating, %[12]s as finishing,
            %[13]s as other
        from staged`,
		forLocale, hasLanguage, args.add(scope.organizationID), args.add(projectIDs), start, end, onlyWithLanguage,
		ms("took"), ms("preparing"), ms("reusing_memory"), ms("translating"), ms("finishing"), other), args...).
		Scan(&runs.Milliseconds, &runs.Runs, &stages[0], &stages[1], &stages[2], &stages[3], &stages[4])
	if err != nil {
		return runs, fmt.Errorf("read task run time: %w", err)
	}
	for i := range runs.Stages {
		runs.Stages[i].Milliseconds = stages[i]
	}
	return runs, nil
}

type reportingStepTime struct {
	TaskStep string  `json:"taskStep"`
	Minutes  float64 `json:"minutes"`
	People   int     `json:"people"`
}

// queryReportingLoggedTimeBySteps reads time people logged in a period by what the task was
// for, in the order of the steps.
func queryReportingLoggedTimeBySteps(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod) ([]reportingStepTime, error) {
	steps := []reportingStepTime{}
	projectIDs := scope.scopedProjectIDs()
	if len(projectIDs) == 0 {
		return steps, nil
	}
	var args reportingArgs
	where := reportingLoggedTimeWhere(&args, scope, projectIDs, period.From, period.To, "")
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select %s as task_step, sum(e.minutes)::float8 as minutes, count(distinct e.contributor_id)::integer as people
        from reporting_time_entries e left join jobs j on j.id = e.job_id
        where %s
        group by 1`, reportingTaskStepSQL("j"), where), args...)
	if err != nil {
		return nil, fmt.Errorf("read time by step: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var step reportingStepTime
		if err := rows.Scan(&step.TaskStep, &step.Minutes, &step.People); err != nil {
			return nil, fmt.Errorf("scan time by step: %w", err)
		}
		steps = append(steps, step)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read time by step: %w", err)
	}
	slices.SortStableFunc(steps, func(a, b reportingStepTime) int {
		return slices.Index(reportingTaskSteps, a.TaskStep) - slices.Index(reportingTaskSteps, b.TaskStep)
	})
	return steps, nil
}

type reportingTimeQuery struct {
	from, to, projectID, jobID, targetLocale string
	page                                     int
	format                                   string
}

func parseReportingTimeQuery(r *http.Request, paged bool) (reportingTimeQuery, error) {
	q := readReportingQuery(r)
	var query reportingTimeQuery
	query.from, query.to = q.dates()
	query.projectID, query.jobID, query.targetLocale = q.scope()
	query.page = 1
	if paged {
		query.page = q.page()
	}
	query.format = q.format()
	return query, q.err()
}

type reportingTime struct {
	Period reportingPeriod     `json:"period"`
	Logged reportingLoggedTime `json:"logged"`
	// Null for roles that cannot see what work costs: automated time is workspace activity.
	Automated *reportingAutomatedTime `json:"automated"`
}

// time is the Time tab: time people logged, and automated run time for the roles that see it.
// Roles that cannot see what work costs see only their own time, and no automated time.
func (api *reportingAPI) time(r *http.Request, actor reportingActor) (any, int, error) {
	query, err := parseReportingTimeQuery(r, true)
	if err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var time reportingTime
	err = api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		scope := view.scope(query.projectID, query.jobID, query.targetLocale)
		time.Period = view.period(query.from, query.to)
		contributorID := view.userID
		if view.financial {
			contributorID = ""
		}
		if time.Logged, err = queryReportingLoggedTime(ctx, db, scope, time.Period, query.page, query.format == "csv", contributorID); err != nil {
			return err
		}
		if !view.financial {
			return nil
		}
		automated, err := queryReportingAutomatedTime(ctx, db, view.scope(query.projectID, "", ""), time.Period, true)
		time.Automated = &automated
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if query.format == "csv" {
		return reportingLoggedTimeCSV(time.Logged), http.StatusOK, nil
	}
	return map[string]any{"time": time}, http.StatusOK, nil
}

type reportingStepTimes struct {
	Period    reportingPeriod        `json:"period"`
	Logged    []reportingStepTime    `json:"logged"`
	Automated reportingAutomatedTime `json:"automated"`
}

// stepTimes is time by step: logged by what each task is for, and automated by stage and step.
func (api *reportingAPI) stepTimes(r *http.Request, actor reportingActor) (any, int, error) {
	query, err := parseReportingTimeQuery(r, false)
	if err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var times reportingStepTimes
	err = api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		times.Period = view.period(query.from, query.to)
		if times.Logged, err = queryReportingLoggedTimeBySteps(ctx, db, view.scope(query.projectID, query.jobID, query.targetLocale), times.Period); err != nil {
			return err
		}
		times.Automated, err = queryReportingAutomatedTime(ctx, db, view.scope(query.projectID, "", query.targetLocale), times.Period, view.financial)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if query.format == "csv" {
		return reportingStepTimesCSV(times), http.StatusOK, nil
	}
	return map[string]any{"stepTimes": times}, http.StatusOK, nil
}

func reportingOptional(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// reportingMinutesOf rounds milliseconds to minutes as JavaScript's Math.round does.
func reportingMinutesOf(milliseconds float64) string {
	return strconv.FormatFloat(math.Floor(milliseconds/60_000+0.5), 'f', -1, 64)
}

func reportingLoggedTimeCSV(time reportingLoggedTime) reportingCSV {
	return reportingCSV{filename: "time.csv", write: func(w *reportingCSVWriter) error {
		if err := w.row("jobTitle", "jobId", "taskStep", "step", "targetLocale", "minutes", "people"); err != nil {
			return err
		}
		for _, row := range time.Rows {
			if err := w.row(reportingOptional(row.JobTitle), row.JobID, row.TaskStep, row.Step, row.TargetLocale,
				reportingNumber(row.Minutes), strconv.Itoa(row.People)); err != nil {
				return err
			}
		}
		return nil
	}}
}

// reportingStepTimesCSV writes logged time by task step, task runs as one row then each stage
// when there were any, and workflow steps.
func reportingStepTimesCSV(times reportingStepTimes) reportingCSV {
	return reportingCSV{filename: "step-times.csv", write: func(w *reportingCSVWriter) error {
		if err := w.row("kind", "name", "minutes", "people", "runs"); err != nil {
			return err
		}
		for _, row := range times.Logged {
			if err := w.row("logged", row.TaskStep, reportingNumber(row.Minutes), strconv.Itoa(row.People), ""); err != nil {
				return err
			}
		}
		runs := times.Automated.TaskRuns
		if runs.Runs > 0 {
			if err := w.row("task_runs", "translation", reportingMinutesOf(runs.Milliseconds), "", strconv.Itoa(runs.Runs)); err != nil {
				return err
			}
			for _, stage := range runs.Stages {
				if err := w.row("task_run_stage", stage.Stage, reportingMinutesOf(stage.Milliseconds), "", strconv.Itoa(runs.Runs)); err != nil {
					return err
				}
			}
		}
		for _, step := range times.Automated.WorkflowSteps {
			if err := w.row("workflow_step", step.NodeType, reportingMinutesOf(step.Milliseconds), "", strconv.Itoa(step.Runs)); err != nil {
				return err
			}
		}
		return nil
	}}
}
