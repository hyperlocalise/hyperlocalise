package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/customfield"
	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/projecttemplate"
)

// writeProjectTemplateError maps template and project creation errors to API errors, with the
// same codes go-svc returns to the web app.
func writeProjectTemplateError(w http.ResponseWriter, err error, operation string) {
	var validation projecttemplate.ValidationError
	var fieldValidation customfield.ValidationError
	switch {
	case errors.As(err, &validation):
		writeError(w, http.StatusBadRequest, "invalid_body", validation.Message)
	case errors.As(err, &fieldValidation):
		writeError(w, http.StatusBadRequest, "invalid_body", fieldValidation.Error())
	case errors.Is(err, projecttemplate.ErrNotFound):
		writeError(w, http.StatusNotFound, "project_template_not_found", "Project template not found")
	case errors.Is(err, projecttemplate.ErrNameTaken):
		writeError(w, http.StatusConflict, "project_template_name_taken", "A project template with this name already exists")
	case errors.Is(err, nativeproject.ErrTeamNotFound):
		writeError(w, http.StatusBadRequest, "invalid_team", "The team does not exist, or the key owner is not a member")
	case errors.Is(err, nativeproject.ErrMemoryNotFound):
		writeError(w, http.StatusBadRequest, "translation_memory_not_found", "A translation memory does not exist")
	case errors.Is(err, nativeproject.ErrGlossaryNotFound):
		writeError(w, http.StatusBadRequest, "glossary_not_found", "A glossary does not exist")
	case errors.Is(err, nativeproject.ErrGlossarySourceLocale):
		writeError(w, http.StatusBadRequest, "glossary_source_locale_mismatch", "Every glossary must use the project's source locale")
	case errors.Is(err, nativeproject.ErrIdentifierExhausted):
		writeError(w, http.StatusServiceUnavailable, "project_identifier_exhausted", "Could not allocate a unique project identifier")
	case errors.Is(err, errProjectLimitReached):
		writeError(w, http.StatusForbidden, "workspace_resource_limit_reached", "The workspace has reached its project limit")
	case errors.Is(err, errProjectLimitCheck):
		slog.Error(operation+" failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "workspace_resource_limit_check_failed", "Could not check the workspace's project limit")
	default:
		writeStoreError(w, err, operation)
	}
}

// projectTemplates lists templates (GET) or creates one (POST).
func (s apiServer) projectTemplates(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	if r.Method == http.MethodPost {
		s.createProjectTemplate(w, r)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "project-templates:read")
	if !ok {
		return
	}
	templates, err := s.store.listProjectTemplates(r.Context(), p)
	if err != nil {
		writeProjectTemplateError(w, err, "list project templates")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		ProjectTemplates []projecttemplate.Template `json:"projectTemplates"`
	}{templates})
}

func (s apiServer) createProjectTemplate(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticateWithStore(w, r, "project-templates:write")
	if !ok {
		return
	}
	var body struct {
		projecttemplate.Body
		FromProjectID *string `json:"fromProjectId"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	var from *string
	if body.FromProjectID != nil {
		trimmed := strings.TrimSpace(*body.FromProjectID)
		if trimmed == "" || len(trimmed) > 128 {
			writeError(w, http.StatusBadRequest, "invalid_body", "fromProjectId must be a project ID")
			return
		}
		from = &trimmed
	}
	template, err := s.store.createProjectTemplate(r.Context(), p, body.Body, from)
	if err != nil {
		writeProjectTemplateError(w, err, "create project template")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		ProjectTemplate projecttemplate.Template `json:"projectTemplate"`
	}{template})
}

// projectTemplate reads (GET), patches (PATCH), or deletes (DELETE) one template.
func (s apiServer) projectTemplate(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPatch, http.MethodDelete) {
		return
	}
	templateID, ok := pathID(w, r, "templateId")
	if !ok {
		return
	}
	permission := "project-templates:write"
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		permission = "project-templates:read"
	}
	p, ok := s.authenticateWithStore(w, r, permission)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var body projecttemplate.Body
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if body.Empty() {
			writeError(w, http.StatusBadRequest, "invalid_body", "Provide at least one template field")
			return
		}
		template, err := s.store.updateProjectTemplate(r.Context(), p, templateID, body)
		if err != nil {
			writeProjectTemplateError(w, err, "update project template")
			return
		}
		writeJSON(w, http.StatusOK, struct {
			ProjectTemplate projecttemplate.Template `json:"projectTemplate"`
		}{template})
	case http.MethodDelete:
		if err := s.store.deleteProjectTemplate(r.Context(), p, templateID); err != nil {
			writeProjectTemplateError(w, err, "delete project template")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		template, err := s.store.getProjectTemplate(r.Context(), p, templateID)
		if err != nil {
			writeProjectTemplateError(w, err, "get project template")
			return
		}
		writeJSON(w, http.StatusOK, struct {
			ProjectTemplate projecttemplate.Template `json:"projectTemplate"`
		}{template})
	}
}

// createProject creates a native project, optionally from a template.
func (s apiServer) createProject(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticateWithStore(w, r, "projects:write")
	if !ok {
		return
	}
	var body struct {
		projecttemplate.ProjectRequest
		TemplateID   *string                    `json:"templateId"`
		CustomFields map[string]json.RawMessage `json:"customFields"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	req := projectCreate{ProjectRequest: body.ProjectRequest, CustomFields: body.CustomFields}
	if body.TemplateID != nil {
		trimmed := strings.TrimSpace(*body.TemplateID)
		req.TemplateID = &trimmed
	}
	created, err := s.store.createProject(r.Context(), p, req)
	if err != nil {
		writeProjectTemplateError(w, err, "create project")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Project project `json:"project"`
	}{created})
}
