package main

import (
	"context"
	"encoding/json"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const testBillingResourceUsagePath = "/v1/orgs/acme/billing/resource-usage"

func billingTestAPI(t *testing.T, role string) (*billingAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	return &billingAPI{pool: scope.Pool, membership: scope.Membership(role)}, scope
}

func billingRequest(api *billingAPI, workosUserID, method, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: workosUserID}})
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func decodeResourceUsage(t *testing.T, rec *httptest.ResponseRecorder) workspaceResourceUsage {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body workspaceResourceUsageResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.ResourceUsage
}

func mustBillingExec(t *testing.T, scope *testenv.Scope, sql string, args ...any) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

func mustPendingSeat(t *testing.T, scope *testenv.Scope) {
	t.Helper()
	userID := uuid.NewString()
	mustBillingExec(t, scope, `insert into users (id, workos_user_id, email) values ($1, $2, $3)`,
		userID, "invited_user_"+uuid.NewString(), uuid.NewString()+"@example.com")
	mustBillingExec(t, scope, `insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, null, 'member')`, scope.OrganizationID, userID)
	t.Cleanup(func() {
		_, _ = scope.Pool.Exec(context.Background(), `delete from organization_memberships where user_id=$1`, userID)
		_, _ = scope.Pool.Exec(context.Background(), `delete from users where id=$1`, userID)
	})
}

func mustAutomation(t *testing.T, scope *testenv.Scope, status string) {
	t.Helper()
	mustBillingExec(t, scope, `insert into workspace_automations (organization_id, status, name, instructions)
        values ($1, $2::workspace_automation_status, 'Automation', 'Do work')`, scope.OrganizationID, status)
}

func mustTMSCredential(t *testing.T, scope *testenv.Scope) {
	t.Helper()
	mustBillingExec(t, scope, `insert into organization_external_tms_provider_credentials (
            organization_id, provider_kind, display_name, encryption_algorithm, ciphertext, iv, auth_tag, masked_secret_suffix
        ) values ($1, 'crowdin', 'Crowdin', 'aes-256-gcm', 'c', 'i', 't', '1234')`, scope.OrganizationID)
}

func mustGithubInstallation(t *testing.T, scope *testenv.Scope) {
	t.Helper()
	mustBillingExec(t, scope, `insert into github_installations (organization_id, github_installation_id, github_app_id)
        values ($1, $2, 1)`, scope.OrganizationID, rand.Int64N(1<<52)+1)
}

func mustContentfulConnection(t *testing.T, scope *testenv.Scope, enabled bool) {
	t.Helper()
	mustBillingExec(t, scope, `insert into contentful_connections (
            organization_id, display_name, space_id, enabled, encryption_algorithm, ciphertext, iv, auth_tag, masked_token_suffix
        ) values ($1, 'Contentful', $2, $3, 'aes-256-gcm', 'c', 'i', 't', '1234')`, scope.OrganizationID, uuid.NewString(), enabled)
}

func mustConnector(t *testing.T, scope *testenv.Scope, kind string, enabled bool) {
	t.Helper()
	mustBillingExec(t, scope, `insert into connectors (organization_id, kind, enabled) values ($1, $2, $3)`,
		scope.OrganizationID, kind, enabled)
}

func seedCountedResources(t *testing.T, scope *testenv.Scope) {
	t.Helper()
	mustPendingSeat(t, scope)
	scope.MustProject(t, "project_active_"+uuid.NewString()[:8], "Active")
	inactive := scope.MustProject(t, "project_inactive_"+uuid.NewString()[:8], "Inactive")
	mustBillingExec(t, scope, `update projects set is_active=false where id=$1`, inactive)
	mustAutomation(t, scope, "active")
	mustAutomation(t, scope, "paused")
	mustAutomation(t, scope, "archived")
	mustTMSCredential(t, scope)
	mustGithubInstallation(t, scope)
	mustContentfulConnection(t, scope, true)
	mustContentfulConnection(t, scope, false)
	mustConnector(t, scope, "slack", true)
	mustConnector(t, scope, "jira", false)
}

func TestBillingResourceUsageRequiresDatabase(t *testing.T) {
	rec := billingRequest(&billingAPI{}, "user_live", http.MethodGet, testBillingResourceUsagePath)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), `"billing_unavailable"`)
}

func TestBillingResourceUsageRequiresSession(t *testing.T) {
	mux := http.NewServeMux()
	(&billingAPI{}).register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, testBillingResourceUsagePath, nil))
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestBillingResourceUsageEmptyOrganization(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	rec := billingRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/resource-usage"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"resourceUsage":{"seats":1,"projects":0,"automations":0,"integrations":0}}`, rec.Body.String())
}

func TestBillingResourceUsageAllowedRoles(t *testing.T) {
	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role, func(t *testing.T) {
			api, scope := billingTestAPI(t, role)
			rec := billingRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/resource-usage"))
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		})
	}
}

func TestBillingResourceUsageForbiddenRoles(t *testing.T) {
	for _, role := range []string{"developer", "reviewer", "translator", "member"} {
		t.Run(role, func(t *testing.T) {
			api, scope := billingTestAPI(t, role)
			rec := billingRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/resource-usage"))
			require.Equal(t, http.StatusForbidden, rec.Code)
			require.JSONEq(t, `{"error":"billing_read_forbidden","message":"Billing settings require workspace admin access"}`, rec.Body.String())
		})
	}
}

func TestBillingResourceUsageCountsAndFilters(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	seedCountedResources(t, scope)
	usage := decodeResourceUsage(t, billingRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/resource-usage")))
	require.Equal(t, workspaceResourceUsage{Seats: 2, Projects: 1, Automations: 2, Integrations: 4}, usage)
}

func TestBillingResourceUsageOrganizationIsolation(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	seedCountedResources(t, other)

	usage := decodeResourceUsage(t, billingRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/resource-usage")))
	require.Equal(t, workspaceResourceUsage{Seats: 1}, usage)

	rec := billingRequest(api, scope.WorkOSUserID, http.MethodGet, other.OrgPath("/billing/resource-usage"))
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), `"organization_access_denied"`)
}

func TestBillingResourceUsageRoutes(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	path := scope.OrgPath("/billing/resource-usage")
	require.Equal(t, http.StatusMethodNotAllowed, billingRequest(api, scope.WorkOSUserID, http.MethodPost, path).Code)
	require.Equal(t, http.StatusMethodNotAllowed, billingRequest(api, scope.WorkOSUserID, http.MethodGet, path+"/sync").Code)
	require.Equal(t, http.StatusNotFound, billingRequest(api, scope.WorkOSUserID, http.MethodGet, "/api/go-svc"+path).Code)
	require.Equal(t, http.StatusNotFound, billingRequest(api, scope.WorkOSUserID, http.MethodPost, "/api/go-svc"+path+"/sync").Code)
}
