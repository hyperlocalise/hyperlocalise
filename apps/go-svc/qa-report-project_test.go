package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestProjectQaReportRejectsProviderProject(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source='external_tms' where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	rec := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/projects/"+scope.ProjectID+"/qa-reports"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "qa_scan_not_supported")
}

func TestWorkspaceQaReportExposesSafeFailureAndLastSuccess(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	succeededID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 1, 0)
	failedID := mustQaRun(t, scope, scope.ProjectID, "failed", 0, 0, 0)
	_, err := scope.Pool.Exec(t.Context(), `
        update translation_qa_runs
        set error_code='qa_scan_processing_failed', error_message='private source text', created_at=now() + interval '1 second'
        where id=$1`, failedID)
	require.NoError(t, err)

	rec := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/qa-reports"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	var response struct {
		Reports []struct {
			ProjectID        string  `json:"projectId"`
			LastSuccessfulAt *string `json:"lastSuccessfulAt"`
			Report           struct {
				ID           string  `json:"id"`
				ErrorCode    *string `json:"errorCode"`
				ErrorMessage *string `json:"errorMessage"`
			} `json:"report"`
		} `json:"reports"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Len(t, response.Reports, 1)
	require.Equal(t, scope.ProjectID, response.Reports[0].ProjectID)
	require.Equal(t, failedID, response.Reports[0].Report.ID)
	require.Equal(t, "qa_scan_processing_failed", *response.Reports[0].Report.ErrorCode)
	require.Nil(t, response.Reports[0].Report.ErrorMessage)
	require.NotNil(t, response.Reports[0].LastSuccessfulAt)
	require.NotEmpty(t, *response.Reports[0].LastSuccessfulAt)
	require.NotEqual(t, succeededID, failedID)
	require.NotContains(t, rec.Body.String(), "private source text")
	projectRec := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/projects/"+scope.ProjectID+"/qa-reports"), "")
	require.Equal(t, http.StatusOK, projectRec.Code)
	require.Contains(t, projectRec.Body.String(), "qa_scan_processing_failed")
	require.NotContains(t, projectRec.Body.String(), "private source text")
}
