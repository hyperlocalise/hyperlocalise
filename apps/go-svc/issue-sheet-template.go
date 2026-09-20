package main

import (
	"context"
	"encoding/json"
	"net/http"
)

type templateConfigBody struct {
	DefaultTemplateKey *string           `json:"defaultTemplateKey"`
	AssigneeByTemplate map[string]string `json:"assigneeByTemplate"`
}

func (api *issueSheetAPI) getTemplateConfig(ctx context.Context, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	var raw []byte
	err := api.pool.QueryRow(ctx, `
        select coalesce(issue_template_config, '{}'::jsonb)
        from projects
        where organization_id = $1 and id = $2`,
		actor.organizationID, project.ID).Scan(&raw)
	if err != nil {
		return nil, 0, err
	}
	config, err := mapTemplateConfig(raw)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"templateConfig": config}, 200, nil
}

func (api *issueSheetAPI) putTemplateConfig(ctx context.Context, actor issueSheetActor, project issueSheetProject, r *http.Request) (any, int, error) {
	var body templateConfigBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	if body.AssigneeByTemplate == nil {
		body.AssigneeByTemplate = map[string]string{}
	}
	stored := map[string]any{
		"assigneeByTemplate": body.AssigneeByTemplate,
	}
	if body.DefaultTemplateKey != nil && *body.DefaultTemplateKey != "" {
		stored["defaultTemplateKey"] = *body.DefaultTemplateKey
	}
	payload, err := json.Marshal(stored)
	if err != nil {
		return nil, 0, err
	}
	_, err = api.pool.Exec(ctx, `
        update projects set issue_template_config = $3::jsonb, updated_at = now()
        where organization_id = $1 and id = $2`,
		actor.organizationID, project.ID, string(payload))
	if err != nil {
		return nil, 0, err
	}
	return api.getTemplateConfig(ctx, actor, project)
}

func mapTemplateConfig(raw []byte) (map[string]any, error) {
	var stored struct {
		DefaultTemplateKey *string           `json:"defaultTemplateKey"`
		AssigneeByTemplate map[string]string `json:"assigneeByTemplate"`
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &stored); err != nil {
			return nil, err
		}
	}
	assignees := []map[string]any{}
	for templateKey, userID := range stored.AssigneeByTemplate {
		assignees = append(assignees, map[string]any{
			"templateKey": templateKey,
			"userId":      userID,
			"assignable":  true,
		})
	}
	var defaultKey any
	if stored.DefaultTemplateKey != nil {
		defaultKey = *stored.DefaultTemplateKey
	}
	return map[string]any{
		"defaultTemplateKey": defaultKey,
		"assigneeByTemplate": assignees,
	}, nil
}
