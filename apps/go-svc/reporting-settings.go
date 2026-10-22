package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type reportingProject struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	TargetLocales json.RawMessage `json:"targetLocales"`
}

type reportingRate struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organizationId"`
	Name           string          `json:"name"`
	SourceLocale   string          `json:"sourceLocale"`
	TargetLocale   string          `json:"targetLocale"`
	Step           string          `json:"step"`
	Basis          string          `json:"basis"`
	Rate           string          `json:"rate"`
	Percentages    json.RawMessage `json:"percentages"`
	CreatedAt      string          `json:"createdAt"`
}

const reportingRateColumns = `id, organization_id, name, source_locale, target_locale, step, basis, rate::text, percentages, created_at`

func scanReportingRate(row pgx.Row) (reportingRate, error) {
	var rate reportingRate
	var created time.Time
	err := row.Scan(&rate.ID, &rate.OrganizationID, &rate.Name, &rate.SourceLocale, &rate.TargetLocale,
		&rate.Step, &rate.Basis, &rate.Rate, &rate.Percentages, &created)
	rate.CreatedAt = formatReportingTime(created)
	return rate, err
}

type reportingBudget struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	Budget         string  `json:"budget"`
	RateCardName   *string `json:"rateCardName"`
	CreatedAt      string  `json:"createdAt"`
}

const reportingBudgetColumns = `id, organization_id, project_id, budget::text, rate_card_name, created_at`

func scanReportingBudget(row pgx.Row) (reportingBudget, error) {
	var budget reportingBudget
	var created time.Time
	err := row.Scan(&budget.ID, &budget.OrganizationID, &budget.ProjectID, &budget.Budget, &budget.RateCardName, &created)
	budget.CreatedAt = formatReportingTime(created)
	return budget, err
}

type reportingBudgetSummary struct {
	reportingBudget
	AccruedUSD      string `json:"accruedUsd"`
	OutstandingUSD  string `json:"outstandingUsd"`
	ForecastUSD     string `json:"forecastUsd"`
	RemainingUSD    string `json:"remainingUsd"`
	Incomplete      bool   `json:"incomplete"`
	SpendWarning    string `json:"spendWarning"`
	ForecastWarning string `json:"forecastWarning"`
}

type reportingSettings struct {
	Projects  []reportingProject       `json:"projects"`
	Rates     []reportingRate          `json:"rates"`
	Budgets   []reportingBudgetSummary `json:"budgets"`
	Financial bool                     `json:"financial"`
	CanManage bool                     `json:"canManage"`
}

func (h *handler) getReportSettings(r *http.Request, actor workspaceActor) (any, int, error) {
	ctx, db := r.Context(), h.workspace.pool
	projectIDs, err := reportingProjectIDs(ctx, db, actor)
	if err != nil {
		return nil, 0, err
	}
	settings := reportingSettings{Projects: []reportingProject{}, Rates: []reportingRate{}, Budgets: []reportingBudgetSummary{}}
	if len(projectIDs) > 0 {
		if settings.Projects, err = loadReportingProjects(ctx, db, projectIDs); err != nil {
			return nil, 0, err
		}
	}
	if !hasOrganizationCapability(actor.role, "billing:read") {
		return map[string]any{"settings": settings}, http.StatusOK, nil
	}
	rows, err := db.Query(ctx, `select `+reportingRateColumns+` from reporting_rates where organization_id=$1 order by created_at desc`, actor.organizationID)
	if err != nil {
		return nil, 0, fmt.Errorf("list reporting rates: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		rate, err := scanReportingRate(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan reporting rate: %w", err)
		}
		settings.Rates = append(settings.Rates, rate)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("list reporting rates: %w", err)
	}
	if settings.Budgets, err = budgetSummary(ctx, db, actor.organizationID, projectIDs); err != nil {
		return nil, 0, err
	}
	settings.Financial = true
	settings.CanManage = hasOrganizationCapability(actor.role, "billing:write")
	return map[string]any{"settings": settings}, http.StatusOK, nil
}

func loadReportingProjects(ctx context.Context, db dictionaryDB, projectIDs []string) ([]reportingProject, error) {
	rows, err := db.Query(ctx, `select id, name, target_locales from projects where id = any($1::text[])`, projectIDs)
	if err != nil {
		return nil, fmt.Errorf("list reporting settings projects: %w", err)
	}
	defer rows.Close()
	projects := []reportingProject{}
	for rows.Next() {
		var project reportingProject
		if err := rows.Scan(&project.ID, &project.Name, &project.TargetLocales); err != nil {
			return nil, fmt.Errorf("scan reporting settings project: %w", err)
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func budgetSummary(ctx context.Context, db dictionaryDB, organizationID string, projectIDs []string) ([]reportingBudgetSummary, error) {
	summaries := []reportingBudgetSummary{}
	if len(projectIDs) == 0 {
		return summaries, nil
	}
	rows, err := db.Query(ctx, `select `+reportingBudgetColumns+` from reporting_budgets where organization_id=$1 and project_id = any($2::text[])`,
		organizationID, projectIDs)
	if err != nil {
		return nil, fmt.Errorf("list reporting budgets: %w", err)
	}
	budgets, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (reportingBudget, error) { return scanReportingBudget(row) })
	if err != nil {
		return nil, fmt.Errorf("list reporting budgets: %w", err)
	}
	for _, budget := range budgets {
		summary, err := summarizeReportingBudget(ctx, db, organizationID, budget)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, summary)
	}
	return summaries, nil
}

type reportingPendingWork struct {
	words       *int
	bucket      string
	rate, basis *string
	percentages []byte
}

func summarizeReportingBudget(ctx context.Context, db dictionaryDB, organizationID string, budget reportingBudget) (reportingBudgetSummary, error) {
	var accruedText string
	var unpriced int
	if err := db.QueryRow(ctx, `
        select coalesce(sum(c.amount_usd),0)::text as amount, count(*) filter(where c.amount_usd is null)::integer as unpriced
        from reporting_costs c where c.organization_id=$1 and c.project_id=$2 and not c.voided`,
		organizationID, budget.ProjectID).Scan(&accruedText, &unpriced); err != nil {
		return reportingBudgetSummary{}, fmt.Errorf("sum reporting budget costs: %w", err)
	}
	rows, err := db.Query(ctx, `
        select a.words,a.bucket,r.rate::text,r.basis,r.percentages from reporting_analyses a left join reporting_rates r on r.id=a.rate_id join jobs j on j.id=a.job_id
        where a.organization_id=$1 and a.project_id=$2 and a.is_current and a.billable and j.status not in ('failed','cancelled')
        and not exists(select 1 from reporting_activity e where e.organization_id=a.organization_id and e.operation_key='completion:' || a.id || ':' || a.step)
        and not exists(select 1 from reporting_task_rates t where t.organization_id=a.organization_id and t.job_id=a.job_id and t.step=a.step and t.override_usd is not null)`,
		organizationID, budget.ProjectID)
	if err != nil {
		return reportingBudgetSummary{}, fmt.Errorf("list reporting pending work: %w", err)
	}
	pending, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (reportingPendingWork, error) {
		var work reportingPendingWork
		err := row.Scan(&work.words, &work.bucket, &work.rate, &work.basis, &work.percentages)
		return work, err
	})
	if err != nil {
		return reportingBudgetSummary{}, fmt.Errorf("list reporting pending work: %w", err)
	}
	outstanding := new(big.Int)
	incomplete := unpriced > 0
	for _, work := range pending {
		if work.basis != nil && *work.basis == "hour" {
			continue
		}
		if work.words == nil || work.rate == nil || *work.rate == "" || work.bucket == "unavailable" {
			incomplete = true
			continue
		}
		percent, err := reportingPayablePercent(work.percentages, work.bucket)
		if err != nil {
			return reportingBudgetSummary{}, err
		}
		cost, err := wordCost(*work.rate, *work.words, percent)
		if err != nil {
			return reportingBudgetSummary{}, err
		}
		outstanding.Add(outstanding, cost)
	}

	type hourlyWork struct {
		estimated *int
		logged    int
		rate      string
	}
	rows, err = db.Query(ctx, `
        select t.estimated_minutes as estimated, coalesce((select sum(e.minutes) from reporting_time_entries e where e.job_id=a.job_id and e.step=r.step and not e.voided),0)::integer as logged, r.rate::text
        from (select distinct job_id,rate_id from reporting_analyses where organization_id=$1 and project_id=$2 and is_current and billable) a
        join reporting_rates r on r.id=a.rate_id join jobs j on j.id=a.job_id
        left join reporting_task_rates t on t.job_id=a.job_id and t.step=r.step
        where r.basis='hour' and t.override_usd is null and j.status not in ('succeeded','failed','cancelled')`,
		organizationID, budget.ProjectID)
	if err != nil {
		return reportingBudgetSummary{}, fmt.Errorf("list reporting hourly work: %w", err)
	}
	hours, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (hourlyWork, error) {
		var work hourlyWork
		err := row.Scan(&work.estimated, &work.logged, &work.rate)
		return work, err
	})
	if err != nil {
		return reportingBudgetSummary{}, fmt.Errorf("list reporting hourly work: %w", err)
	}
	for _, work := range hours {
		if work.estimated == nil {
			incomplete = true
			continue
		}
		cost, err := hourlyCost(work.rate, max(0, *work.estimated-work.logged))
		if err != nil {
			return reportingBudgetSummary{}, err
		}
		outstanding.Add(outstanding, cost)
	}

	var overridesText string
	if err := db.QueryRow(ctx, `
        select coalesce(sum(r.override_usd),0)::text as amount from reporting_task_rates r join jobs j on j.id=r.job_id
        where r.organization_id=$1 and j.project_id=$2 and r.override_usd is not null
        and j.status not in ('failed','cancelled')
        and not exists(select 1 from reporting_costs c where c.organization_id=r.organization_id and c.operation_key='task-override:' || r.id)`,
		organizationID, budget.ProjectID).Scan(&overridesText); err != nil {
		return reportingBudgetSummary{}, fmt.Errorf("sum reporting task overrides: %w", err)
	}
	overrides, err := usdUnits(overridesText)
	if err != nil {
		return reportingBudgetSummary{}, err
	}
	outstanding.Add(outstanding, overrides)

	accrued, err := usdUnits(accruedText)
	if err != nil {
		return reportingBudgetSummary{}, err
	}
	limit, err := usdUnits(budget.Budget)
	if err != nil {
		return reportingBudgetSummary{}, err
	}
	forecast := new(big.Int).Add(accrued, outstanding)
	spendWarning, err := budgetWarning(budget.Budget, usdString(accrued))
	if err != nil {
		return reportingBudgetSummary{}, err
	}
	forecastWarning, err := budgetWarning(budget.Budget, usdString(forecast))
	if err != nil {
		return reportingBudgetSummary{}, err
	}
	return reportingBudgetSummary{
		reportingBudget: budget,
		AccruedUSD:      usdString(accrued),
		OutstandingUSD:  usdString(outstanding),
		ForecastUSD:     usdString(forecast),
		RemainingUSD:    usdString(limit.Sub(limit, accrued)),
		Incomplete:      incomplete,
		SpendWarning:    spendWarning,
		ForecastWarning: forecastWarning,
	}, nil
}

func reportingPayablePercent(raw []byte, bucket string) (int, error) {
	if len(raw) == 0 || isJSONNull(raw) {
		return 100, nil
	}
	var percentages map[string]*float64
	if err := json.Unmarshal(raw, &percentages); err != nil {
		return 0, fmt.Errorf("decode reporting rate percentages: %w", err)
	}
	value, ok := percentages[bucket]
	if !ok || value == nil {
		return 100, nil
	}
	if *value != math.Trunc(*value) {
		return 0, fmt.Errorf("reporting rate percentage is not an integer")
	}
	return int(*value), nil
}
