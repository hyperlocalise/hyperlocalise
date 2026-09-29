package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type contentEditorBehaviorResponseBody struct {
	ContentEditorBehavior struct {
		AutomaticallyGroupIdenticalStrings bool `json:"automaticallyGroupIdenticalStrings"`
		GroupingRevision                   int  `json:"groupingRevision"`
		CanManage                          bool `json:"canManage"`
	} `json:"contentEditorBehavior"`
}

func patchContentEditorBehavior(api *projectAPI, scope *testenv.Scope, value bool) *contentEditorBehaviorResponseBody {
	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior"), map[string]any{
		"automaticallyGroupIdenticalStrings": value,
	})
	if rec.Code != http.StatusOK {
		return nil
	}
	var resp contentEditorBehaviorResponseBody
	if json.Unmarshal(rec.Body.Bytes(), &resp) != nil {
		return nil
	}
	return &resp
}

func TestUpdateContentEditorBehaviorHappyPath(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior"), map[string]any{
		"automaticallyGroupIdenticalStrings": true,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var resp contentEditorBehaviorResponseBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.True(t, resp.ContentEditorBehavior.AutomaticallyGroupIdenticalStrings)
	require.Equal(t, 1, resp.ContentEditorBehavior.GroupingRevision)
	require.True(t, resp.ContentEditorBehavior.CanManage)

	rec = projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior"), map[string]any{
		"automaticallyGroupIdenticalStrings": false,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.False(t, resp.ContentEditorBehavior.AutomaticallyGroupIdenticalStrings)
	require.Equal(t, 2, resp.ContentEditorBehavior.GroupingRevision)
}

func TestUpdateContentEditorBehaviorNoOpDoesNotIncrementRevision(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	first := patchContentEditorBehavior(api, scope, true)
	require.NotNil(t, first)
	require.Equal(t, 1, first.ContentEditorBehavior.GroupingRevision)

	second := patchContentEditorBehavior(api, scope, true)
	require.NotNil(t, second)
	require.True(t, second.ContentEditorBehavior.AutomaticallyGroupIdenticalStrings)
	require.Equal(t, 1, second.ContentEditorBehavior.GroupingRevision, "a no-op request for the same value must not bump the revision")
}

func TestUpdateContentEditorBehaviorAuthorizationMatrix(t *testing.T) {
	testenv.Require(t)
	cases := []struct {
		role    string
		allowed bool
	}{
		{"admin", true},
		{"localization_manager", true},
		{"developer", false},
		{"reviewer", false},
		{"translator", false},
		{"member", false},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: tc.role})
			teamID := scope.MustTeam(t, "team-cat-"+tc.role, "Team", "member")
			scope.MustProject(t, scope.ProjectID, "CAT Behavior Role Test")
			_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, scope.ProjectID, teamID)
			require.NoError(t, err)

			api := &projectAPI{pool: scope.Pool, membership: scope.Membership(tc.role)}
			rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior"), map[string]any{
				"automaticallyGroupIdenticalStrings": true,
			})
			if tc.allowed {
				require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			} else {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				require.Contains(t, rec.Body.String(), `"forbidden"`)
			}
		})
	}
}

func TestUpdateContentEditorBehaviorNotFound(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/does-not-exist/content-editor-behavior"), map[string]any{
		"automaticallyGroupIdenticalStrings": true,
	})
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"project_not_found"`)
}

func TestUpdateContentEditorBehaviorInvalidPayload(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior"), map[string]any{})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"invalid_project_payload"`)
}

func TestConcurrentContentEditorBehaviorToggle(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	var initialRevision int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select cat_grouping_revision from projects where id=$1`, scope.ProjectID).Scan(&initialRevision))

	const concurrency = 12
	var wg sync.WaitGroup
	results := make(chan *contentEditorBehaviorResponseBody, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- patchContentEditorBehavior(api, scope, true)
		}()
	}
	wg.Wait()
	close(results)

	for resp := range results {
		require.NotNil(t, resp, "every concurrent request must succeed")
		require.True(t, resp.ContentEditorBehavior.AutomaticallyGroupIdenticalStrings)
		require.Equal(t, initialRevision+1, resp.ContentEditorBehavior.GroupingRevision,
			"every response, real transition or no-op fallback, must observe the single post-transition revision")
	}

	var finalValue bool
	var finalRevision int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
		select automatically_group_identical_strings, cat_grouping_revision from projects where id=$1`,
		scope.ProjectID).Scan(&finalValue, &finalRevision))
	require.True(t, finalValue)
	require.Equal(t, initialRevision+1, finalRevision, "concurrent requests for the same value must produce exactly one increment, never lost or duplicated")
}
