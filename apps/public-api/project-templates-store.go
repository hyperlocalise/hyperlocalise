package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/projecttemplate"
)

// projectLocalFallbackLimit matches go-svc: without Autumn, a workspace may hold one project.
const projectLocalFallbackLimit = 1

var (
	errProjectLimitReached = errors.New("workspace project limit reached")
	errProjectLimitCheck   = errors.New("workspace project limit check failed")
)

// projectCreate is a request to create a native project, optionally from a template.
type projectCreate struct {
	projecttemplate.ProjectRequest
	TemplateID *string
}

func (s *postgresStore) listProjectTemplates(ctx context.Context, actor principal) ([]projecttemplate.Template, error) {
	return projecttemplate.List(ctx, s.pool, actor.OrganizationID)
}

func (s *postgresStore) getProjectTemplate(ctx context.Context, actor principal, templateID string) (projecttemplate.Template, error) {
	return projecttemplate.Get(ctx, s.pool, actor.OrganizationID, templateID)
}

// createProjectTemplate stores a template from body, starting from fromProjectID's settings
// when it is set.
func (s *postgresStore) createProjectTemplate(ctx context.Context, actor principal, body projecttemplate.Body, fromProjectID *string) (projecttemplate.Template, error) {
	base := projecttemplate.Fields{}
	if fromProjectID != nil {
		name := ""
		if body.Name != nil {
			name = *body.Name
		}
		fields, err := projecttemplate.FromProject(ctx, s.pool, actor.OrganizationID, *fromProjectID, name)
		if errors.Is(err, projecttemplate.ErrNotFound) {
			return projecttemplate.Template{}, errProjectNotFound
		}
		if err != nil {
			return projecttemplate.Template{}, err
		}
		base = fields
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return projecttemplate.Template{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	template, err := projecttemplate.Create(ctx, tx, actor.OrganizationID, actor.UserID, body.ApplyTo(base))
	if err != nil {
		return projecttemplate.Template{}, err
	}
	return template, tx.Commit(ctx)
}

func (s *postgresStore) updateProjectTemplate(ctx context.Context, actor principal, templateID string, body projecttemplate.Body) (projecttemplate.Template, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return projecttemplate.Template{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT 1 FROM project_templates WHERE organization_id = $1 AND id::text = $2 FOR UPDATE`,
		actor.OrganizationID, templateID); err != nil {
		return projecttemplate.Template{}, fmt.Errorf("lock project template: %w", err)
	}
	existing, err := projecttemplate.Get(ctx, tx, actor.OrganizationID, templateID)
	if err != nil {
		return projecttemplate.Template{}, err
	}
	template, err := projecttemplate.Update(ctx, tx, actor.OrganizationID, actor.UserID, templateID, body.ApplyTo(existing.Fields()))
	if err != nil {
		return projecttemplate.Template{}, err
	}
	return template, tx.Commit(ctx)
}

func (s *postgresStore) deleteProjectTemplate(ctx context.Context, actor principal, templateID string) error {
	return projecttemplate.Delete(ctx, s.pool, actor.OrganizationID, templateID)
}

// createProject creates a native project as go-svc's project create does: it holds the
// workspace's project-limit lock, checks the limit, and records project_created.
func (s *postgresStore) createProject(ctx context.Context, actor principal, req projectCreate) (project, error) {
	var template *projecttemplate.Template
	if req.TemplateID != nil {
		found, err := projecttemplate.Get(ctx, s.pool, actor.OrganizationID, *req.TemplateID)
		if err != nil {
			return project{}, err
		}
		template = &found
	}
	input, err := projecttemplate.ProjectInput(template, req.ProjectRequest)
	if err != nil {
		return project{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return project{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
		"workspace_resource_limit:"+actor.OrganizationID+":projects"); err != nil {
		return project{}, fmt.Errorf("lock project limit: %w", err)
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*)::int FROM projects WHERE organization_id = $1 AND is_active = true`,
		actor.OrganizationID).Scan(&count); err != nil {
		return project{}, errProjectLimitCheck
	}
	if s.autumn == nil {
		if count+1 > projectLocalFallbackLimit {
			return project{}, errProjectLimitReached
		}
	} else {
		allowed, err := s.autumn.allowsUsage(ctx, actor.OrganizationID, "projects", float64(count+1))
		if err != nil {
			return project{}, errProjectLimitCheck
		}
		if !allowed {
			return project{}, errProjectLimitReached
		}
	}

	projectID, err := nativeproject.Create(ctx, tx, nativeproject.Actor{
		OrganizationID:  actor.OrganizationID,
		UserID:          actor.UserID,
		CanReadAllTeams: actor.Role == "admin" || actor.Role == "localization_manager",
	}, input)
	if err != nil {
		return project{}, err
	}
	payload := map[string]any{"name": input.Name, "resourceId": projectID, "source": "native"}
	if template != nil {
		payload["templateId"] = template.ID
	}
	if err := insertActivity(ctx, tx, actor, activityEvent{
		EventType:  "project_created",
		TargetID:   projectID,
		TargetKind: "project",
		Payload:    payload,
	}); err != nil {
		return project{}, err
	}
	created, err := scanProject(tx.QueryRow(ctx, `SELECT `+projectColumns+` FROM projects p WHERE p.id = $1`, projectID))
	if err != nil {
		return project{}, err
	}
	return created, tx.Commit(ctx)
}
