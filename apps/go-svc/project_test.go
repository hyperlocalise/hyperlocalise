package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func projectTestAPI(t *testing.T) (*projectAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	return &projectAPI{
		pool:       scope.Pool,
		membership: scope.Membership("admin"),
	}, scope
}

func projectRequest(api *projectAPI, scope *testenv.Scope, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestProjectRoutes(t *testing.T) {
	t.Run("lists accessible native projects with open job counts", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload)
            values ($1, $2, $3, 'translation', 'queued', '{}'::jsonb),
                   ($4, $2, $3, 'translation', 'running', '{}'::jsonb)`,
			"job_"+scope.ProjectID+"_1", scope.OrganizationID, scope.ProjectID,
			"job_"+scope.ProjectID+"_2")
		require.NoError(t, err)
		rec := projectRequest(api, scope, scope.OrgPath("/projects"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Projects []struct {
				ID           string `json:"id"`
				Name         string `json:"name"`
				OpenJobCount int    `json:"openJobCount"`
			} `json:"projects"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Projects, 1)
		require.Equal(t, scope.ProjectID, body.Projects[0].ID)
		require.Equal(t, "Project", body.Projects[0].Name)
		require.Equal(t, 2, body.Projects[0].OpenJobCount)
	})

	t.Run("returns a dedicated open job count", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		for i := 1; i <= 3; i++ {
			_, err := scope.Pool.Exec(t.Context(), `
                insert into jobs (id, organization_id, project_id, kind, status, input_payload)
                values ($1, $2, $3, 'translation', 'queued', '{}'::jsonb)`,
				"job_"+scope.ProjectID+"_"+string(rune('0'+i)), scope.OrganizationID, scope.ProjectID)
			require.NoError(t, err)
		}
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/open-job-count"))
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"openJobCount":3}`, rec.Body.String())
	})

	t.Run("returns content editor behavior and capability", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `
            update projects set automatically_group_identical_strings=true, cat_grouping_revision=4 where id=$1`,
			scope.ProjectID)
		require.NoError(t, err)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior"))
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"contentEditorBehavior":{"automaticallyGroupIdenticalStrings":true,"groupingRevision":4,"canManage":true}}`, rec.Body.String())
	})

	t.Run("lists the latest native repository files", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/files"))
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})

	t.Run("applies native file filters and pagination in SQL", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/files?search=messages&locale=fr&limit=25&offset=10"))
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})

	t.Run("rejects invalid file query parameters", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/files?limit=1001"))
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.JSONEq(t, `{"error":"invalid_project_files_query","message":"Invalid project files query parameters"}`, rec.Body.String())
	})

	t.Run("short-circuits provider-only file filters to an empty list", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/files?origin=provider"))
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})

	t.Run("does not serve external project ids", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:1/open-job-count"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})
}

func TestProjectActorRoles(t *testing.T) {
	require.True(t, projectActor{role: "admin"}.canReadAllTeams())
	require.True(t, projectActor{role: "localization_manager"}.canReadAllTeams())
	require.False(t, projectActor{role: "member"}.canReadAllTeams())
	require.False(t, projectActor{role: "translator"}.canReadAllTeams())

	require.True(t, projectActor{role: "admin"}.canManageContentEditorBehavior())
	require.True(t, projectActor{role: "localization_manager"}.canManageContentEditorBehavior())
	require.False(t, projectActor{role: "developer"}.canManageContentEditorBehavior())
	require.False(t, projectActor{role: "reviewer"}.canManageContentEditorBehavior())
}

func TestParseProjectFilesQuery(t *testing.T) {
	defaults, err := parseProjectFilesQuery(url.Values{})
	require.NoError(t, err)
	require.Equal(t, projectFilesQuery{limit: projectFilesDefaultLimit}, defaults)

	searchAndLocale, err := parseProjectFilesQuery(url.Values{
		"search": {" messages "},
		"locale": {"fr-FR"},
		"limit":  {"25"},
		"offset": {"10"},
		"origin": {"repository"},
	})
	require.NoError(t, err)
	require.Equal(t, projectFilesQuery{
		limit:  25,
		offset: 10,
		search: "messages",
		locale: "fr-FR",
	}, searchAndLocale)

	for _, values := range []url.Values{
		{"origin": {"provider"}},
		{"resourceType": {"key"}},
		{"providerKind": {"crowdin"}},
		{"syncState": {"pending"}},
	} {
		query, parseErr := parseProjectFilesQuery(values)
		require.NoError(t, parseErr, values.Encode())
		require.True(t, query.empty, values.Encode())
	}

	for _, values := range []url.Values{
		{"origin": {"all"}},
		{"resourceType": {"file"}},
		{"providerKind": {"all"}},
		{"syncState": {"all"}},
		{"syncState": {"repository"}},
	} {
		query, parseErr := parseProjectFilesQuery(values)
		require.NoError(t, parseErr, values.Encode())
		require.False(t, query.empty, values.Encode())
	}

	for _, values := range []url.Values{
		{"limit": {"0"}},
		{"limit": {"1001"}},
		{"limit": {"abc"}},
		{"offset": {"-1"}},
		{"offset": {"abc"}},
		{"search": {strings.Repeat("x", 257)}},
		{"locale": {strings.Repeat("y", 33)}},
		{"origin": {"combined"}},
		{"resourceType": {"folder"}},
		{"providerKind": {"memoq"}},
		{"syncState": {strings.Repeat("z", 65)}},
		{"branch": {""}},
		{"branch": {strings.Repeat("b", 257)}},
	} {
		_, parseErr := parseProjectFilesQuery(values)
		require.Error(t, parseErr, values.Encode())
		var projectErr *projectError
		require.ErrorAs(t, parseErr, &projectErr)
		require.Equal(t, 400, projectErr.status)
		require.Equal(t, "invalid_project_files_query", projectErr.code)
	}
}

func TestNormalizedNativeProjectID(t *testing.T) {
	id, err := normalizedNativeProjectID("  project_1  ")
	require.NoError(t, err)
	require.Equal(t, "project_1", id)

	_, err = normalizedNativeProjectID("")
	require.Error(t, err)
	_, err = normalizedNativeProjectID("ext:crowdin:1")
	require.Error(t, err)
	_, err = normalizedNativeProjectID(strings.Repeat("p", 257))
	require.Error(t, err)
}
