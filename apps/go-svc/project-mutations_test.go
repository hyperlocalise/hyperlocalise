package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func projectMutationRequest(api *projectAPI, scope *testenv.Scope, method, path string, body any) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		reader = bytes.NewReader(encoded)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

type projectResponseBody struct {
	Project struct {
		ID                 string   `json:"id"`
		OrganizationID     string   `json:"organizationId"`
		TeamID             *string  `json:"teamId"`
		Name               string   `json:"name"`
		Identifier         string   `json:"identifier"`
		Description        string   `json:"description"`
		TranslationContext string   `json:"translationContext"`
		Source             string   `json:"source"`
		SourceLocale       *string  `json:"sourceLocale"`
		TargetLocales      []string `json:"targetLocales"`
		OpenJobCount       int      `json:"openJobCount"`
	} `json:"project"`
}

func TestCreateProjectHappyPath(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name":          "Acme Website",
		"description":   "A marketing site",
		"sourceLocale":  "en-US",
		"targetLocales": []string{"fr-FR", "de-DE"},
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	var resp projectResponseBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "Acme Website", resp.Project.Name)
	require.Equal(t, "native", resp.Project.Source)
	require.Equal(t, "A marketing site", resp.Project.Description)
	require.NotNil(t, resp.Project.SourceLocale)
	require.Equal(t, "en-US", *resp.Project.SourceLocale)
	require.ElementsMatch(t, []string{"fr-FR", "de-DE"}, resp.Project.TargetLocales)
	require.Equal(t, 0, resp.Project.OpenJobCount)
	require.NotEmpty(t, resp.Project.Identifier)
	require.NotNil(t, resp.Project.TeamID)

	var memoryCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
		select count(*) from project_memories pm
		join memories m on m.id = pm.memory_id
		where pm.project_id = $1 and m.source = 'native'`,
		resp.Project.ID).Scan(&memoryCount))
	require.Equal(t, 1, memoryCount, "expected exactly one default native TM attached")

	var storedIdentifier string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select identifier from projects where id=$1`,
		resp.Project.ID).Scan(&storedIdentifier))
	require.Equal(t, resp.Project.Identifier, storedIdentifier)
}

func TestCreateProjectAuthorizationMatrix(t *testing.T) {
	testenv.Require(t)
	cases := []struct {
		role    string
		allowed bool
	}{
		{"admin", true},
		{"localization_manager", true},
		{"developer", true},
		{"reviewer", false},
		{"translator", false},
		{"member", false},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: tc.role})
			api := &projectAPI{pool: scope.Pool, membership: scope.Membership(tc.role)}
			rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
				"name":          "Role Test Project",
				"sourceLocale":  "en",
				"targetLocales": []string{"fr"},
			})
			if !tc.allowed {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				require.Contains(t, rec.Body.String(), `"forbidden"`)
				return
			}
			require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
			if tc.role == "developer" {
				// A caller without org-wide project access must be enrolled as a
				// member of the (default) team the project resolved to.
				var resp projectResponseBody
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
				var membershipCount int
				require.NoError(t, scope.Pool.QueryRow(t.Context(), `
					select count(*) from team_memberships tm
					join teams t on t.id = tm.team_id
					where tm.user_id = $1 and t.organization_id = $2`,
					scope.UserID, scope.OrganizationID).Scan(&membershipCount))
				require.Equal(t, 1, membershipCount)
			}
		})
	}
}

func TestCreateProjectInvalidPayload(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	cases := map[string]map[string]any{
		"missing name": {
			"sourceLocale": "en", "targetLocales": []string{"fr"},
		},
		"missing sourceLocale": {
			"name": "X", "targetLocales": []string{"fr"},
		},
		"empty targetLocales": {
			"name": "X", "sourceLocale": "en", "targetLocales": []string{},
		},
		"source in targets": {
			"name": "X", "sourceLocale": "en", "targetLocales": []string{"en"},
		},
		"too many target locales": {
			"name": "X", "sourceLocale": "en", "targetLocales": manyTestLocales(51),
		},
		"invalid locale": {
			"name": "X", "sourceLocale": "not a locale !!", "targetLocales": []string{"fr"},
		},
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), body)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"invalid_project_payload"`)
		})
	}
}

func manyTestLocales(n int) []string {
	languages := []string{"en", "fr", "de", "es", "it", "pt", "nl", "sv", "da", "pl"}
	regions := []string{"US", "GB", "FR", "DE", "ES", "IT"}
	locales := make([]string, 0, n)
	for _, region := range regions {
		for _, lang := range languages {
			locales = append(locales, lang+"-"+region)
			if len(locales) == n {
				return locales
			}
		}
	}
	return locales
}

func TestCreateProjectInvalidTeam(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "developer"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("developer")}
	otherTeamID := scope.MustTeam(t, "other-team", "Other Team", "")

	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name":          "X",
		"sourceLocale":  "en",
		"targetLocales": []string{"fr"},
		"teamId":        otherTeamID,
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"invalid_project_team"`)
}

func TestCreateProjectLimitReachedLocalFallback(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	first := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name":          "First Project",
		"sourceLocale":  "en",
		"targetLocales": []string{"fr"},
	})
	require.Equal(t, http.StatusCreated, first.Code, first.Body.String())

	second := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name":          "Second Project",
		"sourceLocale":  "en",
		"targetLocales": []string{"fr"},
	})
	require.Equal(t, http.StatusConflict, second.Code, second.Body.String())
	require.Contains(t, second.Body.String(), `"workspace_resource_limit_reached"`)
}

type alwaysAllowAutumn struct{}

func (alwaysAllowAutumn) Do(*http.Request) (*http.Response, error) {
	body := `{"allowed":true,"customer_id":"test"}`
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}, nil
}

func TestConcurrentProjectCreateIdentifierAllocation(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	client, err := autumn.NewClient(autumn.Config{SecretKey: "test", HTTPClient: alwaysAllowAutumn{}})
	require.NoError(t, err)
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin"), autumn: client}

	const concurrency = 8
	var wg sync.WaitGroup
	identifiers := make(chan string, concurrency)
	errs := make(chan string, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
				"name":          "Acme Project",
				"sourceLocale":  "en",
				"targetLocales": []string{"fr"},
			})
			if rec.Code != http.StatusCreated {
				errs <- rec.Body.String()
				return
			}
			var resp projectResponseBody
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				errs <- err.Error()
				return
			}
			identifiers <- resp.Project.Identifier
		}()
	}
	wg.Wait()
	close(identifiers)
	close(errs)

	for msg := range errs {
		t.Fatalf("concurrent create failed: %s", msg)
	}
	seen := map[string]bool{}
	for id := range identifiers {
		require.False(t, seen[id], "duplicate identifier returned: %s", id)
		seen[id] = true
	}
	require.Len(t, seen, concurrency)

	var distinctCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
		select count(distinct identifier) from projects where organization_id=$1`,
		scope.OrganizationID).Scan(&distinctCount))
	require.Equal(t, concurrency, distinctCount)
}
