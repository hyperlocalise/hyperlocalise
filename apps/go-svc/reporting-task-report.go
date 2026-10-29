package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"
)

// A task's Report tab: its words by language and match band, its estimate and what is still to
// come, time logged on it, its own pricing, and the state of its analysis.

// A pending analysis not updated for this long is read as failed. Each language's step updates
// the row when it finishes, and a step takes minutes at most, so a longer silence means the
// workflow stopped without saying so.
const reportingTaskAnalysisStale = time.Hour

type reportingTaskRow struct {
	ID        string
	ProjectID *string
	Kind      string
	Status    string
	Payload   json.RawMessage
	CreatedAt time.Time
}

// loadReportingTaskRow reads a task the viewer can open, by the web app's buildAccessibleJobsWhere.
func loadReportingTaskRow(ctx context.Context, db dictionaryDB, actor reportingActor, jobID string) (reportingTaskRow, error) {
	var job reportingTaskRow
	err := db.QueryRow(ctx, `
        select j.id, j.project_id, j.kind, j.status, j.input_payload, j.created_at from jobs j
        where j.id = $1 and j.organization_id = $2
        and ($3::boolean or exists(
            select 1 from projects p
            where p.id = j.project_id and p.organization_id = $2
            and `+formatQaProjectTeamAccessSQL(4, 5, 2)+`
        ))`,
		jobID, actor.organizationID, actor.orgWideProjectAccess(), false, actor.userID,
	).Scan(&job.ID, &job.ProjectID, &job.Kind, &job.Status, &job.Payload, &job.CreatedAt)
	if isNoRows(err) {
		return job, reportingFailure(404, "job_not_found", "Resource not found")
	}
	if err != nil {
		return job, fmt.Errorf("read task: %w", err)
	}
	return job, nil
}

type reportingTaskWordRow struct {
	TargetLocale string `json:"targetLocale"`
	Step         string `json:"step"`
	// Units to do in each band: the current version of each of the task's strings.
	Bands map[string]float64 `json:"bands"`
	Total float64            `json:"total"`
	// The part of total finished.
	Finished float64 `json:"finished"`
}

type reportingTaskWordTotals struct {
	Source      float64 `json:"source"`
	Arrived     float64 `json:"arrived"`
	ArrivedDone float64 `json:"arrivedDone"`
	Uncounted   float64 `json:"uncounted"`
}

type reportingTaskWords struct {
	Rows   []reportingTaskWordRow             `json:"rows"`
	Totals map[string]reportingTaskWordTotals `json:"totals"`
}

// queryReportingTaskWords reads a task's units by language, step and match band, over its whole life.
func queryReportingTaskWords(ctx context.Context, db dictionaryDB, organizationID, jobID, unit string) (reportingTaskWords, error) {
	words := reportingTaskWords{Rows: []reportingTaskWordRow{}, Totals: map[string]reportingTaskWordTotals{"translation": {}, "review": {}}}
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select s.target_locale, s.step, s.bucket,
            sum(%s)::float8 as source, sum(%s)::float8 as arrived, sum(%s)::float8 as arrived_done,
            sum(s.arrived_uncounted)::float8 as uncounted
        from reporting_daily_by_task s
        where s.organization_id = $1 and s.job_id = $2
        group by 1, 2, 3`, reportingMeasure("source", unit), reportingMeasure("arrived", unit), reportingMeasure("arrived_done", unit)), organizationID, jobID)
	if err != nil {
		return words, fmt.Errorf("read task words: %w", err)
	}
	defer rows.Close()
	byKey := map[string]*reportingTaskWordRow{}
	var order []string
	for rows.Next() {
		var targetLocale, step, bucket string
		var source, arrived, arrivedDone, uncounted float64
		if err := rows.Scan(&targetLocale, &step, &bucket, &source, &arrived, &arrivedDone, &uncounted); err != nil {
			return words, fmt.Errorf("scan task words: %w", err)
		}
		total := words.Totals[step]
		total.Source += source
		total.Arrived += arrived
		total.ArrivedDone += arrivedDone
		total.Uncounted += uncounted
		words.Totals[step] = total
		key := targetLocale + "\x00" + step
		entry, ok := byKey[key]
		if !ok {
			entry = &reportingTaskWordRow{TargetLocale: targetLocale, Step: step, Bands: map[string]float64{}}
			byKey[key] = entry
			order = append(order, key)
		}
		if arrived > 0 {
			entry.Bands[bucket] += arrived
		}
		entry.Total += arrived
		entry.Finished += arrivedDone
	}
	if err := rows.Err(); err != nil {
		return words, fmt.Errorf("read task words: %w", err)
	}
	for _, key := range order {
		words.Rows = append(words.Rows, *byKey[key])
	}
	slices.SortStableFunc(words.Rows, func(a, b reportingTaskWordRow) int {
		if c := slices.Index(reportingStepOptions, a.Step) - slices.Index(reportingStepOptions, b.Step); c != 0 {
			return c
		}
		return compareReportingNames(a.TargetLocale, b.TargetLocale)
	})
	return words, nil
}

// queryReportingLockedPricingSteps reads the steps of a task whose pricing can no longer change:
// every step once the task has ended, else the steps with work on them. Work has started once
// Reports holds a finished string, a person's cost of work (not an expense row the old API
// wrote, and not an AI call) or logged time for the task and step, deleted ones aside.
func queryReportingLockedPricingSteps(ctx context.Context, db dictionaryDB, organizationID, jobID, status string) ([]string, error) {
	if !slices.Contains([]string{"queued", "running", "waiting_for_review"}, status) {
		return slices.Clone(reportingStepOptions), nil
	}
	rows, err := db.Query(ctx, `
        select s.step from (values ('translation'), ('review')) s(step)
        where exists(select 1 from reporting_activity d where d.organization_id = $1
                and d.job_id = $2 and d.step = s.step and d.kind = 'completion')
            or exists(select 1 from reporting_costs c where c.organization_id = $1
                and c.job_id = $2 and c.step = s.step and c.kind = 'human' and not c.voided)
            or exists(select 1 from reporting_time_entries e where e.organization_id = $1
                and e.job_id = $2 and e.step = s.step and not e.voided)`, organizationID, jobID)
	if err != nil {
		return nil, fmt.Errorf("read locked pricing steps: %w", err)
	}
	defer rows.Close()
	locked := []string{}
	for rows.Next() {
		var step string
		if err := rows.Scan(&step); err != nil {
			return nil, fmt.Errorf("scan locked pricing step: %w", err)
		}
		locked = append(locked, step)
	}
	return locked, rows.Err()
}

type reportingTaskSummary struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Kind          string   `json:"kind"`
	Status        string   `json:"status"`
	ProjectID     *string  `json:"projectId"`
	CreatedAt     string   `json:"createdAt"`
	SourceLocale  *string  `json:"sourceLocale"`
	TargetLocales []string `json:"targetLocales"`
}

type reportingTimeEntry struct {
	ID           string  `json:"id"`
	Person       *string `json:"person"`
	Step         string  `json:"step"`
	TargetLocale string  `json:"targetLocale"`
	WorkDate     string  `json:"workDate"`
	Minutes      int     `json:"minutes"`
	Note         *string `json:"note"`
	Own          bool    `json:"own"`
	CanEdit      bool    `json:"canEdit"`
}

type reportingTaskTime struct {
	Minutes int                  `json:"minutes"`
	People  int                  `json:"people"`
	Entries []reportingTimeEntry `json:"entries"`
}

type reportingTaskPricing struct {
	Step             string  `json:"step"`
	RateCardName     *string `json:"rateCardName"`
	PricedAt         *string `json:"pricedAt"`
	EstimatedMinutes *int    `json:"estimatedMinutes"`
	OverrideUSD      *string `json:"overrideUsd"`
	Locked           bool    `json:"locked"`
}

type reportingTaskReport struct {
	Task        reportingTaskSummary   `json:"task"`
	Unit        string                 `json:"unit"`
	Step        string                 `json:"step"`
	Words       *reportingTaskWords    `json:"words"`
	Estimate    *reportingCostEstimate `json:"estimate"`
	StillToCome *reportingStillToCome  `json:"stillToCome"`
	Time        reportingTaskTime      `json:"time"`
	CanLogTime  bool                   `json:"canLogTime"`
	// A task's own pricing, for each step: shown to the roles that see money.
	Pricing       []reportingTaskPricing `json:"pricing"`
	CanSetPricing bool                   `json:"canSetPricing"`
}

// taskReport is one task's words, money and time. Words, match bands and money are for the roles
// that see Reports; others see their own time.
func (api *reportingAPI) taskReport(r *http.Request, actor reportingActor) (any, int, error) {
	q := readReportingQuery(r)
	unit := q.unit()
	step := q.step("translation")
	rateCard := q.trimmed("rateCard", 100)
	if _, given := q.raw("rateCard"); given && rateCard == "" {
		q.fail()
	}
	format := q.format()
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	var rateCardName *string
	if rateCard != "" {
		rateCardName = &rateCard
	}
	financial := actor.can("billing:read")
	if format == "csv" && !financial {
		return nil, 0, reportingForbidden("report_costs_forbidden")
	}
	ctx := r.Context()
	var report reportingTaskReport
	err := api.read(ctx, func(db dictionaryDB) error {
		job, err := loadReportingTaskRow(ctx, db, actor, r.PathValue("jobId"))
		if err != nil {
			return err
		}
		var payload struct {
			SourceLocale  *string  `json:"sourceLocale"`
			TargetLocales []string `json:"targetLocales"`
			TargetLocale  *string  `json:"targetLocale"`
			Metadata      struct {
				Title *string `json:"title"`
			} `json:"metadata"`
		}
		_ = json.Unmarshal(job.Payload, &payload)
		report = reportingTaskReport{
			Task: reportingTaskSummary{
				ID: job.ID, Title: job.ID, Kind: job.Kind, Status: job.Status, ProjectID: job.ProjectID,
				CreatedAt: formatReportingTime(job.CreatedAt), SourceLocale: payload.SourceLocale, TargetLocales: payload.TargetLocales,
			},
			Unit: unit, Step: step, Time: reportingTaskTime{Entries: []reportingTimeEntry{}},
			CanLogTime: actor.can("jobs:write"), CanSetPricing: actor.can("billing:write"),
		}
		if payload.Metadata.Title != nil {
			report.Task.Title = *payload.Metadata.Title
		}
		if report.Task.TargetLocales == nil {
			report.Task.TargetLocales = []string{}
			if payload.TargetLocale != nil {
				report.Task.TargetLocales = []string{*payload.TargetLocale}
			}
		}
		money := financial && job.ProjectID != nil
		if financial {
			words, err := queryReportingTaskWords(ctx, db, actor.organizationID, job.ID, unit)
			if err != nil {
				return err
			}
			report.Words = &words
		}
		if money {
			// The whole task, both steps: the card shows the task's cost, the table one step of it.
			scope := reportingScope{organizationID: actor.organizationID, projectIDs: []string{*job.ProjectID}}
			estimate, err := queryReportingCostEstimate(ctx, db, scope, []string{job.ID}, "", unit, rateCardName)
			if err != nil {
				return err
			}
			report.Estimate = &estimate
			toCome, err := queryReportingStillToCome(ctx, db, actor.organizationID, []string{*job.ProjectID}, []string{job.ID}, "", rateCardName)
			if err != nil {
				return err
			}
			pending := reportingStillToCome{AmountUSD: "0.00000000"}
			if found, ok := toCome[*job.ProjectID]; ok {
				pending = found
			}
			report.StillToCome = &pending
		}
		// Other people's entries, and their totals, are for the roles that see what work costs.
		entries, err := db.Query(ctx, `
            select e.id, e.contributor_id,
                coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as person,
                e.step, e.target_locale, e.work_date::text, e.minutes, e.note
            from reporting_time_entries e left join users u on u.id = e.contributor_id
            where e.organization_id = $1 and e.job_id = $2 and not e.voided
            order by e.work_date desc, e.created_at desc`, actor.organizationID, job.ID)
		if err != nil {
			return fmt.Errorf("read task time: %w", err)
		}
		defer entries.Close()
		people := map[string]bool{}
		for entries.Next() {
			var entry reportingTimeEntry
			var contributorID string
			if err := entries.Scan(&entry.ID, &contributorID, &entry.Person, &entry.Step, &entry.TargetLocale, &entry.WorkDate, &entry.Minutes, &entry.Note); err != nil {
				return fmt.Errorf("scan task time: %w", err)
			}
			if !financial && contributorID != actor.userID {
				continue
			}
			entry.Own = contributorID == actor.userID
			entry.CanEdit = report.CanLogTime && (entry.Own || report.CanSetPricing)
			report.Time.Minutes += entry.Minutes
			people[contributorID] = true
			report.Time.Entries = append(report.Time.Entries, entry)
		}
		if err := entries.Err(); err != nil {
			return fmt.Errorf("read task time: %w", err)
		}
		report.Time.People = len(people)
		if !financial {
			return nil
		}
		locked, err := queryReportingLockedPricingSteps(ctx, db, actor.organizationID, job.ID, job.Status)
		if err != nil {
			return err
		}
		own := map[string]reportingTaskPricing{}
		rates, err := db.Query(ctx, `select step, rate_card_name, priced_at, estimated_minutes, override_usd::text
            from reporting_task_rates where organization_id = $1 and job_id = $2`, actor.organizationID, job.ID)
		if err != nil {
			return fmt.Errorf("read task pricing: %w", err)
		}
		defer rates.Close()
		for rates.Next() {
			var pricing reportingTaskPricing
			var pricedAt *time.Time
			if err := rates.Scan(&pricing.Step, &pricing.RateCardName, &pricedAt, &pricing.EstimatedMinutes, &pricing.OverrideUSD); err != nil {
				return fmt.Errorf("scan task pricing: %w", err)
			}
			if pricedAt != nil {
				text := formatReportingTime(*pricedAt)
				pricing.PricedAt = &text
			}
			own[pricing.Step] = pricing
		}
		if err := rates.Err(); err != nil {
			return fmt.Errorf("read task pricing: %w", err)
		}
		report.Pricing = []reportingTaskPricing{}
		for _, step := range reportingStepOptions {
			pricing := own[step]
			pricing.Step = step
			pricing.Locked = slices.Contains(locked, step)
			report.Pricing = append(report.Pricing, pricing)
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	if format == "csv" && report.Words != nil {
		return reportingTaskWordsCSV(*report.Words, report.Estimate, step), http.StatusOK, nil
	}
	return map[string]any{"taskReport": report}, http.StatusOK, nil
}

// reportingTaskWordsCSV is a task's words by language for one step, as its Report tab shows
// them, with the weighted units, cost and pricing when the estimate is given (the roles that see
// money). A fixed fee belongs to the whole step, so it is a row of its own with no language.
func reportingTaskWordsCSV(words reportingTaskWords, estimate *reportingCostEstimate, step string) reportingCSV {
	return reportingCSV{filename: "task-report.csv", write: func(w *reportingCSVWriter) error {
		var rows []reportingTaskWordRow
		totals := map[string]float64{}
		for _, row := range words.Rows {
			if row.Step != step {
				continue
			}
			rows = append(rows, row)
			for bucket, units := range row.Bands {
				totals[bucket] += units
			}
		}
		bands := reportingBandsIn(totals)
		header := append([]string{"targetLocale"}, bands...)
		header = append(header, "total", "finished")
		if estimate != nil {
			header = append(header, "weighted", "costUsd", "pricing")
		}
		if err := w.row(header...); err != nil {
			return err
		}
		money := func(targetLocale string) []string {
			var lines []reportingCostEstimateRow
			for _, line := range estimate.Rows {
				if line.TargetLocale == targetLocale && line.Step == step {
					lines = append(lines, line)
				}
			}
			weighted, cost := "", ""
			var weightedSum, costSum float64
			hasWeighted, hasCost := false, false
			for _, line := range lines {
				if line.Weighted != nil {
					weightedSum += *line.Weighted
					hasWeighted = true
				}
				if line.CostUSD != nil {
					value, _ := parseReportingFloat(*line.CostUSD)
					costSum += value
					hasCost = true
				}
			}
			if hasWeighted {
				weighted = reportingHundredths(weightedSum)
			}
			if hasCost {
				cost = fmt.Sprintf("%.2f", costSum)
			}
			// Empty for a language the estimate has no line for.
			pricing := ""
			switch {
			case len(lines) == 0:
			case slices.ContainsFunc(lines, func(line reportingCostEstimateRow) bool { return line.Pricing == "fixed" }):
				pricing = "fixed"
			case !slices.ContainsFunc(lines, func(line reportingCostEstimateRow) bool { return line.Pricing != "none" }):
				pricing = "none"
			default:
				pricing = "rate"
			}
			return []string{weighted, cost, pricing}
		}
		for _, row := range rows {
			cells := []string{row.TargetLocale}
			for _, bucket := range bands {
				cells = append(cells, reportingNumber(row.Bands[bucket]))
			}
			cells = append(cells, reportingNumber(row.Total), reportingNumber(row.Finished))
			if estimate != nil {
				cells = append(cells, money(row.TargetLocale)...)
			}
			if err := w.row(cells...); err != nil {
				return err
			}
		}
		if estimate != nil {
			for _, fee := range estimate.FixedFees {
				if fee.Step != step {
					continue
				}
				cells := []string{""}
				for range bands {
					cells = append(cells, "")
				}
				amount, _ := parseReportingFloat(fee.AmountUSD)
				if err := w.row(append(cells, "", "", "", fmt.Sprintf("%.2f", amount), "fixed")...); err != nil {
					return err
				}
			}
		}
		return nil
	}}
}

func parseReportingFloat(text string) (float64, error) {
	var value float64
	_, err := fmt.Sscanf(strings.TrimSpace(text), "%g", &value)
	return value, err
}

type reportingTaskAnalysisState struct {
	Step   string `json:"step"`
	Status string `json:"status"`
	// Some strings have no match band, so the quote is not exact.
	Incomplete bool `json:"incomplete"`
	// The task's strings in each language, once a language has been recorded.
	Strings   *int    `json:"strings"`
	Error     *string `json:"error"`
	UpdatedAt string  `json:"updatedAt"`
}

// taskAnalysis is the state of the task's analysis per step (pending, done or failed): read by
// the Report tab every few seconds while a step is pending. A pending state left alone too long
// reads as failed. The task's string counts and failure details are for the roles that see its
// words.
func (api *reportingAPI) taskAnalysis(r *http.Request, actor reportingActor) (any, int, error) {
	ctx := r.Context()
	states := []reportingTaskAnalysisState{}
	err := api.read(ctx, func(db dictionaryDB) error {
		job, err := loadReportingTaskRow(ctx, db, actor, r.PathValue("jobId"))
		if err != nil {
			return err
		}
		rows, err := db.Query(ctx, `select step, status, incomplete, strings, error, updated_at
            from reporting_task_analyses where organization_id = $1 and job_id = $2`, actor.organizationID, job.ID)
		if err != nil {
			return fmt.Errorf("read task analysis: %w", err)
		}
		defer rows.Close()
		now := api.now()
		financial := actor.can("billing:read")
		for rows.Next() {
			var state reportingTaskAnalysisState
			var updatedAt time.Time
			if err := rows.Scan(&state.Step, &state.Status, &state.Incomplete, &state.Strings, &state.Error, &updatedAt); err != nil {
				return fmt.Errorf("scan task analysis: %w", err)
			}
			if state.Status == "pending" && now.Sub(updatedAt) > reportingTaskAnalysisStale {
				state.Status = "failed"
				if state.Error == nil {
					stopped := "reporting_task_analysis_stopped"
					state.Error = &stopped
				}
			}
			state.UpdatedAt = formatReportingTime(updatedAt)
			if !financial {
				state.Strings, state.Error = nil, nil
			}
			states = append(states, state)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"analysis": states}, http.StatusOK, nil
}
