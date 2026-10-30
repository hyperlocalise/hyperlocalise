package main

import (
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

// reportingMoneyFixture seeds a workspace with a default team and a named project, and offers
// the inserts the money tests need: rate cards as the web app saves them, budgets, task pricing,
// costs and billing rows.
type reportingMoneyFixture struct {
	t     *testing.T
	scope *testenv.Scope
}

func seedReportingMoney(t *testing.T) reportingMoneyFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	f := reportingMoneyFixture{t: t, scope: scope}
	f.exec(`update projects set name = 'Docs', source_locale = 'en-US' where id = $1`, scope.ProjectID)
	// Billing's rows count from when Reports started.
	f.exec(`insert into reporting_workspaces (organization_id, started_at) values ($1, '2026-01-01T00:00:00Z')`, scope.OrganizationID)
	return f
}

func (f reportingMoneyFixture) exec(sql string, args ...any) {
	f.t.Helper()
	_, err := f.scope.Pool.Exec(f.t.Context(), sql, args...)
	require.NoError(f.t, err)
}

type reportingTestLine struct {
	targetLocale, rate, basis, step string
	percentages                     string
}

func line(targetLocale, rate string, rest ...string) reportingTestLine {
	l := reportingTestLine{targetLocale: targetLocale, rate: rate, basis: "word", step: "translation", percentages: "{}"}
	if len(rest) > 0 {
		l.basis = rest[0]
	}
	if len(rest) > 1 {
		l.percentages = rest[1]
	}
	if len(rest) > 2 {
		l.step = rest[2]
	}
	return l
}

// card saves a rate card as the web app does: a card row and a rate row per line, at a time.
func (f reportingMoneyFixture) card(name, at string, lines ...reportingTestLine) {
	f.t.Helper()
	f.exec(`insert into reporting_rate_cards (organization_id, name, default_basis) values ($1, $2, 'word') on conflict do nothing`, f.scope.OrganizationID, name)
	for _, l := range lines {
		f.exec(`insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages, created_at)
            values ($1, $2, 'en-US', $3, $4, $5, $6::numeric, $7::jsonb, $8::timestamptz)`,
			f.scope.OrganizationID, name, l.targetLocale, l.step, l.basis, l.rate, l.percentages, at)
	}
}

func (f reportingMoneyFixture) retire(name, targetLocale, step, at string) {
	f.t.Helper()
	f.exec(`insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages, created_at, retired)
        values ($1, $2, 'en-US', $3, $4, 'word', 0, '{}', $5::timestamptz, true)`, f.scope.OrganizationID, name, targetLocale, step, at)
}

func (f reportingMoneyFixture) budget(projectID, budget string, rateCardName *string) {
	f.t.Helper()
	f.exec(`insert into reporting_budgets (organization_id, project_id, budget, rate_card_name) values ($1, $2, $3::numeric, $4)`, f.scope.OrganizationID, projectID, budget, rateCardName)
}

func (f reportingMoneyFixture) taskRate(jobID, step string, rateCardName *string, pricedAt string, estimatedMinutes *int, overrideUSD *string) string {
	f.t.Helper()
	var id string
	var priced *string
	if pricedAt != "" {
		priced = &pricedAt
	}
	require.NoError(f.t, f.scope.Pool.QueryRow(f.t.Context(), `insert into reporting_task_rates (organization_id, job_id, step, rate_card_name, priced_at, estimated_minutes, override_usd)
        values ($1, $2, $3, $4, $5::timestamptz, $6, $7::numeric) returning id`, f.scope.OrganizationID, jobID, step, rateCardName, priced, estimatedMinutes, overrideUSD).Scan(&id))
	return id
}

func (f reportingMoneyFixture) cost(projectID string, jobID *string, kind string, amount *string, at string, voided bool, operationKey string) {
	f.t.Helper()
	if operationKey == "" {
		operationKey = "test:" + uuid.NewString()
	}
	f.exec(`insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, target_locale, amount_usd, basis, voided, created_at)
        values ($1, $2, $3, $4, $5, 'translation', 'fr-FR', $6::numeric, 'manual', $7, $8::timestamptz)`,
		f.scope.OrganizationID, projectID, jobID, operationKey, kind, amount, voided, at)
}

func (f reportingMoneyFixture) job(id, projectID, status string, assigned bool, title string) string {
	f.t.Helper()
	id = mustReportingTask(f.t, f.scope, id, projectID, "translation", status, title, "")
	if assigned {
		f.exec(`update jobs set assignee_type = 'user', owner_user_id = $2 where id = $1`, id, f.scope.UserID)
	}
	return id
}

func estimate(t *testing.T, scope *testenv.Scope, query string) map[string]any {
	t.Helper()
	return reportingReadJSON(t, scope, "admin", "/reports/cost-estimate?"+query)["costEstimate"].(map[string]any)
}

func estimateRows(e map[string]any) map[string]map[string]any {
	rows := map[string]map[string]any{}
	for _, row := range e["rows"].([]any) {
		r := row.(map[string]any)
		rows[r["targetLocale"].(string)+"/"+r["step"].(string)] = r
	}
	return rows
}

func TestReportingPricedUnitsRefuseAnUnvalidatedUnit(t *testing.T) {
	f := seedReportingMoney(t)
	require.PanicsWithValue(t, "reporting unit not validated: words; drop table jobs", func() {
		_, _ = queryReportingPricedUnits(t.Context(), f.scope.Pool, reportingPricingInput{
			organizationID: f.scope.OrganizationID, projectIDs: []string{f.scope.ProjectID},
			step: "translation", unit: "words; drop table jobs", measure: "chosen",
		})
	})
}

func TestReportingEstimatePricesEachLineInItsOwnBasisAndDiscountsMatchBands(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "0.10", "word", `{"100": 20}`), line("ja-JP", "0.02", "character"))
	job := f.job("job_est", f.scope.ProjectID, "running", false, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: job, targetLocale: "fr-FR", bucket: "new", day: "2026-06-01", arrived: 100},
		{jobID: job, targetLocale: "fr-FR", bucket: "100", day: "2026-06-02", arrived: 50},
		// The unavailable band is paid as new work.
		{jobID: job, targetLocale: "fr-FR", bucket: "unavailable", day: "2026-06-02", arrived: 10},
		{jobID: job, targetLocale: "ja-JP", bucket: "new", day: "2026-06-01", arrived: 10, arrivedStrings: 1, arrivedCharacters: 300, arrivedCharactersWithSpaces: 310},
		{jobID: job, targetLocale: "ko-KR", bucket: "new", day: "2026-06-01", arrived: 40},
	})
	e := estimate(t, f.scope, "jobIds="+job+"&rateCard=Standard")
	rows := estimateRows(e)
	french := rows["fr-FR/translation"]
	require.Equal(t, "rate", french["pricing"])
	require.Equal(t, "word", french["basis"])
	require.Equal(t, map[string]any{"new": float64(100), "100": float64(50), "unavailable": float64(10)}, french["bands"])
	require.Equal(t, float64(160), french["units"])
	require.Equal(t, float64(120), french["weighted"])
	require.Equal(t, "12.00000000", french["costUsd"])
	// Shown in words, priced per character.
	japanese := rows["ja-JP/translation"]
	require.Equal(t, "character", japanese["basis"])
	require.Equal(t, float64(10), japanese["units"])
	require.Equal(t, float64(300), japanese["weighted"])
	require.Equal(t, "6.00000000", japanese["costUsd"])
	korean := rows["ko-KR/translation"]
	require.Equal(t, "none", korean["pricing"])
	require.Nil(t, korean["rate"])
	require.Nil(t, korean["weighted"])
	require.Nil(t, korean["costUsd"])
	totals := e["totals"].(map[string]any)
	require.Equal(t, float64(210), totals["units"])
	require.Equal(t, float64(40), totals["unpricedUnits"])
	// Weighted words and weighted characters do not add up.
	require.Nil(t, totals["weighted"])
	require.Equal(t, float64(1), totals["tasks"])
	require.Equal(t, float64(3), totals["languages"])
	require.Equal(t, true, totals["incomplete"])
	require.Equal(t, "18.00000000", totals["costUsd"])
	require.InDelta(t, (22.0-18.0)/22.0, totals["memorySavings"], 1e-9)
	require.Equal(t, "words", e["unit"])
	// The same work in characters: the counts change, the money does not.
	inCharacters := estimate(t, f.scope, "jobIds="+job+"&rateCard=Standard&unit=characters")
	require.Equal(t, "18.00000000", inCharacters["totals"].(map[string]any)["costUsd"])
	require.Equal(t, float64(300), estimateRows(inCharacters)["ja-JP/translation"]["units"])
}

func TestReportingEstimateUsesTheTasksCardThenTheBudgetsThenTheChosen(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Per word", "2026-03-01T00:00:00Z", line("fr-FR", "0.10"))
	f.card("Per character", "2026-03-01T00:00:00Z", line("fr-FR", "0.01", "character"))
	first := f.job("job_first", f.scope.ProjectID, "running", false, "")
	second := f.job("job_second", f.scope.ProjectID, "running", false, "")
	for _, job := range []string{first, second} {
		mustReportingSummary(t, f.scope, []reportingSummaryRow{{jobID: job, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10, arrivedStrings: 1, arrivedCharacters: 50, arrivedCharactersWithSpaces: 60}})
	}
	cost := func(query string) string {
		return estimate(t, f.scope, "jobIds="+first+","+second+query)["totals"].(map[string]any)["costUsd"].(string)
	}
	// The same language on two cards, priced per word on one and per character on the other.
	require.Equal(t, "2.00000000", cost("&rateCard=Per%20word"))
	require.Equal(t, "1.00000000", cost("&rateCard=Per%20character"))
	none := estimate(t, f.scope, "jobIds="+first+","+second)["rows"].([]any)
	require.Len(t, none, 1)
	require.Equal(t, "none", none[0].(map[string]any)["pricing"])
	require.Equal(t, float64(20), none[0].(map[string]any)["units"])
	require.Equal(t, []any{}, none[0].(map[string]any)["pricedBy"])
	require.Nil(t, none[0].(map[string]any)["rateCardName"])

	f.budget(f.scope.ProjectID, "100", some("Per character"))
	require.Equal(t, "1.00000000", cost("&rateCard=Per%20word"))
	f.taskRate(first, "translation", some("Per word"), "2026-06-15T00:00:00Z", nil, nil)
	mixed := estimate(t, f.scope, "jobIds="+first+","+second+"&rateCard=Per%20word")
	var seen [][]any
	for _, row := range mixed["rows"].([]any) {
		r := row.(map[string]any)
		seen = append(seen, []any{r["rateCardName"], r["basis"], r["costUsd"], r["pricedBy"]})
	}
	require.ElementsMatch(t, [][]any{
		{"Per word", "word", "1.00000000", []any{"task"}},
		{"Per character", "character", "0.50000000", []any{"budget"}},
	}, seen)
	require.Equal(t, "1.50000000", mixed["totals"].(map[string]any)["costUsd"])
}

func TestReportingEstimateEstimatesAWholeProjectFromItsCurrentStrings(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Per word", "2026-03-01T00:00:00Z", line("fr-FR", "0.10"))
	first := f.job("job_first", f.scope.ProjectID, "running", false, "")
	second := f.job("job_second", f.scope.ProjectID, "succeeded", false, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: first, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10},
		{jobID: second, targetLocale: "fr-FR", day: "2026-06-02", arrived: 20},
		// Saved in the content editor outside any task.
		{targetLocale: "fr-FR", day: "2026-06-03", arrived: 5, payable: true},
	})
	// The project's current rows, as the scheduled run rebuilds them.
	f.exec(`insert into reporting_current_by_project (organization_id, project_id, source_locale, target_locale, step, bucket, arrived_words, arrived_strings)
        values ($1, $2, 'en-US', 'fr-FR', 'translation', 'new', 35, 3)`, f.scope.OrganizationID, f.scope.ProjectID)
	tasks := estimate(t, f.scope, "projectId="+f.scope.ProjectID+"&jobIds="+first+","+second+"&rateCard=Per%20word")
	require.Equal(t, float64(30), tasks["totals"].(map[string]any)["units"])
	require.Equal(t, float64(2), tasks["totals"].(map[string]any)["tasks"])
	whole := estimate(t, f.scope, "projectId="+f.scope.ProjectID+"&rateCard=Per%20word")
	require.Equal(t, float64(35), whole["totals"].(map[string]any)["units"])
	require.Equal(t, "3.50000000", whole["totals"].(map[string]any)["costUsd"])
	require.Len(t, whole["rows"], 1)
	require.Equal(t, []any{"chosen"}, whole["rows"].([]any)[0].(map[string]any)["pricedBy"])
	// Without one project chosen, nothing is estimated: a whole workspace is never read.
	status, _ := reportingSend(t, f.scope, "admin", http.MethodGet, "/reports/cost-estimate?rateCard=Per%20word", "")
	require.Equal(t, http.StatusBadRequest, status)
}

func TestReportingEstimatePricesATaskByItsOwnCardAsItWasWhenPriced(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "0.10"), line("ja-JP", "0.20"))
	f.card("Agency", "2026-03-01T00:00:00Z", line("fr-FR", "0.05"), line("de-DE", "0.07"))
	f.budget(f.scope.ProjectID, "100", some("Agency"))
	priced := f.job("job_priced", f.scope.ProjectID, "running", false, "")
	other := f.job("job_other", f.scope.ProjectID, "running", false, "")
	for _, job := range []string{priced, other} {
		for _, locale := range []string{"fr-FR", "ja-JP", "de-DE"} {
			mustReportingSummary(t, f.scope, []reportingSummaryRow{{jobID: job, targetLocale: locale, day: "2026-06-01", arrived: 10}})
		}
	}
	// Priced at the very moment the card's last line was saved.
	f.taskRate(priced, "translation", some("Standard"), "2026-03-01T00:00:00Z", nil, nil)
	// The card changes after the task was priced: the task keeps the earlier prices.
	f.card("Standard", "2026-04-01T00:00:00Z", line("fr-FR", "0.30"), line("de-DE", "0.40"))
	f.retire("Standard", "ja-JP", "translation", "2026-04-01T00:00:00Z")
	rows := func(job string) [][]any {
		var seen [][]any
		for _, row := range estimate(t, f.scope, "jobIds="+job+"&rateCard=Standard")["rows"].([]any) {
			r := row.(map[string]any)
			seen = append(seen, []any{r["targetLocale"], r["pricing"], r["rateCardName"], r["pricedBy"], r["costUsd"]})
		}
		return seen
	}
	require.Equal(t, [][]any{
		// The task's card had no de-DE line when it was priced; the budget's card is not asked.
		{"de-DE", "none", "Standard", []any{"task"}, nil},
		{"fr-FR", "rate", "Standard", []any{"task"}, "1.00000000"},
		{"ja-JP", "rate", "Standard", []any{"task"}, "2.00000000"},
	}, rows(priced))
	// A task without its own card takes the budget's, which has no ja-JP line.
	require.Equal(t, [][]any{
		{"de-DE", "rate", "Agency", []any{"budget"}, "0.70000000"},
		{"fr-FR", "rate", "Agency", []any{"budget"}, "0.50000000"},
		{"ja-JP", "none", "Agency", []any{"budget"}, nil},
	}, rows(other))
}

func TestReportingEstimatePricesHourlyLinesFromTheTasksEstimateAndAddsFixedFees(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Hourly", "2026-03-01T00:00:00Z", line("fr-FR", "60", "hour"), line("de-DE", "60", "hour"))
	hourly := f.job("job_hourly", f.scope.ProjectID, "running", false, "")
	unestimated := f.job("job_unestimated", f.scope.ProjectID, "running", false, "")
	fixed := f.job("job_fixed", f.scope.ProjectID, "running", false, "Landing page")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: hourly, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10},
		{jobID: hourly, targetLocale: "de-DE", day: "2026-06-01", arrived: 10},
		{jobID: unestimated, targetLocale: "fr-FR", day: "2026-06-01", arrived: 5},
		{jobID: fixed, targetLocale: "fr-FR", day: "2026-06-01", arrived: 7},
	})
	f.taskRate(hourly, "translation", nil, "", some(90), nil)
	f.taskRate(fixed, "translation", nil, "", nil, some("250"))
	e := estimate(t, f.scope, "jobIds="+hourly+","+fixed+"&rateCard=Hourly")
	// An hour and a half at $60, shared by the task's two languages.
	var rated [][]any
	var fixedRow map[string]any
	for _, row := range e["rows"].([]any) {
		r := row.(map[string]any)
		if r["pricing"] == "rate" {
			rated = append(rated, []any{r["targetLocale"], r["costUsd"]})
		}
		if r["pricing"] == "fixed" {
			fixedRow = r
		}
	}
	require.Equal(t, [][]any{{"de-DE", "45.00000000"}, {"fr-FR", "45.00000000"}}, rated)
	require.Equal(t, float64(7), fixedRow["units"])
	require.Equal(t, []any{map[string]any{"jobId": fixed, "jobTitle": "Landing page", "step": "translation", "amountUsd": "250.00000000"}}, e["fixedFees"])
	require.Equal(t, "340.00000000", e["totals"].(map[string]any)["costUsd"])
	require.Equal(t, false, e["totals"].(map[string]any)["incomplete"])

	without := estimate(t, f.scope, "jobIds="+unestimated+"&rateCard=Hourly")
	require.Len(t, without["rows"], 1)
	require.Equal(t, true, without["rows"].([]any)[0].(map[string]any)["unestimated"])
	require.Nil(t, without["rows"].([]any)[0].(map[string]any)["costUsd"])
	require.Equal(t, true, without["totals"].(map[string]any)["incomplete"])
}

func TestReportingStillToComeAndBudgets(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "1"))
	f.budget(f.scope.ProjectID, "100", some("Standard"))
	assigned := f.job("job_assigned", f.scope.ProjectID, "running", true, "")
	automatic := f.job("job_automatic", f.scope.ProjectID, "running", false, "")
	finished := f.job("job_finished", f.scope.ProjectID, "succeeded", true, "")
	cancelled := f.job("job_cancelled", f.scope.ProjectID, "cancelled", true, "")
	unfinished := func(jobID string, payable bool) reportingSummaryRow {
		return reportingSummaryRow{jobID: jobID, targetLocale: "fr-FR", payable: payable, day: "2026-06-01", arrived: 10, arrivedStrings: 2, arrivedDone: 4}
	}
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		unfinished(assigned, false), unfinished(automatic, false), unfinished(automatic, true), unfinished(finished, true), unfinished(cancelled, true),
		// Finished work costs nothing more.
		{jobID: assigned, targetLocale: "fr-FR", day: "2026-06-02", arrived: 9, arrivedDone: 9},
	})
	// Spent: people's work and billed AI in the project, on its tasks or not. An expense row (the
	// old API's) is left out.
	f.cost(f.scope.ProjectID, nil, "human", some("73"), "2026-06-05T00:00:00Z", false, "")
	f.cost(f.scope.ProjectID, nil, "expense", some("5"), "2026-06-05T00:00:00Z", false, "")
	f.cost(f.scope.ProjectID, nil, "human", some("1000"), "2026-06-05T00:00:00Z", true, "")
	f.cost(f.scope.ProjectID, nil, "ai", some("1000"), "2026-06-05T00:00:00Z", false, "")
	f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, credential_source, amount_usd, job_id, dimensions) values
        ($1, 'ai_tokens', 'tracking_succeeded', 'test:' || gen_random_uuid(), 'translation_job_complete', 'gateway', 2.5, $2, '{}'),
        ($1, 'ai_tokens', 'tracking_succeeded', 'test:' || gen_random_uuid(), 'content_editor_ai_suggestion', 'gateway', 1, null, $3::jsonb)`,
		f.scope.OrganizationID, assigned, fmt.Sprintf(`{"project_id": "%s"}`, f.scope.ProjectID))
	budgets := reportingReadJSON(t, f.scope, "admin", "/reports/budgets")["budgets"].([]any)
	require.Len(t, budgets, 1)
	budget := budgets[0].(map[string]any)
	// 6 words still to do in the assigned task and in the open task's payable row.
	require.Equal(t, f.scope.ProjectID, budget["projectId"])
	require.Equal(t, "Docs", budget["projectName"])
	require.Equal(t, "76.50000000", budget["spentUsd"])
	require.Equal(t, "12.00000000", budget["stillToComeUsd"])
	require.Equal(t, "88.50000000", budget["forecastUsd"])
	require.Equal(t, "23.50000000", budget["remainingUsd"])
	require.Equal(t, "on_track", budget["status"])
	require.Equal(t, false, budget["incomplete"])
	require.Equal(t, "100.00000000", budget["budgetUsd"])

	lines := reportingReadCSV(t, f.scope, "admin", "/reports/budgets?format=csv")
	require.Equal(t, `"projectName","projectId","budgetUsd","spentUsd","stillToComeUsd","forecastUsd","remainingUsd","status","incomplete"`, lines[0])
	require.Equal(t, fmt.Sprintf(`"Docs","%s","100.00000000","76.50000000","12.00000000","88.50000000","23.50000000","on_track","false"`, f.scope.ProjectID), lines[1])
}

func TestReportingBudgetStatusOrdersStates(t *testing.T) {
	usd := func(v string) *big.Int { u, _ := usdUnits(v); return u }
	require.Equal(t, "over_budget", reportingBudgetStatus(usd("100"), usd("101"), usd("101")))
	require.Equal(t, "forecast_over", reportingBudgetStatus(usd("100"), usd("50"), usd("120")))
	require.Equal(t, "over_80", reportingBudgetStatus(usd("100"), usd("80"), usd("90")))
	require.Equal(t, "on_track", reportingBudgetStatus(usd("100"), usd("79"), usd("100")))
}

func TestReportingStillToComeInDetail(t *testing.T) {
	f := seedReportingMoney(t)
	hourlyProject := mustReportingNamedProject(t, f.scope, "rp_hourly", "Hourly work")
	f.card("Mixed", "2026-03-01T00:00:00Z", line("fr-FR", "1"), line("de-DE", "60", "hour"))
	f.budget(f.scope.ProjectID, "1000", some("Mixed"))
	f.budget(hourlyProject, "1000", some("Mixed"))
	unfinished := func(jobID, projectID, locale string, payable bool) reportingSummaryRow {
		return reportingSummaryRow{jobID: jobID, projectID: projectID, targetLocale: locale, payable: payable, day: "2026-06-01", arrived: 10, arrivedStrings: 2, arrivedDone: 4}
	}
	queued := f.job("job_queued", f.scope.ProjectID, "queued", true, "")
	reviewing := f.job("job_reviewing", f.scope.ProjectID, "waiting_for_review", false, "")
	estimated := f.job("job_estimated", hourlyProject, "running", true, "")
	unestimated := f.job("job_unestimated", hourlyProject, "running", true, "")
	feeTask := f.job("job_fee", hourlyProject, "queued", false, "")
	chargedTask := f.job("job_charged", hourlyProject, "queued", false, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		unfinished(queued, "", "fr-FR", false), unfinished(reviewing, "", "fr-FR", true), unfinished("", "", "fr-FR", true),
		unfinished(estimated, hourlyProject, "de-DE", false), unfinished(unestimated, hourlyProject, "de-DE", false),
	})
	f.taskRate(estimated, "translation", nil, "", some(120), nil)
	f.taskRate(feeTask, "translation", nil, "", nil, some("50"))
	charged := f.taskRate(chargedTask, "translation", nil, "", nil, some("70"))
	f.cost(hourlyProject, &chargedTask, "human", some("70"), "2026-06-05T00:00:00Z", false, "task-override:"+charged)
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'translation', 'de-DE', '2026-06-01', 30)`, f.scope.OrganizationID, hourlyProject, estimated, f.scope.UserID)
	budgets := reportingReadJSON(t, f.scope, "admin", "/reports/budgets")["budgets"].([]any)
	byName := map[string]map[string]any{}
	for _, row := range budgets {
		byName[row.(map[string]any)["projectName"].(string)] = row.(map[string]any)
	}
	require.Equal(t, "18.00000000", byName["Docs"]["stillToComeUsd"])
	require.Equal(t, false, byName["Docs"]["incomplete"])
	// 90 minutes left at $60, and the uncharged $50 fee; a task with no estimate makes the
	// amount incomplete rather than free.
	require.Equal(t, "140.00000000", byName["Hourly work"]["stillToComeUsd"])
	require.Equal(t, true, byName["Hourly work"]["incomplete"])
	require.Equal(t, "70.00000000", byName["Hourly work"]["spentUsd"])
	// Narrowed to one project, and to none for a project the viewer has not got.
	require.Len(t, reportingReadJSON(t, f.scope, "admin", "/reports/budgets?projectId="+hourlyProject)["budgets"], 1)
	require.Equal(t, []any{}, reportingReadJSON(t, f.scope, "admin", "/reports/budgets?projectId=project_elsewhere")["budgets"])
}

func TestReportingEstimateFiltersKeepEachLanguagesShareAndLeaveFixedFeesOut(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Hourly", "2026-03-01T00:00:00Z", line("fr-FR", "60", "hour"), line("de-DE", "60", "hour"), line("ja-JP", "1"))
	estimated := f.job("job_estimated", f.scope.ProjectID, "running", false, "")
	unestimated := f.job("job_unestimated", f.scope.ProjectID, "running", false, "")
	fee := f.job("job_fee", f.scope.ProjectID, "running", false, "Landing page")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: estimated, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10},
		{jobID: estimated, targetLocale: "de-DE", day: "2026-06-01", arrived: 10},
		{jobID: estimated, targetLocale: "fr-FR", step: "review", day: "2026-06-01", arrived: 10},
		{jobID: unestimated, targetLocale: "fr-FR", day: "2026-06-01", arrived: 5},
		{jobID: fee, targetLocale: "fr-FR", day: "2026-06-01", arrived: 7},
		{jobID: unestimated, targetLocale: "ja-JP", day: "2026-06-01", arrived: 3, uncounted: 2},
	})
	f.taskRate(estimated, "translation", nil, "", some(90), nil)
	f.taskRate(fee, "translation", nil, "", nil, some("300"))
	jobs := "jobIds=" + estimated + "," + unestimated + "," + fee + "&rateCard=Hourly"
	french := estimate(t, f.scope, jobs+"&targetLocale=fr-FR&step=translation")
	var hourlyRow map[string]any
	for _, row := range french["rows"].([]any) {
		if row.(map[string]any)["pricing"] == "rate" {
			hourlyRow = row.(map[string]any)
		}
	}
	// The estimated task's 90 minutes are shared with German; the other task has no estimate,
	// which is flagged without losing the known part.
	require.Equal(t, "fr-FR", hourlyRow["targetLocale"])
	require.Equal(t, true, hourlyRow["unestimated"])
	require.Equal(t, "45.00000000", hourlyRow["costUsd"])
	require.Equal(t, []any{}, french["fixedFees"])
	require.Equal(t, float64(1), french["fixedFeesLeftOut"])
	totals := french["totals"].(map[string]any)
	require.Equal(t, "45.00000000", totals["costUsd"])
	require.Equal(t, true, totals["incomplete"])
	require.Equal(t, float64(1), totals["languages"])
	require.Equal(t, float64(3), totals["tasks"])
	// Review work has no review rate on the card.
	review := estimate(t, f.scope, jobs+"&step=review")["rows"].([]any)
	require.Len(t, review, 1)
	require.Equal(t, "none", review[0].(map[string]any)["pricing"])
	// Strings whose words could not be counted make the cost incomplete.
	japanese := estimate(t, f.scope, jobs+"&targetLocale=ja-JP")["totals"].(map[string]any)
	require.Equal(t, float64(2), japanese["uncounted"])
	require.Equal(t, true, japanese["incomplete"])
	// A line taken off the card prices nothing from then on.
	f.retire("Hourly", "ja-JP", "translation", "2026-06-10T00:00:00Z")
	retired := estimate(t, f.scope, jobs+"&targetLocale=ja-JP")["rows"].([]any)
	require.Equal(t, "none", retired[0].(map[string]any)["pricing"])
	require.Nil(t, retired[0].(map[string]any)["costUsd"])
	require.Equal(t, "390.00000000", estimate(t, f.scope, jobs)["totals"].(map[string]any)["costUsd"])

	lines := reportingReadCSV(t, f.scope, "admin", "/reports/cost-estimate?"+jobs+"&format=csv")
	require.Equal(t, `"targetLocale","step","pricing","pricedBy","rateCardName","basis","rate","new","units","weighted","costUsd","jobTitle","jobId"`, lines[0])
	require.Equal(t, fmt.Sprintf(`"","translation","fixed","","","","","","","","300.00000000","Landing page","%s"`, fee), lines[len(lines)-1])
}

func TestReportingEstimatePricesUncountedAndUnavailableWork(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Characters", "2026-03-01T00:00:00Z", line("ja-JP", "0.1", "character"))
	job := f.job("job_chars", f.scope.ProjectID, "running", false, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{{jobID: job, targetLocale: "ja-JP", day: "2026-06-01", arrived: 0, arrivedStrings: 2, arrivedCharacters: 40, arrivedCharactersWithSpaces: 40}})
	// Strings with no words but characters are priced whatever unit is shown.
	for _, unit := range []string{"words", "strings", "characters"} {
		require.Equal(t, "4.00000000", estimate(t, f.scope, "jobIds="+job+"&rateCard=Characters&unit="+unit)["totals"].(map[string]any)["costUsd"], unit)
	}

	// Work whose match band could not be worked out is priced as new, and says the quote is not exact.
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "1", "word", `{"new": 50}`))
	f.budget(f.scope.ProjectID, "100", some("Standard"))
	task := f.job("job_unavailable", f.scope.ProjectID, "running", true, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: task, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10},
		{jobID: task, targetLocale: "fr-FR", day: "2026-06-01", bucket: "unavailable", arrived: 10},
	})
	totals := estimate(t, f.scope, "jobIds="+task)["totals"].(map[string]any)
	require.Equal(t, "10.00000000", totals["costUsd"])
	require.Equal(t, float64(10), totals["unavailableUnits"])
	require.Equal(t, true, totals["incomplete"])
	budget := reportingReadJSON(t, f.scope, "admin", "/reports/budgets")["budgets"].([]any)[0].(map[string]any)
	require.Equal(t, "10.00000000", budget["stillToComeUsd"])
	require.Equal(t, true, budget["incomplete"])
}

func TestReportingStillToComeIsIncompleteOnlyForUncountedStringsThatMustStillBeOpen(t *testing.T) {
	f := seedReportingMoney(t)
	other := mustReportingNamedProject(t, f.scope, "rp_other", "Other")
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "1"))
	f.budget(f.scope.ProjectID, "100", some("Standard"))
	f.budget(other, "100", some("Standard"))
	done := f.job("job_done", f.scope.ProjectID, "running", true, "")
	open := f.job("job_open", other, "running", true, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		// Three strings, one done and one uncounted: the uncounted one may be the done one.
		{jobID: done, targetLocale: "fr-FR", day: "2026-06-01", arrived: 9, arrivedStrings: 3, arrivedDone: 4, uncounted: 1},
		// Two uncounted strings and one done: at least one uncounted string is still open.
		{projectID: other, jobID: open, targetLocale: "fr-FR", day: "2026-06-01", arrived: 9, arrivedStrings: 3, arrivedDone: 4, uncounted: 2},
	})
	budgets := reportingReadJSON(t, f.scope, "admin", "/reports/budgets")["budgets"].([]any)
	require.Equal(t, []any{"5.00000000", false}, []any{budgets[0].(map[string]any)["stillToComeUsd"], budgets[0].(map[string]any)["incomplete"]})
	require.Equal(t, []any{"5.00000000", true}, []any{budgets[1].(map[string]any)["stillToComeUsd"], budgets[1].(map[string]any)["incomplete"]})
}

func TestReportingCostsSumWhatWasSpentByProjectWithThePreviousPeriod(t *testing.T) {
	f := seedReportingMoney(t)
	other := mustReportingNamedProject(t, f.scope, "rp_help", "Help centre")
	job := f.job("job_costs", f.scope.ProjectID, "running", false, "")
	f.cost(f.scope.ProjectID, nil, "human", some("10.5"), "2026-06-10T12:00:00Z", false, "")
	f.cost(f.scope.ProjectID, nil, "human", nil, "2026-06-10T12:00:00Z", false, "")
	// Expense rows, which the old API wrote, are left out.
	f.cost(f.scope.ProjectID, nil, "expense", some("3"), "2026-06-11T12:00:00Z", false, "")
	f.cost(other, nil, "expense", some("4"), "2026-06-12T12:00:00Z", false, "")
	f.cost(f.scope.ProjectID, nil, "human", some("8"), "2026-06-03T12:00:00Z", false, "")
	var tmsRun string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into agent_runs (organization_id, provider_kind, external_job_id, kind, hyperlocalise_job_id)
        values ($1, 'crowdin', '42', 'translate', $2) returning id`, f.scope.OrganizationID, job).Scan(&tmsRun))
	var automation string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into workspace_automations (organization_id, name, instructions, project_id) values ($1, 'Nightly', '', $2) returning id`, f.scope.OrganizationID, f.scope.ProjectID).Scan(&automation))
	workspaceTask := f.job("job_workspace", f.scope.ProjectID, "running", false, "")
	f.exec(`update jobs set project_id = null where id = $1`, workspaceTask)
	tmsKey, slackKey, jobKey, crowdinKey := "agent-run:"+tmsRun+":agent_runs", "slack:"+uuid.NewString(), "translation:"+uuid.NewString(), "crowdin:"+uuid.NewString()
	billed := func(amount *string, credential, at string, jobID *string) {
		f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, credential_source, amount_usd, job_id, created_at)
            values ($1, 'ai_tokens', 'tracking_succeeded', 'test:' || gen_random_uuid(), 'translation_job_complete', $2, $3::numeric, $4, $5::timestamptz)`,
			f.scope.OrganizationID, credential, amount, jobID, at)
	}
	charge := func(amount, at, parent string, dimensions string) {
		if parent == "" {
			parent = "none:" + uuid.NewString()
		}
		f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, credential_source, amount_usd, dimensions, created_at)
            values ($1, 'ai_tokens', 'tracking_succeeded', 'test:' || gen_random_uuid(), 'agent_runtime_complete', 'gateway', $2::numeric,
                ($3::jsonb || jsonb_build_object('parent_operation_key', $4::text)), $5::timestamptz)`, f.scope.OrganizationID, amount, dimensions, parent, at)
	}
	run := func(key, source, dimensions string, jobID *string) {
		f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, dimensions, job_id, created_at)
            values ($1, 'agent_runs', 'tracking_succeeded', $2, $3, $4::jsonb, $5, '2026-06-12T12:00:00Z')`, f.scope.OrganizationID, key, source, dimensions, jobID)
	}
	billed(some("1.25"), "gateway", "2026-06-10T12:00:00Z", &job)
	billed(nil, "gateway", "2026-06-11T12:00:00Z", &job)
	// On the workspace's own provider key: nothing billed through us.
	billed(some("0"), "byok", "2026-06-11T12:00:00Z", &job)
	// A connected TMS run on the task: on the task, through the run.
	run(tmsKey, "agent_run_create", "{}", nil)
	charge("0.2", "2026-06-12T12:00:00Z", tmsKey, "{}")
	// An editor suggestion in the project, with no task.
	charge("0.4", "2026-06-12T12:00:00Z", "", fmt.Sprintf(`{"project_id": "%s"}`, f.scope.ProjectID))
	// A Slack turn whose run names the other project.
	run(slackKey, "slack_agent_turn", fmt.Sprintf(`{"project_id": "%s"}`, other), nil)
	charge("0.3", "2026-06-12T12:00:00Z", slackKey, "{}")
	// Chat with no project.
	charge("0.1", "2026-06-12T12:00:00Z", "", "{}")
	// A job's own row names the task; its token row does not.
	run(jobKey, "translation_job_create", "{}", &job)
	charge("0.15", "2026-06-12T12:00:00Z", jobKey, "{}")
	// A run recording an id that is not one of the workspace's projects and its automation: the
	// automation's project counts instead.
	run(crowdinKey, "workspace_crowdin_agent", fmt.Sprintf(`{"automation_id": "%s", "project_id": "ext:crowdin:42"}`, automation), nil)
	charge("0.05", "2026-06-12T12:00:00Z", crowdinKey, "{}")
	// On a task outside any project, even though the call names a project.
	f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, credential_source, amount_usd, job_id, dimensions, created_at)
        values ($1, 'ai_tokens', 'tracking_succeeded', 'test:' || gen_random_uuid(), 'translation_job_complete', 'gateway', 0.07, $2, $3::jsonb, '2026-06-12T12:00:00Z')`,
		f.scope.OrganizationID, workspaceTask, fmt.Sprintf(`{"project_id": "%s"}`, other))

	costs := reportingReadJSON(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek)["costs"].(map[string]any)
	require.Equal(t, []any{
		map[string]any{"projectId": f.scope.ProjectID, "projectName": "Docs", "peopleUsd": "10.50000000", "aiUsd": "2.05000000", "aiOnTasksUsd": "1.60000000", "aiOutsideTasksUsd": "0.45000000", "totalUsd": "12.55000000"},
		map[string]any{"projectId": other, "projectName": "Help centre", "peopleUsd": "0.00000000", "aiUsd": "0.30000000", "aiOnTasksUsd": "0.00000000", "aiOutsideTasksUsd": "0.30000000", "totalUsd": "0.30000000"},
	}, costs["rows"])
	// AI outside any project is its own line, split the same way, and in the totals.
	require.Equal(t, map[string]any{"aiUsd": "0.17000000", "aiOnTasksUsd": "0.07000000", "aiOutsideTasksUsd": "0.10000000"}, costs["outsideProjects"])
	require.Equal(t, map[string]any{"peopleUsd": "10.50000000", "aiUsd": "2.52000000", "aiOnTasksUsd": "1.67000000", "aiOutsideTasksUsd": "0.85000000", "totalUsd": "13.02000000"}, costs["totals"])
	require.Equal(t, "8.00000000", costs["previousTotalUsd"])
	require.Equal(t, float64(1), costs["unpriced"])
	require.Equal(t, float64(1), costs["pendingAi"])
	oneProject := reportingReadJSON(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek+"&projectId="+other)["costs"].(map[string]any)
	require.Nil(t, oneProject["outsideProjects"])
	require.Equal(t, "0.30000000", oneProject["totals"].(map[string]any)["totalUsd"])
	// AI charges have no language, so a language filter leaves them out, and says so.
	french := reportingReadJSON(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek+"&targetLocale=fr-FR&projectId="+f.scope.ProjectID)["costs"].(map[string]any)
	row := french["rows"].([]any)[0].(map[string]any)
	require.Equal(t, "10.50000000", row["peopleUsd"])
	require.Nil(t, row["aiUsd"])
	require.Nil(t, row["aiOnTasksUsd"])
	require.Nil(t, french["totals"].(map[string]any)["aiUsd"])
	require.Nil(t, french["outsideProjects"])

	lines := reportingReadCSV(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek+"&format=csv")
	require.Equal(t, `"projectName","projectId","peopleUsd","aiOnTasksUsd","aiOutsideTasksUsd","aiUsd","totalUsd"`, lines[0])
	require.Equal(t, `"","","","0.07000000","0.10000000","0.17000000","0.17000000"`, lines[3])
	require.True(t, strings.HasPrefix(lines[1], `"Docs"`))
}

func TestReportingCostsCountAnAutomationToolStepsAIInTheAutomationsProject(t *testing.T) {
	f := seedReportingMoney(t)
	var automation, run string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into workspace_automations (organization_id, name, instructions, project_id) values ($1, 'Repo sync', '', $2) returning id`, f.scope.OrganizationID, f.scope.ProjectID).Scan(&automation))
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into workspace_automation_runs (organization_id, automation_id, trigger_source) values ($1, $2, 'manual') returning id`, f.scope.OrganizationID, automation).Scan(&run))
	// The GitHub step records its run only in its key, not the automation or the project.
	step := "workspace-github-repo:" + run + ":agent_runs"
	f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, created_at) values ($1, 'agent_runs', 'succeeded', $2, 'workspace_github_repository_agent', '2026-06-10T12:00:00Z')`, f.scope.OrganizationID, step)
	f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, credential_source, amount_usd, dimensions, created_at)
        values ($1, 'ai_tokens', 'tracking_succeeded', $2, 'agent_runtime_complete', 'gateway', 0.2, $3::jsonb, '2026-06-10T12:00:00Z')`,
		f.scope.OrganizationID, step+":ai_tokens", fmt.Sprintf(`{"parent_operation_key": "%s", "input_tokens": 100, "output_tokens": 10}`, step))
	costs := reportingReadJSON(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek)["costs"].(map[string]any)
	require.Len(t, costs["rows"], 1)
	require.Equal(t, "0.20000000", costs["rows"].([]any)[0].(map[string]any)["aiOutsideTasksUsd"])
	require.Equal(t, "0.00000000", costs["outsideProjects"].(map[string]any)["aiUsd"])
}

// tooManyTasks is 51 distinct task ids, one over the limit.
func tooManyTasks() string {
	var ids []string
	for i := range 51 {
		ids = append(ids, fmt.Sprintf(",job_%d", i))
	}
	return strings.Join(ids, "")
}

func TestReportingMoneyReadsAreForBillingRoles(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	for _, role := range []string{"translator", "member"} {
		for _, path := range []string{"/reports/costs", "/reports/cost-estimate?jobIds=job_a", "/reports/budgets", "/reports/rate-cards", "/reports/ai-usage"} {
			status, body := reportingSend(t, scope, role, http.MethodGet, path, "")
			require.Equal(t, http.StatusForbidden, status, role, path)
			require.Equal(t, "report_costs_forbidden", body["error"], role, path)
		}
	}
	for _, path := range []string{"/reports/cost-estimate", "/reports/cost-estimate?jobIds=job_a&rateCard=", "/reports/cost-estimate?jobIds=" + strings.Repeat("job_x", 1) + tooManyTasks(), "/reports/costs?from=2026-06-10&to=2026-06-01"} {
		status, body := reportingSend(t, scope, "admin", http.MethodGet, path, "")
		require.Equal(t, http.StatusBadRequest, status, path)
		require.Equal(t, "invalid_report_query", body["error"], path)
	}
	// Empty answers in their envelopes.
	costs := reportingReadJSON(t, scope, "admin", "/reports/costs")["costs"].(map[string]any)
	require.Equal(t, []any{}, costs["rows"])
	require.Equal(t, "0.00000000", costs["outsideProjects"].(map[string]any)["aiUsd"])
	require.Equal(t, "0.00000000", costs["totals"].(map[string]any)["totalUsd"])
	est := reportingReadJSON(t, scope, "admin", "/reports/cost-estimate?jobIds=job_a,job_b")["costEstimate"].(map[string]any)
	require.Equal(t, []any{}, est["rows"])
	require.Equal(t, []any{}, est["fixedFees"])
	none := reportingReadJSON(t, scope, "admin", "/reports/cost-estimate?projectId=project_none")["costEstimate"].(map[string]any)
	require.Equal(t, float64(0), none["totals"].(map[string]any)["tasks"])
	require.Equal(t, []any{}, reportingReadJSON(t, scope, "admin", "/reports/budgets")["budgets"])
	cards := reportingReadJSON(t, scope, "admin", "/reports/rate-cards")
	require.Equal(t, []any{}, cards["rateCards"])
	require.Equal(t, true, cards["canManage"])
}

func TestReportingRateCardsListEveryCardWithItsLines(t *testing.T) {
	f := seedReportingMoney(t)
	f.card("Standard 2026", "2026-03-01T00:00:00Z", line("ja-JP", "0.02", "character"), line("fr-FR", "0.015", "character_with_spaces"))
	f.exec(`update reporting_rate_cards set default_basis = 'character' where name = 'Standard 2026'`)
	// A card from before cards had their own record lists as per word; a retired line is gone.
	f.exec(`insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages, created_at)
        values ($1, 'Legacy', 'en-US', 'de-DE', 'translation', 'word', 0.1, '{"100": 30}', '2026-02-01')`, f.scope.OrganizationID)
	f.retire("Standard 2026", "fr-FR", "translation", "2026-04-01T00:00:00Z")
	cards := reportingReadJSON(t, f.scope, "localization_manager", "/reports/rate-cards")
	require.Equal(t, false, cards["canManage"])
	list := cards["rateCards"].([]any)
	require.Len(t, list, 2)
	legacy := list[0].(map[string]any)
	require.Equal(t, "Legacy", legacy["name"])
	require.Equal(t, "word", legacy["defaultBasis"])
	require.Len(t, legacy["lines"], 1)
	lineOf := legacy["lines"].([]any)[0].(map[string]any)
	require.Equal(t, "de-DE", lineOf["targetLocale"])
	require.Equal(t, "0.10000000", lineOf["rate"])
	require.Equal(t, map[string]any{"100": float64(30)}, lineOf["percentages"])
	standard := list[1].(map[string]any)
	require.Equal(t, "Standard 2026", standard["name"])
	require.Equal(t, "character", standard["defaultBasis"])
	require.Len(t, standard["lines"], 1)
	require.Equal(t, "ja-JP", standard["lines"].([]any)[0].(map[string]any)["targetLocale"])
}
