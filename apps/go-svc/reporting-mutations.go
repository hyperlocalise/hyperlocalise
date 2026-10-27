package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

type reportingCost struct {
	ID              string          `json:"id"`
	OrganizationID  string          `json:"organizationId"`
	ProjectID       *string         `json:"projectId"`
	JobID           *string         `json:"jobId"`
	OperationKey    string          `json:"operationKey"`
	Kind            string          `json:"kind"`
	Step            string          `json:"step"`
	TargetLocale    *string         `json:"targetLocale"`
	AmountUSD       *string         `json:"amountUsd"`
	Basis           string          `json:"basis"`
	RateID          *string         `json:"rateId"`
	TimeEntryID     *string         `json:"timeEntryId"`
	Provider        *string         `json:"provider"`
	Model           *string         `json:"model"`
	InputTokens     *int            `json:"inputTokens"`
	OutputTokens    *int            `json:"outputTokens"`
	TokenCategories json.RawMessage `json:"tokenCategories"`
	PricingVersion  *string         `json:"pricingVersion"`
	Note            *string         `json:"note"`
	Voided          bool            `json:"voided"`
	CreatedAt       string          `json:"createdAt"`
}

const reportingCostColumns = `id, organization_id, project_id, job_id, operation_key, kind, step, target_locale, amount_usd::text,
    basis, rate_id, time_entry_id, provider, model, input_tokens, output_tokens, token_categories, pricing_version, note, voided, created_at`

func (h *handler) createReportingRate(r *http.Request, actor workspaceActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "billing:write") {
		return nil, 0, reportingForbidden("report_costs_forbidden")
	}
	body, err := readReportingBody(r, "invalid_rate")
	if err != nil {
		return nil, 0, err
	}
	name := body.trimmedText("name", 1, 100)
	sourceLocale := body.text("sourceLocale", 2, 35)
	targetLocale := body.text("targetLocale", 2, 35)
	step := body.step("step")
	basis := body.choice("basis", "word", "hour")
	rateValue := body.usd("rate")
	percentages := body.percentages("percentages")
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_rate")
	}
	encoded, err := json.Marshal(percentages)
	if err != nil {
		return nil, 0, err
	}
	rate, err := scanReportingRate(h.workspace.pool.QueryRow(r.Context(), `
        insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages)
        values ($1, $2, $3, $4, $5, $6, $7::text::numeric, $8::text::jsonb)
        returning `+reportingRateColumns,
		actor.organizationID, name, sourceLocale, targetLocale, step, basis, rateValue, string(encoded)))
	if err != nil {
		return nil, 0, fmt.Errorf("insert reporting rate: %w", err)
	}
	return map[string]any{"rate": rate}, http.StatusCreated, nil
}

func (h *handler) upsertReportingBudget(r *http.Request, actor workspaceActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "billing:write") {
		return nil, 0, reportingForbidden("report_costs_forbidden")
	}
	body, err := readReportingBody(r, "invalid_budget")
	if err != nil {
		return nil, 0, err
	}
	projectID := body.text("projectId", 1, math.MaxInt)
	amount := body.usd("budget")
	rateCardName := body.nullableText("rateCardName", 100)
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_budget")
	}
	ctx, db := r.Context(), h.workspace.pool
	projectIDs, err := reportingProjectIDs(ctx, db, actor)
	if err != nil {
		return nil, 0, err
	}
	if !slices.Contains(projectIDs, projectID) {
		return nil, 0, reportingNotFound("project_not_found")
	}
	budget, err := scanReportingBudget(db.QueryRow(ctx, `
        insert into reporting_budgets (organization_id, project_id, budget, rate_card_name)
        values ($1, $2, $3::text::numeric, $4)
        on conflict (organization_id, project_id) do update
        set project_id = excluded.project_id, budget = excluded.budget, rate_card_name = excluded.rate_card_name
        returning `+reportingBudgetColumns,
		actor.organizationID, projectID, amount, rateCardName))
	if err != nil {
		return nil, 0, fmt.Errorf("upsert reporting budget: %w", err)
	}
	return map[string]any{"budget": budget}, http.StatusOK, nil
}

func (h *handler) createReportingExpense(r *http.Request, actor workspaceActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "billing:write") {
		return nil, 0, reportingForbidden("report_costs_forbidden")
	}
	body, err := readReportingBody(r, "invalid_expense")
	if err != nil {
		return nil, 0, err
	}
	projectID := body.text("projectId", 1, math.MaxInt)
	jobID := body.optionalText("jobId", math.MaxInt)
	step := body.step("step")
	amount := body.usd("amountUsd")
	note := body.trimmedText("note", 1, 2000)
	operationKey := body.uuid("operationKey")
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_expense")
	}
	ctx, db := r.Context(), h.workspace.pool
	projectIDs, err := reportingProjectIDs(ctx, db, actor)
	if err != nil {
		return nil, 0, err
	}
	if !slices.Contains(projectIDs, projectID) {
		return nil, 0, reportingNotFound("project_not_found")
	}
	if jobID != nil && *jobID != "" {
		var found string
		err := db.QueryRow(ctx, `select id from jobs where id=$1 and project_id=$2 and organization_id=$3`,
			*jobID, projectID, actor.organizationID).Scan(&found)
		if isNoRows(err) {
			return nil, 0, reportingNotFound("job_not_found")
		}
		if err != nil {
			return nil, 0, fmt.Errorf("load expense job: %w", err)
		}
	}
	expense, err := scanReportingCost(db.QueryRow(ctx, `
        insert into reporting_costs (organization_id, project_id, job_id, step, amount_usd, note, operation_key, kind, basis)
        values ($1, $2, $3, $4, $5::text::numeric, $6, $7, 'expense', 'manual')
        on conflict do nothing
        returning `+reportingCostColumns,
		actor.organizationID, projectID, jobID, step, amount, note, operationKey))
	if isNoRows(err) {
		return map[string]any{"expense": nil}, http.StatusCreated, nil
	}
	if err != nil {
		return nil, 0, fmt.Errorf("insert reporting expense: %w", err)
	}
	return map[string]any{"expense": expense}, http.StatusCreated, nil
}

func scanReportingCost(row pgx.Row) (reportingCost, error) {
	var cost reportingCost
	var created time.Time
	err := row.Scan(&cost.ID, &cost.OrganizationID, &cost.ProjectID, &cost.JobID, &cost.OperationKey, &cost.Kind, &cost.Step,
		&cost.TargetLocale, &cost.AmountUSD, &cost.Basis, &cost.RateID, &cost.TimeEntryID, &cost.Provider, &cost.Model,
		&cost.InputTokens, &cost.OutputTokens, &cost.TokenCategories, &cost.PricingVersion, &cost.Note, &cost.Voided, &created)
	cost.CreatedAt = formatReportingTime(created)
	return cost, err
}
