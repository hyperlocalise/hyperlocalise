package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// uniqueProjectID returns a fresh id with the given readable prefix and no
// separators, avoiding both testenv.MustProject's identifier-prefix
// collisions (it truncates to 10 normalized chars) and the projects table's
// identifier format check (which rejects hyphens).
func uniqueProjectID(prefix string) string {
	return prefix + strings.ReplaceAll(uuid.NewString(), "-", "")
}

func mustRepositoryFileVersion(
	t *testing.T,
	api *projectAPI,
	orgID, projectID, sourcePath, filename string,
	createdAt time.Time,
) string {
	t.Helper()
	storedFileID := uuid.NewString()
	_, err := api.pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1, $2, $3, 'source', 'repository_file', 'test', $1, $1, $4, 'text/plain', 10, 'deadbeef')`,
		storedFileID, orgID, projectID, filename)
	require.NoError(t, err)

	sourceFileID := uuid.NewString()
	_, err = api.pool.Exec(t.Context(), `
        insert into repository_source_files (id, organization_id, project_id, source_path)
        values ($1, $2, $3, $4)`,
		sourceFileID, orgID, projectID, sourcePath)
	require.NoError(t, err)

	versionID := uuid.NewString()
	_, err = api.pool.Exec(t.Context(), `
        insert into repository_source_file_versions (
            id, repository_source_file_id, organization_id, project_id, source_path, stored_file_id, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
		versionID, sourceFileID, orgID, projectID, sourcePath, storedFileID, createdAt)
	require.NoError(t, err)
	return versionID
}

func TestWorkspaceFilesHandler(t *testing.T) {
	t.Run("merges files from multiple accessible native projects sorted by project name", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		projectA := scope.MustProject(t, uniqueProjectID("beta"), "Beta project")
		projectB := scope.MustProject(t, uniqueProjectID("alpha"), "Alpha project")
		now := time.Now().UTC().Truncate(time.Millisecond)
		mustRepositoryFileVersion(t, api, scope.OrganizationID, projectA, "messages/en.json", "en.json", now)
		mustRepositoryFileVersion(t, api, scope.OrganizationID, projectB, "messages/en.json", "en.json", now)

		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var body struct {
			Files []struct {
				ProjectName string `json:"projectName"`
				ProjectID   string `json:"projectId"`
				SourcePath  string `json:"sourcePath"`
				Origin      string `json:"origin"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Files, 2)
		require.Equal(t, "Alpha project", body.Files[0].ProjectName)
		require.Equal(t, projectB, body.Files[0].ProjectID)
		require.Equal(t, "Beta project", body.Files[1].ProjectName)
		require.Equal(t, projectA, body.Files[1].ProjectID)
		require.Equal(t, "repository", body.Files[0].Origin)
	})

	t.Run("never surfaces files from a provider project even with repository rows and team visibility", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		providerProjectID := scope.ProjectID + "_provider"
		_, err := scope.Pool.Exec(t.Context(), `
            insert into projects (id, organization_id, created_by_user_id, name, identifier, source, external_provider_kind, external_project_id)
            select $1, organization_id, created_by_user_id, 'Provider project', 'PROVWS', 'external_tms', 'crowdin', '123'
            from projects where id=$2`,
			providerProjectID, scope.ProjectID)
		require.NoError(t, err)
		mustRepositoryFileVersion(t, api, scope.OrganizationID, providerProjectID, "leaked.json", "leaked.json", time.Now())
		mustRepositoryFileVersion(t, api, scope.OrganizationID, scope.ProjectID, "native.json", "native.json", time.Now())

		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var body struct {
			Files []struct {
				SourcePath string `json:"sourcePath"`
				ProjectID  string `json:"projectId"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Files, 1)
		require.Equal(t, "native.json", body.Files[0].SourcePath)
		require.Equal(t, scope.ProjectID, body.Files[0].ProjectID)
	})

	t.Run("filters to a single project id", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		projectA := scope.MustProject(t, uniqueProjectID("a"), "Project A")
		projectB := scope.MustProject(t, uniqueProjectID("b"), "Project B")
		mustRepositoryFileVersion(t, api, scope.OrganizationID, projectA, "a.json", "a.json", time.Now())
		mustRepositoryFileVersion(t, api, scope.OrganizationID, projectB, "b.json", "b.json", time.Now())

		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files?projectId="+projectA))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var body struct {
			Files []struct {
				SourcePath string `json:"sourcePath"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Files, 1)
		require.Equal(t, "a.json", body.Files[0].SourcePath)
	})

	t.Run("only returns files from team-visible projects", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		otherTeam := scope.MustTeam(t, "other-team", "Other team", "")
		_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, otherTeam, scope.ProjectID)
		require.NoError(t, err)
		mustRepositoryFileVersion(t, api, scope.OrganizationID, scope.ProjectID, "inaccessible.json", "inaccessible.json", time.Now())

		api.membership = scope.Membership("member")
		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})

	t.Run("short-circuits provider-only filters to an empty list", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		mustRepositoryFileVersion(t, api, scope.OrganizationID, scope.ProjectID, "a.json", "a.json", time.Now())
		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files?origin=provider"))
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})

	t.Run("rejects invalid query parameters", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files?limit=1001"))
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.JSONEq(t, `{"error":"invalid_workspace_files_query","message":"Invalid workspace files query parameters"}`, rec.Body.String())
	})

	t.Run("returns an empty list rather than an error for a caller with no visible teams", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		mustRepositoryFileVersion(t, api, scope.OrganizationID, scope.ProjectID, "a.json", "a.json", time.Now())
		scope.MustTeam(t, "some-other-team", "Some other team", "")

		api.membership = scope.Membership("member")
		rec := projectRequest(api, scope, scope.OrgPath("/workspace-files"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})
}

func TestParseWorkspaceFilesQuery(t *testing.T) {
	defaults, err := parseWorkspaceFilesQuery(url.Values{})
	require.NoError(t, err)
	require.Equal(t, workspaceFilesQuery{limit: projectFilesDefaultLimit}, defaults)

	withProjectID, err := parseWorkspaceFilesQuery(url.Values{"projectId": {"proj_1"}})
	require.NoError(t, err)
	require.Equal(t, "proj_1", withProjectID.projectID)

	allSentinel, err := parseWorkspaceFilesQuery(url.Values{"projectId": {"all"}})
	require.NoError(t, err)
	require.Equal(t, "", allSentinel.projectID)

	for _, values := range []url.Values{
		{"limit": {"1001"}},
		{"limit": {"0"}},
		{"offset": {"-1"}},
		{"origin": {"combined"}},
		{"resourceType": {"folder"}},
		{"providerKind": {"memoq"}},
	} {
		_, parseErr := parseWorkspaceFilesQuery(values)
		require.Error(t, parseErr)
		var projectErr *projectError
		require.ErrorAs(t, parseErr, &projectErr)
		require.Equal(t, "invalid_workspace_files_query", projectErr.code)
	}
}
