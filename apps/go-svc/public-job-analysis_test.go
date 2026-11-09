package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPublicJobAnalysis(t *testing.T) {
	t.Run("returns every band for each language and step", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{status: "running", jobType: "file"})
		mustReportingSummary(t, f.scope, []reportingSummaryRow{
			{jobID: id, targetLocale: "fr-FR", bucket: "100", day: "2026-06-01", arrived: 12},
			{jobID: id, targetLocale: "fr-FR", bucket: "85-94", day: "2026-06-01", arrived: 8},
			{jobID: id, targetLocale: "fr-FR", bucket: "new", day: "2026-06-02", arrived: 30, arrivedStrings: 3},
			{jobID: id, targetLocale: "de-DE", bucket: "repetition", day: "2026-06-01", arrived: 5},
			{jobID: id, targetLocale: "fr-FR", step: "review", bucket: "new", day: "2026-06-03", arrived: 50},
		})
		updatedAt := time.Now().UTC().Truncate(time.Millisecond)
		_, err := f.scope.Pool.Exec(t.Context(), `insert into reporting_task_analyses (organization_id, job_id, step, status, incomplete, error, updated_at)
            values ($1, $2, 'translation', 'done', true, 'memory down', $3)`, f.scope.OrganizationID, id, updatedAt)
		require.NoError(t, err)

		rec := f.get(t, "/v1/jobs/"+id+"/analysis")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		zero := `"repetition":0,"100":0,"95-99":0,"85-94":0,"75-84":0,"50-74":0,"new":0,"unavailable":0`
		require.JSONEq(t, `{"analysis":{
            "jobId":"`+id+`","unit":"words",
            "bands":["repetition","100","95-99","85-94","75-84","50-74","new","unavailable"],
            "steps":[{"step":"translation","status":"done","incomplete":true,"updatedAt":"`+formatPublicJobTime(updatedAt)+`"}],
            "locales":[
                {"targetLocale":"de-DE","step":"translation","total":5,"bands":{`+zero+`,"repetition":5}},
                {"targetLocale":"fr-FR","step":"translation","total":50,"bands":{`+zero+`,"100":12,"85-94":8,"new":30}},
                {"targetLocale":"fr-FR","step":"review","total":50,"bands":{`+zero+`,"new":50}}
            ]}}`, rec.Body.String())

		strings := f.get(t, "/v1/jobs/"+id+"/analysis?unit=strings")
		require.Equal(t, http.StatusOK, strings.Code, strings.Body.String())
		require.Contains(t, strings.Body.String(), `"unit":"strings"`)
		require.Contains(t, strings.Body.String(), `"new":3`)
	})

	t.Run("returns empty lists for a job never analysed", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{status: "queued", jobType: "string"})
		rec := f.get(t, "/v1/jobs/"+id+"/analysis")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"steps":[]`)
		require.Contains(t, rec.Body.String(), `"locales":[]`)
	})

	t.Run("reads a pending analysis that has gone quiet as failed", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{status: "running", jobType: "file"})
		_, err := f.scope.Pool.Exec(t.Context(), `insert into reporting_task_analyses (organization_id, job_id, step, status, updated_at)
            values ($1, $2, 'translation', 'pending', now() - interval '61 minutes'), ($1, $2, 'review', 'pending', now())`,
			f.scope.OrganizationID, id)
		require.NoError(t, err)
		rec := f.get(t, "/v1/jobs/"+id+"/analysis")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decodePublicJobAnalysis(t, rec)
		steps := body["steps"].([]any)
		require.Len(t, steps, 2)
		require.Equal(t, "translation", steps[0].(map[string]any)["step"])
		require.Equal(t, "failed", steps[0].(map[string]any)["status"])
		require.Equal(t, "pending", steps[1].(map[string]any)["status"])
	})

	t.Run("rejects an unknown or repeated unit", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{jobType: "file"})
		for _, query := range []string{"?unit=pages", "?unit=", "?unit=words&unit=strings"} {
			rec := f.get(t, "/v1/jobs/"+id+"/analysis"+query)
			require.Equal(t, http.StatusBadRequest, rec.Code, query)
			require.Contains(t, rec.Body.String(), `"invalid_analysis_query"`, query)
		}
	})

	t.Run("hides jobs outside the key's workspace", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		other := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, other.scope, publicJobSeed{jobType: "file"})
		rec := f.get(t, "/v1/jobs/"+id+"/analysis")
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"job_not_found"`)
	})

	t.Run("needs jobs:read", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", []string{"files:read"})
		id := mustPublicJob(t, f.scope, publicJobSeed{jobType: "file"})
		rec := f.get(t, "/v1/jobs/"+id+"/analysis")
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	})
}

func decodePublicJobAnalysis(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body struct {
		Analysis map[string]any `json:"analysis"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.Analysis
}
