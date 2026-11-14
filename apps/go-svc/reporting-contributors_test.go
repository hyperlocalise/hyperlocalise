package main

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// seedReportingContributors gives the workspace two people: the seeded admin, Ada, and Grace,
// with finished work, time and costs in June, plus a removed member's row.
func seedReportingContributors(t *testing.T) (reportingMoneyFixture, string, string) {
	t.Helper()
	f := seedReportingMoney(t)
	f.exec(`update users set first_name = 'Ada', last_name = 'Lovelace' where id = $1`, f.scope.UserID)
	grace := uuid.NewString()
	f.exec(`insert into users (id, workos_user_id, email, first_name, last_name) values ($1, $2, $3, 'Grace', 'Hopper')`,
		grace, "user_"+grace, grace+"@example.com")
	removed := uuid.NewString()
	person := func(actor, target, step, bucket, postEdit, day string, words, unchanged int) {
		f.exec(`insert into reporting_daily_by_person (organization_id, project_id, actor_user_id, source_locale, target_locale,
                step, bucket, post_edit_bucket, day, finished_words, finished_strings, finished_unchanged_words, finished_unchanged_strings)
            values ($1, $2, $3, 'en-US', $4, $5, $6, $7, $8, $9, 1, $10, $11)`,
			f.scope.OrganizationID, f.scope.ProjectID, actor, target, step, bucket, postEdit, day, words, unchanged, min(unchanged, 1))
	}
	person(f.scope.UserID, "fr-FR", "translation", "new", "85-94", "2026-06-02", 100, 0)
	person(f.scope.UserID, "fr-FR", "translation", "100", "100", "2026-06-03", 40, 40)
	person(f.scope.UserID, "de-DE", "review", "new", "", "2026-06-04", 30, 0)
	person(grace, "de-DE", "translation", "95-99", "50-74", "2026-06-05", 200, 0)
	person(removed, "de-DE", "translation", "new", "", "2026-06-05", 10, 0)
	// Before the period: left out.
	person(grace, "de-DE", "translation", "new", "", "2026-05-01", 999, 0)

	// Ada's finished string cost $12.50, priced; Grace's string had no rate.
	analysis := func() string {
		var id string
		require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `
            insert into reporting_analyses (organization_id, project_id, step, segment_id, source_revision, source_locale, target_locale, words, bucket)
            values ($1, $2, 'translation', $3, 'rev', 'en-US', 'fr-FR', 10, 'new') returning id`,
			f.scope.OrganizationID, f.scope.ProjectID, uuid.NewString()).Scan(&id))
		return id
	}
	finished := func(actor, analysisID, amount string) {
		f.exec(`insert into reporting_activity (organization_id, project_id, operation_key, kind, step, target_locale, analysis_id, actor_user_id, created_at)
            values ($1, $2, $3, 'completion', 'translation', 'fr-FR', $4, $5, '2026-06-02T10:00:00Z')`,
			f.scope.OrganizationID, f.scope.ProjectID, "completion:"+analysisID+":translation", analysisID, actor)
		var amountArg any
		basis := "unpriced"
		if amount != "" {
			amountArg, basis = amount, "rate"
		}
		f.exec(`insert into reporting_costs (organization_id, project_id, operation_key, kind, step, target_locale, amount_usd, basis, created_at)
            values ($1, $2, $3, 'human', 'translation', 'fr-FR', $4::numeric, $5, '2026-06-02T10:00:00Z')`,
			f.scope.OrganizationID, f.scope.ProjectID, "human:"+analysisID+":translation", amountArg, basis)
	}
	finished(f.scope.UserID, analysis(), "12.5")
	finished(grace, analysis(), "")

	// Grace logged 90 minutes at $40 an hour; a voided entry is left out.
	var entry string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `
        insert into reporting_time_entries (organization_id, project_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, 'translation', 'de-DE', '2026-06-06', 90) returning id`,
		f.scope.OrganizationID, f.scope.ProjectID, grace).Scan(&entry))
	f.exec(`insert into reporting_costs (organization_id, project_id, operation_key, kind, step, target_locale, time_entry_id, amount_usd, basis, created_at)
        values ($1, $2, $3, 'human', 'translation', 'de-DE', $4, 60, 'rate', '2026-06-06T00:00:00Z')`,
		f.scope.OrganizationID, f.scope.ProjectID, "time:"+entry, entry)
	f.exec(`insert into reporting_time_entries (organization_id, project_id, contributor_id, step, target_locale, work_date, minutes, voided)
        values ($1, $2, $3, 'translation', 'de-DE', '2026-06-06', 500, true)`, f.scope.OrganizationID, f.scope.ProjectID, grace)
	return f, grace, removed
}

func TestReportingContributorsListEachPersonsWorkTimeAndSpending(t *testing.T) {
	f, grace, removed := seedReportingContributors(t)
	body := reportingReadJSON(t, f.scope, "admin", "/reports/contributors?from=2026-06-01&to=2026-06-30")
	report := body["contributors"].(map[string]any)
	require.Equal(t, true, report["financial"])
	require.Equal(t, "", report["step"], "both steps unless one is chosen")
	rows := report["rows"].([]any)
	require.Len(t, rows, 3)
	require.Equal(t, [][]any{
		{grace, "Grace Hopper", float64(200), float64(0), float64(90), "60.00000000", float64(1)},
		{f.scope.UserID, "Ada Lovelace", float64(170), float64(40), float64(0), "12.50000000", float64(0)},
		{removed, nil, float64(10), float64(0), float64(0), "0.00000000", float64(0)},
	}, rowValues(rows, "userId", "person", "finished", "unchanged", "minutes", "spentUsd", "unpriced"))
	ada := rows[1].(map[string]any)
	require.Equal(t, map[string]any{"new": float64(130), "100": float64(40)}, ada["bands"])
	require.Equal(t, map[string]any{"85-94": float64(100), "100": float64(40), "": float64(30)}, ada["postEditBands"])
	require.Equal(t, []any{"de-DE", "fr-FR"}, ada["languages"])
	totals := report["totals"].(map[string]any)
	require.Equal(t, float64(380), totals["finished"])
	require.Equal(t, float64(3), totals["people"])
	require.Equal(t, "72.50000000", totals["spentUsd"])

	// One step, one language.
	report = reportingReadJSON(t, f.scope, "admin", "/reports/contributors?from=2026-06-01&to=2026-06-30&step=review")["contributors"].(map[string]any)
	require.Equal(t, [][]any{{f.scope.UserID, float64(30)}}, rowValues(report["rows"], "userId", "finished"))
	report = reportingReadJSON(t, f.scope, "admin", "/reports/contributors?from=2026-06-01&to=2026-06-30&targetLocale=fr-FR")["contributors"].(map[string]any)
	require.Equal(t, [][]any{{f.scope.UserID, float64(140)}, {grace, float64(0)}}, rowValues(report["rows"], "userId", "finished"),
		"Grace's unpriced French string still names her")

	status, body := reportingSend(t, f.scope, "admin", http.MethodGet, "/reports/contributors?step=proofread", "")
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_report_query", body["error"])
}

func TestReportingContributorsShowOtherRolesOnlyTheirOwnWorkWithoutMoney(t *testing.T) {
	f, _, _ := seedReportingContributors(t)
	report := reportingReadJSON(t, f.scope, "translator", "/reports/contributors?from=2026-06-01&to=2026-06-30")["contributors"].(map[string]any)
	require.Equal(t, false, report["financial"])
	rows := report["rows"].([]any)
	require.Equal(t, [][]any{{f.scope.UserID, float64(170), nil}}, rowValues(rows, "userId", "finished", "spentUsd"))
	require.Nil(t, report["totals"].(map[string]any)["spentUsd"])
}

func TestReportingContributorsCSV(t *testing.T) {
	f, _, _ := seedReportingContributors(t)
	lines := reportingReadCSV(t, f.scope, "admin", "/reports/contributors?from=2026-06-01&to=2026-06-30&format=csv")
	require.Equal(t, `"Person","Languages","Finished (words)","Unchanged (words)","Match 100","Match 95-99","Match new","Post-edit 100","Post-edit 85-94","Post-edit 50-74","Post-edit none","Minutes logged","Spent (USD)","Unpriced strings"`, lines[0])
	require.Equal(t, `"Grace Hopper","de-DE","200","0","0","200","0","0","0","200","0","90","60.00000000","1"`, lines[1])
	require.Equal(t, `"Removed member","de-DE","10","0","0","0","10","0","0","0","10","0","0.00000000","0"`, lines[3])
}

func TestReportingContributorsIsAnInternalReportKind(t *testing.T) {
	f, _, _ := seedReportingContributors(t)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test")
	api := reportingTestAPI(f.scope, "admin", stubWorkspaceFlags{enabled: true})
	payload := `{"organizationId": "` + f.scope.OrganizationID + `", "userId": "` + f.scope.UserID + `", "query": {"from": "2026-06-01", "to": "2026-06-30"}`
	rec := reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPost, "/internal/reports/contributors", payload+`}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"kind":"contributors"`)
	require.Contains(t, rec.Body.String(), `"Grace Hopper"`)

	rec = reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPost, "/internal/reports/contributors", payload+`, "format": "csv"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "text/csv; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Contains(t, rec.Body.String(), `"Grace Hopper"`)

	rec = reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPost, "/internal/reports/word-series", payload+`, "format": "csv"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "report_csv_unavailable")

	rec = reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPost, "/internal/reports/task-report", payload+`}`)
	require.Equal(t, http.StatusBadRequest, rec.Code, "a task report names its task")

	rec = reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodPost, "/internal/reports/budgets", payload+`, "format": "xml"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestReportingTaskReportShowsPeoplesPostEditBands(t *testing.T) {
	f := seedReportingMoney(t)
	job := mustReportingTask(t, f.scope, "task_post_edit", f.scope.ProjectID, "translation", "running", "Post-edit", "")
	for _, row := range []struct {
		postEdit string
		words    int
	}{{"100", 20}, {"85-94", 30}, {"", 5}} {
		f.exec(`insert into reporting_daily_by_person (organization_id, project_id, job_id, actor_user_id, source_locale, target_locale,
                step, bucket, post_edit_bucket, day, finished_words, finished_strings)
            values ($1, $2, $3, $4, 'en-US', 'fr-FR', 'translation', 'new', $5, '2026-06-02', $6, 1)`,
			f.scope.OrganizationID, f.scope.ProjectID, job, f.scope.UserID, row.postEdit, row.words)
	}
	report := reportingReadJSON(t, f.scope, "admin", "/reports/tasks/"+job+"/report")["taskReport"].(map[string]any)
	bands := report["words"].(map[string]any)["postEditBands"].(map[string]any)
	require.Equal(t, map[string]any{"100": float64(20), "85-94": float64(30), "": float64(5)}, bands["translation"])
	require.Equal(t, map[string]any{}, bands["review"])
}
