package main

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestReportingTaskAnalysisTellsHowFarItHasGot(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_analysed", f.scope.ProjectID, "running", false, "Proofread strings")
	// A task never analysed has no state.
	require.Equal(t, []any{}, reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/analysis")["analysis"])
	f.exec(`insert into reporting_task_analyses (organization_id, job_id, step, status, updated_at) values ($1, $2, 'review', 'pending', $3)`, f.scope.OrganizationID, job, reportingTestToday)
	f.exec(`insert into reporting_task_analyses (organization_id, job_id, step, status, strings, error, updated_at) values ($1, $2, 'translation', 'failed', 12, 'memory down', $3)`, f.scope.OrganizationID, job, reportingTestToday)
	states := reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/analysis")["analysis"].([]any)
	byStep := map[string]map[string]any{}
	for _, state := range states {
		byStep[state.(map[string]any)["step"].(string)] = state.(map[string]any)
	}
	require.Equal(t, "pending", byStep["review"]["status"])
	require.Equal(t, false, byStep["review"]["incomplete"])
	require.Nil(t, byStep["review"]["strings"])
	require.Nil(t, byStep["review"]["error"])
	require.Equal(t, "failed", byStep["translation"]["status"])
	require.Equal(t, float64(12), byStep["translation"]["strings"])
	require.Equal(t, "memory down", byStep["translation"]["error"])
	// The counts and failure details go with the task's words: roles without billing access see
	// only the state.
	seen := reportingReadJSON(t, f.scope, "translator", "/reports/tasks/"+job+"/analysis")["analysis"].([]any)
	for _, state := range seen {
		s := state.(map[string]any)
		if s["step"] == "translation" {
			require.Equal(t, "failed", s["status"])
			require.Nil(t, s["strings"])
			require.Nil(t, s["error"])
		}
	}
	status, _ := reportingSend(t, f.scope, "admin", http.MethodGet, "/reports/tasks/job_missing/analysis", "")
	require.Equal(t, http.StatusNotFound, status)

	// A pending analysis left alone for an hour reads as failed; a finished one is kept whole.
	f.exec(`update reporting_task_analyses set updated_at = $3::timestamptz - interval '61 minutes' where job_id = $1 and step = $2`, job, "review", reportingTestToday)
	stale := reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/analysis")["analysis"].([]any)
	for _, state := range stale {
		s := state.(map[string]any)
		if s["step"] == "review" {
			require.Equal(t, "failed", s["status"])
			require.Equal(t, "reporting_task_analysis_stopped", s["error"])
		}
	}
	f.exec(`update reporting_task_analyses set status = 'done', incomplete = true, strings = 2 where job_id = $1 and step = 'review'`, job)
	done := reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/analysis")["analysis"].([]any)
	for _, state := range done {
		s := state.(map[string]any)
		if s["step"] == "review" {
			require.Equal(t, "done", s["status"])
			require.Equal(t, true, s["incomplete"])
			require.Equal(t, float64(2), s["strings"])
			require.Nil(t, s["error"])
		}
	}
}

func TestReportingTaskReportWordsMoneyAndTime(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_report", f.scope.ProjectID, "running", true, "Release strings")
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "0.5"))
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: job, targetLocale: "fr-FR", day: "2026-06-01", sourceUnits: 10, arrived: 10, arrivedStrings: 2, arrivedDone: 4},
		{jobID: job, targetLocale: "fr-FR", step: "review", day: "2026-06-02", arrived: 10, arrivedDone: 2},
	})
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'translation', 'fr-FR', '2026-06-01', 45)`, f.scope.OrganizationID, f.scope.ProjectID, job, f.scope.UserID)
	report := reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/report?rateCard=Standard")["taskReport"].(map[string]any)
	task := report["task"].(map[string]any)
	require.Equal(t, job, task["id"])
	require.Equal(t, "Release strings", task["title"])
	require.Equal(t, "running", task["status"])
	require.Equal(t, []any{}, task["targetLocales"])
	totals := report["words"].(map[string]any)["totals"].(map[string]any)
	require.Equal(t, map[string]any{"source": float64(10), "arrived": float64(10), "arrivedDone": float64(4), "uncounted": float64(0)}, totals["translation"])
	require.Equal(t, float64(2), totals["review"].(map[string]any)["arrivedDone"])
	require.Equal(t, "5.00000000", report["estimate"].(map[string]any)["totals"].(map[string]any)["costUsd"])
	require.Equal(t, map[string]any{"amountUsd": "3.00000000", "incomplete": false}, report["stillToCome"])
	time := report["time"].(map[string]any)
	require.Equal(t, float64(45), time["minutes"])
	require.Equal(t, float64(1), time["people"])
	entry := time["entries"].([]any)[0].(map[string]any)
	require.Equal(t, float64(45), entry["minutes"])
	require.Equal(t, true, entry["own"])
	require.Equal(t, true, entry["canEdit"])
	require.NotEmpty(t, entry["person"])
	// Time is logged on translation, so its pricing can no longer change; review's still can.
	require.Equal(t, [][]any{{"translation", nil, true}, {"review", nil, false}}, rowValues(report["pricing"], "step", "rateCardName", "locked"))
	require.Equal(t, true, report["canSetPricing"])
	require.Equal(t, true, report["canLogTime"])

	lines := reportingReadCSV(t, f.scope, "admin", "/reports/tasks/"+job+"/report?rateCard=Standard&format=csv")
	require.Equal(t, []string{
		`"targetLocale","new","total","finished","weighted","costUsd","pricing"`,
		`"fr-FR","10","10","4","10","5.00","rate"`,
	}, lines)

	// Pricing is money: a localization manager reads it, only an admin sets it, others see none.
	manager := reportingReadJSON(t, f.scope, "localization_manager", "/reports/tasks/"+job+"/report")["taskReport"].(map[string]any)
	require.Len(t, manager["pricing"], 2)
	require.Equal(t, false, manager["canSetPricing"])
	translator := reportingReadJSON(t, f.scope, "translator", "/reports/tasks/"+job+"/report")["taskReport"].(map[string]any)
	require.Nil(t, translator["words"])
	require.Nil(t, translator["estimate"])
	require.Nil(t, translator["stillToCome"])
	require.Nil(t, translator["pricing"])
	require.Equal(t, false, translator["canSetPricing"])
	// The seeded user is the one who logged the time, so a translator still sees their own entry.
	require.Len(t, translator["time"].(map[string]any)["entries"], 1)
	status, body := reportingSend(t, f.scope, "translator", http.MethodGet, "/reports/tasks/"+job+"/report?format=csv", "")
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "report_costs_forbidden", body["error"])
	status, _ = reportingSend(t, f.scope, "admin", http.MethodGet, "/reports/tasks/job_missing/report", "")
	require.Equal(t, http.StatusNotFound, status)
}

func TestReportingTaskReportHidesOtherPeoplesTimeFromOtherRoles(t *testing.T) {
	f := seedReportingMoney(t)
	job := f.job("job_shared", f.scope.ProjectID, "running", false, "")
	colleague := uuid.NewString()
	f.exec(`insert into users (id, workos_user_id, email, first_name, last_name) values ($1, $2, $3, 'Ada', 'Lovelace')`, colleague, "user_"+colleague, colleague+"@example.com")
	t.Cleanup(func() { _, _ = f.scope.Pool.Exec(t.Context(), `delete from users where id = $1`, colleague) })
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, note)
        values ($1, $2, $3, $4, 'translation', 'fr-FR', '2026-06-01', 30, 'theirs')`, f.scope.OrganizationID, f.scope.ProjectID, job, colleague)
	admin := reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/report")["taskReport"].(map[string]any)["time"].(map[string]any)
	require.Equal(t, float64(30), admin["minutes"])
	entry := admin["entries"].([]any)[0].(map[string]any)
	require.Equal(t, "Ada Lovelace", entry["person"])
	require.Equal(t, "theirs", entry["note"])
	require.Equal(t, false, entry["own"])
	// An admin may edit anyone's time.
	require.Equal(t, true, entry["canEdit"])
	// Someone else's 30 minutes: not listed, and not counted either.
	translator := reportingReadJSON(t, f.scope, "translator", "/reports/tasks/"+job+"/report")["taskReport"].(map[string]any)["time"].(map[string]any)
	require.Equal(t, map[string]any{"minutes": float64(0), "people": float64(0), "entries": []any{}}, translator)
}

func TestReportingLockedPricingSteps(t *testing.T) {
	f := seedReportingMoney(t)
	open := f.job("job_open", f.scope.ProjectID, "queued", false, "")
	ended := f.job("job_ended", f.scope.ProjectID, "succeeded", false, "")
	locked := func(job, status string) []string {
		var steps []string
		require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select 1`).Scan(new(int)))
		err := reportingTestAPI(f.scope, "admin", stubWorkspaceFlags{enabled: true}).read(t.Context(), func(db dictionaryDB) error {
			var err error
			steps, err = queryReportingLockedPricingSteps(t.Context(), db, f.scope.OrganizationID, job, status)
			return err
		})
		require.NoError(t, err)
		return steps
	}
	require.Equal(t, []string{}, locked(open, "queued"))
	require.Equal(t, []string{"translation", "review"}, locked(ended, "succeeded"))
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'translation', 'fr-FR', '2026-06-01', 15)`, f.scope.OrganizationID, f.scope.ProjectID, open, f.scope.UserID)
	require.Equal(t, []string{"translation"}, locked(open, "queued"))
	// An expense row the old API wrote is not work; a person's cost of work is.
	f.exec(`insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, amount_usd, basis) values ($1, $2, $3, 'expense:' || gen_random_uuid(), 'expense', 'review', 20, 'manual')`, f.scope.OrganizationID, f.scope.ProjectID, open)
	require.Equal(t, []string{"translation"}, locked(open, "queued"))
	f.exec(`insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, amount_usd, basis) values ($1, $2, $3, 'human:' || gen_random_uuid(), 'human', 'review', 40, 'manual')`, f.scope.OrganizationID, f.scope.ProjectID, open)
	require.Equal(t, []string{"translation", "review"}, locked(open, "queued"))

	// Voided time and costs, and an agent job's AI calls, do not start work; a finished string does.
	running := f.job("job_running", f.scope.ProjectID, "running", false, "")
	f.exec(`insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, voided)
        values ($1, $2, $3, $4, 'translation', 'fr-FR', '2026-06-01', 15, true)`, f.scope.OrganizationID, f.scope.ProjectID, running, f.scope.UserID)
	f.exec(`insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, amount_usd, basis, voided) values ($1, $2, $3, 'human:' || gen_random_uuid(), 'human', 'review', 40, 'manual', true)`, f.scope.OrganizationID, f.scope.ProjectID, running)
	f.exec(`insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, basis) values ($1, $2, $3, 'ai:' || gen_random_uuid(), 'ai', 'translation', 'unpriced')`, f.scope.OrganizationID, f.scope.ProjectID, running)
	require.Equal(t, []string{}, locked(running, "running"))
	f.exec(`insert into reporting_activity (organization_id, project_id, job_id, operation_key, kind, step, target_locale) values ($1, $2, $3, 'completion:' || gen_random_uuid() || ':translation', 'completion', 'translation', 'fr-FR')`, f.scope.OrganizationID, f.scope.ProjectID, running)
	require.Equal(t, []string{"translation"}, locked(running, "running"))
}

func TestReportingInternalReportServesTheMcpToolForAMember(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test")
	payload := func(query string) string {
		return fmt.Sprintf(`{"organizationId": "%s", "userId": "%s", "query": %s}`, scope.OrganizationID, scope.UserID, query)
	}
	send := func(role, kind, body string, token bool) (int, map[string]any) {
		api := reportingTestAPI(scope, role, stubWorkspaceFlags{enabled: true})
		rec := reportingRequest(t, api, scope.WorkOSUserID, http.MethodPost, "/internal/reports/"+kind, body)
		if !token {
			mux := http.NewServeMux()
			api.registerInternal(mux)
			return reportingSendRaw(t, mux, http.MethodPost, "/internal/reports/"+kind, body)
		}
		return reportingDecode(t, rec.Code, rec.Body.Bytes(), rec.Header().Get("Content-Type"))
	}
	status, _ := send("admin", "activity", payload(`{}`), false)
	require.Equal(t, http.StatusUnauthorized, status, "the service token is required")
	status, body := send("translator", "costs", payload(`{}`), true)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "report_forbidden", body["error"])
	// The same reads as the page: a kind, that tab's fields, and whether work is still counted.
	status, body = send("admin", "activity", payload(`{"unit": "strings"}`), true)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "activity", body["kind"])
	require.Equal(t, false, body["stillUpdating"])
	require.Equal(t, "strings", body["activity"].(map[string]any)["unit"])
	status, body = send("admin", "words", payload(`{"groupBy": "task", "split": "band", "per": "month"}`), true)
	require.Equal(t, http.StatusOK, status)
	counts := body["wordCounts"].(map[string]any)
	require.Equal(t, "task", counts["groupBy"])
	require.Equal(t, "band", counts["series"].(map[string]any)["split"])
	status, body = send("admin", "ai", payload(`{"groupBy": "model", "thenBy": "area", "key": "our_ai"}`), true)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "area", body["aiUsage"].(map[string]any)["thenBy"])
	require.Equal(t, false, body["stillUpdating"])
	for _, kind := range []string{"time", "costs"} {
		status, body = send("admin", kind, payload(`{}`), true)
		require.Equal(t, http.StatusOK, status, kind)
		require.Contains(t, body, kind)
	}
	status, body = send("admin", "words", payload(`{"from": "2026-06-10", "to": "2026-06-01"}`), true)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_report_query", body["error"])
	status, _ = send("admin", "budgets", payload(`{}`), true)
	require.Equal(t, http.StatusBadRequest, status)
	status, _ = send("admin", "activity", `{"organizationId": "nope"}`, true)
	require.Equal(t, http.StatusBadRequest, status)
	// The flag applies to the member's workspace as on the page.
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: false})
	rec := reportingRequest(t, api, scope.WorkOSUserID, http.MethodPost, "/internal/reports/activity", payload(`{}`))
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}
