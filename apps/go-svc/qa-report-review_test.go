package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestQaFindingStatus(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name, raw, want string
		ok              bool
	}{
		{name: "empty defaults", raw: "", want: "", ok: true},
		{name: "all", raw: "all", want: "all", ok: true},
		{name: "open", raw: "open", want: "open", ok: true},
		{name: "ignored", raw: "ignored", want: "ignored", ok: true},
		{name: "resolved", raw: "resolved", want: "resolved", ok: true},
		{name: "trims", raw: "  open  ", want: "open", ok: true},
		{name: "rejects unknown", raw: "closed", ok: false},
		{name: "rejects resolved typo", raw: "resolve", ok: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptestWithStatusQuery(tc.raw)
			got, err := qaFindingStatus(req)
			if !tc.ok {
				require.Error(t, err)
				var failure *qaReportError
				require.ErrorAs(t, err, &failure)
				require.Equal(t, 400, failure.status)
				require.Equal(t, "invalid_qa_report_query", failure.code)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func httptestWithStatusQuery(status string) *http.Request {
	values := url.Values{}
	if status != "" {
		values.Set("status", status)
	}
	req, err := http.NewRequest(http.MethodGet, "/v1/orgs/acme/qa-reports/findings?"+values.Encode(), nil)
	if err != nil {
		panic(err)
	}
	return req
}

func TestQaReportFindingsRejectInvalidStatus(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	rec := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/qa-reports/findings?status=closed"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_qa_report_query")
}

func TestQaReportReviewForbiddenForMember(t *testing.T) {
	api, scope := qaReportTestAPI(t, "member")
	rec := qaReportRequest(api, scope, http.MethodPatch,
		scope.OrgPath("/qa-reports/findings/"+uuid.NewString()),
		`{"status":"ignored","reason":"false positive"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestQaReportReviewValidation(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 1, 0)
	findingID := mustQaFinding(t, scope, runID, scope.ProjectID, "review-validation")

	for _, tc := range []struct {
		name, body string
	}{
		{name: "unknown status", body: `{"status":"resolved","reason":"done"}`},
		{name: "ignored without reason", body: `{"status":"ignored","reason":""}`},
		{name: "ignored whitespace reason", body: `{"status":"ignored","reason":"   "}`},
		{name: "ignored reason too long", body: `{"status":"ignored","reason":"` + strings.Repeat("x", 1001) + `"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := qaReportRequest(api, scope, http.MethodPatch,
				scope.OrgPath("/qa-reports/findings/"+findingID), tc.body)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "invalid_qa_review")
		})
	}
}

func TestQaReportReviewIgnoreAndReopenMatchingFindings(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	ctx := t.Context()

	olderRun := uuid.NewString()
	latestRun := uuid.NewString()
	_, err := scope.Pool.Exec(ctx, `
        insert into translation_qa_runs(id, organization_id, project_id, trigger, status, summary, completed_at, created_at)
        values
            ($1,$2,$3,'manual','succeeded','{}'::jsonb,now() - interval '2 hours',now() - interval '2 hours'),
            ($4,$2,$3,'manual','succeeded','{}'::jsonb,now(),now())`,
		olderRun, scope.OrganizationID, scope.ProjectID, latestRun)
	require.NoError(t, err)

	latestID := mustQaFinding(t, scope, latestRun, scope.ProjectID, "same-key")
	olderID := mustQaFinding(t, scope, olderRun, scope.ProjectID, "same-key")
	otherID := uuid.NewString()
	_, err = scope.Pool.Exec(ctx, `
        insert into translation_qa_findings (
            id, run_id, organization_id, project_id, key, target_locale, check_type, severity, category, message, source_text, target_text
        ) values ($1, $2, $3, $4, 'other-key', 'de-DE', 'same_as_source', 'warning', 'qa', 'Target matches source', 'Hello', 'Hello')`,
		otherID, latestRun, scope.OrganizationID, scope.ProjectID)
	require.NoError(t, err)

	ignore := qaReportRequest(api, scope, http.MethodPatch,
		scope.OrgPath("/qa-reports/findings/"+latestID),
		`{"status":"ignored","reason":"Accepted brand exception"}`)
	require.Equal(t, http.StatusOK, ignore.Code, ignore.Body.String())

	var ignoreBody struct {
		Finding struct {
			ID           string `json:"id"`
			Status       string `json:"status"`
			IgnoreReason string `json:"ignoreReason"`
		} `json:"finding"`
	}
	require.NoError(t, json.Unmarshal(ignore.Body.Bytes(), &ignoreBody))
	require.Equal(t, latestID, ignoreBody.Finding.ID)
	require.Equal(t, "ignored", ignoreBody.Finding.Status)
	require.Equal(t, "Accepted brand exception", ignoreBody.Finding.IgnoreReason)

	var latestStatus, olderStatus, otherStatus string
	var latestReason, olderReason *string
	require.NoError(t, scope.Pool.QueryRow(ctx,
		`select status, ignore_reason from translation_qa_findings where id=$1`, latestID,
	).Scan(&latestStatus, &latestReason))
	require.NoError(t, scope.Pool.QueryRow(ctx,
		`select status, ignore_reason from translation_qa_findings where id=$1`, olderID,
	).Scan(&olderStatus, &olderReason))
	require.NoError(t, scope.Pool.QueryRow(ctx,
		`select status from translation_qa_findings where id=$1`, otherID,
	).Scan(&otherStatus))

	require.Equal(t, "ignored", latestStatus)
	require.Equal(t, "ignored", olderStatus)
	require.NotNil(t, latestReason)
	require.Equal(t, "Accepted brand exception", *latestReason)
	require.NotNil(t, olderReason)
	require.Equal(t, "Accepted brand exception", *olderReason)
	require.Equal(t, "open", otherStatus)

	reopen := qaReportRequest(api, scope, http.MethodPatch,
		scope.OrgPath("/qa-reports/findings/"+latestID),
		`{"status":"open","reason":"should be cleared"}`)
	require.Equal(t, http.StatusOK, reopen.Code, reopen.Body.String())

	var reopenBody struct {
		Finding struct {
			Status       string `json:"status"`
			IgnoreReason string `json:"ignoreReason"`
		} `json:"finding"`
	}
	require.NoError(t, json.Unmarshal(reopen.Body.Bytes(), &reopenBody))
	require.Equal(t, "open", reopenBody.Finding.Status)
	require.Equal(t, "", reopenBody.Finding.IgnoreReason)

	require.NoError(t, scope.Pool.QueryRow(ctx,
		`select status, ignore_reason from translation_qa_findings where id=$1`, latestID,
	).Scan(&latestStatus, &latestReason))
	require.NoError(t, scope.Pool.QueryRow(ctx,
		`select status, ignore_reason from translation_qa_findings where id=$1`, olderID,
	).Scan(&olderStatus, &olderReason))
	require.Equal(t, "open", latestStatus)
	require.Equal(t, "open", olderStatus)
	require.Nil(t, latestReason)
	require.Nil(t, olderReason)
}

func TestQaReportReviewRejectsStaleFinding(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	staleRun := uuid.NewString()
	latestRun := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into translation_qa_runs(id, organization_id, project_id, trigger, status, summary, completed_at, created_at)
        values
            ($1,$2,$3,'manual','succeeded','{}'::jsonb,now() - interval '2 hours',now() - interval '2 hours'),
            ($4,$2,$3,'manual','succeeded','{}'::jsonb,now(),now())`,
		staleRun, scope.OrganizationID, scope.ProjectID, latestRun)
	require.NoError(t, err)
	_ = mustQaFinding(t, scope, latestRun, scope.ProjectID, "latest")
	staleID := mustQaFinding(t, scope, staleRun, scope.ProjectID, "stale-only")

	rec := qaReportRequest(api, scope, http.MethodPatch,
		scope.OrgPath("/qa-reports/findings/"+staleID),
		`{"status":"ignored","reason":"too old"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "qa_finding_stale")
}
