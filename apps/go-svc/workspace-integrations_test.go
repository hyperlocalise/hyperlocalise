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

type workspaceIntegrationsFixture struct {
	api   *workspaceIntegrationsAPI
	scope *testenv.Scope
}

func newWorkspaceIntegrationsFixture(t *testing.T, role string) *workspaceIntegrationsFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: false})
	return &workspaceIntegrationsFixture{
		api: &workspaceIntegrationsAPI{
			pool:       scope.Pool,
			membership: scope.Membership(role),
		},
		scope: scope,
	}
}

func (f *workspaceIntegrationsFixture) request(path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func (f *workspaceIntegrationsFixture) seedGithub(t *testing.T) (installationID, repositoryID string) {
	t.Helper()
	installationID = "424242"
	repositoryID = uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `insert into github_installations (organization_id, github_installation_id, github_app_id, account_login)
        values ($1, $2, 1, 'acme-org')`, f.scope.OrganizationID, installationID)
	require.NoError(t, err)
	_, err = f.scope.Pool.Exec(t.Context(), `insert into github_installation_repositories (
            id, organization_id, github_installation_id, github_repository_id, owner, name, full_name, enabled, archived
        ) values ($1, $2, $3, 99, 'acme-org', 'wallet', 'acme-org/wallet', true, false)`,
		repositoryID, f.scope.OrganizationID, installationID)
	require.NoError(t, err)
	return installationID, repositoryID
}

func TestGithubInstallationEmpty(t *testing.T) {
	testenv.Require(t)
	f := newWorkspaceIntegrationsFixture(t, "admin")

	rec := f.request(f.scope.OrgPath("/github-installation"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"installation":null}`, strings.TrimSpace(rec.Body.String()))

	repos := f.request(f.scope.OrgPath("/github-installation/repositories"))
	require.Equal(t, http.StatusOK, repos.Code, repos.Body.String())
	require.JSONEq(t, `{"repositories":[]}`, strings.TrimSpace(repos.Body.String()))
}

func TestGithubInstallationListsRepositories(t *testing.T) {
	testenv.Require(t)
	f := newWorkspaceIntegrationsFixture(t, "developer")
	_, repositoryID := f.seedGithub(t)

	rec := f.request(f.scope.OrgPath("/github-installation"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Installation *githubInstallationRecord `json:"installation"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.NotNil(t, body.Installation)
	require.Equal(t, "424242", body.Installation.GithubInstallationID)
	require.Equal(t, "acme-org", body.Installation.AccountLogin)
	require.Equal(t, 1, body.Installation.RepositoryCount)
	require.Equal(t, 1, body.Installation.EnabledRepositoryCount)

	repos := f.request(f.scope.OrgPath("/github-installation/repositories"))
	require.Equal(t, http.StatusOK, repos.Code, repos.Body.String())
	var listed struct {
		Repositories []githubRepositoryRecord `json:"repositories"`
	}
	require.NoError(t, json.Unmarshal(repos.Body.Bytes(), &listed))
	require.Len(t, listed.Repositories, 1)
	require.Equal(t, repositoryID, listed.Repositories[0].ID)
	require.Equal(t, "acme-org/wallet", listed.Repositories[0].FullName)
	require.True(t, listed.Repositories[0].Enabled)
}

func TestWorkspaceIntegrationsForbiddenForMember(t *testing.T) {
	testenv.Require(t)
	f := newWorkspaceIntegrationsFixture(t, "member")

	rec := f.request(f.scope.OrgPath("/github-installation"))
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}

func TestWorkspaceIntegrationsIsolateOrganizations(t *testing.T) {
	testenv.Require(t)
	owner := newWorkspaceIntegrationsFixture(t, "admin")
	owner.seedGithub(t)
	_, err := owner.scope.Pool.Exec(t.Context(), `insert into connectors (organization_id, kind, enabled, config)
        values ($1, 'slack', true, '{"teamId":"T-OWNER","teamName":"Owner Corp"}')`, owner.scope.OrganizationID)
	require.NoError(t, err)

	outsider := newWorkspaceIntegrationsFixture(t, "admin")

	installation := outsider.request(outsider.scope.OrgPath("/github-installation"))
	require.Equal(t, http.StatusOK, installation.Code, installation.Body.String())
	require.JSONEq(t, `{"installation":null}`, strings.TrimSpace(installation.Body.String()))

	repos := outsider.request(outsider.scope.OrgPath("/github-installation/repositories"))
	require.Equal(t, http.StatusOK, repos.Code, repos.Body.String())
	require.JSONEq(t, `{"repositories":[]}`, strings.TrimSpace(repos.Body.String()))

	slack := outsider.request(outsider.scope.OrgPath("/agent-slack"))
	require.Equal(t, http.StatusOK, slack.Code, slack.Body.String())
	require.NotContains(t, slack.Body.String(), "T-OWNER")
	require.NotContains(t, slack.Body.String(), "Owner Corp")

	cross := outsider.request(owner.scope.OrgPath("/github-installation"))
	require.Equal(t, http.StatusForbidden, cross.Code, cross.Body.String())
	require.Contains(t, cross.Body.String(), "organization_access_denied")
	require.NotContains(t, cross.Body.String(), "acme-org")
	require.NotContains(t, cross.Body.String(), "424242")
}

func TestWorkspaceIntegrationsUnavailableWithoutPool(t *testing.T) {
	mux := http.NewServeMux()
	api := &workspaceIntegrationsAPI{}
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/github-installation", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "integrations_unavailable")
}

func TestSlackAgentFromConnector(t *testing.T) {
	testenv.Require(t)
	f := newWorkspaceIntegrationsFixture(t, "admin")

	empty := f.request(f.scope.OrgPath("/agent-slack"))
	require.Equal(t, http.StatusOK, empty.Code, empty.Body.String())
	var missing struct {
		SlackAgent slackAgentRecord `json:"slackAgent"`
	}
	require.NoError(t, json.Unmarshal(empty.Body.Bytes(), &missing))
	require.False(t, missing.SlackAgent.Enabled)
	require.Nil(t, missing.SlackAgent.TeamID)

	_, err := f.scope.Pool.Exec(t.Context(), `insert into connectors (organization_id, kind, enabled, config)
        values ($1, 'slack', true, '{"teamId":"T123","teamName":"Acme"}')`, f.scope.OrganizationID)
	require.NoError(t, err)

	rec := f.request(f.scope.OrgPath("/agent-slack"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		SlackAgent slackAgentRecord `json:"slackAgent"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.True(t, body.SlackAgent.Enabled)
	require.NotNil(t, body.SlackAgent.TeamID)
	require.Equal(t, "T123", *body.SlackAgent.TeamID)
	require.Equal(t, "Acme", *body.SlackAgent.TeamName)
}
