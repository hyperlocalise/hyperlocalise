package main

import (
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func (f reportingMoneyFixture) send(role, method, path, body string) (int, map[string]any) {
	f.t.Helper()
	return reportingSend(f.t, f.scope, role, method, path, body)
}

func (f reportingMoneyFixture) count(sql string, args ...any) int {
	f.t.Helper()
	var n int
	require.NoError(f.t, f.scope.Pool.QueryRow(f.t.Context(), sql, args...).Scan(&n))
	return n
}

func TestReportingRateCardsAreSavedByAdminsOncePerName(t *testing.T) {
	f := seedReportingMoney(t)
	card := `{"name": "Standard 2026", "defaultBasis": "character", "lines": [
        {"sourceLocale": "en", "targetLocale": "ja-JP", "step": "translation", "basis": "character", "rate": "0.02"},
        {"sourceLocale": "en", "targetLocale": "fr-FR", "step": "translation", "basis": "character_with_spaces", "rate": "0.015"}
    ], "create": true}`
	status, body := f.send("localization_manager", http.MethodPut, "/reports/rate-cards", card)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "report_costs_forbidden", body["error"])
	status, body = f.send("admin", http.MethodPut, "/reports/rate-cards", card)
	require.Equal(t, http.StatusOK, status)
	saved := body["rateCard"].(map[string]any)
	require.Equal(t, "Standard 2026", saved["name"])
	require.Equal(t, "character", saved["defaultBasis"])
	require.Equal(t, [][]any{{"fr-FR", "character_with_spaces", "0.01500000"}, {"ja-JP", "character", "0.02000000"}}, rowValues(saved["lines"], "targetLocale", "basis", "rate"))
	status, body = f.send("admin", http.MethodPut, "/reports/rate-cards", card)
	require.Equal(t, http.StatusConflict, status)
	require.Equal(t, "rate_card_exists", body["error"])
	status, body = f.send("admin", http.MethodPut, "/reports/rate-cards", `{"name": "Other", "lines": [], "create": false}`)
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, "rate_card_not_found", body["error"])
	status, body = f.send("admin", http.MethodPut, "/reports/rate-cards", `{"name": "Standard 2026", "lines": [
        {"sourceLocale": "en", "targetLocale": "fr-FR", "step": "translation", "basis": "word", "rate": "0.10"},
        {"sourceLocale": "en", "targetLocale": "fr-FR", "step": "translation", "basis": "word", "rate": "0.11"}]}`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "duplicate_rate_line", body["error"])
	for _, malformed := range []string{`{"name": "", "lines": []}`, `{"name": "x"}`, `{"name": "x", "lines": [{"targetLocale": "fr-FR"}]}`, `{"name": "x", "lines": [], "create": "yes"}`, `{"name": "x", "defaultBasis": "page", "lines": []}`} {
		status, body = f.send("admin", http.MethodPut, "/reports/rate-cards", malformed)
		require.Equal(t, http.StatusBadRequest, status, malformed)
		require.Equal(t, "invalid_rate_card", body["error"], malformed)
	}
	listed := reportingReadJSON(t, f.scope, "localization_manager", "/reports/rate-cards")
	require.Equal(t, [][]any{{"Standard 2026"}}, rowValues(listed["rateCards"], "name"))
	require.Equal(t, false, listed["canManage"])
}

func TestReportingRateCardSaveKeepsEarlierVersionsAndRetiresRemovedLines(t *testing.T) {
	f := seedReportingMoney(t)
	line := func(target, rate string) string {
		return fmt.Sprintf(`{"sourceLocale": "en-US", "targetLocale": "%s", "step": "translation", "basis": "word", "rate": "%s"}`, target, rate)
	}
	status, body := f.send("admin", http.MethodPut, "/reports/rate-cards", `{"name": "Standard", "lines": [`+line("fr-FR", "0.10")+`,`+line("de-DE", "0.12")+`,`+line("es-ES", "0.09")+`], "create": true}`)
	require.Equal(t, http.StatusOK, status)
	ids := map[string]any{}
	for _, l := range body["rateCard"].(map[string]any)["lines"].([]any) {
		ids[l.(map[string]any)["targetLocale"].(string)] = l.(map[string]any)["id"]
	}
	// fr-FR unchanged (written differently), de-DE changed, es-ES taken off.
	status, body = f.send("admin", http.MethodPut, "/reports/rate-cards", `{"name": "Standard", "lines": [`+line("fr-FR", "0.1")+`,`+line("de-DE", "0.13")+`]}`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, 5, f.count(`select count(*) from reporting_rates where organization_id = $1`, f.scope.OrganizationID))
	require.Equal(t, 1, f.count(`select count(*) from reporting_rates where organization_id = $1 and retired and target_locale = 'es-ES'`, f.scope.OrganizationID))
	lines := body["rateCard"].(map[string]any)["lines"].([]any)
	require.Equal(t, [][]any{{"de-DE"}, {"fr-FR"}}, rowValues(lines, "targetLocale"))
	require.Equal(t, ids["fr-FR"], lines[1].(map[string]any)["id"], "an unchanged line keeps its row")
	// Work recorded from now on for the retired language has no rate.
	f.budget(f.scope.ProjectID, "100", some("Standard"))
	var rate *reportingRateRow
	require.NoError(t, reportingTestAPI(f.scope, "admin", stubWorkspaceFlags{enabled: true}).read(t.Context(), func(db dictionaryDB) error {
		var err error
		rate, err = resolveReportingRate(t.Context(), db, f.scope.OrganizationID, f.scope.ProjectID, "", "en-US", "es-ES", "translation")
		return err
	}))
	require.Nil(t, rate)
	rows, err := f.scope.Pool.Query(t.Context(), `select action, before is null from reporting_audit where organization_id = $1 and actor_id = $2 order by created_at`, f.scope.OrganizationID, f.scope.UserID)
	require.NoError(t, err)
	defer rows.Close()
	var audit [][]any
	for rows.Next() {
		var action string
		var noBefore bool
		require.NoError(t, rows.Scan(&action, &noBefore))
		audit = append(audit, []any{action, noBefore})
	}
	require.Equal(t, [][]any{{"rate_card_created", true}, {"rate_card_saved", false}}, audit)
}

func TestReportingTaskPricingByACardUntilWorkStartsAndBudgetsNeedAKnownCard(t *testing.T) {
	f := seedReportingMoney(t)
	// A task people work on from the start is never queued.
	job := f.job("job_priced", f.scope.ProjectID, "waiting_for_review", false, "")
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "0.12"))
	price := func(jobID, step, rest string) (int, map[string]any) {
		return f.send("admin", http.MethodPut, "/reports/task-rates", fmt.Sprintf(`{"jobId": "%s", "step": "%s"%s}`, jobID, step, rest))
	}
	status, body := price(job, "translation", `, "rateCardName": "Nope"`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "rate_card_not_found", body["error"])
	status, body = price(job, "translation", `, "rateCardName": "Standard", "estimatedMinutes": 90`)
	require.Equal(t, http.StatusOK, status)
	taskRate := body["taskRate"].(map[string]any)
	require.Equal(t, "Standard", taskRate["rateCardName"])
	require.Equal(t, float64(90), taskRate["estimatedMinutes"])
	require.NotEmpty(t, taskRate["pricedAt"])
	require.Equal(t, 1, f.count(`select count(*) from reporting_audit where organization_id = $1 and action = 'task_rate_saved'`, f.scope.OrganizationID))
	// Once time is logged on the step its pricing is fixed; the other step's is not.
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'translation', 'fr-FR', '2026-06-01', 30)`, f.scope.OrganizationID, f.scope.ProjectID, job, f.scope.UserID)
	status, body = price(job, "translation", `, "rateCardName": null`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "task_rate_locked", body["error"])
	// Time logged by mistake and deleted, or a voided cost, is not work.
	f.cost(f.scope.ProjectID, &job, "human", some("10"), "2026-06-01T00:00:00Z", true, "")
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, voided)
        values ($1, $2, $3, $4, 'review', 'fr-FR', '2026-06-01', 15, true)`, f.scope.OrganizationID, f.scope.ProjectID, job, f.scope.UserID)
	status, body = price(job, "review", `, "overrideUsd": "250"`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "250.00000000", body["taskRate"].(map[string]any)["overrideUsd"])
	require.Nil(t, body["taskRate"].(map[string]any)["pricedAt"])
	// A task that ended does no more work, so nothing about it can change.
	ended := f.job("job_ended", f.scope.ProjectID, "succeeded", false, "")
	status, _ = price(ended, "translation", `, "rateCardName": "Standard"`)
	require.Equal(t, http.StatusBadRequest, status)
	status, _ = price("job_missing", "translation", "")
	require.Equal(t, http.StatusNotFound, status)
	for _, malformed := range []string{`, "estimatedMinutes": -1`, `, "overrideUsd": "1,0"`, `, "rateCardName": ""`} {
		status, body = price(job, "review", malformed)
		require.Equal(t, http.StatusBadRequest, status, malformed)
		require.Equal(t, "invalid_task_rate", body["error"], malformed)
	}
	status, _ = f.send("localization_manager", http.MethodPut, "/reports/task-rates", fmt.Sprintf(`{"jobId": "%s", "step": "translation"}`, job))
	require.Equal(t, http.StatusForbidden, status)

	budget := func(rateCardName string) (int, map[string]any) {
		return f.send("admin", http.MethodPut, "/reports/budgets", fmt.Sprintf(`{"projectId": "%s", "budget": "500", "rateCardName": %s}`, f.scope.ProjectID, rateCardName))
	}
	status, body = budget(`"Nope"`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "rate_card_not_found", body["error"])
	// An empty name is no card; "no rate card" is sent as null.
	status, body = budget(`""`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_budget", body["error"])
	status, body = budget(`"Standard"`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "500.00000000", body["budget"].(map[string]any)["budget"])
	status, body = budget(`null`)
	require.Equal(t, http.StatusOK, status)
	require.Nil(t, body["budget"].(map[string]any)["rateCardName"])
	require.Equal(t, 1, f.count(`select count(*) from reporting_budgets where organization_id = $1`, f.scope.OrganizationID))
	status, body = f.send("admin", http.MethodPut, "/reports/budgets", `{"projectId": "project_elsewhere", "budget": "1"}`)
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, "project_not_found", body["error"])
	status, _ = f.send("localization_manager", http.MethodPut, "/reports/budgets", fmt.Sprintf(`{"projectId": "%s", "budget": "1"}`, f.scope.ProjectID))
	require.Equal(t, http.StatusForbidden, status)
}

func TestReportingLoggedTimeIsPricedOnlyByAnHourlyLine(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_time", f.scope.ProjectID, "running", false, "")
	f.card("Mixed", "2026-03-01T00:00:00Z", line("ja-JP", "0.02", "character"), line("de-DE", "60", "hour"))
	f.budget(f.scope.ProjectID, "1000", some("Mixed"))
	log := func(locale string) int {
		status, _ := f.send("admin", http.MethodPost, "/reports/time-entries", fmt.Sprintf(`{"jobId": "%s", "step": "translation", "targetLocale": "%s", "workDate": "2026-06-01", "minutes": 30}`, job, locale))
		return status
	}
	require.Equal(t, http.StatusCreated, log("ja-JP"))
	require.Equal(t, http.StatusCreated, log("de-DE"))
	rows, err := f.scope.Pool.Query(t.Context(), `select amount_usd::text, target_locale from reporting_costs where organization_id = $1 and kind = 'human'`, f.scope.OrganizationID)
	require.NoError(t, err)
	defer rows.Close()
	var costs [][]any
	for rows.Next() {
		var amount, locale string
		require.NoError(t, rows.Scan(&amount, &locale))
		costs = append(costs, []any{amount, locale})
	}
	require.Equal(t, [][]any{{"30.00000000", "de-DE"}}, costs)
	// Reports starts for the workspace at its first record.
	require.Equal(t, 1, f.count(`select count(*) from reporting_workspaces where organization_id = $1`, f.scope.OrganizationID))
	// A task with a fixed fee logs time without a cost of its own; an external task cannot log time.
	fee := f.job("job_fee", f.scope.ProjectID, "running", false, "")
	f.taskRate(fee, "translation", nil, "", nil, some("100"))
	status, _ := f.send("admin", http.MethodPost, "/reports/time-entries", fmt.Sprintf(`{"jobId": "%s", "step": "translation", "targetLocale": "de-DE", "workDate": "2026-06-01", "minutes": 30}`, fee))
	require.Equal(t, http.StatusCreated, status)
	require.Equal(t, 0, f.count(`select count(*) from reporting_costs where organization_id = $1 and job_id = $2`, f.scope.OrganizationID, fee))
	external := f.job("job_external", f.scope.ProjectID, "running", false, "")
	f.exec(`insert into external_job_details (job_id, organization_id, provider_kind, external_job_id, external_status) values ($1, $2, 'crowdin', '1', 'open')`, external, f.scope.OrganizationID)
	status, body := f.send("admin", http.MethodPost, "/reports/time-entries", fmt.Sprintf(`{"jobId": "%s", "step": "translation", "targetLocale": "de-DE", "workDate": "2026-06-01", "minutes": 30}`, external))
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "native_job_required", body["error"])
}

func TestReportingTimeEntriesAreEditedAndVoidedByTheirContributorOrBillingWrite(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_entries", f.scope.ProjectID, "running", false, "")
	f.card("Hourly", "2026-03-01T00:00:00Z", line("fr-FR", "60", "hour"))
	f.budget(f.scope.ProjectID, "1000", some("Hourly"))
	// The seeded user logs as a translator; an admin's entry is someone else's.
	status, body := f.send("translator", http.MethodPost, "/reports/time-entries", fmt.Sprintf(`{"jobId": "%s", "step": "translation", "targetLocale": "fr-FR", "workDate": "2026-06-01", "minutes": 30}`, job))
	require.Equal(t, http.StatusCreated, status)
	entryID := body["timeEntry"].(map[string]any)["id"].(string)
	status, _ = f.send("translator", http.MethodPatch, "/reports/time-entries/"+entryID, `{"minutes": 45, "workDate": "2026-06-02"}`)
	require.Equal(t, http.StatusOK, status)
	var amount string
	var voided bool
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select amount_usd::text, voided from reporting_costs where time_entry_id = $1`, entryID).Scan(&amount, &voided))
	require.Equal(t, "45.00000000", amount)
	require.False(t, voided)

	colleague := uuid.NewString()
	f.exec(`insert into users (id, workos_user_id, email) values ($1, $2, $3)`, colleague, "user_"+colleague, colleague+"@example.com")
	t.Cleanup(func() { _, _ = f.scope.Pool.Exec(t.Context(), `delete from users where id = $1`, colleague) })
	var foreign string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'translation', 'fr-FR', '2026-06-03', 15) returning id`, f.scope.OrganizationID, f.scope.ProjectID, job, colleague).Scan(&foreign))
	status, body = f.send("translator", http.MethodPatch, "/reports/time-entries/"+foreign, `{"minutes": 20, "workDate": "2026-06-03"}`)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "time_entry_forbidden", body["error"])
	status, _ = f.send("translator", http.MethodDelete, "/reports/time-entries/"+foreign, "")
	require.Equal(t, http.StatusForbidden, status)
	status, _ = f.send("admin", http.MethodPatch, "/reports/time-entries/"+entryID, `{"minutes": 15, "workDate": "2026-06-02"}`)
	require.Equal(t, http.StatusOK, status)
	status, _ = f.send("translator", http.MethodDelete, "/reports/time-entries/"+entryID, "")
	require.Equal(t, http.StatusNoContent, status)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select voided from reporting_costs where time_entry_id = $1`, entryID).Scan(&voided))
	require.True(t, voided)
	status, _ = f.send("admin", http.MethodPatch, "/reports/time-entries/"+entryID, `{"minutes": 15, "workDate": "2026-06-02"}`)
	require.Equal(t, http.StatusNotFound, status, "a voided entry cannot be edited")
	status, _ = f.send("admin", http.MethodDelete, "/reports/time-entries/"+uuid.NewString(), "")
	require.Equal(t, http.StatusNotFound, status)
	// A member may not log time; a translator may not log time on a task they cannot open.
	status, body = f.send("member", http.MethodPost, "/reports/time-entries", fmt.Sprintf(`{"jobId": "%s", "step": "translation", "targetLocale": "fr-FR", "workDate": "2026-06-01", "minutes": 30}`, job))
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "time_entry_forbidden", body["error"])
	for _, malformed := range []string{`{"jobId": "x", "step": "translation", "targetLocale": "fr-FR", "workDate": "2026-06-01", "minutes": 0}`, `{"jobId": "x", "step": "translation", "targetLocale": "f", "workDate": "2026-06-01", "minutes": 5}`, `{"jobId": "x", "step": "translation", "targetLocale": "fr-FR", "workDate": "2026-6-1", "minutes": 5}`, `{"jobId": "x", "step": "translation", "targetLocale": "fr-FR", "workDate": "2026-06-01", "minutes": 5, "note": null}`} {
		status, body = f.send("admin", http.MethodPost, "/reports/time-entries", malformed)
		require.Equal(t, http.StatusBadRequest, status, malformed)
		require.Equal(t, "invalid_time_entry", body["error"], malformed)
	}
	require.Equal(t, 4, f.count(`select count(*) from reporting_audit where organization_id = $1 and action like 'time_%'`, f.scope.OrganizationID))
}

func TestReportingTwoTaskPricesSavedTogetherLeaveOne(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_raced", f.scope.ProjectID, "waiting_for_review", false, "")
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "0.12"))
	f.card("Agency", "2026-03-01T00:00:00Z", line("fr-FR", "0.10"))
	api := reportingTestAPI(f.scope, "admin", stubWorkspaceFlags{enabled: true})
	var wg sync.WaitGroup
	statuses := make([]int, 2)
	for i, card := range []string{"Standard", "Agency"} {
		wg.Go(func() {
			rec := reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPut, f.scope.OrgPath("/reports/task-rates"), fmt.Sprintf(`{"jobId": "%s", "step": "translation", "rateCardName": "%s"}`, job, card))
			statuses[i] = rec.Code
		})
	}
	wg.Wait()
	require.Equal(t, []int{200, 200}, statuses)
	// The task row is locked, so the saves run one after the other: one row, the later card.
	require.Equal(t, 1, f.count(`select count(*) from reporting_task_rates where job_id = $1`, job))
	require.Equal(t, 2, f.count(`select count(*) from reporting_audit where organization_id = $1 and action = 'task_rate_saved'`, f.scope.OrganizationID))
	var card string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select rate_card_name from reporting_task_rates where job_id = $1`, job).Scan(&card))
	require.Contains(t, []string{"Standard", "Agency"}, card)
}

func TestReportingAnEditRacingADeleteLeavesTheEntryVoided(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_raced", f.scope.ProjectID, "running", false, "")
	f.card("Hourly", "2026-03-01T00:00:00Z", line("fr-FR", "60", "hour"))
	f.budget(f.scope.ProjectID, "1000", some("Hourly"))
	for range 5 {
		status, body := f.send("admin", http.MethodPost, "/reports/time-entries", fmt.Sprintf(`{"jobId": "%s", "step": "translation", "targetLocale": "fr-FR", "workDate": "2026-06-01", "minutes": 30}`, job))
		require.Equal(t, http.StatusCreated, status)
		entryID := body["timeEntry"].(map[string]any)["id"].(string)
		api := reportingTestAPI(f.scope, "admin", stubWorkspaceFlags{enabled: true})
		var wg sync.WaitGroup
		codes := make([]int, 2)
		wg.Go(func() {
			codes[0] = reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPatch, f.scope.OrgPath("/reports/time-entries/"+entryID), `{"minutes": 45, "workDate": "2026-06-02"}`).Code
		})
		wg.Go(func() {
			codes[1] = reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodDelete, f.scope.OrgPath("/reports/time-entries/"+entryID), "").Code
		})
		wg.Wait()
		require.Equal(t, http.StatusNoContent, codes[1])
		require.Contains(t, []int{http.StatusOK, http.StatusNotFound}, codes[0])
		// Whichever ran first, the entry and its cost end up voided.
		var entryVoided, costVoided bool
		require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select e.voided, c.voided from reporting_time_entries e join reporting_costs c on c.time_entry_id = e.id where e.id = $1`, entryID).Scan(&entryVoided, &costVoided))
		require.True(t, entryVoided)
		require.True(t, costVoided)
	}
}

func TestReportingWritesNeedTheFlag(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: false})
	for _, route := range []struct{ method, path string }{
		{http.MethodPut, "/reports/rate-cards"},
		{http.MethodPut, "/reports/budgets"},
		{http.MethodPut, "/reports/task-rates"},
		{http.MethodPost, "/reports/time-entries"},
		{http.MethodPatch, "/reports/time-entries/x"},
		{http.MethodDelete, "/reports/time-entries/x"},
	} {
		rec := reportingRequest(t, api, scope.WorkOSUserID, route.method, scope.OrgPath(route.path), `{}`)
		require.Equal(t, http.StatusForbidden, rec.Code, route)
		require.Contains(t, rec.Body.String(), "feature_unavailable", route)
	}
}
