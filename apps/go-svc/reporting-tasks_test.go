package main

import (
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestReportingTaskSearchListsTasksWithReportsData(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	jobID := mustReportingTask(t, scope, "job_checkout", scope.ProjectID, "translation", "succeeded", "Checkout strings", "")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into reporting_analyses (organization_id, project_id, job_id, step, segment_id, source_revision, source_locale, target_locale, words, bucket)
        values ($1, $2, $3, 'translation', 's1', 'r1', 'en-US', 'fr-FR', 10, 'new')`, scope.OrganizationID, scope.ProjectID, jobID)
	require.NoError(t, err)
	mustReportingTask(t, scope, "job_unanalysed", scope.ProjectID, "translation", "running", "Nothing counted", "")

	jobs := reportingReadJSON(t, scope, "admin", "/reports/jobs")["jobs"].([]any)
	require.Len(t, jobs, 1)
	task := jobs[0].(map[string]any)
	require.Equal(t, jobID, task["id"])
	require.Equal(t, "Checkout strings", task["title"])
	require.Equal(t, scope.ProjectID, task["projectId"])
	require.Equal(t, "succeeded", task["status"])
	require.NotEmpty(t, task["createdAt"])

	count := func(path string) int {
		return len(reportingReadJSON(t, scope, "admin", path)["jobs"].([]any))
	}
	require.Equal(t, 1, count("/reports/jobs?q=checkout"))
	require.Equal(t, 0, count("/reports/jobs?q=invoice"))
	// Wildcards in the search are matched as themselves.
	require.Equal(t, 0, count("/reports/jobs?q=%25"))
	require.Equal(t, 1, count("/reports/jobs?ids="+jobID))
	require.Equal(t, 0, count("/reports/jobs?ids=job_other"))
	// The seeded task has finished, so it is not open.
	require.Equal(t, 0, count("/reports/jobs?open=true"))
	// Logging time may pick a task Reports has not counted yet.
	require.Equal(t, 2, count("/reports/jobs?counted=false"))
	require.Equal(t, 1, count("/reports/jobs?counted=false&limit=1"))
}

func TestReportingTaskSearchRefusesMalformedQueries(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	for _, path := range []string{"/reports/jobs?limit=0", "/reports/jobs?limit=201", "/reports/jobs?open=yes", "/reports/jobs?counted=maybe", "/reports/jobs?projectId="} {
		status, body := reportingSend(t, scope, "admin", http.MethodGet, path, "")
		require.Equal(t, http.StatusBadRequest, status, path)
		require.Equal(t, "invalid_report_query", body["error"], path)
	}
	// Every member may search; a fresh workspace has nothing.
	for _, role := range []string{"member", "translator"} {
		require.Equal(t, []any{}, reportingReadJSON(t, scope, role, "/reports/jobs")["jobs"], role)
	}
}
