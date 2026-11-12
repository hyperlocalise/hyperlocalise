package main

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/projecttemplate"
)

// Project templates are saved starting points for native projects. Every workspace member can
// list them to pick one in the New project dialog; admins and localization managers manage them.

func (api *projectAPI) registerTemplates(route func(string, func(*http.Request, projectActor) (any, int, error))) {
	templates := orgRoutePrefix + "/project-templates"
	template := templates + "/{templateId}"
	route("GET "+templates, bindActor(api, (*projectAPI).listTemplatesHandler))
	route("POST "+templates, bindActor(api, (*projectAPI).createTemplateHandler))
	route("GET "+template, bindActor(api, (*projectAPI).getTemplateHandler))
	route("PATCH "+template, bindActor(api, (*projectAPI).updateTemplateHandler))
	route("DELETE "+template, bindActor(api, (*projectAPI).deleteTemplateHandler))
}

func (a projectActor) canManageProjectTemplates() bool {
	return a.canReadAllTeams()
}

// projectTemplateFailure maps template and native project errors to API errors.
func projectTemplateFailure(err error) error {
	var validation projecttemplate.ValidationError
	switch {
	case errors.As(err, &validation):
		return projectFailureDetails(http.StatusBadRequest, "invalid_project_template", validation.Message,
			map[string]any{"field": validation.Field})
	case errors.Is(err, projecttemplate.ErrNotFound):
		return projectFailure(http.StatusNotFound, "project_template_not_found", "Project template not found")
	case errors.Is(err, projecttemplate.ErrNameTaken):
		return projectFailure(http.StatusConflict, "project_template_name_taken", "A project template with this name already exists")
	}
	return nativeProjectFailure(err)
}

// nativeProjectFailure maps nativeproject errors to API errors and passes others through.
func nativeProjectFailure(err error) error {
	switch {
	case errors.Is(err, nativeproject.ErrTeamNotFound):
		return invalidProjectTeam()
	case errors.Is(err, nativeproject.ErrMemoryNotFound):
		return projectFailure(http.StatusBadRequest, "translation_memory_not_found", "A translation memory in the template no longer exists")
	case errors.Is(err, nativeproject.ErrGlossaryNotFound):
		return projectFailure(http.StatusBadRequest, "glossary_not_found", "A glossary in the template no longer exists")
	case errors.Is(err, nativeproject.ErrGlossarySourceLocale):
		return projectFailure(http.StatusBadRequest, "glossary_source_locale_mismatch", "Every glossary must use the project's source locale")
	case errors.Is(err, nativeproject.ErrIdentifierExhausted):
		return projectFailure(http.StatusServiceUnavailable, "project_identifier_exhausted", "Could not allocate a unique project identifier")
	}
	return err
}

func (api *projectAPI) listTemplatesHandler(r *http.Request, actor projectActor) (any, int, error) {
	templates, err := projecttemplate.List(r.Context(), api.pool, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"projectTemplates": templates}, http.StatusOK, nil
}

func (api *projectAPI) getTemplateHandler(r *http.Request, actor projectActor) (any, int, error) {
	template, err := projecttemplate.Get(r.Context(), api.pool, actor.organizationID, r.PathValue("templateId"))
	if err != nil {
		return nil, 0, projectTemplateFailure(err)
	}
	return map[string]any{"projectTemplate": template}, http.StatusOK, nil
}

// createTemplateBody is a template body, or with fromProjectId, a project to copy settings from.
// Body fields set alongside fromProjectId override the copied values.
type createTemplateBody struct {
	projecttemplate.Body
	FromProjectID *string `json:"fromProjectId"`
}

func (api *projectAPI) createTemplateHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canManageProjectTemplates() {
		return nil, 0, projectForbidden()
	}
	var body createTemplateBody
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	base := projecttemplate.Fields{}
	if body.FromProjectID != nil {
		name := ""
		if body.Name != nil {
			name = *body.Name
		}
		fields, err := projecttemplate.FromProject(ctx, api.pool, actor.organizationID, strings.TrimSpace(*body.FromProjectID), name)
		if errors.Is(err, projecttemplate.ErrNotFound) {
			return nil, 0, projectNotFound()
		}
		if err != nil {
			return nil, 0, err
		}
		base = fields
	}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	template, err := projecttemplate.Create(ctx, tx, actor.organizationID, actor.userID, body.ApplyTo(base))
	if err != nil {
		return nil, 0, projectTemplateFailure(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return map[string]any{"projectTemplate": template}, http.StatusCreated, nil
}

func (api *projectAPI) updateTemplateHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canManageProjectTemplates() {
		return nil, 0, projectForbidden()
	}
	var body projecttemplate.Body
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	if body.Empty() {
		return nil, 0, invalidProjectPayload()
	}
	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	templateID := r.PathValue("templateId")
	if _, err := tx.Exec(ctx, `select 1 from project_templates where organization_id=$1 and id::text=$2 for update`,
		actor.organizationID, templateID); err != nil {
		return nil, 0, err
	}
	existing, err := projecttemplate.Get(ctx, tx, actor.organizationID, templateID)
	if err != nil {
		return nil, 0, projectTemplateFailure(err)
	}
	template, err := projecttemplate.Update(ctx, tx, actor.organizationID, actor.userID, templateID, body.ApplyTo(existing.Fields()))
	if err != nil {
		return nil, 0, projectTemplateFailure(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return map[string]any{"projectTemplate": template}, http.StatusOK, nil
}

func (api *projectAPI) deleteTemplateHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canManageProjectTemplates() {
		return nil, 0, projectForbidden()
	}
	templateID := r.PathValue("templateId")
	if err := projecttemplate.Delete(r.Context(), api.pool, actor.organizationID, templateID); err != nil {
		return nil, 0, projectTemplateFailure(err)
	}
	return nil, http.StatusNoContent, nil
}

func resolveProjectTeam(ctx context.Context, tx dictionaryDB, actor projectActor, teamID *string) (string, error) {
	resolved, err := nativeproject.ResolveTeam(ctx, tx, nativeproject.Actor{
		OrganizationID:  actor.organizationID,
		UserID:          actor.userID,
		CanReadAllTeams: actor.canReadAllTeams(),
	}, teamID)
	if err != nil {
		return "", nativeProjectFailure(err)
	}
	return resolved, nil
}
