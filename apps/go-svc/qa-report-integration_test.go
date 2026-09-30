package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const testQaReportBase = "/v1/orgs/acme/qa-reports"

func qaReportTestAPI(t *testing.T, role string) (*qaReportAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	return &qaReportAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
	}, scope
}

func qaReportRequest(api *qaReportAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func qaReportRequestForTest(api *qaReportAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustQaRun(t *testing.T, scope *testenv.Scope, projectID, status string, findingCount, errorCount, warningCount int) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into translation_qa_runs (
            id, organization_id, project_id, trigger, status, finding_count, error_count, warning_count, summary, completed_at
        ) values ($1, $2, $3, 'manual', $4, $5, $6, $7, '{"byCheckType":{"not_localized":1},"bySeverity":{"error":1},"byLocale":{"de-DE":1}}'::jsonb, now())`,
		id, scope.OrganizationID, projectID, status, findingCount, errorCount, warningCount)
	require.NoError(t, err)
	return id
}

func mustQaFinding(t *testing.T, scope *testenv.Scope, runID, projectID, key string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into translation_qa_findings (
            id, run_id, organization_id, project_id, key, target_locale, check_type, severity, category, message, source_text, target_text
        ) values ($1, $2, $3, $4, $5, 'de-DE', 'not_localized', 'error', 'missing', 'Target is empty', 'Hello', '')`,
		id, runID, scope.OrganizationID, projectID, key)
	require.NoError(t, err)
	return id
}

func TestQaReportUnavailableWithoutPool(t *testing.T) {
	rec := qaReportRequestForTest(&qaReportAPI{}, http.MethodGet, testQaReportBase, "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "qa_report_unavailable")
}

func TestQaReportPostgresWorkspaceLifecycle(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	ctx := t.Context()
	providerID := "projqa_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	_, err := scope.Pool.Exec(ctx, `
        insert into projects (id, organization_id, created_by_user_id, name, identifier, source)
        values ($1, $2, $3, 'Provider QA', 'PRVQA', 'external_tms')`,
		providerID, scope.OrganizationID, scope.UserID)
	require.NoError(t, err)

	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 1, 0)
	findingID := mustQaFinding(t, scope, runID, scope.ProjectID, "promote-me")

	list := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/qa-reports"), "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	var listBody struct {
		Reports []struct {
			ProjectID string `json:"projectId"`
			Report    *struct {
				Status       string `json:"status"`
				FindingCount int    `json:"findingCount"`
			} `json:"report"`
		} `json:"reports"`
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listBody))
	require.Len(t, listBody.Reports, 1)
	require.Equal(t, scope.ProjectID, listBody.Reports[0].ProjectID)
	require.Equal(t, "succeeded", listBody.Reports[0].Report.Status)
	require.Equal(t, 1, listBody.Reports[0].Report.FindingCount)

	findings := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/qa-reports/findings?projectId="+scope.ProjectID), "")
	require.Equal(t, http.StatusOK, findings.Code)
	var findingsBody struct {
		Findings []struct {
			ID          string `json:"id"`
			ProjectName string `json:"projectName"`
			EditorHref  string `json:"editorHref"`
		} `json:"findings"`
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(findings.Body.Bytes(), &findingsBody))
	require.Equal(t, 1, findingsBody.Total)
	require.Equal(t, findingID, findingsBody.Findings[0].ID)
	require.Equal(t, "Project", findingsBody.Findings[0].ProjectName)
	require.Contains(t, findingsBody.Findings[0].EditorHref, scope.ProjectID)

	promote := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/promote"),
		`{"findingIds":["`+findingID+`"]}`)
	require.Equal(t, http.StatusOK, promote.Code, promote.Body.String())
	var promoteBody struct {
		Results []struct {
			Created    bool   `json:"created"`
			Identifier string `json:"identifier"`
		} `json:"results"`
	}
	require.NoError(t, json.Unmarshal(promote.Body.Bytes(), &promoteBody))
	require.Len(t, promoteBody.Results, 1)
	require.True(t, promoteBody.Results[0].Created)
	firstIdentifier := promoteBody.Results[0].Identifier

	promoteAgain := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/promote"),
		`{"findingIds":["`+findingID+`"]}`)
	require.Equal(t, http.StatusOK, promoteAgain.Code)
	require.NoError(t, json.Unmarshal(promoteAgain.Body.Bytes(), &promoteBody))
	require.False(t, promoteBody.Results[0].Created)
	require.Equal(t, firstIdentifier, promoteBody.Results[0].Identifier)

	var issueCount int
	require.NoError(t, api.pool.QueryRow(ctx, `select count(*) from issue_sheet_issues where project_id=$1`, scope.ProjectID).Scan(&issueCount))
	require.Equal(t, 1, issueCount)
}

func TestQaReportPostgresStaleFindingPromote(t *testing.T) {
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
	findingID := mustQaFinding(t, scope, staleRun, scope.ProjectID, "stale")

	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/promote"),
		`{"findingIds":["`+findingID+`"]}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "qa_finding_stale", body["error"])
}
