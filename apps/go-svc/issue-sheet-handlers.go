package main

import "net/http"

func (api *issueSheetAPI) listIssuesHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.listIssues(r.Context(), actor, project, r)
}

func (api *issueSheetAPI) createIssueHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canMutateIssues() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.createIssue(r.Context(), actor, project, r)
}

func (api *issueSheetAPI) listAssignableMembersHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.listAssignableMembers(r.Context(), actor, project)
}

func (api *issueSheetAPI) listColumnsHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
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
}

func (api *issueSheetAPI) createColumnHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canManageColumns() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.createColumn(r.Context(), actor, project, r)
}

func (api *issueSheetAPI) reorderColumnsHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canManageColumns() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.reorderColumns(r.Context(), actor, project, r)
}

func (api *issueSheetAPI) patchTwoSegmentHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	first, second := r.PathValue("first"), r.PathValue("second")
	if first == "columns" {
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.updateColumn(r.Context(), actor, project, second, r)
	}
	if second == "values" {
		if !actor.canMutateIssues() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.setIssueValue(r.Context(), actor, project, first, r)
	}
	return nil, 0, errIssueSheetUnmatched
}

func (api *issueSheetAPI) deleteTwoSegmentHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	first, second := r.PathValue("first"), r.PathValue("second")
	if first == "columns" {
		if !actor.canManageColumns() {
			return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
		}
		return api.deleteColumn(r.Context(), actor, project, second)
	}
	if second == "subscription" {
		return api.unwatchIssue(r.Context(), actor, project, first)
	}
	return nil, 0, errIssueSheetUnmatched
}

func (api *issueSheetAPI) getTemplateConfigHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.getTemplateConfig(r.Context(), actor, project)
}

func (api *issueSheetAPI) putTemplateConfigHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canManageColumns() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.putTemplateConfig(r.Context(), actor, project, r)
}

func (api *issueSheetAPI) getIssueHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.getIssue(r.Context(), actor, project, r.PathValue("issueId"))
}

func (api *issueSheetAPI) updateIssueHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canMutateIssues() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.updateIssue(r.Context(), actor, project, r.PathValue("issueId"), r)
}

func (api *issueSheetAPI) listFeedHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.listFeed(r.Context(), actor, project, r.PathValue("issueId"), r)
}

func (api *issueSheetAPI) listSubscriptionsHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.listSubscriptions(r.Context(), actor, project, r.PathValue("issueId"))
}

func (api *issueSheetAPI) watchIssueHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.watchIssue(r.Context(), actor, project, r.PathValue("issueId"))
}

func (api *issueSheetAPI) createCommentHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.createComment(r.Context(), actor, project, r.PathValue("issueId"), r)
}

func (api *issueSheetAPI) updateCommentHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.updateComment(r.Context(), actor, project, r.PathValue("issueId"), r.PathValue("commentId"), r)
}

func (api *issueSheetAPI) deleteCommentHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.deleteComment(r.Context(), actor, project, r.PathValue("issueId"), r.PathValue("commentId"))
}

func (api *issueSheetAPI) listRelationshipsHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	return api.listRelationships(r.Context(), actor, project, r.PathValue("issueId"))
}

func (api *issueSheetAPI) createRelationshipHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canMutateIssues() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.createRelationship(r.Context(), actor, project, r.PathValue("issueId"), r)
}

func (api *issueSheetAPI) deleteRelationshipHandler(r *http.Request, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	if !actor.canMutateIssues() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	return api.deleteRelationship(r.Context(), actor, project, r.PathValue("issueId"), r.PathValue("relationshipId"))
}
