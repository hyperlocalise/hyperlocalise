package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
)

func (api *projectAPI) listBranchesHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := api.accessibleBranchProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	if err := nativeproject.EnsureDefaultBranch(r.Context(), api.pool, actor.organizationID, projectID, actor.userID); err != nil {
		return nil, 0, err
	}
	branches, err := nativeproject.ListBranches(r.Context(), api.pool, projectID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"branches": branches, "canManage": actor.canMutateProjects()}, http.StatusOK, nil
}

func (api *projectAPI) createBranchHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, err := api.accessibleBranchProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	var body struct {
		Name           string  `json:"name"`
		Title          *string `json:"title"`
		BaseBranchName *string `json:"baseBranchName"`
		Clone          *bool   `json:"clone"`
	}
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	if err := nativeproject.EnsureDefaultBranch(r.Context(), api.pool, actor.organizationID, projectID, actor.userID); err != nil {
		return nil, 0, err
	}
	branch, err := nativeproject.CreateBranch(r.Context(), api.pool, nativeproject.CreateBranchInput{
		OrganizationID:  actor.organizationID,
		ProjectID:       projectID,
		Name:            body.Name,
		Title:           body.Title,
		BaseBranchName:  body.BaseBranchName,
		CreatedByUserID: actor.userID,
		Clone:           body.Clone,
	})
	if err != nil {
		return nil, 0, branchFailure(err)
	}
	return map[string]any{"branch": branch}, http.StatusCreated, nil
}

func (api *projectAPI) updateBranchHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, name, err := api.branchNameParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	var raw map[string]json.RawMessage
	if err := decodeProjectBody(r, &raw); err != nil {
		return nil, 0, err
	}
	input := nativeproject.UpdateBranchInput{ProjectID: projectID, Name: name}
	if title, ok := raw["title"]; ok {
		input.TitleSet = true
		if string(title) != "null" {
			var value string
			if err := json.Unmarshal(title, &value); err != nil {
				return nil, 0, projectFailure(http.StatusBadRequest, "invalid_project_branch_payload", "Invalid branch update")
			}
			input.Title = &value
		}
	}
	if protected, ok := raw["isProtected"]; ok {
		var value bool
		if err := json.Unmarshal(protected, &value); err != nil {
			return nil, 0, projectFailure(http.StatusBadRequest, "invalid_project_branch_payload", "Invalid branch update")
		}
		input.IsProtected = &value
	}
	if !input.TitleSet && input.IsProtected == nil {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_project_branch_payload", "Invalid branch update")
	}
	branch, err := nativeproject.UpdateBranch(r.Context(), api.pool, input)
	if err != nil {
		return nil, 0, branchFailure(err)
	}
	return map[string]any{"branch": branch}, http.StatusOK, nil
}

func (api *projectAPI) deleteBranchHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, name, err := api.branchNameParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	if err := nativeproject.DeleteBranch(r.Context(), api.pool, projectID, name); err != nil {
		return nil, 0, branchFailure(err)
	}
	return nil, http.StatusNoContent, nil
}

func (api *projectAPI) previewMergeHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, name, err := api.branchNameParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	var target *string
	if raw := strings.TrimSpace(r.URL.Query().Get("targetName")); raw != "" {
		if !nativeproject.ValidBranchName(raw) {
			return nil, 0, projectFailure(http.StatusBadRequest, "invalid_branch_name", "Enter a valid branch name.")
		}
		normalized := nativeproject.NormalizeBranchName(raw)
		target = &normalized
	}
	changes, err := nativeproject.PreviewMerge(r.Context(), api.pool, projectID, name, target)
	if err != nil {
		return nil, 0, branchFailure(err)
	}
	return map[string]any{"changes": changes}, http.StatusOK, nil
}

func (api *projectAPI) mergeBranchHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, name, err := api.branchNameParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	var body struct {
		TargetName  *string `json:"targetName"`
		Strategy    string  `json:"strategy"`
		DeleteAfter *bool   `json:"deleteAfter"`
	}
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	if !nativeproject.ValidStrategy(body.Strategy) {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_project_branch_payload", "Invalid merge")
	}
	branch, err := nativeproject.MergeBranch(r.Context(), api.pool, nativeproject.MergeBranchInput{
		ProjectID:   projectID,
		SourceName:  name,
		TargetName:  body.TargetName,
		Strategy:    body.Strategy,
		DeleteAfter: body.DeleteAfter,
	})
	if err != nil {
		return nil, 0, branchFailure(err)
	}
	return map[string]any{"branch": branch}, http.StatusOK, nil
}

func (api *projectAPI) syncBranchHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, name, err := api.branchNameParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	var body struct {
		Strategy string `json:"strategy"`
	}
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	if !nativeproject.ValidStrategy(body.Strategy) {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_project_branch_payload", "Invalid sync")
	}
	branch, err := nativeproject.SyncBranch(r.Context(), api.pool, projectID, name, body.Strategy)
	if err != nil {
		return nil, 0, branchFailure(err)
	}
	return map[string]any{"branch": branch}, http.StatusOK, nil
}

func (api *projectAPI) accessibleBranchProject(r *http.Request, actor projectActor) (string, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return "", err
	}
	if err := api.requireAccessibleNativeProject(r.Context(), actor, projectID); err != nil {
		return "", err
	}
	return projectID, nil
}

func (api *projectAPI) branchNameParams(r *http.Request, actor projectActor) (string, string, error) {
	projectID, err := api.accessibleBranchProject(r, actor)
	if err != nil {
		return "", "", err
	}
	name := nativeproject.NormalizeBranchName(r.PathValue("branchName"))
	if !nativeproject.ValidBranchName(name) {
		return "", "", projectFailure(http.StatusBadRequest, "invalid_branch_name", "Enter a valid branch name.")
	}
	return projectID, name, nil
}

func branchFailure(err error) error {
	code, ok := nativeproject.AsError(err)
	if !ok {
		return err
	}
	switch code {
	case "invalid_branch_name":
		return projectFailure(http.StatusBadRequest, code, "Enter a valid branch name.")
	case "invalid_branch_title":
		return projectFailure(http.StatusBadRequest, code, "Title must be 256 characters or fewer.")
	case "branch_not_found":
		return projectFailure(http.StatusNotFound, code, "Branch not found.")
	case "branch_name_taken":
		return projectFailure(http.StatusConflict, code, "A branch with this name already exists.")
	case "default_branch_required":
		return projectFailure(http.StatusBadRequest, code, "The default branch is required.")
	case "protected_branch":
		return projectFailure(http.StatusConflict, code, "This branch is protected.")
	case "cannot_delete_default":
		return projectFailure(http.StatusConflict, code, "The default branch cannot be deleted.")
	case "cannot_delete_with_children":
		return projectFailure(http.StatusConflict, code, "Delete or merge child branches first.")
	case "cannot_merge_into_self":
		return projectFailure(http.StatusBadRequest, code, "Choose a different branch to merge into.")
	case "cannot_merge_merged_branch":
		return projectFailure(http.StatusConflict, code, "This branch is already merged.")
	case "has_child_branches":
		return projectFailure(http.StatusConflict, code, "Merge or delete child branches first.")
	default:
		return projectFailure(http.StatusBadRequest, code, "Invalid branch")
	}
}

func (api *projectAPI) rejectProtectedBranchWrite(r *http.Request, actor projectActor, projectID, action string, body map[string]any) error {
	switch action {
	case "use_translation_as_source":
		// A send reads this project and writes the destination's default branch.
		destinationID, _ := body["destinationProjectId"].(string)
		destinationID = strings.TrimSpace(destinationID)
		if destinationID == "" || destinationID == projectID {
			return nil
		}
		if err := api.requireAccessibleNativeProject(r.Context(), actor, destinationID); err != nil {
			return err
		}
		return api.assertProjectBranchWritable(r, actor, destinationID, "")
	case "file_settings_patch":
		return api.rejectProtectedFileSettings(r, actor, projectID, body)
	default:
		branch, _ := body["branch"].(string)
		return api.assertProjectBranchWritable(r, actor, projectID, branch)
	}
}

func (api *projectAPI) assertProjectBranchWritable(r *http.Request, actor projectActor, projectID, branch string) error {
	if err := nativeproject.EnsureDefaultBranch(r.Context(), api.pool, actor.organizationID, projectID, actor.userID); err != nil {
		return err
	}
	if _, err := nativeproject.AssertWritable(r.Context(), api.pool, projectID, branch); err != nil {
		return branchFailure(err)
	}
	return nil
}

func (api *projectAPI) rejectProtectedFileSettings(r *http.Request, actor projectActor, projectID string, body map[string]any) error {
	sourcePath, _ := body["sourcePath"].(string)
	sourcePath = normalizeWorkflowSourcePath(sourcePath)
	if sourcePath == "" {
		return nil
	}
	if err := nativeproject.EnsureDefaultBranch(r.Context(), api.pool, actor.organizationID, projectID, actor.userID); err != nil {
		return err
	}
	// File settings are stored on the file row. The same path can exist on more
	// than one branch, and the writer does not name which row it updates, so a
	// protected branch at that path blocks the write.
	var protected bool
	err := api.pool.QueryRow(r.Context(), `
		select exists (
			select 1
			from repository_source_files f
			join project_branches b
				on b.project_id = f.project_id and b.name = f.branch_name
				and b.status = 'active' and b.is_protected
			where f.organization_id = $1 and f.project_id = $2 and f.source_path = $3
		)`, actor.organizationID, projectID, sourcePath).Scan(&protected)
	if err != nil {
		return err
	}
	if !protected {
		return nil
	}
	return branchFailure(&nativeproject.Error{Code: "protected_branch"})
}

func normalizeWorkflowSourcePath(value string) string {
	value = strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	for strings.HasPrefix(value, "./") {
		value = strings.TrimPrefix(value, "./")
	}
	for strings.Contains(value, "//") {
		value = strings.ReplaceAll(value, "//", "/")
	}
	return value
}
