package main

import (
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
