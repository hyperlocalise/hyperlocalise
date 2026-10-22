package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	reportPageSize = 200
	reportMaxPage  = 10_000
	reportDayMs    = 86_400_000
)

var reportCSVColumns = []string{
	"period", "projectId", "jobId", "targetLocale", "step", "bucket", "kind",
	"words", "minutes", "durationMs", "inputTokens", "outputTokens", "unavailable", "count",
}

type reportQuery struct {
	from, to                       *string
	projectID, jobID, targetLocale string
	step, interval, view, format   string
	page                           int
}

type reportRow struct {
	Period       string  `json:"period"`
	ProjectID    *string `json:"projectId"`
	JobID        *string `json:"jobId"`
	TargetLocale *string `json:"targetLocale"`
	Step         string  `json:"step"`
	Bucket       *string `json:"bucket"`
	Kind         string  `json:"kind"`
	Words        int     `json:"words"`
	Minutes      int     `json:"minutes"`
	DurationMs   float64 `json:"durationMs"`
	AmountUSD    *string `json:"amountUsd"`
	InputTokens  int     `json:"inputTokens"`
	OutputTokens int     `json:"outputTokens"`
	Unavailable  int     `json:"unavailable"`
	Count        int     `json:"count"`
}

type reportAnalysis struct {
	SourceWords    int `json:"sourceWords"`
	WorkloadWords  int `json:"workloadWords"`
	CompletedWords int `json:"completedWords"`
}

type reportResult struct {
	Analysis  reportAnalysis `json:"analysis"`
	Rows      []reportRow    `json:"rows"`
	Page      int            `json:"page"`
	HasMore   bool           `json:"hasMore"`
	StartedAt *string        `json:"startedAt"`
	From      string         `json:"from"`
	To        string         `json:"to"`
	Timezone  string         `json:"timezone"`
	Currency  string         `json:"currency"`
	Financial bool           `json:"financial"`
}

func (h *handler) getReport(r *http.Request, actor workspaceActor) (any, int, error) {
	query, ok := parseReportQuery(r.URL.Query())
	if !ok {
		return nil, 0, reportingInvalid("invalid_report_query")
	}
	financial := hasOrganizationCapability(actor.role, "billing:read")
	if query.view == "costs" && !financial {
		return nil, 0, reportingForbidden("report_costs_forbidden")
	}
	db := h.workspace.pool
	projectIDs, err := reportingProjectIDs(r.Context(), db, actor)
	if err != nil {
		return nil, 0, err
	}
	report, err := queryReport(r.Context(), db, actor.organizationID, projectIDs, financial, query, time.Now())
	if err != nil {
		return nil, 0, err
	}
	if query.format == "csv" {
		return reportingCSV{filename: "translation-report.csv", body: []byte(reportCSV(report.Rows, financial))}, http.StatusOK, nil
	}
	return map[string]any{"report": report}, http.StatusOK, nil
}

func parseReportQuery(values url.Values) (reportQuery, bool) {
	get := func(key string) (string, bool) {
		if v, ok := values[key]; ok {
			return v[0], true
		}
		return "", false
	}
	choice := func(key, fallback string, options ...string) (string, bool) {
		value, ok := get(key)
		if !ok {
			return fallback, true
		}
		return value, slices.Contains(options, value)
	}
	query := reportQuery{page: 1}
	valid := true
	for key, dest := range map[string]**string{"from": &query.from, "to": &query.to} {
		if value, ok := get(key); ok {
			valid = valid && isReportingDay(value)
			*dest = &value
		}
	}
	query.projectID, _ = get("projectId")
	query.jobID, _ = get("jobId")
	query.targetLocale, _ = get("targetLocale")
	var ok bool
	query.step, ok = choice("step", "", reportingStepOptions...)
	valid = valid && ok
	query.interval, ok = choice("interval", "week", "day", "week")
	valid = valid && ok
	query.view, ok = choice("view", "overview", "overview", "words", "time", "costs")
	valid = valid && ok
	query.format, ok = choice("format", "json", "json", "csv")
	valid = valid && ok
	if raw, present := get("page"); present {
		page := jsNumber(raw)
		if math.IsNaN(page) || math.IsInf(page, 0) || page != math.Trunc(page) || page < 1 || page > reportMaxPage {
			valid = false
		} else {
			query.page = int(page)
		}
	}
	if query.from != nil && query.to != nil && *query.from > *query.to {
		valid = false
	}
	return query, valid
}

func queryReport(ctx context.Context, db dictionaryDB, organizationID string, projectIDs []string, financial bool, query reportQuery, now time.Time) (reportResult, error) {
	from := now.Add(-27 * reportDayMs * time.Millisecond).UTC().Format(time.DateOnly)
	if query.from != nil {
		from = *query.from
	}
	to := now.UTC().Format(time.DateOnly)
	if query.to != nil {
		to = *query.to
	}
	const (
		start = `($2::text::date::timestamp at time zone 'UTC')`
		end   = `(($3::text::date + 1)::timestamp at time zone 'UTC')`
	)
	args := []any{organizationID, from, to, projectIDs, financial, query.interval}
	arg := func(value any) string {
		args = append(args, value)
		return "$" + strconv.Itoa(len(args))
	}
	jobColumn := "job_id"
	if query.view == "overview" {
		jobColumn = "null::text"
	}
	var filters strings.Builder
	if query.projectID != "" {
		filters.WriteString(" and project_id=" + arg(query.projectID))
	}
	if query.jobID != "" {
		filters.WriteString(" and job_id=" + arg(query.jobID))
	}
	if query.targetLocale != "" {
		filters.WriteString(" and (target_locale=" + arg(query.targetLocale) + " or (target_locale is null and kind in ('ai','human','expense')))")
	}
	if query.step != "" {
		filters.WriteString(" and step=" + arg(query.step))
	}
	switch query.view {
	case "words":
		filters.WriteString(" and kind='completion'")
	case "time":
		filters.WriteString(" and kind in ('time','workflow','status')")
	case "costs":
		filters.WriteString(" and kind in ('human','ai','expense')")
	}
	paging := ""
	if query.format != "csv" {
		paging = " limit " + arg(reportPageSize+1) + " offset " + arg((query.page-1)*reportPageSize)
	}
	rows, err := db.Query(ctx, `
        with facts as (
            select a.organization_id, a.project_id, a.job_id, a.target_locale, a.step, a.created_at at time zone 'UTC' as occurred_at,
                s.bucket, a.kind, coalesce(s.words, 0) as words, 0 as minutes, coalesce(a.duration_ms,0) as duration_ms,
                null::numeric as amount_usd, 0 as input_tokens, 0 as output_tokens,
                case when a.kind='completion' and (s.words is null or s.bucket='unavailable') then 1 else 0 end as unavailable
            from reporting_activity a left join reporting_analyses s on s.id=a.analysis_id
            where a.organization_id=$1 and a.created_at >= `+start+` and a.created_at < `+end+`
            union all
            select n.organization_id,w.project_id,null,null,n.node_type,n.finished_at at time zone 'UTC',null,'workflow',0,0,
              (extract(epoch from (n.finished_at-n.started_at))*1000)::integer,null,0,0,0
            from visual_workflow_node_runs n join visual_workflow_runs r on r.id=n.run_id join visual_workflows w on w.id=r.visual_workflow_id
            where n.organization_id=$1 and n.started_at >= (select started_at from reporting_rollout where id=1)
              and n.finished_at >= `+start+` and n.finished_at < `+end+`
            union all
            select organization_id,project_id,job_id,target_locale,step,work_date at time zone 'UTC',null,'time',0,minutes,0,null,0,0,0 from reporting_time_entries
            where organization_id=$1 and not voided and work_date >= `+start+` and work_date < `+end+`
            union all
            select c.organization_id,c.project_id,c.job_id,c.target_locale,c.step,c.created_at at time zone 'UTC',null,c.kind,0,0,0,
                case when $5::boolean then c.amount_usd else null end,c.input_tokens,c.output_tokens,
                case when c.amount_usd is null then 1 else 0 end
            from reporting_costs c where c.organization_id=$1 and not c.voided and ($5::boolean or c.kind='ai')
              and c.created_at >= `+start+` and c.created_at < `+end+`
        )
        select to_char(date_trunc($6::text, occurred_at),'YYYY-MM-DD') as period,
            project_id as "projectId",`+jobColumn+` as "jobId",target_locale as "targetLocale",step,bucket,kind,
            sum(words)::integer as words,sum(minutes)::integer as minutes,sum(duration_ms)::float8 as "durationMs",
            sum(amount_usd)::text as "amountUsd",coalesce(sum(input_tokens),0)::integer as "inputTokens",coalesce(sum(output_tokens),0)::integer as "outputTokens",
            sum(unavailable)::integer as unavailable,count(*)::integer as count
        from facts where (project_id = any($4::text[]) or ($5::boolean and project_id is null))`+filters.String()+`
        group by period,project_id,"jobId",target_locale,step,bucket,kind order by period desc,project_id,"jobId",target_locale,step,bucket,kind`+paging,
		args...)
	if err != nil {
		return reportResult{}, fmt.Errorf("query report rows: %w", err)
	}
	defer rows.Close()
	result := reportResult{Rows: []reportRow{}, Page: query.page, From: from, To: to, Timezone: "UTC", Currency: "USD", Financial: financial}
	for rows.Next() {
		var row reportRow
		if err := rows.Scan(&row.Period, &row.ProjectID, &row.JobID, &row.TargetLocale, &row.Step, &row.Bucket, &row.Kind,
			&row.Words, &row.Minutes, &row.DurationMs, &row.AmountUSD, &row.InputTokens, &row.OutputTokens, &row.Unavailable, &row.Count); err != nil {
			return reportResult{}, fmt.Errorf("scan report row: %w", err)
		}
		result.Rows = append(result.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return reportResult{}, fmt.Errorf("query report rows: %w", err)
	}
	if query.format != "csv" && len(result.Rows) > reportPageSize {
		result.HasMore = true
		result.Rows = result.Rows[:reportPageSize]
	}

	var startedAt time.Time
	err = db.QueryRow(ctx, `select started_at from reporting_rollout where id=1`).Scan(&startedAt)
	switch {
	case err == nil:
		formatted := formatReportingTime(startedAt)
		result.StartedAt = &formatted
	case !isNoRows(err):
		return reportResult{}, fmt.Errorf("load reporting rollout: %w", err)
	}

	if result.Analysis, err = queryReportAnalysis(ctx, db, organizationID, from, to, projectIDs, query); err != nil {
		return reportResult{}, err
	}
	return result, nil
}

func queryReportAnalysis(ctx context.Context, db dictionaryDB, organizationID, from, to string, projectIDs []string, query reportQuery) (reportAnalysis, error) {
	const (
		start = `($2::text::date::timestamp at time zone 'UTC')`
		end   = `(($3::text::date + 1)::timestamp at time zone 'UTC')`
	)
	step := query.step
	if step == "" {
		step = "translation"
	}
	scoped := func() (string, []any) {
		args := []any{organizationID, from, to, projectIDs}
		arg := func(value any) string {
			args = append(args, value)
			return "$" + strconv.Itoa(len(args))
		}
		var filters strings.Builder
		if query.projectID != "" {
			filters.WriteString(" and project_id=" + arg(query.projectID))
		}
		if query.jobID != "" {
			filters.WriteString(" and job_id=" + arg(query.jobID))
		}
		if query.targetLocale != "" {
			filters.WriteString(" and target_locale=" + arg(query.targetLocale))
		}
		filters.WriteString(" and step=" + arg(step))
		return filters.String(), args
	}
	var analysis reportAnalysis
	filters, args := scoped()
	if err := db.QueryRow(ctx, `
        select coalesce(sum(words),0)::integer as "sourceWords",coalesce(sum(workload),0)::integer as "workloadWords" from (
          select job_id,segment_id,source_revision,max(words) as words,sum(words) as workload from reporting_analyses
          where organization_id=$1 and (project_id = any($4::text[]))
          and created_at >= `+start+` and created_at < `+end+filters+`
          group by job_id,segment_id,source_revision
        ) source_scope`, args...).Scan(&analysis.SourceWords, &analysis.WorkloadWords); err != nil {
		return reportAnalysis{}, fmt.Errorf("query report source words: %w", err)
	}
	filters, args = scoped()
	if err := db.QueryRow(ctx, `
        select coalesce(sum(words),0)::integer as "completedWords" from (
          select s.words,a.project_id,a.job_id,a.target_locale,a.step from reporting_activity a
          join reporting_analyses s on s.id=a.analysis_id
          where a.organization_id=$1 and a.kind='completion'
          and a.created_at >= `+start+` and a.created_at < `+end+`
        ) completed
        where (project_id = any($4::text[]))`+filters, args...).Scan(&analysis.CompletedWords); err != nil {
		return reportAnalysis{}, fmt.Errorf("query report completed words: %w", err)
	}
	return analysis, nil
}

func reportCSV(rows []reportRow, financial bool) string {
	columns := slices.Clone(reportCSVColumns)
	if financial {
		columns = append(columns, "amountUsd")
	}
	lines := make([]string, 0, len(rows)+1)
	lines = append(lines, reportCSVLine(columns))
	for _, row := range rows {
		cells := []string{
			row.Period, optionalString(row.ProjectID), optionalString(row.JobID), optionalString(row.TargetLocale),
			row.Step, optionalString(row.Bucket), row.Kind,
			strconv.Itoa(row.Words), strconv.Itoa(row.Minutes), jsNumberString(row.DurationMs),
			strconv.Itoa(row.InputTokens), strconv.Itoa(row.OutputTokens), strconv.Itoa(row.Unavailable), strconv.Itoa(row.Count),
		}
		if financial {
			cells = append(cells, optionalString(row.AmountUSD))
		}
		lines = append(lines, reportCSVLine(cells))
	}
	return strings.Join(lines, "\r\n")
}

func reportCSVLine(cells []string) string {
	quoted := make([]string, len(cells))
	for i, cell := range cells {
		quoted[i] = reportCSVCell(cell)
	}
	return strings.Join(quoted, ",")
}

func reportCSVCell(text string) string {
	if text != "" && strings.IndexByte("=+@-\t\r", text[0]) >= 0 {
		text = "'" + text
	}
	return `"` + strings.ReplaceAll(text, `"`, `""`) + `"`
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func jsNumberString(value float64) string {
	switch {
	case value == 0:
		return "0"
	case math.IsNaN(value):
		return "NaN"
	case math.IsInf(value, 1):
		return "Infinity"
	case math.IsInf(value, -1):
		return "-Infinity"
	}
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
