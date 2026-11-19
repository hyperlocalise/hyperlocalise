package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestProjectBranchesCreateSyncMergeAndDelete(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	ctx := t.Context()

	list := projectMutationRequest(api, scope, http.MethodGet, scope.OrgPath("/projects/"+scope.ProjectID+"/branches"), nil)
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	var listed struct {
		CanManage bool `json:"canManage"`
		Branches  []struct {
			Name      string `json:"name"`
			IsDefault bool   `json:"isDefault"`
		} `json:"branches"`
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listed))
	require.True(t, listed.CanManage)
	require.Equal(t, "main", listed.Branches[0].Name)
	require.True(t, listed.Branches[0].IsDefault)

	_, err := scope.Pool.Exec(ctx, `
		insert into repository_source_files (organization_id, project_id, source_path, branch_name)
		values ($1, $2, 'lang/en.json', 'main')`, scope.OrganizationID, scope.ProjectID)
	require.NoError(t, err)
	var fileID string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select id::text from repository_source_files where project_id = $1 and branch_name = 'main'`,
		scope.ProjectID).Scan(&fileID))
	_, err = scope.Pool.Exec(ctx, `
		insert into project_translation_keys (
			organization_id, project_id, repository_source_file_id, key, branch_name, source_text, normalized_source_text
		) values ($1, $2, $3, 'greeting', 'main', 'Hello', 'hello')`,
		scope.OrganizationID, scope.ProjectID, fileID)
	require.NoError(t, err)

	created := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches"), map[string]any{
		"name": "feature-checkout", "title": "Checkout", "baseBranchName": "main",
	})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())

	var featureKeys int
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select count(*) from project_translation_keys where project_id = $1 and branch_name = 'feature-checkout'`,
		scope.ProjectID).Scan(&featureKeys))
	require.Equal(t, 1, featureKeys)

	_, err = scope.Pool.Exec(ctx, `
		update project_translation_keys set source_text = 'Hi'
		where project_id = $1 and branch_name = 'feature-checkout'`, scope.ProjectID)
	require.NoError(t, err)

	preview := projectMutationRequest(api, scope, http.MethodGet, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/feature-checkout/merge"), nil)
	require.Equal(t, http.StatusOK, preview.Code, preview.Body.String())
	require.Contains(t, preview.Body.String(), `"kind":"conflicted"`)

	kept := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/feature-checkout/merge"), map[string]any{
		"strategy": "use_base",
	})
	require.Equal(t, http.StatusOK, kept.Code, kept.Body.String())
	var mainText string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select source_text from project_translation_keys where project_id = $1 and branch_name = 'main'`,
		scope.ProjectID).Scan(&mainText))
	require.Equal(t, "Hello", mainText, "use_base leaves the parent source text")

	again := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches"), map[string]any{
		"name": "release-ios", "baseBranchName": "main",
	})
	require.Equal(t, http.StatusCreated, again.Code, again.Body.String())
	_, err = scope.Pool.Exec(ctx, `
		insert into project_translation_keys (
			organization_id, project_id, key, branch_name, source_text, normalized_source_text
		) values ($1, $2, 'new_key', 'release-ios', 'New', 'new')`, scope.OrganizationID, scope.ProjectID)
	require.NoError(t, err)
	merged := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/release-ios/merge"), map[string]any{
		"strategy": "use_branch",
	})
	require.Equal(t, http.StatusOK, merged.Code, merged.Body.String())
	var added int
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select count(*) from project_translation_keys
		where project_id = $1 and branch_name = 'main' and key = 'new_key'`, scope.ProjectID).Scan(&added))
	require.Equal(t, 1, added)

	child := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches"), map[string]any{
		"name": "child", "baseBranchName": "main", "clone": false,
	})
	require.Equal(t, http.StatusCreated, child.Code, child.Body.String())
	var childID string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select id::text from project_branches where project_id = $1 and name = 'child'`, scope.ProjectID).Scan(&childID))
	_, err = scope.Pool.Exec(ctx, `
		insert into project_branches (organization_id, project_id, name, base_branch_id)
		values ($1, $2, 'grandchild', $3)`, scope.OrganizationID, scope.ProjectID, childID)
	require.NoError(t, err)
	blocked := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/child"), nil)
	require.Equal(t, http.StatusConflict, blocked.Code, blocked.Body.String())
	require.Contains(t, blocked.Body.String(), "cannot_delete_with_children")

	protected := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/main"), map[string]any{
		"isProtected": true,
	})
	require.Equal(t, http.StatusOK, protected.Code, protected.Body.String())
	upload := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/files"), map[string]any{
		"branch": "main",
	})
	require.Equal(t, http.StatusConflict, upload.Code, upload.Body.String())
	require.Contains(t, upload.Body.String(), "protected_branch")
}

func TestProjectBranchWritesForbidMembers(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "member", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("member")}
	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches"), map[string]any{
		"name": "feature",
	})
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}
