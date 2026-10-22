package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func reportingSend(t *testing.T, scope *testenv.Scope, role, method, path, body string) (int, map[string]any) {
	t.Helper()
	h := workspaceHandler(scope, role, stubWorkspaceFlags{enabled: true})
	rec := workspaceRequest(t, h, scope, method, scope.OrgPath(path), body)
	var decoded map[string]any
	if rec.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &decoded), rec.Body.String())
	}
	return rec.Code, decoded
}

func TestReportingRatesAgainstPostgres(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	rate := `{"name":"  Default  ","sourceLocale":"en","targetLocale":"fr","step":"translation","basis":"word","rate":"0.12","percentages":{"100":50}}`

	status, body := reportingSend(t, scope, "localization_manager", http.MethodPost, "/reports/rates", rate)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "report_costs_forbidden", body["error"])

	status, _ = reportingSend(t, scope, "localization_manager", http.MethodPost, "/reports/rates", "{")
	require.Equal(t, http.StatusForbidden, status, "capability is checked before the body")

	for _, invalid := range []string{"{", "", `{"name":"x"}`} {
		status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/rates", invalid)
		require.Equal(t, http.StatusBadRequest, status, invalid)
		require.Equal(t, "invalid_rate", body["error"])
	}

	status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/rates", rate)
	require.Equal(t, http.StatusCreated, status)
	created := body["rate"].(map[string]any)
	require.Equal(t, "Default", created["name"])
	require.Equal(t, "0.12000000", created["rate"])
	require.Equal(t, map[string]any{"100": float64(50)}, created["percentages"])
	require.Equal(t, scope.OrganizationID, created["organizationId"])
}

func TestReportingBudgetsAgainstPostgres(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	projectID := mustReportingProject(t, scope, "rp_budget", nil)

	status, body := reportingSend(t, scope, "admin", http.MethodPut, "/reports/budgets", `{"projectId":"`+projectID+`","budget":"100","rateCardName":"Card"}`)
	require.Equal(t, http.StatusOK, status)
	first := body["budget"].(map[string]any)
	require.Equal(t, "100.00000000", first["budget"])
	require.Equal(t, "Card", first["rateCardName"])

	status, body = reportingSend(t, scope, "admin", http.MethodPut, "/reports/budgets", `{"projectId":"`+projectID+`","budget":"250.5"}`)
	require.Equal(t, http.StatusOK, status)
	second := body["budget"].(map[string]any)
	require.Equal(t, first["id"], second["id"])
	require.Equal(t, "250.50000000", second["budget"])
	require.Nil(t, second["rateCardName"], "omitting rateCardName clears it")

	status, body = reportingSend(t, scope, "admin", http.MethodPut, "/reports/budgets", `{"projectId":"missing","budget":"1"}`)
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, "project_not_found", body["error"])

	status, body = reportingSend(t, scope, "admin", http.MethodPut, "/reports/budgets", `{"projectId":"`+projectID+`","budget":"-1"}`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_budget", body["error"])

	status, _ = reportingSend(t, scope, "localization_manager", http.MethodPut, "/reports/budgets", `{}`)
	require.Equal(t, http.StatusForbidden, status)
}

func TestReportingExpensesAgainstPostgres(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	projectID := mustReportingProject(t, scope, "rp_expense", nil)
	otherProject := mustReportingProject(t, scope, "rp_other", nil)
	jobID := mustReportingJob(t, scope, "job_expense", &projectID)
	otherJob := mustReportingJob(t, scope, "job_other", &otherProject)
	expense := func(extra string) string {
		return `{"projectId":"` + projectID + `","step":"review","amountUsd":"12.5","note":"  Courier  ","operationKey":"` + uuid.NewString() + `"` + extra + `}`
	}

	status, body := reportingSend(t, scope, "admin", http.MethodPost, "/reports/expenses", expense(`,"jobId":"`+jobID+`"`))
	require.Equal(t, http.StatusCreated, status)
	row := body["expense"].(map[string]any)
	require.Equal(t, "expense", row["kind"])
	require.Equal(t, "manual", row["basis"])
	require.Equal(t, "12.50000000", row["amountUsd"])
	require.Equal(t, "Courier", row["note"])
	require.Equal(t, jobID, row["jobId"])

	key := uuid.NewString()
	repeated := `{"projectId":"` + projectID + `","step":"review","amountUsd":"1","note":"x","operationKey":"` + key + `"}`
	status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/expenses", repeated)
	require.Equal(t, http.StatusCreated, status)
	require.Nil(t, body["expense"].(map[string]any)["jobId"])
	status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/expenses", repeated)
	require.Equal(t, http.StatusCreated, status)
	require.Contains(t, body, "expense")
	require.Nil(t, body["expense"])

	status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/expenses", expense(`,"jobId":"`+otherJob+`"`))
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, "job_not_found", body["error"])

	status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/expenses", expense(`,"jobId":""`))
	require.Equal(t, http.StatusInternalServerError, status, "an empty jobId fails the foreign key, as in Hono")
	require.Equal(t, "internal_error", body["error"])

	status, body = reportingSend(t, scope, "admin", http.MethodPost, "/reports/expenses", expense(`,"jobId":null`))
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_expense", body["error"])
}
