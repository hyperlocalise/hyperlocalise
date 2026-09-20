package main

import (
	"net/http"
	"strings"
)

func (api *issueSheetAPI) dispatch(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	rest := strings.Trim(r.PathValue("rest"), "/")
	parts := []string{}
	if rest != "" {
		parts = strings.Split(rest, "/")
	}

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		return api.listIssues(r.Context(), actor, project, r)
	case len(parts) == 0 && r.Method == http.MethodPost:
		if !actor.canMutateIssues() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.createIssue(r.Context(), actor, project, r)
	case len(parts) == 1 && parts[0] == "assignable-members" && r.Method == http.MethodGet:
		return api.listAssignableMembers(r.Context(), actor, project)
	case len(parts) == 1 && parts[0] == "columns" && r.Method == http.MethodGet:
		tx, err := api.pool.Begin(r.Context())
		if err != nil {
			return nil, 0, err
		}
		defer func() { _ = tx.Rollback(r.Context()) }()
		if err := ensureIssueStarterColumns(r.Context(), tx, actor.organizationID, project.ID, actor.userID); err != nil {
			return nil, 0, err
		}
		if err := tx.Commit(r.Context()); err != nil {
			return nil, 0, err
		}
		columns, err := api.loadColumns(r.Context(), actor.organizationID, project.ID)
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{"columns": columns}, 200, nil
	case len(parts) == 1 && parts[0] == "columns" && r.Method == http.MethodPost:
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.createColumn(r.Context(), actor, project, r)
	case len(parts) == 2 && parts[0] == "columns" && parts[1] == "order" && r.Method == http.MethodPut:
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.reorderColumns(r.Context(), actor, project, r)
	case len(parts) == 2 && parts[0] == "columns" && r.Method == http.MethodPatch:
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.updateColumn(r.Context(), actor, project, parts[1], r)
	case len(parts) == 2 && parts[0] == "columns" && r.Method == http.MethodDelete:
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.deleteColumn(r.Context(), actor, project, parts[1])
	case len(parts) == 1 && parts[0] == "template-config" && r.Method == http.MethodGet:
		return api.getTemplateConfig(r.Context(), actor, project)
	case len(parts) == 1 && parts[0] == "template-config" && r.Method == http.MethodPut:
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.putTemplateConfig(r.Context(), actor, project, r)
	case len(parts) == 1 && r.Method == http.MethodGet:
		return api.getIssue(r.Context(), actor, project, parts[0])
	case len(parts) == 1 && r.Method == http.MethodPatch:
		if !actor.canMutateIssues() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.updateIssue(r.Context(), actor, project, parts[0], r)
	case len(parts) == 2 && parts[1] == "values" && r.Method == http.MethodPatch:
		if !actor.canMutateIssues() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.setIssueValue(r.Context(), actor, project, parts[0], r)
	case len(parts) == 2 && parts[1] == "feed" && r.Method == http.MethodGet:
		return api.listFeed(r.Context(), actor, project, parts[0], r)
	case len(parts) == 2 && parts[1] == "subscriptions" && r.Method == http.MethodGet:
		return api.listSubscriptions(r.Context(), actor, project, parts[0])
	case len(parts) == 2 && parts[1] == "subscription" && r.Method == http.MethodPost:
		return api.watchIssue(r.Context(), actor, project, parts[0])
	case len(parts) == 2 && parts[1] == "subscription" && r.Method == http.MethodDelete:
		return api.unwatchIssue(r.Context(), actor, project, parts[0])
	case len(parts) == 2 && parts[1] == "comments" && r.Method == http.MethodPost:
		return api.createComment(r.Context(), actor, project, parts[0], r)
	case len(parts) == 3 && parts[1] == "comments" && r.Method == http.MethodPatch:
		return api.updateComment(r.Context(), actor, project, parts[0], parts[2], r)
	case len(parts) == 3 && parts[1] == "comments" && r.Method == http.MethodDelete:
		return api.deleteComment(r.Context(), actor, project, parts[0], parts[2])
	case len(parts) == 2 && parts[1] == "relationships" && r.Method == http.MethodGet:
		return api.listRelationships(r.Context(), actor, project, parts[0])
	case len(parts) == 2 && parts[1] == "relationships" && r.Method == http.MethodPost:
		if !actor.canMutateIssues() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.createRelationship(r.Context(), actor, project, parts[0], r)
	case len(parts) == 3 && parts[1] == "relationships" && r.Method == http.MethodDelete:
		if !actor.canMutateIssues() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.deleteRelationship(r.Context(), actor, project, parts[0], parts[2])
	default:
		return nil, 0, issueSheetFailure(404, "not_found", "Not found")
	}
}
