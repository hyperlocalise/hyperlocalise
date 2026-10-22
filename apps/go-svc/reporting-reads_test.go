package main

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type reportingReadsFixture struct {
	scope     *testenv.Scope
	projectID string
	jobID     string
}

func seedReportingReads(t *testing.T) reportingReadsFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	scope.MustTeam(t, "default", "Default", "member")
	projectID := mustReportingProject(t, scope, "rp_reads", nil)
	jobID := mustReportingJob(t, scope, "job_reads", &projectID)
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := scope.Pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	var wordRate, hourRate string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages)
        values ($1, 'Card', 'en', 'fr', 'translation', 'word', '0.10', '{"100": 30}') returning id`,
		scope.OrganizationID).Scan(&wordRate))
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate)
        values ($1, 'Card', 'en', 'fr', 'review', 'hour', '60') returning id`,
		scope.OrganizationID).Scan(&hourRate))
	exec(`insert into reporting_budgets (organization_id, project_id, budget, rate_card_name) values ($1, $2, '100', 'Card')`,
		scope.OrganizationID, projectID)
	exec(`insert into reporting_task_rates (organization_id, job_id, step, estimated_minutes) values ($1, $2, 'review', 120)`,
		scope.OrganizationID, jobID)
	analysis := func(step, segment string, words int, bucket, rateID string) string {
		var id string
		require.NoError(t, scope.Pool.QueryRow(ctx, `
            insert into reporting_analyses (organization_id, project_id, job_id, step, segment_id, source_revision, source_locale, target_locale, words, billable, bucket, rate_id)
            values ($1, $2, $3, $4, $5, 'r1', 'en', 'fr', $6, true, $7, $8) returning id`,
			scope.OrganizationID, projectID, jobID, step, segment, words, bucket, rateID).Scan(&id))
		return id
	}
	analysis("translation", "s1", 100, "new", wordRate)
	analysis("translation", "s2", 50, "100", wordRate)
	completed := analysis("translation", "s3", 20, "new", wordRate)
	analysis("review", "s1", 100, "new", hourRate)
	exec(`
        insert into reporting_activity (organization_id, project_id, job_id, operation_key, kind, step, target_locale, analysis_id)
        values ($1, $2, $3, 'completion:' || $4::text || ':translation', 'completion', 'translation', 'fr', $4::uuid)`,
		scope.OrganizationID, projectID, jobID, completed)
	var entryID string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, rate_id)
        values ($1, $2, $3, $4, 'review', 'fr', date_trunc('day', now()), 30, $5) returning id`,
		scope.OrganizationID, projectID, jobID, scope.UserID, hourRate).Scan(&entryID))
	exec(`
        insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, target_locale, amount_usd, basis, time_entry_id)
        values ($1, $2, $3, 'time:' || $4::text, 'human', 'review', 'fr', '30', 'rate', $4::uuid)`,
		scope.OrganizationID, projectID, jobID, entryID)
	exec(`
        insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, amount_usd, basis, input_tokens, output_tokens)
        values ($1, $2, $3, 'ai:1', 'ai', 'translation', '0.5', 'reported', 10, 5),
               ($1, $2, $3, 'manual:1', 'human', 'translation', null, 'unpriced', null, null)`,
		scope.OrganizationID, projectID, jobID)
	return reportingReadsFixture{scope: scope, projectID: projectID, jobID: jobID}
}

func reportingGet(t *testing.T, f reportingReadsFixture, role, path string) (*http.Response, map[string]any) {
	t.Helper()
	h := workspaceHandler(f.scope, role, stubWorkspaceFlags{enabled: true})
	rec := workspaceRequest(t, h, f.scope, http.MethodGet, f.scope.OrgPath(path), "")
	var body map[string]any
	if strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	}
	return rec.Result(), body
}

func TestReportingReadsAgainstPostgres(t *testing.T) {
	f := seedReportingReads(t)

	res, body := reportingGet(t, f, "admin", "/reports/settings")
	require.Equal(t, http.StatusOK, res.StatusCode)
	settings := body["settings"].(map[string]any)
	require.Equal(t, true, settings["financial"])
	require.Equal(t, true, settings["canManage"])
	require.Len(t, settings["rates"], 2)
	budget := settings["budgets"].([]any)[0].(map[string]any)
	require.Equal(t, "100.00000000", budget["budget"])
	require.Equal(t, "30.50000000", budget["accruedUsd"])
	require.Equal(t, "101.50000000", budget["outstandingUsd"])
	require.Equal(t, "132.00000000", budget["forecastUsd"])
	require.Equal(t, "69.50000000", budget["remainingUsd"])
	require.Equal(t, true, budget["incomplete"])
	require.Equal(t, "none", budget["spendWarning"])
	require.Equal(t, "exceeded", budget["forecastWarning"])

	_, body = reportingGet(t, f, "translator", "/reports/settings")
	require.Equal(t, map[string]any{
		"projects":  []any{map[string]any{"id": f.projectID, "name": f.projectID, "targetLocales": []any{}}},
		"rates":     []any{},
		"budgets":   []any{},
		"financial": false,
		"canManage": false,
	}, body["settings"])

	res, body = reportingGet(t, f, "admin", "/reports?view=costs")
	require.Equal(t, http.StatusOK, res.StatusCode)
	report := body["report"].(map[string]any)
	require.Equal(t, map[string]any{"sourceWords": float64(170), "workloadWords": float64(170), "completedWords": float64(20)}, report["analysis"])
	amounts := map[string]any{}
	for _, raw := range report["rows"].([]any) {
		row := raw.(map[string]any)
		amounts[row["kind"].(string)+"/"+row["step"].(string)] = row["amountUsd"]
	}
	require.Equal(t, map[string]any{"ai/translation": "0.50000000", "human/translation": nil, "human/review": "30.00000000"}, amounts)

	res, _ = reportingGet(t, f, "translator", "/reports?view=costs")
	require.Equal(t, http.StatusForbidden, res.StatusCode)
	_, body = reportingGet(t, f, "translator", "/reports")
	for _, raw := range body["report"].(map[string]any)["rows"].([]any) {
		row := raw.(map[string]any)
		require.Nil(t, row["amountUsd"])
		require.NotEqual(t, "human", row["kind"], "non-financial readers only see AI costs")
	}

	res, _ = reportingGet(t, f, "admin", "/reports?format=csv&view=time")
	require.Equal(t, http.StatusOK, res.StatusCode)
	require.Equal(t, `attachment; filename="translation-report.csv"`, res.Header.Get("Content-Disposition"))
	lines := strings.Split(readReportingBodyString(t, res), "\r\n")
	require.Equal(t, reportCSVLine(slices.Concat(reportCSVColumns, []string{"amountUsd"})), lines[0])
	require.Len(t, lines, 2)
	require.Contains(t, lines[1], `"review","","time","0","30"`)

	res, body = reportingGet(t, f, "translator", "/reports/tasks/"+f.jobID)
	require.Equal(t, http.StatusOK, res.StatusCode)
	task := body["taskReport"].(map[string]any)
	require.Len(t, task["analyses"], 4)
	entries := task["timeEntries"].([]any)
	require.Len(t, entries, 1)
	require.NotContains(t, entries[0], "rateId")

	res, _ = reportingGet(t, f, "admin", "/reports/tasks/job_missing")
	require.Equal(t, http.StatusNotFound, res.StatusCode)
}

func readReportingBodyString(t *testing.T, res *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return string(body)
}
