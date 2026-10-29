package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Money for the Reports page. Estimates price the daily summary's units at the live rate card,
// line by line in each line's own basis, when the page reads them; nothing priced is stored.
// Spent amounts are the recorded costs, priced when the work was recorded, and billing's charges
// for AI.

// A task's own rate card, else its project budget's card, else the card chosen on the page. The
// first card found prices every language: a language it has no line for has no rate.
const reportingPricingOrder = "task's rate card, then the project budget's rate card, then the chosen card"

var (
	reportingRateBases   = []string{"word", "character", "character_with_spaces", "hour"}
	reportingPricedBy    = []string{"task", "budget", "chosen"}
	reportingOpenTaskSQL = "j.status in ('queued', 'running', 'waiting_for_review')"
	reportingLiveTaskSQL = "j.status not in ('failed', 'cancelled')"
)

type reportingPricedGroup struct {
	ProjectID    string `json:"projectId"`
	TargetLocale string `json:"targetLocale"`
	Step         string `json:"step"`
	Bucket       string `json:"bucket"`
	// rate, fixed (the task has a fixed fee instead) or none (no rate).
	Pricing string `json:"pricing"`
	// Which card priced the work; null when no card applies at all.
	PricedBy *string `json:"pricedBy"`
	RateID   *string `json:"rateId"`
	// The card that priced the work, or that has no line for it.
	RateCardName *string         `json:"rateCardName"`
	Basis        *string         `json:"basis"`
	Rate         *string         `json:"rate"`
	Percentages  json.RawMessage `json:"percentages"`
	// In the unit the page shows.
	Units float64 `json:"units"`
	// In the rate line's basis; 0 for hourly lines and unpriced or fixed-fee work.
	BasisUnits float64 `json:"basisUnits"`
	// Strings whose units could not be counted, so they are priced at nothing.
	Uncounted float64 `json:"uncounted"`
}

type reportingHourlyLine struct {
	ProjectID        string `json:"projectId"`
	JobID            string `json:"jobId"`
	Step             string `json:"step"`
	TargetLocale     string `json:"targetLocale"`
	RateID           string `json:"rateId"`
	Rate             string `json:"rate"`
	EstimatedMinutes *int   `json:"estimatedMinutes"`
	LoggedMinutes    int    `json:"loggedMinutes"`
	// The task and step's languages on hourly lines, which share its time estimate.
	Languages int `json:"languages"`
}

type reportingPricedUnits struct {
	groups          []reportingPricedGroup
	hourly          []reportingHourlyLine
	tasks, language int
}

type reportingPricingInput struct {
	organizationID string
	projectIDs     []string
	jobIDs         []string
	targetLocale   string
	step           string
	unit           string
	rateCardName   *string
	// chosen: every current string of the given tasks, finished or not; project: every current
	// string of the given projects, in a task or not, from the projects' current rows (a task's
	// own card does not apply there: the project is priced as one); toCome: the unfinished part
	// of open tasks assigned to a person or marked payable, plus unfinished payable work saved
	// outside any task. A task that ended will do no more work.
	measure string
}

// queryReportingPricedUnits reads units of work, priced.
func queryReportingPricedUnits(ctx context.Context, db dictionaryDB, in reportingPricingInput) (reportingPricedUnits, error) {
	var args reportingArgs
	org := args.add(in.organizationID)
	projects := "s.project_id = any(" + args.add(in.projectIDs) + "::text[])"
	value := func(unit string) string {
		if in.measure == "toCome" {
			return "s.arrived_" + unit + " - s.arrived_done_" + unit
		}
		return "s.arrived_" + unit
	}
	// Still to come counts only the uncounted strings that cannot all be among the done ones.
	uncounted := "s.arrived_uncounted"
	if in.measure == "toCome" {
		uncounted = "greatest(s.arrived_uncounted - s.arrived_done_strings, 0)"
	}
	tasks := ""
	if len(in.jobIDs) > 0 {
		tasks = " and s.job_id = any(" + args.add(in.jobIDs) + "::text[])"
	}
	var rows string
	switch in.measure {
	case "chosen":
		rows = fmt.Sprintf("select s.* from reporting_daily_by_task s where s.organization_id = %s and %s%s", org, projects, tasks)
	case "project":
		rows = fmt.Sprintf("select s.*, null::text as job_id from reporting_current_by_project s where s.organization_id = %s and %s", org, projects)
	default:
		// Read task by task from the open tasks, through the summary's task index: tasks that
		// ended hold most of a workspace's rows, and a planner scanning them all is far slower.
		// Rows with as many strings done as arrived have nothing left to do.
		rows = fmt.Sprintf(`select s.* from jobs j
            cross join lateral (
                select s.* from reporting_daily_by_task s
                where s.organization_id = %[1]s and s.job_id = j.id
                    and %[2]s%[3]s and s.arrived_strings > s.arrived_done_strings
                    and (s.payable or (j.assignee_type = 'user' and j.owner_user_id is not null))
                offset 0
            ) s
            where j.organization_id = %[1]s and j.project_id = any(%[4]s::text[]) and %[5]s`,
			org, projects, tasks, args.add(in.projectIDs), reportingOpenTaskSQL)
		if len(in.jobIDs) == 0 {
			rows += fmt.Sprintf(` union all
                select s.* from reporting_daily_by_task s
                where s.organization_id = %s and %s and s.job_id is null and s.payable
                    and s.arrived_strings > s.arrived_done_strings`, org, projects)
		}
	}
	// Only a task with its own rate, fee or time estimate is priced apart from the others, so
	// still to come adds up the rest of a project's open tasks together.
	task, ownJoin := "s.job_id", ""
	if in.measure == "toCome" {
		task = "case when own.id is not null then s.job_id end"
		ownJoin = fmt.Sprintf("left join reporting_task_rates own on own.organization_id = %s and own.job_id = s.job_id and own.step = s.step", org)
	}
	stepFilter := ""
	if in.step != "" {
		stepFilter = " and s.step = " + args.add(in.step)
	}
	chosenLanguage, hourlyLanguage := "true", "true"
	if in.targetLocale != "" {
		locale := args.add(in.targetLocale)
		chosenLanguage = "target_locale = " + locale
		hourlyLanguage = "r.target_locale = " + locale
	}
	chosenCard := args.add(in.rateCardName) + "::text"
	var groupsJSON, hourlyJSON []byte
	var result reportingPricedUnits
	err := db.QueryRow(ctx, fmt.Sprintf(`
        with live as (%[1]s),
        task_lines as (
            select distinct on (t.job_id, t.step, r.source_locale, r.target_locale)
                t.job_id, t.step, r.source_locale, r.target_locale, r.id, r.basis, r.rate, r.percentages, r.retired
            from reporting_task_rates t
            join reporting_rates r on r.organization_id = t.organization_id
                and r.name = t.rate_card_name and r.step = t.step and r.created_at <= t.priced_at
            where t.organization_id = %[2]s and t.rate_card_name is not null
            order by t.job_id, t.step, r.source_locale, r.target_locale, r.created_at desc, r.id desc
        ),
        units as (
            select s.project_id, %[3]s as job_id, s.source_locale, s.target_locale, s.step, s.bucket,
                sum(%[4]s) as words, sum(%[5]s) as strings, sum(%[6]s) as characters,
                sum(%[7]s) as characters_with_spaces, sum(%[8]s) as shown, sum(%[9]s) as uncounted
            from (%[10]s) s
            %[11]s
            where true%[12]s
            group by 1, 2, 3, 4, 5, 6
        ),
        resolved as (
            select u.*, t.override_usd is not null as fixed,
                case when t.rate_card_name is not null then 'task'
                    when b.rate_card_name is not null then 'budget'
                    when %[13]s is not null then 'chosen' end as priced_by,
                case when t.rate_card_name is not null then tr.id else l.id end as rate_id,
                coalesce(t.rate_card_name, b.rate_card_name, %[13]s) as card,
                case when t.rate_card_name is not null then tr.basis else l.basis end as basis,
                case when t.rate_card_name is not null then tr.rate else l.rate end as rate,
                case when t.rate_card_name is not null then tr.percentages else l.percentages end as percentages
            from units u
            left join reporting_task_rates t on t.organization_id = %[2]s and t.job_id = u.job_id and t.step = u.step
            left join task_lines tr on t.rate_card_name is not null and not tr.retired
                and tr.job_id = u.job_id and tr.step = u.step
                and tr.source_locale = u.source_locale and tr.target_locale = u.target_locale
            left join reporting_budgets b on b.organization_id = %[2]s and b.project_id = u.project_id
            left join live l on t.rate_card_name is null and not l.retired
                and l.name = coalesce(b.rate_card_name, %[13]s)
                and l.source_locale = u.source_locale and l.target_locale = u.target_locale and l.step = u.step
        )
        select
            (select coalesce(json_agg(g), '[]') from (
                select project_id as "projectId", target_locale as "targetLocale", step, bucket,
                    case when fixed then 'fixed' when rate_id is null then 'none' else 'rate' end as pricing,
                    case when fixed then null else priced_by end as "pricedBy",
                    case when fixed then null else rate_id end as "rateId",
                    case when fixed then null else card end as "rateCardName",
                    case when fixed then null else basis end as basis,
                    case when fixed then null else rate::text end as rate,
                    case when fixed then null else percentages end as percentages,
                    sum(shown)::float8 as units,
                    sum(case when fixed then 0 when basis = 'word' then words
                        when basis = 'character' then characters
                        when basis = 'character_with_spaces' then characters_with_spaces else 0 end)::float8 as "basisUnits",
                    sum(uncounted)::float8 as uncounted
                from resolved where %[14]s
                group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
                having sum(strings) > 0 or sum(uncounted) > 0
            ) g) as groups,
            (select coalesce(json_agg(h), '[]') from (
                select r.project_id as "projectId", r.job_id as "jobId", r.step,
                    r.target_locale as "targetLocale", r.rate_id as "rateId", r.rate::text as rate,
                    t.estimated_minutes as "estimatedMinutes",
                    (select coalesce(sum(e.minutes), 0) from reporting_time_entries e
                        where e.organization_id = %[2]s and e.project_id = r.project_id
                            and e.job_id = r.job_id and e.step = r.step and not e.voided)::integer as "loggedMinutes",
                    r.languages
                from (
                    select *, (count(*) over (partition by job_id, step))::integer as languages from (
                        select distinct project_id, job_id, step, target_locale, rate_id, rate from resolved
                        where basis = 'hour' and not fixed
                    ) lines
                ) r
                left join reporting_task_rates t on t.organization_id = %[2]s and t.job_id = r.job_id and t.step = r.step
                where %[15]s
            ) h) as hourly,
            (select count(distinct job_id) from units where %[14]s)::integer as tasks,
            (select count(distinct target_locale) from units where %[14]s)::integer as languages`,
		reportingLiveRateRowsSQL(org), org, task, value("words"), value("strings"), value("characters"),
		value("characters_with_spaces"), value(in.unit), uncounted, rows, ownJoin, stepFilter, chosenCard,
		chosenLanguage, hourlyLanguage), args...).
		Scan(&groupsJSON, &hourlyJSON, &result.tasks, &result.language)
	if err != nil {
		return result, fmt.Errorf("read priced units: %w", err)
	}
	if err := json.Unmarshal(groupsJSON, &result.groups); err != nil {
		return result, fmt.Errorf("decode priced units: %w", err)
	}
	if err := json.Unmarshal(hourlyJSON, &result.hourly); err != nil {
		return result, fmt.Errorf("decode hourly lines: %w", err)
	}
	return result, nil
}

type reportingHourlyCost struct {
	cost               *big.Int
	known, unestimated bool
}

// reportingHourlyCosts is the cost of hourly lines: a task's time estimate for a step, shared
// evenly between the languages it has on hourly lines. remaining takes off the time already
// logged. A line whose task has no estimate adds nothing and marks the cost unestimated.
func reportingHourlyCosts(lines []reportingHourlyLine, remaining bool, keyOf func(reportingHourlyLine) string) (map[string]*reportingHourlyCost, error) {
	costs := map[string]*reportingHourlyCost{}
	for _, line := range lines {
		key := keyOf(line)
		entry, ok := costs[key]
		if !ok {
			entry = &reportingHourlyCost{cost: new(big.Int)}
			costs[key] = entry
		}
		if line.EstimatedMinutes == nil {
			entry.unestimated = true
			continue
		}
		minutes := *line.EstimatedMinutes
		if remaining {
			minutes = max(0, minutes-line.LoggedMinutes)
		}
		cost, err := hourlyCost(line.Rate, minutes)
		if err != nil {
			return nil, err
		}
		entry.cost.Add(entry.cost, cost.Quo(cost, big.NewInt(int64(line.Languages))))
		entry.known = true
	}
	return costs, nil
}

type reportingFixedFee struct {
	ID        string `json:"-"`
	ProjectID string `json:"-"`
	JobID     string `json:"jobId"`
	JobTitle  string `json:"jobTitle"`
	Step      string `json:"step"`
	AmountUSD string `json:"amountUsd"`
}

func queryReportingFixedFees(ctx context.Context, db dictionaryDB, organizationID string, projectIDs, jobIDs []string, step string, uncharged bool) ([]reportingFixedFee, error) {
	fees := []reportingFixedFee{}
	if len(projectIDs) == 0 {
		return fees, nil
	}
	var args reportingArgs
	where := fmt.Sprintf("t.organization_id = %s and t.override_usd is not null and j.project_id = any(%s::text[])", args.add(organizationID), args.add(projectIDs))
	if len(jobIDs) > 0 {
		where += " and t.job_id = any(" + args.add(jobIDs) + "::text[])"
	}
	if step != "" {
		where += " and t.step = " + args.add(step)
	}
	if uncharged {
		where += " and " + reportingLiveTaskSQL + ` and not exists (select 1 from reporting_costs c
            where c.organization_id = t.organization_id and c.operation_key = 'task-override:' || t.id)`
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select t.id, j.project_id, t.job_id, %s as title, t.step, t.override_usd::text
        from reporting_task_rates t join jobs j on j.id = t.job_id
        where %s
        order by title, t.step`, reportingTaskTitleSQL("j"), where), args...)
	if err != nil {
		return nil, fmt.Errorf("read fixed fees: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var fee reportingFixedFee
		if err := rows.Scan(&fee.ID, &fee.ProjectID, &fee.JobID, &fee.JobTitle, &fee.Step, &fee.AmountUSD); err != nil {
			return nil, fmt.Errorf("scan fixed fee: %w", err)
		}
		fees = append(fees, fee)
	}
	return fees, rows.Err()
}

type reportingCostEstimateRow struct {
	TargetLocale string `json:"targetLocale"`
	Step         string `json:"step"`
	// fixed: the task has a fixed fee instead (listed in fixedFees); none: no rate.
	Pricing string `json:"pricing"`
	// Which cards priced the row, in pricing order; empty when no card applies.
	PricedBy []string `json:"pricedBy"`
	// The card that priced the row, or that has no rate for its language.
	RateCardName *string            `json:"rateCardName"`
	RateID       *string            `json:"rateId"`
	Basis        *string            `json:"basis"`
	Rate         *string            `json:"rate"`
	Percentages  json.RawMessage    `json:"percentages"`
	Bands        map[string]float64 `json:"bands"`
	Units        float64            `json:"units"`
	// In the rate line's basis, after its band percentages. Null for hourly lines and no rate.
	Weighted *float64 `json:"weighted"`
	// Null when nothing in the row could be priced.
	CostUSD *string `json:"costUsd"`
	// An hourly line on a task with no time estimate: that task's part of the cost is missing.
	Unestimated bool `json:"unestimated"`
	// Strings whose units could not be counted, priced at nothing.
	Uncounted float64 `json:"uncounted"`
	cost      *big.Int
}

type reportingCostEstimateTotals struct {
	Bands map[string]float64 `json:"bands"`
	Units float64            `json:"units"`
	// Only when every priced row is per word, or every one per character, and so on.
	Weighted      *float64 `json:"weighted"`
	WeightedBasis *string  `json:"weightedBasis"`
	CostUSD       string   `json:"costUsd"`
	// Units with no rate, left out of the cost.
	UnpricedUnits float64 `json:"unpricedUnits"`
	// Strings whose units could not be counted.
	Uncounted float64 `json:"uncounted"`
	// Units whose match band could not be worked out (the memory could not be read when they
	// arrived), priced as new work, so the cost may be too high.
	UnavailableUnits float64 `json:"unavailableUnits"`
	// The share of the per-unit cost saved by match discounts, against paying every band in full.
	MemorySavings *float64 `json:"memorySavings"`
	Tasks         int      `json:"tasks"`
	Languages     int      `json:"languages"`
	// Some work has no rate, no time estimate or no match band, so the cost is not exact.
	Incomplete bool `json:"incomplete"`
}

type reportingCostEstimate struct {
	RateCardName *string                    `json:"rateCardName"`
	PricingOrder string                     `json:"pricingOrder"`
	Rows         []reportingCostEstimateRow `json:"rows"`
	FixedFees    []reportingFixedFee        `json:"fixedFees"`
	// Fixed fees belong to a task, not a language, so a language filter leaves them out.
	FixedFeesLeftOut int                         `json:"fixedFeesLeftOut"`
	Totals           reportingCostEstimateTotals `json:"totals"`
	Unit             string                      `json:"unit,omitempty"`
}

// reportingRound rounds as JavaScript's Math.round does: halves up.
func reportingRound(value float64) float64 {
	return math.Floor(value + 0.5)
}

func reportingBigFloat(value *big.Int) float64 {
	result, _ := new(big.Float).SetInt(value).Float64()
	return result
}

// queryReportingCostEstimate reads what the chosen tasks will cost: every current string,
// finished or not, at the live rates. With no tasks chosen and one project, the whole project:
// every current string it holds, in a task or not, from its current rows. A whole workspace is
// never estimated: its tasks hold millions of summary rows.
func queryReportingCostEstimate(ctx context.Context, db dictionaryDB, scope reportingScope, jobIDs []string, step, unit string, rateCardName *string) (reportingCostEstimate, error) {
	projectIDs := scope.scopedProjectIDs()
	wholeProject := len(jobIDs) == 0 && scope.projectID != ""
	estimate := reportingCostEstimate{
		RateCardName: rateCardName, PricingOrder: reportingPricingOrder,
		Rows: []reportingCostEstimateRow{}, FixedFees: []reportingFixedFee{},
		Totals: reportingCostEstimateTotals{Bands: map[string]float64{}, CostUSD: usdString(new(big.Int))},
	}
	if len(projectIDs) == 0 || (len(jobIDs) == 0 && !wholeProject) {
		return estimate, nil
	}
	measure := "chosen"
	if wholeProject {
		measure = "project"
	}
	priced, err := queryReportingPricedUnits(ctx, db, reportingPricingInput{
		organizationID: scope.organizationID, projectIDs: projectIDs, jobIDs: jobIDs, targetLocale: scope.targetLocale,
		step: step, unit: unit, rateCardName: rateCardName, measure: measure,
	})
	if err != nil {
		return estimate, err
	}
	// A whole project is priced as one: no task's fixed fee stands in for its strings.
	allFees := []reportingFixedFee{}
	if !wholeProject {
		if allFees, err = queryReportingFixedFees(ctx, db, scope.organizationID, projectIDs, jobIDs, step, false); err != nil {
			return estimate, err
		}
	}
	fees := allFees
	if scope.targetLocale != "" {
		fees = []reportingFixedFee{}
	}
	lineKey := func(targetLocale, step string, rateID *string) string {
		return targetLocale + "\x00" + step + "\x00" + reportingOptionalNull(rateID)
	}
	hourly, err := reportingHourlyCosts(priced.hourly, false, func(line reportingHourlyLine) string {
		return lineKey(line.TargetLocale, line.Step, &line.RateID)
	})
	if err != nil {
		return estimate, err
	}
	rows := map[string]*reportingCostEstimateRow{}
	var order []string
	totals := &estimate.Totals
	cost, perUnitCost, perUnitFull := new(big.Int), new(big.Int), new(big.Int)
	bases := []string{}
	for _, group := range priced.groups {
		key := strings.Join([]string{group.TargetLocale, group.Step, group.Pricing, reportingOptionalNull(group.RateCardName), reportingOptionalNull(group.RateID)}, "\x00")
		row, ok := rows[key]
		if !ok {
			row = &reportingCostEstimateRow{
				TargetLocale: group.TargetLocale, Step: group.Step, Pricing: group.Pricing, PricedBy: []string{},
				RateCardName: group.RateCardName, RateID: group.RateID, Basis: group.Basis, Rate: group.Rate,
				Percentages: group.Percentages, Bands: map[string]float64{},
			}
			if group.Pricing == "rate" && reportingOptional(group.Basis) != "hour" {
				row.Weighted = new(float64)
			}
			if group.Pricing == "rate" {
				row.cost = new(big.Int)
			}
			rows[key] = row
			order = append(order, key)
		}
		if group.PricedBy != nil && !slices.Contains(row.PricedBy, *group.PricedBy) {
			row.PricedBy = append(row.PricedBy, *group.PricedBy)
		}
		if group.Units > 0 {
			row.Bands[group.Bucket] += group.Units
			totals.Bands[group.Bucket] += group.Units
		}
		row.Units += group.Units
		// Uncounted strings matter only where work is priced per unit.
		if group.Pricing == "rate" && reportingOptional(group.Basis) != "hour" {
			row.Uncounted += group.Uncounted
			totals.Uncounted += group.Uncounted
		}
		totals.Units += group.Units
		if group.Pricing == "none" {
			totals.UnpricedUnits += group.Units
		}
		if group.Bucket == "unavailable" && group.Units > 0 {
			totals.UnavailableUnits += group.Units
		}
		if group.Pricing != "rate" || reportingOptional(group.Basis) == "hour" || group.Rate == nil {
			continue
		}
		percent, err := reportingPaidPercent(group.Percentages, group.Bucket)
		if err != nil {
			return estimate, err
		}
		units := int(reportingRound(group.BasisUnits))
		*row.Weighted += float64(units*percent) / 100
		groupCost, err := unitCost(*group.Rate, units, percent)
		if err != nil {
			return estimate, err
		}
		row.cost.Add(row.cost, groupCost)
		perUnitCost.Add(perUnitCost, groupCost)
		full, err := unitCost(*group.Rate, units, 100)
		if err != nil {
			return estimate, err
		}
		perUnitFull.Add(perUnitFull, full)
		if !slices.Contains(bases, *group.Basis) {
			bases = append(bases, *group.Basis)
		}
	}
	for _, key := range order {
		row := rows[key]
		if row.Pricing == "rate" && reportingOptional(row.Basis) == "hour" {
			hours, ok := hourly[lineKey(row.TargetLocale, row.Step, row.RateID)]
			row.cost = nil
			if ok && hours.known {
				row.cost = hours.cost
			}
			row.Unestimated = !ok || hours.unestimated
		}
		if row.cost != nil {
			cost.Add(cost, row.cost)
			text := usdString(row.cost)
			row.CostUSD = &text
		}
		if row.Pricing == "none" || row.Unestimated || row.Uncounted > 0 {
			totals.Incomplete = true
		}
	}
	if totals.UnavailableUnits > 0 {
		totals.Incomplete = true
	}
	for _, fee := range fees {
		amount, err := usdUnits(fee.AmountUSD)
		if err != nil {
			return estimate, err
		}
		cost.Add(cost, amount)
	}
	totals.CostUSD = usdString(cost)
	if len(bases) == 1 {
		totals.WeightedBasis = &bases[0]
		weighted := 0.0
		for _, key := range order {
			if rows[key].Weighted != nil {
				weighted += *rows[key].Weighted
			}
		}
		totals.Weighted = &weighted
	}
	if perUnitFull.Sign() > 0 {
		savings := reportingBigFloat(new(big.Int).Sub(perUnitFull, perUnitCost)) / reportingBigFloat(perUnitFull)
		totals.MemorySavings = &savings
	}
	totals.Tasks = priced.tasks
	totals.Languages = priced.language
	for _, key := range order {
		row := *rows[key]
		pricedBy := []string{}
		for _, source := range reportingPricedBy {
			if slices.Contains(row.PricedBy, source) {
				pricedBy = append(pricedBy, source)
			}
		}
		row.PricedBy = pricedBy
		estimate.Rows = append(estimate.Rows, row)
	}
	slices.SortStableFunc(estimate.Rows, func(a, b reportingCostEstimateRow) int {
		if c := compareReportingNames(a.TargetLocale, b.TargetLocale); c != 0 {
			return c
		}
		return slices.Index(reportingStepOptions, a.Step) - slices.Index(reportingStepOptions, b.Step)
	})
	estimate.FixedFees = fees
	estimate.FixedFeesLeftOut = len(allFees) - len(fees)
	return estimate, nil
}

func reportingOptionalNull(value *string) string {
	if value == nil {
		return "null"
	}
	return *value
}

type reportingStillToCome struct {
	AmountUSD  string `json:"amountUsd"`
	Incomplete bool   `json:"incomplete"`
}

// queryReportingStillToCome reads what unfinished paid work will still cost, per project:
// unfinished strings of open tasks assigned to a person and unfinished work already marked
// payable, at the live rates; the time still estimated on hourly lines; and fixed fees not yet
// charged.
func queryReportingStillToCome(ctx context.Context, db dictionaryDB, organizationID string, projectIDs, jobIDs []string, step string, rateCardName *string) (map[string]reportingStillToCome, error) {
	result := map[string]reportingStillToCome{}
	if len(projectIDs) == 0 {
		return result, nil
	}
	type entry struct {
		amount     *big.Int
		incomplete bool
	}
	byProject := map[string]*entry{}
	project := func(projectID string) *entry {
		e, ok := byProject[projectID]
		if !ok {
			e = &entry{amount: new(big.Int)}
			byProject[projectID] = e
		}
		return e
	}
	priced, err := queryReportingPricedUnits(ctx, db, reportingPricingInput{
		organizationID: organizationID, projectIDs: projectIDs, jobIDs: jobIDs, step: step, unit: "words",
		rateCardName: rateCardName, measure: "toCome",
	})
	if err != nil {
		return nil, err
	}
	fees, err := queryReportingFixedFees(ctx, db, organizationID, projectIDs, jobIDs, step, true)
	if err != nil {
		return nil, err
	}
	for _, group := range priced.groups {
		e := project(group.ProjectID)
		if group.Pricing == "none" || (group.Bucket == "unavailable" && group.Units > 0) {
			e.incomplete = true
		}
		if group.Pricing != "rate" || reportingOptional(group.Basis) == "hour" || group.Rate == nil {
			continue
		}
		if group.Uncounted > 0 {
			e.incomplete = true
		}
		percent, err := reportingPaidPercent(group.Percentages, group.Bucket)
		if err != nil {
			return nil, err
		}
		cost, err := unitCost(*group.Rate, int(reportingRound(group.BasisUnits)), percent)
		if err != nil {
			return nil, err
		}
		e.amount.Add(e.amount, cost)
	}
	hourly, err := reportingHourlyCosts(priced.hourly, true, func(line reportingHourlyLine) string { return line.ProjectID })
	if err != nil {
		return nil, err
	}
	for projectID, hours := range hourly {
		e := project(projectID)
		e.amount.Add(e.amount, hours.cost)
		if hours.unestimated {
			e.incomplete = true
		}
	}
	for _, fee := range fees {
		amount, err := usdUnits(fee.AmountUSD)
		if err != nil {
			return nil, err
		}
		project(fee.ProjectID).amount.Add(project(fee.ProjectID).amount, amount)
	}
	for projectID, e := range byProject {
		result[projectID] = reportingStillToCome{AmountUSD: usdString(e.amount), Incomplete: e.incomplete}
	}
	return result, nil
}

type reportingSpending struct {
	people *big.Int
	// Billing's AI charges on the project's tasks; nil when the costs are filtered by language.
	aiOnTasks *big.Int
	// Billing's AI charges in the project with no task, such as content editor suggestions.
	aiOutsideTasks *big.Int
	// People's work with no rate, so no amount.
	unpriced int
	// Billed AI calls whose charge billing has not received yet.
	pendingAi int
}

type reportingOutsideSpending struct {
	aiOnTasks, aiOutsideTasks *big.Int
	pendingAi                 int
}

// queryReportingSpending reads money spent per project: people's work as recorded, and
// billing's charges for AI through our AI gateway (calls on the workspace's own provider key
// cost the workspace nothing through us), placed in projects by reportingAttributedUsageSQL. A
// charge on a task counts by its task, one with no task by its recorded project, so none counts
// twice. With no days given, everything spent so far. Billing's AI charges tied to no project
// come back apart, when asked for and not filtered by language.
func queryReportingSpending(ctx context.Context, db dictionaryDB, organizationID string, projectIDs []string, from, to, targetLocale string, outsideProjects bool) (map[string]*reportingSpending, *reportingOutsideSpending, error) {
	byProject := map[string]*reportingSpending{}
	withAi := targetLocale == ""
	outside := withAi && outsideProjects
	if len(projectIDs) == 0 && !outside {
		return byProject, nil, nil
	}
	project := func(projectID string) *reportingSpending {
		e, ok := byProject[projectID]
		if !ok {
			e = &reportingSpending{people: new(big.Int)}
			if withAi {
				e.aiOnTasks, e.aiOutsideTasks = new(big.Int), new(big.Int)
			}
			byProject[projectID] = e
		}
		return e
	}
	if len(projectIDs) > 0 {
		var args reportingArgs
		where := fmt.Sprintf("c.organization_id = %s and c.project_id = any(%s::text[]) and not c.voided and c.kind = 'human'", args.add(organizationID), args.add(projectIDs))
		if targetLocale != "" {
			where += " and c.target_locale = " + args.add(targetLocale)
		}
		if from != "" && to != "" {
			where += fmt.Sprintf(" and c.created_at >= %s and c.created_at < %s", reportingDayStart(args.add(from)), reportingDayEnd(args.add(to)))
		}
		rows, err := db.Query(ctx, `
            select c.project_id, round(coalesce(sum(c.amount_usd), 0), 8)::text as amount,
                count(*) filter (where c.amount_usd is null)::integer as unpriced
            from reporting_costs c where `+where+` group by 1`, args...)
		if err != nil {
			return nil, nil, fmt.Errorf("read spending: %w", err)
		}
		for rows.Next() {
			var projectID, amount string
			var unpriced int
			if err := rows.Scan(&projectID, &amount, &unpriced); err != nil {
				rows.Close()
				return nil, nil, fmt.Errorf("scan spending: %w", err)
			}
			units, err := usdUnits(amount)
			if err != nil {
				rows.Close()
				return nil, nil, err
			}
			e := project(projectID)
			e.people.Add(e.people, units)
			e.unpriced += unpriced
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, nil, fmt.Errorf("read spending: %w", err)
		}
	}
	var outsideSpending *reportingOutsideSpending
	if outside {
		outsideSpending = &reportingOutsideSpending{aiOnTasks: new(big.Int), aiOutsideTasks: new(big.Int)}
	}
	if !withAi {
		return byProject, outsideSpending, nil
	}
	var args reportingArgs
	org := args.add(organizationID)
	within := ""
	if from != "" && to != "" {
		within = fmt.Sprintf(" and u.created_at >= %s and u.created_at < %s", reportingDayStart(args.add(from)), reportingDayEnd(args.add(to)))
	}
	projects := "false"
	if len(projectIDs) > 0 {
		projects = "project_id = any(" + args.add(projectIDs) + "::text[])"
	}
	if outside {
		projects = "(" + projects + " or project_id is null)"
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select project_id, job_id is not null as on_task,
            round(coalesce(sum(amount_usd), 0), 8)::text as amount,
            count(*) filter (where amount_usd is null)::integer as pending
        from (%s) charges
        where %s
        group by 1, 2`,
		reportingAttributedUsageSQL(org, "u.feature_id = 'ai_tokens' and u.credential_source = 'gateway' and u.status <> 'rejected'"+within),
		projects), args...)
	if err != nil {
		return nil, nil, fmt.Errorf("read AI spending: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var projectID *string
		var onTask bool
		var amount string
		var pending int
		if err := rows.Scan(&projectID, &onTask, &amount, &pending); err != nil {
			return nil, nil, fmt.Errorf("scan AI spending: %w", err)
		}
		units, err := usdUnits(amount)
		if err != nil {
			return nil, nil, err
		}
		if projectID == nil {
			// A task outside any project, or a call with none, such as chat.
			if onTask {
				outsideSpending.aiOnTasks.Add(outsideSpending.aiOnTasks, units)
			} else {
				outsideSpending.aiOutsideTasks.Add(outsideSpending.aiOutsideTasks, units)
			}
			outsideSpending.pendingAi += pending
			continue
		}
		e := project(*projectID)
		if onTask {
			e.aiOnTasks.Add(e.aiOnTasks, units)
		} else {
			e.aiOutsideTasks.Add(e.aiOutsideTasks, units)
		}
		e.pendingAi += pending
	}
	return byProject, outsideSpending, rows.Err()
}

func (s *reportingSpending) aiTotal() *big.Int {
	total := new(big.Int)
	if s == nil {
		return total
	}
	if s.aiOnTasks != nil {
		total.Add(total, s.aiOnTasks)
	}
	if s.aiOutsideTasks != nil {
		total.Add(total, s.aiOutsideTasks)
	}
	return total
}

func (s *reportingSpending) total() *big.Int {
	if s == nil {
		return new(big.Int)
	}
	return new(big.Int).Add(s.people, s.aiTotal())
}

type reportingCostRow struct {
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	PeopleUSD   string `json:"peopleUsd"`
	// Both parts of the project's AI; null when the costs are filtered by language.
	AIUSD             *string `json:"aiUsd"`
	AIOnTasksUSD      *string `json:"aiOnTasksUsd"`
	AIOutsideTasksUSD *string `json:"aiOutsideTasksUsd"`
	TotalUSD          string  `json:"totalUsd"`
}

type reportingOutsideCosts struct {
	AIUSD             string `json:"aiUsd"`
	AIOnTasksUSD      string `json:"aiOnTasksUsd"`
	AIOutsideTasksUSD string `json:"aiOutsideTasksUsd"`
}

type reportingCostTotals struct {
	PeopleUSD         string  `json:"peopleUsd"`
	AIUSD             *string `json:"aiUsd"`
	AIOnTasksUSD      *string `json:"aiOnTasksUsd"`
	AIOutsideTasksUSD *string `json:"aiOutsideTasksUsd"`
	TotalUSD          string  `json:"totalUsd"`
}

type reportingCosts struct {
	Period reportingPeriod    `json:"period"`
	Rows   []reportingCostRow `json:"rows"`
	// AI charged with no project (chat, assistants, tasks outside any project), when no project is chosen.
	OutsideProjects  *reportingOutsideCosts `json:"outsideProjects"`
	Totals           reportingCostTotals    `json:"totals"`
	PreviousTotalUSD string                 `json:"previousTotalUsd"`
	Unpriced         int                    `json:"unpriced"`
	PendingAi        int                    `json:"pendingAi"`
}

func usdPointer(value *big.Int) *string {
	if value == nil {
		return nil
	}
	text := usdString(value)
	return &text
}

// queryReportingCosts reads what was spent in a period, by project, with the previous period's
// total. With includeUnattributed and no project chosen, AI charged outside any project is added
// as its own line and in the totals, so the workspace's total covers all of billing's AI charges.
func queryReportingCosts(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, includeUnattributed bool) (reportingCosts, error) {
	costs := reportingCosts{Period: period, Rows: []reportingCostRow{}}
	projectIDs := scope.scopedProjectIDs()
	outsideProjects := includeUnattributed && scope.projectID == ""
	current, outside, err := queryReportingSpending(ctx, db, scope.organizationID, projectIDs, period.From, period.To, scope.targetLocale, outsideProjects)
	if err != nil {
		return costs, err
	}
	previous, previousOutside, err := queryReportingSpending(ctx, db, scope.organizationID, projectIDs, period.PreviousFrom, period.PreviousTo, scope.targetLocale, outsideProjects)
	if err != nil {
		return costs, err
	}
	names, err := reportingGroupNames(ctx, db, projectIDs, func(id string) (*string, *string) { return &id, nil })
	if err != nil {
		return costs, err
	}
	languageFiltered := scope.targetLocale != ""
	people, aiOnTasks, aiOutsideTasks := new(big.Int), new(big.Int), new(big.Int)
	if outside != nil {
		costs.PendingAi = outside.pendingAi
	}
	for projectID, e := range current {
		people.Add(people, e.people)
		aiOnTasks.Add(aiOnTasks, e.aiTotalOnTasks())
		aiOutsideTasks.Add(aiOutsideTasks, e.aiTotalOutsideTasks())
		costs.Unpriced += e.unpriced
		costs.PendingAi += e.pendingAi
		name := projectID
		if found := names.projectNames[projectID]; found != nil {
			name = *found
		}
		row := reportingCostRow{
			ProjectID: projectID, ProjectName: name, PeopleUSD: usdString(e.people),
			AIOnTasksUSD: usdPointer(e.aiOnTasks), AIOutsideTasksUSD: usdPointer(e.aiOutsideTasks),
			TotalUSD: usdString(e.total()),
		}
		if !languageFiltered {
			row.AIUSD = usdPointer(e.aiTotal())
		}
		costs.Rows = append(costs.Rows, row)
	}
	slices.SortStableFunc(costs.Rows, func(a, b reportingCostRow) int { return compareReportingNames(a.ProjectName, b.ProjectName) })
	onTasks, outsideTasks := new(big.Int).Set(aiOnTasks), new(big.Int).Set(aiOutsideTasks)
	if outside != nil {
		onTasks.Add(onTasks, outside.aiOnTasks)
		outsideTasks.Add(outsideTasks, outside.aiOutsideTasks)
		costs.OutsideProjects = &reportingOutsideCosts{
			AIUSD:             usdString(new(big.Int).Add(outside.aiOnTasks, outside.aiOutsideTasks)),
			AIOnTasksUSD:      usdString(outside.aiOnTasks),
			AIOutsideTasksUSD: usdString(outside.aiOutsideTasks),
		}
	}
	allAi := new(big.Int).Add(onTasks, outsideTasks)
	previousTotal := new(big.Int)
	for _, e := range previous {
		previousTotal.Add(previousTotal, e.total())
	}
	if previousOutside != nil {
		previousTotal.Add(previousTotal, previousOutside.aiOnTasks)
		previousTotal.Add(previousTotal, previousOutside.aiOutsideTasks)
	}
	costs.Totals = reportingCostTotals{PeopleUSD: usdString(people), TotalUSD: usdString(new(big.Int).Add(people, allAi))}
	if !languageFiltered {
		costs.Totals.AIUSD, costs.Totals.AIOnTasksUSD, costs.Totals.AIOutsideTasksUSD = usdPointer(allAi), usdPointer(onTasks), usdPointer(outsideTasks)
	}
	costs.PreviousTotalUSD = usdString(previousTotal)
	return costs, nil
}

func (s *reportingSpending) aiTotalOnTasks() *big.Int {
	if s.aiOnTasks == nil {
		return new(big.Int)
	}
	return s.aiOnTasks
}

func (s *reportingSpending) aiTotalOutsideTasks() *big.Int {
	if s.aiOutsideTasks == nil {
		return new(big.Int)
	}
	return s.aiOutsideTasks
}

type reportingBudgetRow struct {
	ProjectID      string  `json:"projectId"`
	ProjectName    string  `json:"projectName"`
	BudgetUSD      string  `json:"budgetUsd"`
	RateCardName   *string `json:"rateCardName"`
	SpentUSD       string  `json:"spentUsd"`
	StillToComeUSD string  `json:"stillToComeUsd"`
	ForecastUSD    string  `json:"forecastUsd"`
	RemainingUSD   string  `json:"remainingUsd"`
	Status         string  `json:"status"`
	// Some unfinished work has no rate or no time estimate, so still to come is too low.
	Incomplete bool `json:"incomplete"`
	// People's work with no rate, left out of spent.
	Unpriced  int `json:"unpriced"`
	PendingAi int `json:"pendingAi"`
}

// reportingBudgetStatus is the worst of a budget's states: spent past it, forecast past it, or
// past 80% spent.
func reportingBudgetStatus(budget, spent, forecast *big.Int) string {
	if spent.Cmp(budget) > 0 {
		return "over_budget"
	}
	if forecast.Cmp(budget) > 0 {
		return "forecast_over"
	}
	if new(big.Int).Mul(spent, big.NewInt(100)).Cmp(new(big.Int).Mul(budget, big.NewInt(80))) >= 0 {
		return "over_80"
	}
	return "on_track"
}

// queryReportingBudgets reads each project's all-time budget against what has been spent and
// what is still to come.
func queryReportingBudgets(ctx context.Context, db dictionaryDB, organizationID string, projectIDs []string) ([]reportingBudgetRow, error) {
	budgets := []reportingBudgetRow{}
	if len(projectIDs) == 0 {
		return budgets, nil
	}
	rows, err := db.Query(ctx, `
        select b.project_id, p.name, b.budget::text, b.rate_card_name
        from reporting_budgets b join projects p on p.id = b.project_id
        where b.organization_id = $1 and b.project_id = any($2::text[])
        order by p.name`, organizationID, projectIDs)
	if err != nil {
		return nil, fmt.Errorf("read budgets: %w", err)
	}
	for rows.Next() {
		var row reportingBudgetRow
		if err := rows.Scan(&row.ProjectID, &row.ProjectName, &row.BudgetUSD, &row.RateCardName); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan budget: %w", err)
		}
		budgets = append(budgets, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read budgets: %w", err)
	}
	if len(budgets) == 0 {
		return budgets, nil
	}
	budgeted := make([]string, 0, len(budgets))
	for _, row := range budgets {
		budgeted = append(budgeted, row.ProjectID)
	}
	spent, _, err := queryReportingSpending(ctx, db, organizationID, budgeted, "", "", "", false)
	if err != nil {
		return nil, err
	}
	toCome, err := queryReportingStillToCome(ctx, db, organizationID, budgeted, nil, "", nil)
	if err != nil {
		return nil, err
	}
	for i := range budgets {
		row := &budgets[i]
		budget, err := usdUnits(row.BudgetUSD)
		if err != nil {
			return nil, err
		}
		spending := spent[row.ProjectID]
		spentAmount := spending.total()
		toComeAmount := new(big.Int)
		if pending, ok := toCome[row.ProjectID]; ok {
			if toComeAmount, err = usdUnits(pending.AmountUSD); err != nil {
				return nil, err
			}
			row.Incomplete = pending.Incomplete
		}
		forecast := new(big.Int).Add(spentAmount, toComeAmount)
		row.SpentUSD = usdString(spentAmount)
		row.StillToComeUSD = usdString(toComeAmount)
		row.ForecastUSD = usdString(forecast)
		row.RemainingUSD = usdString(new(big.Int).Sub(budget, spentAmount))
		row.Status = reportingBudgetStatus(budget, spentAmount, forecast)
		if spending != nil {
			row.Unpriced, row.PendingAi = spending.unpriced, spending.pendingAi
		}
	}
	return budgets, nil
}

// Routes.

type reportingBudget struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      string  `json:"projectId"`
	Budget         string  `json:"budget"`
	RateCardName   *string `json:"rateCardName"`
	CreatedAt      string  `json:"createdAt"`
}

// saveBudget sets a project's all-time budget and the card that prices its work.
func (api *reportingAPI) saveBudget(r *http.Request, actor reportingActor) (any, int, error) {
	body, err := readReportingBody(r, "invalid_budget")
	if err != nil {
		return nil, 0, err
	}
	projectID := body.text("projectId", 1, math.MaxInt)
	budget := body.usd("budget")
	rateCardName := body.nullableTrimmedText("rateCardName", 100)
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_budget")
	}
	ctx := r.Context()
	var saved reportingBudget
	err = api.write(ctx, func(tx pgx.Tx) error {
		projectIDs, err := reportingProjectIDs(ctx, tx, actor)
		if err != nil {
			return err
		}
		if !slices.Contains(projectIDs, projectID) {
			return reportingFailure(404, "project_not_found", "Resource not found")
		}
		if rateCardName != nil {
			exists, err := reportingRateCardExists(ctx, tx, actor.organizationID, *rateCardName)
			if err != nil {
				return err
			}
			if !exists {
				return reportingFailure(400, "rate_card_not_found", "Request payload is invalid")
			}
		}
		var created time.Time
		if err := tx.QueryRow(ctx, `
            insert into reporting_budgets (organization_id, project_id, budget, rate_card_name) values ($1, $2, $3::numeric, $4)
            on conflict (organization_id, project_id) do update set budget = excluded.budget, rate_card_name = excluded.rate_card_name
            returning id, organization_id, project_id, budget::text, rate_card_name, created_at`,
			actor.organizationID, projectID, budget, rateCardName).
			Scan(&saved.ID, &saved.OrganizationID, &saved.ProjectID, &saved.Budget, &saved.RateCardName, &created); err != nil {
			return fmt.Errorf("save budget: %w", err)
		}
		saved.CreatedAt = formatReportingTime(created)
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"budget": saved}, http.StatusOK, nil
}

func (api *reportingAPI) costs(r *http.Request, actor reportingActor) (any, int, error) {
	q := readReportingQuery(r)
	from, to := q.dates()
	projectID := q.id("projectId")
	targetLocale := q.text("targetLocale", 2, 35)
	format := q.format()
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var costs reportingCosts
	err := api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		costs, err = queryReportingCosts(ctx, db, view.scope(projectID, "", targetLocale), view.period(from, to), true)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if format == "csv" {
		return reportingCostsCSV(costs), http.StatusOK, nil
	}
	return map[string]any{"costs": costs}, http.StatusOK, nil
}

// costEstimate is for chosen tasks, or for the whole of one project.
func (api *reportingAPI) costEstimate(r *http.Request, actor reportingActor) (any, int, error) {
	q := readReportingQuery(r)
	projectID := q.id("projectId")
	targetLocale := q.text("targetLocale", 2, 35)
	jobIDs := q.idList("jobIds")
	step := q.step("")
	unit := q.unit()
	rateCard := q.trimmed("rateCard", 100)
	if _, given := q.raw("rateCard"); given && rateCard == "" {
		q.fail()
	}
	format := q.format()
	if len(jobIDs) == 0 && projectID == "" {
		q.fail()
	}
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	var rateCardName *string
	if rateCard != "" {
		rateCardName = &rateCard
	}
	ctx := r.Context()
	var estimate reportingCostEstimate
	err := api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		estimate, err = queryReportingCostEstimate(ctx, db, view.scope(projectID, "", targetLocale), jobIDs, step, unit, rateCardName)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if format == "csv" {
		return reportingCostEstimateCSV(estimate), http.StatusOK, nil
	}
	estimate.Unit = unit
	return map[string]any{"costEstimate": estimate}, http.StatusOK, nil
}

func (api *reportingAPI) budgets(r *http.Request, actor reportingActor) (any, int, error) {
	q := readReportingQuery(r)
	projectID := q.id("projectId")
	format := q.format()
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var budgets []reportingBudgetRow
	err := api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		budgets, err = queryReportingBudgets(ctx, db, actor.organizationID, view.scope(projectID, "", "").scopedProjectIDs())
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if format == "csv" {
		return reportingBudgetsCSV(budgets), http.StatusOK, nil
	}
	return map[string]any{"budgets": budgets}, http.StatusOK, nil
}

// CSVs.

func reportingCostsCSV(costs reportingCosts) reportingCSV {
	return reportingCSV{filename: "costs.csv", write: func(w *reportingCSVWriter) error {
		if err := w.row("projectName", "projectId", "peopleUsd", "aiOnTasksUsd", "aiOutsideTasksUsd", "aiUsd", "totalUsd"); err != nil {
			return err
		}
		for _, row := range costs.Rows {
			if err := w.row(row.ProjectName, row.ProjectID, row.PeopleUSD, reportingOptional(row.AIOnTasksUSD), reportingOptional(row.AIOutsideTasksUSD), reportingOptional(row.AIUSD), row.TotalUSD); err != nil {
				return err
			}
		}
		// AI charged outside any project: a row with no project.
		if outside := costs.OutsideProjects; outside != nil {
			return w.row("", "", "", outside.AIOnTasksUSD, outside.AIOutsideTasksUSD, outside.AIUSD, outside.AIUSD)
		}
		return nil
	}}
}

// reportingBandsIn lists the bands with units, in their order.
func reportingBandsIn(totals map[string]float64) []string {
	var bands []string
	for _, bucket := range reportingMatchBucket {
		if totals[bucket] > 0 {
			bands = append(bands, bucket)
		}
	}
	return bands
}

// reportingHundredths rounds to two decimals as JavaScript's Math.round(x * 100) / 100 does.
func reportingHundredths(value float64) string {
	return reportingNumber(reportingRound(value*100) / 100)
}

func reportingCostEstimateCSV(estimate reportingCostEstimate) reportingCSV {
	return reportingCSV{filename: "cost-estimate.csv", write: func(w *reportingCSVWriter) error {
		bands := reportingBandsIn(estimate.Totals.Bands)
		header := append([]string{"targetLocale", "step", "pricing", "pricedBy", "rateCardName", "basis", "rate"}, bands...)
		if err := w.row(append(header, "units", "weighted", "costUsd", "jobTitle", "jobId")...); err != nil {
			return err
		}
		for _, row := range estimate.Rows {
			cells := []string{row.TargetLocale, row.Step, row.Pricing, strings.Join(row.PricedBy, " "), reportingOptional(row.RateCardName), reportingOptional(row.Basis), reportingOptional(row.Rate)}
			for _, bucket := range bands {
				cells = append(cells, reportingNumber(row.Bands[bucket]))
			}
			weighted := ""
			if row.Weighted != nil {
				weighted = reportingHundredths(*row.Weighted)
			}
			if err := w.row(append(cells, reportingNumber(row.Units), weighted, reportingOptional(row.CostUSD), "", "")...); err != nil {
				return err
			}
		}
		for _, fee := range estimate.FixedFees {
			cells := []string{"", fee.Step, "fixed", "", "", "", ""}
			for range bands {
				cells = append(cells, "")
			}
			if err := w.row(append(cells, "", "", fee.AmountUSD, fee.JobTitle, fee.JobID)...); err != nil {
				return err
			}
		}
		return nil
	}}
}

func reportingBudgetsCSV(budgets []reportingBudgetRow) reportingCSV {
	return reportingCSV{filename: "budgets.csv", write: func(w *reportingCSVWriter) error {
		if err := w.row("projectName", "projectId", "budgetUsd", "spentUsd", "stillToComeUsd", "forecastUsd", "remainingUsd", "status", "incomplete"); err != nil {
			return err
		}
		for _, row := range budgets {
			if err := w.row(row.ProjectName, row.ProjectID, row.BudgetUSD, row.SpentUSD, row.StillToComeUSD, row.ForecastUSD, row.RemainingUSD, row.Status, strconv.FormatBool(row.Incomplete)); err != nil {
				return err
			}
		}
		return nil
	}}
}
