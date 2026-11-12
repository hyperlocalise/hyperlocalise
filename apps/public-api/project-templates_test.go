package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/projecttemplate"
	"github.com/stretchr/testify/require"
)

// fakeProjectTemplateStore satisfies resourceStore's template and project-create methods.
type fakeProjectTemplateStore struct {
	templateErr   error
	template      projecttemplate.Template
	templateBody  projecttemplate.Body
	fromProjectID *string
	deletedID     string
	projectCreate projectCreate
}

func (s *fakeProjectTemplateStore) listProjectTemplates(context.Context, principal) ([]projecttemplate.Template, error) {
	return []projecttemplate.Template{s.template}, s.templateErr
}

func (s *fakeProjectTemplateStore) getProjectTemplate(_ context.Context, _ principal, id string) (projecttemplate.Template, error) {
	t := s.template
	t.ID = id
	return t, s.templateErr
}

func (s *fakeProjectTemplateStore) createProjectTemplate(_ context.Context, _ principal, body projecttemplate.Body, from *string) (projecttemplate.Template, error) {
	s.templateBody, s.fromProjectID = body, from
	return s.template, s.templateErr
}

func (s *fakeProjectTemplateStore) updateProjectTemplate(_ context.Context, _ principal, _ string, body projecttemplate.Body) (projecttemplate.Template, error) {
	s.templateBody = body
	return s.template, s.templateErr
}

func (s *fakeProjectTemplateStore) deleteProjectTemplate(_ context.Context, _ principal, id string) error {
	s.deletedID = id
	return s.templateErr
}

func (s *fakeProjectTemplateStore) createProject(_ context.Context, _ principal, req projectCreate) (project, error) {
	s.projectCreate = req
	return project{ID: "project_new", Name: req.Name, TargetLocales: []string{}}, s.templateErr
}

var templateManagerScopes = effectivePermissions([]string{"files:read", "files:write"}, "localization_manager")

func TestProjectTemplatePermissions(t *testing.T) {
	require.Contains(t, effectivePermissions([]string{"files:read"}, "member"), "project-templates:read")
	require.Contains(t, templateManagerScopes, "project-templates:write")
	require.NotContains(t, effectivePermissions([]string{"files:read", "files:write"}, "developer"), "project-templates:write")
	require.Contains(t, effectivePermissions([]string{"files:read", "files:write"}, "developer"), "projects:write")
}

func TestProjectTemplateRoutes(t *testing.T) {
	t.Run("lists for readers", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.template = projecttemplate.Template{ID: "tpl-1", Name: "UI strings"}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/project-templates", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"projectTemplates":[{"id":"tpl-1"`)
	})

	t.Run("create needs project-templates:write", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/project-templates", `{"name":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
	})

	t.Run("creates from a project with overrides", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(templateManagerScopes...), store, http.MethodPost, "/v1/project-templates",
			`{"name":"WEEX","fromProjectId":" project_1 ","teamId":null,"targetLocales":["es-419"]}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, "project_1", *store.fromProjectID)
		require.True(t, store.templateBody.TeamID.Set)
		require.Nil(t, store.templateBody.TeamID.Value)
		require.Equal(t, []string{"es-419"}, *store.templateBody.TargetLocales)
	})

	t.Run("rejects unknown fields and empty patches", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(templateManagerScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/project-templates", `{"workflow":"mt"}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		w = sendResource(t, resourcePrincipal(templateManagerScopes...), &fakeResourceStore{}, http.MethodPatch, "/v1/project-templates/tpl-1", `{}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("deletes", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(templateManagerScopes...), store, http.MethodDelete, "/v1/project-templates/tpl-9", "")
		require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
		require.Equal(t, "tpl-9", store.deletedID)
	})

	t.Run("maps store errors", func(t *testing.T) {
		cases := []struct {
			err    error
			status int
			code   string
		}{
			{projecttemplate.ErrNotFound, http.StatusNotFound, "project_template_not_found"},
			{projecttemplate.ErrNameTaken, http.StatusConflict, "project_template_name_taken"},
			{projecttemplate.ValidationError{Field: "name", Message: "bad"}, http.StatusBadRequest, "invalid_body"},
			{nativeproject.ErrGlossarySourceLocale, http.StatusBadRequest, "glossary_source_locale_mismatch"},
			{errProjectLimitReached, http.StatusForbidden, "workspace_resource_limit_reached"},
		}
		for _, tc := range cases {
			store := &fakeResourceStore{}
			store.templateErr = tc.err
			w := sendResource(t, resourcePrincipal(templateManagerScopes...), store, http.MethodGet, "/v1/project-templates/tpl-1", "")
			require.Equal(t, tc.status, w.Code, w.Body.String())
			require.Contains(t, w.Body.String(), tc.code)
		}
	})
}

func TestCreateProjectRoute(t *testing.T) {
	t.Run("creates from a template", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects",
			`{"name":"REQ-1042","templateId":" 3f0c ","targetLocales":["vi"]}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, "3f0c", *store.projectCreate.TemplateID)
		require.Equal(t, []string{"vi"}, *store.projectCreate.TargetLocales)
		require.Contains(t, w.Body.String(), `"project":{"id":"project_new"`)
	})

	t.Run("needs projects:write", func(t *testing.T) {
		translator := effectivePermissions([]string{"files:read", "files:write"}, "translator")
		w := sendResource(t, resourcePrincipal(translator...), &fakeResourceStore{}, http.MethodPost, "/v1/projects", `{"name":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("listing still works", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/projects", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	})
}

func allowingAutumn(t *testing.T) *autumnClient {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, "projects", body["feature_id"])
		_, _ = w.Write([]byte(`{"allowed":true}`))
	}))
	t.Cleanup(srv.Close)
	return &autumnClient{secretKey: "test", baseURL: srv.URL, apiVersion: autumnDefaultAPIVersion, http: srv.Client()}
}

func TestProjectTemplateStore(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.store.autumn = allowingAutumn(t)
	var memoryID, glossaryID string
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO memories (organization_id, created_by_user_id, name, description, source)
		VALUES ($1, $2, 'Shared TM', '', 'native') RETURNING id::text`, f.actor.OrganizationID, f.actor.UserID).Scan(&memoryID))
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO glossaries (organization_id, created_by_user_id, name, source_locale, status, source)
		VALUES ($1, $2, 'Terms', 'en', 'active', 'native') RETURNING id::text`, f.actor.OrganizationID, f.actor.UserID).Scan(&glossaryID))

	// The fixture project starts as a template, then gains the shared resources.
	name := "From fixture"
	glossaries := []string{glossaryID}
	memories := []string{memoryID}
	tmpl, err := f.store.createProjectTemplate(ctx, f.actor, projecttemplate.Body{
		Name: &name, GlossaryIDs: &glossaries, MemoryIDs: &memories,
	}, &f.project)
	require.NoError(t, err)
	require.Equal(t, "en", tmpl.SourceLocale)
	require.Equal(t, []string{"fr", "de"}, tmpl.TargetLocales)

	got, err := f.store.listProjectTemplates(ctx, f.actor)
	require.NoError(t, err)
	require.Len(t, got, 1)

	targets := []string{"es-419", "az"}
	created, err := f.store.createProject(ctx, f.actor, projectCreate{
		ProjectRequest: projecttemplate.ProjectRequest{Name: "REQ-1042 Futures", TargetLocales: &targets},
		TemplateID:     &tmpl.ID,
	})
	require.NoError(t, err)
	require.Equal(t, "native", created.Source)
	require.Equal(t, []string{"es-419", "az"}, created.TargetLocales)

	var attached int
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM project_memories WHERE project_id = $1 AND memory_id = $2) +
		(SELECT count(*) FROM project_glossaries WHERE project_id = $1 AND glossary_id = $3)`,
		created.ID, memoryID, glossaryID).Scan(&attached))
	require.Equal(t, 2, attached)

	events := f.activities(t, "project_created")
	require.Len(t, events, 1)
	require.Equal(t, created.ID, events[0].TargetID)
	require.Equal(t, tmpl.ID, events[0].Payload["templateId"])

	// Without Autumn the workspace may hold one project, as in go-svc.
	f.store.autumn = nil
	_, err = f.store.createProject(ctx, f.actor, projectCreate{ProjectRequest: projecttemplate.ProjectRequest{Name: "Blocked"}, TemplateID: &tmpl.ID})
	require.ErrorIs(t, err, errProjectLimitReached)

	require.NoError(t, f.store.deleteProjectTemplate(ctx, f.actor, tmpl.ID))
	_, err = f.store.getProjectTemplate(ctx, f.actor, tmpl.ID)
	require.ErrorIs(t, err, projecttemplate.ErrNotFound)
}
