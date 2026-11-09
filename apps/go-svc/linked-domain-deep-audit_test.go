package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type fakeDeepAuditStarter struct {
	mu     sync.Mutex
	runIDs []string
	err    error
}

func (f *fakeDeepAuditStarter) StartDeepAudit(_ context.Context, runID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.runIDs = append(f.runIDs, runID)
	return f.err
}

func seedLinkedDomain(t *testing.T, scope *testenv.Scope, status string) string {
	t.Helper()
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	var id string
	err := scope.Pool.QueryRow(t.Context(), `insert into linked_domains(organization_id,created_by_user_id,domain_key,domain_slug,source_url,status,verification_token) values($1,$2,$3,$4,$5,$6,$7) returning id`,
		scope.OrganizationID, scope.UserID, "deep-"+suffix+".example", "deep-"+suffix, "https://deep-"+suffix+".example/", status, "token-"+suffix).Scan(&id)
	require.NoError(t, err)
	return id
}

func deepAuditPath(scope *testenv.Scope, domainID string, rest ...string) string {
	path := scope.OrgPath("/domains/linked-domains/" + domainID + "/deep-audits")
	for _, part := range rest {
		path += "/" + part
	}
	return path
}

func decodeDeepAudit(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var payload struct {
		DeepAudit map[string]any `json:"deepAudit"`
	}
	require.NoError(t, json.Unmarshal(body, &payload))
	return payload.DeepAudit
}

func TestDeepAuditStartListAndCancel(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	starter := &fakeDeepAuditStarter{}
	h.deepAudits = starter
	domainID := seedLinkedDomain(t, scope, "verified")

	start := workspaceRequest(t, h, scope, http.MethodPost, deepAuditPath(scope, domainID), "")
	require.Equal(t, http.StatusAccepted, start.Code, start.Body.String())
	run := decodeDeepAudit(t, start.Body.Bytes())
	runID, _ := run["id"].(string)
	require.NotEmpty(t, runID)
	require.Equal(t, "queued", run["status"])
	require.EqualValues(t, deepAuditPageLimit, run["pageLimit"])
	require.Equal(t, []string{runID}, starter.runIDs)

	again := workspaceRequest(t, h, scope, http.MethodPost, deepAuditPath(scope, domainID), "")
	require.Equal(t, http.StatusConflict, again.Code, again.Body.String())
	require.Contains(t, again.Body.String(), "deep_audit_in_progress")

	list := workspaceRequest(t, h, scope, http.MethodGet, deepAuditPath(scope, domainID), "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), runID)

	cancel := workspaceRequest(t, h, scope, http.MethodDelete, deepAuditPath(scope, domainID, runID), "")
	require.Equal(t, http.StatusOK, cancel.Code, cancel.Body.String())
	require.Equal(t, "cancelled", decodeDeepAudit(t, cancel.Body.Bytes())["status"])

	cancelAgain := workspaceRequest(t, h, scope, http.MethodDelete, deepAuditPath(scope, domainID, runID), "")
	require.Equal(t, http.StatusConflict, cancelAgain.Code, cancelAgain.Body.String())

	missing := workspaceRequest(t, h, scope, http.MethodGet, deepAuditPath(scope, domainID, "not-a-uuid"), "")
	require.Equal(t, http.StatusNotFound, missing.Code, missing.Body.String())
}

func TestDeepAuditStartRequiresVerifiedDomainAndMarksStartFailures(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	starter := &fakeDeepAuditStarter{err: errors.New("web down")}
	h.deepAudits = starter

	pending := seedLinkedDomain(t, scope, "pending_verification")
	rec := workspaceRequest(t, h, scope, http.MethodPost, deepAuditPath(scope, pending), "")
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "linked_domain_not_verified")
	require.Empty(t, starter.runIDs)

	verified := seedLinkedDomain(t, scope, "verified")
	rec = workspaceRequest(t, h, scope, http.MethodPost, deepAuditPath(scope, verified), "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
	require.Len(t, starter.runIDs, 1)
	var status, code string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select status,error_code from localisation_deep_audits where id=$1`, starter.runIDs[0]).Scan(&status, &code))
	require.Equal(t, "failed", status)
	require.Equal(t, "deep_audit_start_failed", code)

	// A failed start frees the in-flight slot.
	starter.err = nil
	rec = workspaceRequest(t, h, scope, http.MethodPost, deepAuditPath(scope, verified), "")
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())

	disabled := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: false})
	disabled.deepAudits = starter
	rec = workspaceRequest(t, disabled, scope, http.MethodGet, deepAuditPath(scope, verified), "")
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}

func insertDeepAuditFinding(t *testing.T, scope *testenv.Scope, runID, creditID, severity, fingerprint, diffState string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `insert into localisation_deep_audit_findings(run_id,organization_id,credit_id,dimension,severity,title,summary,url,template_key,locale,fingerprint,diff_state) values($1,$2,$3,'technical',$4,$5,'summary','https://example.com/de/a','/a','de',$6,$7)`,
		runID, scope.OrganizationID, creditID, severity, "Title "+fingerprint, fingerprint, diffState)
	require.NoError(t, err)
}

func TestDeepAuditFindingsFiltersAndFixedDiff(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	domainID := seedLinkedDomain(t, scope, "verified")

	var previousID, currentID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `insert into localisation_deep_audits(organization_id,linked_domain_id,status,completed_at) values($1,$2,'succeeded',now()) returning id`, scope.OrganizationID, domainID).Scan(&previousID))
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `insert into localisation_deep_audits(organization_id,linked_domain_id,status,score,summary,previous_run_id,completed_at) values($1,$2,'succeeded',72,'{"diff":{"new":1,"unchanged":1,"fixed":1},"findingsCount":2}',$3,now()) returning id`, scope.OrganizationID, domainID, previousID).Scan(&currentID))
	insertDeepAuditFinding(t, scope, previousID, "hreflang", "high", "kept", "new")
	insertDeepAuditFinding(t, scope, previousID, "hreflang", "medium", "gone", "new")
	insertDeepAuditFinding(t, scope, currentID, "hreflang", "high", "kept", "unchanged")
	insertDeepAuditFinding(t, scope, currentID, "html-lang", "low", "fresh", "new")

	type findingsResponse struct {
		DeepAudit     map[string]any   `json:"deepAudit"`
		Findings      []map[string]any `json:"findings"`
		FindingsTotal int              `json:"findingsTotal"`
	}
	get := func(query string) findingsResponse {
		t.Helper()
		rec := workspaceRequest(t, h, scope, http.MethodGet, deepAuditPath(scope, domainID, currentID)+query, "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var payload findingsResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
		return payload
	}

	all := get("")
	require.Equal(t, 2, all.FindingsTotal)
	require.Equal(t, "high", all.Findings[0]["severity"])
	require.EqualValues(t, 72, all.DeepAudit["score"])
	require.NotNil(t, all.DeepAudit["summary"])

	require.Equal(t, 1, get("?creditId=html-lang").FindingsTotal)
	require.Equal(t, 1, get("?diff=new").FindingsTotal)

	fixed := get("?diff=fixed")
	require.Equal(t, 1, fixed.FindingsTotal)
	require.Equal(t, "fixed", fixed.Findings[0]["diffState"])
	require.Equal(t, "Title gone", fixed.Findings[0]["title"])

	paged := get("?limit=1&offset=1")
	require.Len(t, paged.Findings, 1)
	require.Equal(t, 2, paged.FindingsTotal)

	bad := workspaceRequest(t, h, scope, http.MethodGet, deepAuditPath(scope, domainID, currentID)+"?diff=bogus", "")
	require.Equal(t, http.StatusBadRequest, bad.Code, bad.Body.String())

	list := workspaceRequest(t, h, scope, http.MethodGet, deepAuditPath(scope, domainID), "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), `"fixed":1`)

	_, err := scope.Pool.Exec(t.Context(), `insert into localisation_deep_audit_pages(run_id,organization_id,url,final_url,http_status,locale,template_key,artifact) values($1,$2,'https://example.com/de/a','https://example.com/de/a',200,'de','/a','{}')`, currentID, scope.OrganizationID)
	require.NoError(t, err)
	pages := workspaceRequest(t, h, scope, http.MethodGet, deepAuditPath(scope, domainID, currentID, "pages"), "")
	require.Equal(t, http.StatusOK, pages.Code, pages.Body.String())
	require.Contains(t, pages.Body.String(), `"templateKey":"/a"`)
}

func TestWebDeepAuditStarterSendsServiceToken(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "this-is-a-test-cookie-password-at-least-32-characters")
	var gotPath, gotToken string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get(serverCallTokenHeader)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)

	runID := uuid.NewString()
	require.NoError(t, webDeepAuditStarter{client: server.Client()}.StartDeepAudit(t.Context(), runID))
	require.Equal(t, fmt.Sprintf(deepAuditStartPathTemplate, runID), gotPath)
	require.Equal(t, serverCallToken(), gotToken)

	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer failing.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", failing.URL)
	require.Error(t, webDeepAuditStarter{client: failing.Client()}.StartDeepAudit(t.Context(), runID))
}
