package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestCalculateAllocationRangesMatchesBuckets(t *testing.T) {
	full := calculateAllocationRanges(10000, []int{10000})
	require.Equal(t, &[2]int{0, 9999}, full[0])

	split := calculateAllocationRanges(10000, []int{5000, 5000})
	require.Equal(t, &[2]int{0, 4999}, split[0])
	require.Equal(t, &[2]int{5000, 9999}, split[1])

	half := calculateAllocationRanges(5000, []int{10000})
	require.Equal(t, &[2]int{0, 4999}, half[0])

	skipped := calculateAllocationRanges(10000, []int{10000, 0})
	require.Equal(t, &[2]int{0, 9999}, skipped[0])
	require.Nil(t, skipped[1])
}

func TestMatchSearchConsoleSitePrefersDomainProperty(t *testing.T) {
	sites := []gsc.Site{
		{SiteURL: "https://www.example.com/", PermissionLevel: "siteOwner"},
		{SiteURL: "sc-domain:example.com", PermissionLevel: "siteFullUser"},
		{SiteURL: "sc-domain:example.com", PermissionLevel: gsc.PermissionSiteUnverifiedUser},
	}
	site, ok := matchSearchConsoleSite(sites, "Example.com")
	require.True(t, ok)
	require.Equal(t, "sc-domain:example.com", site.SiteURL)

	covered, ok := matchSearchConsoleSite([]gsc.Site{{SiteURL: "sc-domain:example.com", PermissionLevel: "siteOwner"}}, "blog.example.com")
	require.True(t, ok)
	require.Equal(t, "sc-domain:example.com", covered.SiteURL)

	_, ok = matchSearchConsoleSite([]gsc.Site{{SiteURL: "sc-domain:example.com", PermissionLevel: gsc.PermissionSiteUnverifiedUser}}, "example.com")
	require.False(t, ok)
}

func TestSearchConsolePipesErrorsBecomeSnapshots(t *testing.T) {
	disconnected, ok := gscSnapshotForPipesError("last_28_days", workspaceFailure(404, "gsc_not_connected", "missing"))
	require.True(t, ok)
	require.Equal(t, "disconnected", disconnected["status"])
	require.Nil(t, disconnected["connection"])

	reauth, ok := gscSnapshotForPipesError("last_7_days", workspaceFailure(401, "gsc_pipes_needs_reauthorization", "reconnect"))
	require.True(t, ok)
	require.Equal(t, "needs_reauthorization", reauth["status"])
	require.Equal(t, "last_7_days", reauth["dateRange"])

	_, ok = gscSnapshotForPipesError("last_28_days", workspaceFailure(500, "internal_error", "nope"))
	require.False(t, ok)
}

func TestWorkspaceFeatureFlagFailsClosed(t *testing.T) {
	db := newDictionaryTestDB(t, dictionaryAuthStep(), dictionaryRowStep("workos_organization_id", "org_live"))
	h := newHandler()
	h.workspace = &workspaceAPI{
		pool: db,
		membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{ID: id, UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: "admin"}}, nil
		},
	}
	rec := workspaceRequest(t, h, http.MethodGet, "/v1/orgs/acme/hyperlab/flags", "")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestHyperlabWriteRequiresExperimentsCapability(t *testing.T) {
	db := newDictionaryTestDB(t, dictionaryAuthStep(), dictionaryRowStep("workos_organization_id", "org_live"))
	h := workspaceHandler(db, "member", stubWorkspaceFlags{enabled: true})
	rec := workspaceRequest(t, h, http.MethodPost, "/v1/orgs/acme/hyperlab/flags", `{"key":"checkout"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "Missing experiments:write")
}

func TestHyperlabRejectsInvalidFlagKey(t *testing.T) {
	db := newDictionaryTestDB(t, dictionaryAuthStep(), dictionaryRowStep("workos_organization_id", "org_live"))
	h := workspaceHandler(db, "admin", stubWorkspaceFlags{enabled: true})
	rec := workspaceRequest(t, h, http.MethodPost, "/v1/orgs/acme/hyperlab/flags", `{"key":"Not A Key"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_flag_payload")
}

type stubWorkspaceFlags struct{ enabled bool }

func (s stubWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	return s.enabled, nil
}

func workspaceHandler(db *dictionaryTestDB, role string, flags workspaceFlagChecker) *handler {
	h := newHandler()
	h.workspace = &workspaceAPI{
		pool:  db,
		flags: flags,
		membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{ID: id, UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: role}}, nil
		},
	}
	return h
}

func workspaceRequest(t *testing.T, h *handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	registerRoutes(mux, h, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://127.0.0.1")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}
