package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
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
	storedID := "file_" + fileID
	_, err = scope.Pool.Exec(ctx, `
		insert into stored_files (
			id, organization_id, role, source_kind, storage_provider, storage_key, storage_url,
			filename, content_type, byte_size, sha256
		) values ($1, $2, 'source', 'repository_file', 'test', $1, $1, 'en.json', 'application/json', 2, 'x')`,
		storedID, scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
		with version as (
			insert into repository_source_file_versions (
				organization_id, project_id, repository_source_file_id, source_path, stored_file_id, source_hash
			) values ($1, $2, $3, 'lang/en.json', $4, 'sha256:x')
			returning id
		)
		update repository_source_files
		set reconciled_source_file_version_id = (select id from version)
		where id = $3`,
		scope.OrganizationID, scope.ProjectID, fileID, storedID)
	require.NoError(t, err)
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

	var clonedReconciled bool
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select reconciled_source_file_version_id is not null
		from repository_source_files
		where project_id = $1 and branch_name = 'feature-checkout'`, scope.ProjectID).Scan(&clonedReconciled))
	require.True(t, clonedReconciled, "clone keeps the reconciled source version")

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
	var addedNormalized string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select count(*), coalesce(max(normalized_source_text), '')
		from project_translation_keys
		where project_id = $1 and branch_name = 'main' and key = 'new_key'`, scope.ProjectID).Scan(&added, &addedNormalized))
	require.Equal(t, 1, added)
	require.Equal(t, "new", addedNormalized)

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

	// Translation import always writes main, so naming another branch does not skip protection.
	imported := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/files/translations/import"), map[string]any{
		"branch":     "feature-checkout",
		"sourcePath": "lang/en.json",
		"locale":     "fr",
	})
	require.Equal(t, http.StatusConflict, imported.Code, imported.Body.String())
	require.Contains(t, imported.Body.String(), "protected_branch")

	settings := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/files/settings"), map[string]any{
		"sourcePath": "lang/en.json",
		"kind":       "import",
		"settings":   map[string]any{},
	})
	require.Equal(t, http.StatusConflict, settings.Code, settings.Body.String())
	require.Contains(t, settings.Body.String(), "protected_branch")

	longTitle := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/main"), map[string]any{
		"title": strings.Repeat("a", 257),
	})
	require.Equal(t, http.StatusBadRequest, longTitle.Code, longTitle.Body.String())
	require.Contains(t, longTitle.Body.String(), "invalid_branch_title")
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

func TestProjectBranchSyncCopiesParentAndKeepsUseBaseConflicts(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	ctx := t.Context()

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
		"name": "feature-checkout", "baseBranchName": "main",
	})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())

	_, err = scope.Pool.Exec(ctx, `
		update project_translation_keys set source_text = 'Hello there', normalized_source_text = 'hello there'
		where project_id = $1 and branch_name = 'main' and key = 'greeting'`, scope.ProjectID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
		insert into project_translation_keys (
			organization_id, project_id, repository_source_file_id, key, branch_name, source_text, normalized_source_text
		) values ($1, $2, $3, 'farewell', 'main', 'Goodbye', 'goodbye')`,
		scope.OrganizationID, scope.ProjectID, fileID)
	require.NoError(t, err)

	kept := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/feature-checkout/sync"), map[string]any{
		"strategy": "use_base",
	})
	require.Equal(t, http.StatusOK, kept.Code, kept.Body.String())
	require.Contains(t, kept.Body.String(), `"lastSyncedAt"`)
	require.NotContains(t, kept.Body.String(), `"lastSyncedAt":null`)

	var greeting, farewell string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select coalesce(max(source_text) filter (where key = 'greeting'), ''),
			coalesce(max(source_text) filter (where key = 'farewell'), '')
		from project_translation_keys
		where project_id = $1 and branch_name = 'feature-checkout'`, scope.ProjectID).Scan(&greeting, &farewell))
	require.Equal(t, "Hello", greeting)
	require.Equal(t, "Goodbye", farewell)

	resolved := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+scope.ProjectID+"/branches/feature-checkout/sync"), map[string]any{
		"strategy": "use_branch",
	})
	require.Equal(t, http.StatusOK, resolved.Code, resolved.Body.String())
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select source_text from project_translation_keys
		where project_id = $1 and branch_name = 'feature-checkout' and key = 'greeting'`,
		scope.ProjectID).Scan(&greeting))
	require.Equal(t, "Hello there", greeting)
}

func TestUseTranslationAsSourceRejectsProtectedOrForeignDestination(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	sourceID := scope.ProjectID
	destID := "project_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	scope.MustProject(t, destID, "Destination")

	listed := projectMutationRequest(api, scope, http.MethodGet, scope.OrgPath("/projects/"+destID+"/branches"), nil)
	require.Equal(t, http.StatusOK, listed.Code, listed.Body.String())
	protected := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+destID+"/branches/main"), map[string]any{
		"isProtected": true,
	})
	require.Equal(t, http.StatusOK, protected.Code, protected.Body.String())

	blocked := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+sourceID+"/files/use-translation-as-source"), map[string]any{
		"destinationProjectId": destID,
		"sourcePath":           "lang/en.json",
		"locale":               "fr",
	})
	require.Equal(t, http.StatusConflict, blocked.Code, blocked.Body.String())
	require.Contains(t, blocked.Body.String(), "protected_branch")

	other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	foreign := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/"+sourceID+"/files/use-translation-as-source"), map[string]any{
		"destinationProjectId": other.ProjectID,
		"sourcePath":           "lang/en.json",
		"locale":               "fr",
	})
	require.Equal(t, http.StatusNotFound, foreign.Code, foreign.Body.String())
	require.Contains(t, foreign.Body.String(), "project_not_found")
}
