package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestResolveLinkedDomainIdentity(t *testing.T) {
	domainKey, slug, source, err := resolveLinkedDomainIdentity("https://www.Example.com/path?q=1")
	require.NoError(t, err)
	require.Equal(t, "example.com", domainKey)
	require.Regexp(t, `^example-com-[a-z]{6}$`, slug)
	require.Equal(t, "https://example.com/", source)
	_, _, _, err = resolveLinkedDomainIdentity("http://127.0.0.1/")
	require.Error(t, err)
	_, _, _, err = resolveLinkedDomainIdentity("ftp://example.com/")
	require.Error(t, err)
	_, _, _, err = resolveLinkedDomainIdentity("https://user:pass@example.com/")
	require.EqualError(t, err, "invalid_url")
	_, _, _, err = resolveLinkedDomainIdentity("https://example.com:8080/")
	require.EqualError(t, err, "invalid_port")
	_, _, _, err = resolveLinkedDomainIdentity("https://localhost/")
	require.EqualError(t, err, "not_public")
	_, _, _, err = resolveLinkedDomainIdentity("https://intranet/")
	require.EqualError(t, err, "not_public")
	_, _, _, err = resolveLinkedDomainIdentity("https://10.0.0.8/")
	require.EqualError(t, err, "not_public")
	_, _, _, err = resolveLinkedDomainIdentity("https://169.254.169.254/")
	require.EqualError(t, err, "not_public")
	_, _, _, err = resolveLinkedDomainIdentity("https://100.64.1.2/")
	require.EqualError(t, err, "not_public")
}

func TestLinkedDomainPublicHostnameAndRoutableIP(t *testing.T) {
	require.True(t, isPublicHostname("example.com"))
	require.False(t, isPublicHostname("localhost"))
	require.False(t, isPublicHostname("localdomain"))
	require.False(t, isPublicHostname("127.0.0.1"))
	require.False(t, isPublicHostname("::1"))
	require.False(t, isPublicHostname("192.168.1.1"))
	require.False(t, isPublicHostname("10.1.2.3"))
	require.False(t, isPublicHostname("172.16.0.1"))
	require.False(t, isPublicHostname("169.254.1.1"))
	require.False(t, isPublicHostname("192.0.2.1"))
	require.False(t, isPublicHostname("198.51.100.1"))
	require.False(t, isPublicHostname("203.0.113.1"))
	require.False(t, isPublicHostname("2001:db8::1"))
	require.True(t, isPublicHostname("8.8.8.8"))
	require.True(t, isPublicHostname("1.1.1.1"))
}

func TestLinkedDomainMarketNormalization(t *testing.T) {
	require.True(t, validResearchMarkets(nil))
	require.True(t, validResearchMarkets([]string{"france-fr"}))
	require.False(t, validResearchMarkets([]string{"france-fr", "not-a-market"}))
	require.Equal(t, []string{"france-fr", "germany-de"}, normalizedMarketIDs([]string{"france-fr", "france-fr", "germany-de"}))
	require.Empty(t, normalizedMarketIDs(nil))
}

func TestDeriveLinkedDomainProjectIdentifier(t *testing.T) {
	require.Equal(t, "EC", deriveLinkedDomainProjectIdentifier("example.com"))
	require.Equal(t, "SHO", deriveLinkedDomainProjectIdentifier("shop"))
	require.Equal(t, "SH", deriveLinkedDomainProjectIdentifier("sh"))
	require.Equal(t, "A", deriveLinkedDomainProjectIdentifier("a"))
	require.Equal(t, "PROJ", deriveLinkedDomainProjectIdentifier("---"))
	require.Equal(t, "ACME", linkedDomainProjectIdentifierCandidate(1, "ACME"))
	require.Equal(t, "ACME2", linkedDomainProjectIdentifierCandidate(2, "ACME"))
	require.Equal(t, "ACME10", linkedDomainProjectIdentifierCandidate(10, "ACME"))
	require.Equal(t, "ABCDEFGH10", linkedDomainProjectIdentifierCandidate(10, "ABCDEFGHIJKLM"))
}

func TestLinkedDomainLocaleLanguage(t *testing.T) {
	require.Equal(t, "fr", localeLanguage("fr-FR"))
	require.Equal(t, "en", localeLanguage("EN_US"))
	require.Equal(t, "zh", localeLanguage("zh"))
	require.Equal(t, "", localeLanguage("x-default"))
	require.Equal(t, "", localeLanguage(" "))
	require.Equal(t, "", localeLanguage("english"))
}

func TestLinkedDomainCreateListAndCancel(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	domain := fmt.Sprintf("migrate-%s.example", strings.ReplaceAll(uuid.NewString(), "-", ""))
	create := workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		LinkedDomain struct {
			ID         string `json:"id"`
			DomainKey  string `json:"domainKey"`
			Status     string `json:"status"`
			Challenges struct {
				Token string `json:"token"`
			} `json:"challenges"`
		} `json:"linkedDomain"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	require.NotEmpty(t, created.LinkedDomain.ID)
	require.Equal(t, domain, created.LinkedDomain.DomainKey)
	require.Equal(t, "pending_verification", created.LinkedDomain.Status)
	require.Len(t, created.LinkedDomain.Challenges.Token, 64)

	list := workspaceRequest(t, h, scope, http.MethodGet, scope.OrgPath("/domains/linked-domains"), "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), created.LinkedDomain.ID)

	cancel := workspaceRequest(t, h, scope, http.MethodDelete, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID), "")
	require.Equal(t, http.StatusNoContent, cancel.Code, cancel.Body.String())
}

func TestLinkedDomainCreateRejectsPrivateHostsInvalidMarketsAndDisabledFlag(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	path := scope.OrgPath("/domains/linked-domains")

	disabled := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: false})
	flagged := workspaceRequest(t, disabled, scope, http.MethodPost, path, `{"domain":"example.com","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusForbidden, flagged.Code, flagged.Body.String())
	require.Contains(t, flagged.Body.String(), `"feature_unavailable"`)

	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	private := workspaceRequest(t, h, scope, http.MethodPost, path, `{"domain":"http://127.0.0.1/","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusBadRequest, private.Code, private.Body.String())
	require.Contains(t, private.Body.String(), `"invalid_domain_url"`)

	markets := workspaceRequest(t, h, scope, http.MethodPost, path, `{"domain":"markets.example","marketIds":["not-a-market"]}`)
	require.Equal(t, http.StatusBadRequest, markets.Code, markets.Body.String())
	require.Contains(t, markets.Body.String(), `"invalid_market_selection"`)
}

func TestLinkedDomainTeamAccessAndProjectAssignment(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "developer", WithProject: true})
	defaultTeamID := scope.MustTeam(t, "default", "Default", "member")
	otherTeamID := scope.MustTeam(t, "other", "Other", "")
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, otherTeamID, scope.ProjectID)
	require.NoError(t, err)

	admin := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	domain := fmt.Sprintf("team-%s.example", strings.ReplaceAll(uuid.NewString(), "-", ""))
	create := workspaceRequest(t, admin, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		LinkedDomain struct {
			ID string `json:"id"`
		} `json:"linkedDomain"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	_, err = scope.Pool.Exec(t.Context(), `
		update linked_domains
		set status='verified', project_id=$2, verified_at=now(), verified_method='dns_txt', updated_at=now()
		where id=$1`, created.LinkedDomain.ID, scope.ProjectID)
	require.NoError(t, err)

	developer := workspaceHandler(scope, "developer", stubWorkspaceFlags{enabled: true})
	hidden := workspaceRequest(t, developer, scope, http.MethodGet, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID), "")
	require.Equal(t, http.StatusNotFound, hidden.Code, hidden.Body.String())
	require.Contains(t, hidden.Body.String(), `"linked_domain_not_found"`)

	listHidden := workspaceRequest(t, developer, scope, http.MethodGet, scope.OrgPath("/domains/linked-domains"), "")
	require.Equal(t, http.StatusOK, listHidden.Code, listHidden.Body.String())
	require.NotContains(t, listHidden.Body.String(), created.LinkedDomain.ID)

	createLeak := workspaceRequest(t, developer, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusConflict, createLeak.Code, createLeak.Body.String())
	require.Contains(t, createLeak.Body.String(), `"claim_pending_exists"`)
	require.NotContains(t, createLeak.Body.String(), `"challenges"`)
	require.NotContains(t, createLeak.Body.String(), created.LinkedDomain.ID)

	_, err = scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, defaultTeamID, scope.ProjectID)
	require.NoError(t, err)
	visible := workspaceRequest(t, developer, scope, http.MethodGet, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID), "")
	require.Equal(t, http.StatusOK, visible.Code, visible.Body.String())
	require.Contains(t, visible.Body.String(), created.LinkedDomain.ID)

	foreignProjectID := "project_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	_, err = scope.Pool.Exec(t.Context(), `
		insert into projects (id, organization_id, team_id, created_by_user_id, name, identifier, source)
		values ($1, $2, $3, $4, 'Other team project', 'OTHER', 'native')`,
		foreignProjectID, scope.OrganizationID, otherTeamID, scope.UserID)
	require.NoError(t, err)

	denied := workspaceRequest(t, developer, scope, http.MethodPatch, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID+"/project"), `{"projectId":"`+foreignProjectID+`"}`)
	require.Equal(t, http.StatusNotFound, denied.Code, denied.Body.String())
	require.Contains(t, denied.Body.String(), `"project_not_found"`)

	allowed := workspaceRequest(t, developer, scope, http.MethodPatch, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID+"/project"), `{"projectId":"`+scope.ProjectID+`"}`)
	require.Equal(t, http.StatusOK, allowed.Code, allowed.Body.String())
	require.Contains(t, allowed.Body.String(), scope.ProjectID)
}
