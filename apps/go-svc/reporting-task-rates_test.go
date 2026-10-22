package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestReportingTaskRatesAgainstPostgres(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	ctx := t.Context()
	projectID := mustReportingProject(t, scope, "rp_task_rates", nil)
	jobID := mustReportingJob(t, scope, "job_task_rates", &projectID)
	var reviewRate string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate)
        values ($1, 'Card', 'en', 'fr', 'review', 'hour', '60') returning id`, scope.OrganizationID).Scan(&reviewRate))
	put := func(role, body string) (int, map[string]any) {
		return reportingSend(t, scope, role, http.MethodPut, "/reports/task-rates", body)
	}
	audits := func() int {
		var n int
		require.NoError(t, scope.Pool.QueryRow(ctx, `select count(*) from reporting_audit where organization_id=$1 and action='task_rate_saved'`,
			scope.OrganizationID).Scan(&n))
		return n
	}

	status, body := put("localization_manager", `{}`)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "report_costs_forbidden", body["error"])

	for _, invalid := range []string{"{", `{"jobId":"` + jobID + `","step":"review","estimatedMinutes":-1}`, `{"jobId":"` + jobID + `","step":"review","rateId":"nope"}`} {
		status, body = put("admin", invalid)
		require.Equal(t, http.StatusBadRequest, status, invalid)
		require.Equal(t, "invalid_task_rate", body["error"])
	}

	status, body = put("admin", `{"jobId":"missing","step":"review"}`)
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, "job_not_found", body["error"])

	for _, rateID := range []string{reviewRate, uuid.NewString()} {
		status, body = put("admin", `{"jobId":"`+jobID+`","step":"translation","rateId":"`+rateID+`"}`)
		require.Equal(t, http.StatusBadRequest, status, "rate must exist for the same step")
		require.Equal(t, "invalid_rate", body["error"])
	}

	status, body = put("admin", `{"jobId":"`+jobID+`","step":"review","rateId":"`+reviewRate+`","estimatedMinutes":120,"overrideUsd":"45.5"}`)
	require.Equal(t, http.StatusOK, status)
	first := body["taskRate"].(map[string]any)
	require.Equal(t, reviewRate, first["rateId"])
	require.Equal(t, float64(120), first["estimatedMinutes"])
	require.Equal(t, "45.50000000", first["overrideUsd"])
	require.Equal(t, 1, audits())

	var after []byte
	require.NoError(t, scope.Pool.QueryRow(ctx, `select after from reporting_audit where resource_id=$1`, first["id"]).Scan(&after))
	var snapshot map[string]any
	require.NoError(t, json.Unmarshal(after, &snapshot))
	require.Equal(t, first, snapshot, "the audit snapshot is the saved row")

	status, body = put("admin", `{"jobId":"`+jobID+`","step":"review"}`)
	require.Equal(t, http.StatusOK, status)
	second := body["taskRate"].(map[string]any)
	require.Equal(t, first["id"], second["id"])
	require.Nil(t, second["rateId"])
	require.Nil(t, second["estimatedMinutes"])
	require.Nil(t, second["overrideUsd"])
	require.Equal(t, 2, audits())

	_, err := scope.Pool.Exec(ctx, `
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'review', 'fr', now(), 10)`, scope.OrganizationID, projectID, jobID, scope.UserID)
	require.NoError(t, err)
	status, body = put("admin", `{"jobId":"`+jobID+`","step":"review","estimatedMinutes":60}`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "task_rate_locked", body["error"])
	require.Equal(t, "Task rates can only change before work starts.", body["message"])
	require.Equal(t, 2, audits())

	status, _ = put("admin", `{"jobId":"`+jobID+`","step":"translation"}`)
	require.Equal(t, http.StatusOK, status, "work on one step does not lock the other")

	_, err = scope.Pool.Exec(ctx, `update jobs set status='running' where id=$1`, jobID)
	require.NoError(t, err)
	status, body = put("admin", `{"jobId":"`+jobID+`","step":"translation"}`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "task_rate_locked", body["error"])
}
