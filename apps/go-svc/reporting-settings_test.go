package main

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type erroringWorkspaceFlags struct{}

func (erroringWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	return false, errors.New("workos unavailable")
}

var reportingRoutes = []struct{ method, path string }{
	{http.MethodGet, "/reports/settings"},
	{http.MethodGet, "/reports/activity"},
}

func TestReportingFeatureFlagFailsClosedOnEveryRoute(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	for name, flags := range map[string]workspaceFlagChecker{
		"disabled": stubWorkspaceFlags{enabled: false},
		"errored":  erroringWorkspaceFlags{},
		"missing":  nil,
	} {
		api := reportingTestAPI(scope, "admin", flags)
		for _, route := range reportingRoutes {
			rec := reportingRequest(t, api, scope.WorkOSUserID, route.method, scope.OrgPath(route.path), "")
			require.Equal(t, http.StatusForbidden, rec.Code, name, route)
			require.JSONEq(t, `{"error":"feature_unavailable","message":"Reports is not enabled for this workspace"}`, rec.Body.String(), name, route)
		}
	}
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: true})
	for _, route := range reportingRoutes {
		rec := reportingRequest(t, api, scope.WorkOSUserID, route.method, other.OrgPath(route.path), "")
		require.Equal(t, http.StatusForbidden, rec.Code, route)
		require.Contains(t, rec.Body.String(), "organization_access_denied", route)
	}
}

func TestReportingSettingsForAFreshWorkspace(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	status, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports/settings", "")
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, map[string]any{
		"projects":      []any{},
		"startedAt":     nil,
		"startedDay":    nil,
		"today":         "2026-06-15",
		"canLogTime":    true,
		"summary":       map[string]any{"pendingDays": float64(0), "oldestMarkedAt": nil},
		"rateCardNames": []any{},
		"financial":     true,
		"canManage":     true,
	}, body["settings"])
}

func TestReportingSettingsFollowTheViewersRole(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	for _, role := range []string{"admin", "localization_manager", "developer", "reviewer", "translator", "member"} {
		billingRead := role == "admin" || role == "localization_manager"
		status, body := reportingSend(t, scope, role, http.MethodGet, "/reports/settings", "")
		require.Equal(t, http.StatusOK, status, role)
		settings := body["settings"].(map[string]any)
		require.Equal(t, billingRead, settings["financial"], role)
		require.Equal(t, role == "admin", settings["canManage"], role)
		require.Equal(t, role != "member", settings["canLogTime"], role)
		// The rate cards are a billing detail: other roles get the empty list, never the names.
		require.Equal(t, []any{}, settings["rateCardNames"], role)
	}
}

func TestReportingSettingsListProjectsTheViewerCanOpenAndTheWorkspacesDates(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "translator"})
	scope.MustTeam(t, "default", "Default", "member")
	secret := scope.MustTeam(t, "secret", "Secret", "")
	docs := mustReportingProject(t, scope, "rp_docs", nil)
	mustReportingProject(t, scope, "rp_secret", &secret)
	ctx := t.Context()
	_, err := scope.Pool.Exec(ctx, `update projects set source_locale = 'en-US', target_locales = '["fr-FR", "de-DE"]' where id = $1`, docs)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `insert into reporting_workspaces (organization_id, started_at) values ($1, '2026-03-01T08:30:00Z')`, scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
        insert into reporting_summary_queue (organization_id, project_id, day, marked_at)
        values ($1, $2, '2026-06-14', '2026-06-15T09:30:00Z'), ($1, $2, '2026-06-13', '2026-06-15T08:00:00Z')`, scope.OrganizationID, docs)
	require.NoError(t, err)

	_, body := reportingSend(t, scope, "translator", http.MethodGet, "/reports/settings", "")
	settings := body["settings"].(map[string]any)
	require.Equal(t, []any{map[string]any{
		"id": docs, "name": docs, "sourceLocale": "en-US", "targetLocales": []any{"fr-FR", "de-DE"},
	}}, settings["projects"], "the secret team's project is not offered")
	require.Equal(t, "2026-03-01T08:30:00.000Z", settings["startedAt"])
	require.Equal(t, "2026-03-01", settings["startedDay"])
	require.Equal(t, float64(2), settings["summary"].(map[string]any)["pendingDays"])
	require.NotEmpty(t, settings["summary"].(map[string]any)["oldestMarkedAt"])

	// An admin sees every project, in the same shape.
	_, body = reportingSend(t, scope, "admin", http.MethodGet, "/reports/settings", "")
	require.Len(t, body["settings"].(map[string]any)["projects"], 2)
}

func TestReportingSettingsNameEveryLiveRateCard(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	ctx := t.Context()
	_, err := scope.Pool.Exec(ctx, `
        insert into reporting_rate_cards (organization_id, name, default_basis)
        values ($1, 'Standard', 'word'), ($1, 'alpha', 'hour')`, scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
        insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, created_at, retired) values
          ($1, 'Standard', 'en', 'fr', 'translation', 'word', 0.12, '2026-03-05', false),
          ($1, 'Legacy', 'en', 'fr', 'translation', 'word', 0.10, '2026-03-01', false),
          ($1, 'Retired', 'en', 'fr', 'translation', 'word', 0.20, '2026-03-01', false),
          ($1, 'Retired', 'en', 'fr', 'translation', 'word', 0.20, '2026-03-06', true)`, scope.OrganizationID)
	require.NoError(t, err)

	_, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports/settings", "")
	// Cards with a record of their own, cards from before cards had one, never a card whose
	// lines were all retired; ordered as the browser orders names.
	require.Equal(t, []any{"alpha", "Legacy", "Standard"}, body["settings"].(map[string]any)["rateCardNames"])
}

func TestCompareReportingNamesOrdersLikeTheBrowser(t *testing.T) {
	require.Less(t, compareReportingNames("alpha", "Beta"), 0)
	require.Less(t, compareReportingNames("a", "A"), 0)
	require.Greater(t, compareReportingNames("A", "a"), 0)
	require.Equal(t, 0, compareReportingNames("Same", "Same"))
	require.Less(t, compareReportingNames("ab", "abc"), 0)
	// Accents and punctuation as localeCompare orders them, not as bytes.
	require.Less(t, compareReportingNames("Éclair", "Zeta"), 0)
	require.Less(t, compareReportingNames("résumé", "resumes"), 0)
	require.Less(t, compareReportingNames("pt_BR", "pt-BR"), 0)
}
