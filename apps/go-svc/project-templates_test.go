package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type projectTemplateResponse struct {
	ProjectTemplate struct {
		ID                                 string   `json:"id"`
		Name                               string   `json:"name"`
		SourceLocale                       string   `json:"sourceLocale"`
		TargetLocales                      []string `json:"targetLocales"`
		ProjectDescription                 string   `json:"projectDescription"`
		TranslationContext                 string   `json:"translationContext"`
		TeamID                             *string  `json:"teamId"`
		SourceTextEditable                 bool     `json:"sourceTextEditable"`
		ApprovedTranslationsOnSourceChange string   `json:"approvedTranslationsOnSourceChange"`
		MemoryIDs                          []string `json:"memoryIds"`
		GlossaryIDs                        []string `json:"glossaryIds"`
	} `json:"projectTemplate"`
}

func seedTemplateResources(t *testing.T, scope *testenv.Scope, glossaryLocale string) (memoryID, glossaryID string) {
	t.Helper()
	ctx := t.Context()
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		insert into memories (organization_id, created_by_user_id, name, description, source)
		values ($1, $2, 'Shared TM', '', 'native') returning id::text`,
		scope.OrganizationID, scope.UserID).Scan(&memoryID))
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		insert into glossaries (organization_id, created_by_user_id, name, source_locale, status, source)
		values ($1, $2, 'Brand terms', $3, 'active', 'native') returning id::text`,
		scope.OrganizationID, scope.UserID, glossaryLocale).Scan(&glossaryID))
	return memoryID, glossaryID
}

func createTemplate(t *testing.T, api *projectAPI, scope *testenv.Scope, body map[string]any) projectTemplateResponse {
	t.Helper()
	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/project-templates"), body)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var resp projectTemplateResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp
}

func TestProjectTemplateCreateAndApply(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	memoryID, glossaryID := seedTemplateResources(t, scope, "zh-CN")

	tmpl := createTemplate(t, api, scope, map[string]any{
		"name":                               "App UI strings",
		"sourceLocale":                       "zh_CN",
		"targetLocales":                      []string{"en-US", "es-419", "az", "en-us"},
		"projectDescription":                 "Request from the intake form",
		"translationContext":                 "Product UI, formal tone",
		"sourceTextEditable":                 true,
		"approvedTranslationsOnSourceChange": "needs_review",
		"memoryIds":                          []string{memoryID},
		"glossaryIds":                        []string{glossaryID},
	})
	require.Equal(t, "zh-CN", tmpl.ProjectTemplate.SourceLocale)
	require.Equal(t, []string{"en-US", "es-419", "az"}, tmpl.ProjectTemplate.TargetLocales)
	require.Equal(t, []string{memoryID}, tmpl.ProjectTemplate.MemoryIDs)
	require.Equal(t, []string{glossaryID}, tmpl.ProjectTemplate.GlossaryIDs)

	list := projectMutationRequest(api, scope, http.MethodGet, scope.OrgPath("/project-templates"), nil)
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), "App UI strings")

	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name":          "REQ-1042 Futures page",
		"templateId":    tmpl.ProjectTemplate.ID,
		"targetLocales": []string{"en-US", "vi-VN"},
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var project projectResponseBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &project))
	require.Equal(t, "zh-CN", *project.Project.SourceLocale)
	require.Equal(t, []string{"en-US", "vi-VN"}, project.Project.TargetLocales, "request locales override the template")
	require.Equal(t, "Request from the intake form", project.Project.Description)
	require.Equal(t, "Product UI, formal tone", project.Project.TranslationContext)

	ctx := t.Context()
	var editable bool
	var sourceChange string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select source_text_editable, approved_translations_on_source_change from projects where id=$1`,
		project.Project.ID).Scan(&editable, &sourceChange))
	require.True(t, editable)
	require.Equal(t, "needs_review", sourceChange)

	var memories []string
	rows, err := scope.Pool.Query(ctx, `select memory_id::text from project_memories where project_id=$1`, project.Project.ID)
	require.NoError(t, err)
	for rows.Next() {
		var id string
		require.NoError(t, rows.Scan(&id))
		memories = append(memories, id)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{memoryID}, memories, "the template TM replaces the per-project default TM")

	var glossaryCount int
	require.NoError(t, scope.Pool.QueryRow(ctx, `
		select count(*) from project_glossaries where project_id=$1 and glossary_id=$2`,
		project.Project.ID, glossaryID).Scan(&glossaryCount))
	require.Equal(t, 1, glossaryCount)
}

func TestProjectTemplateValidation(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	_, glossaryID := seedTemplateResources(t, scope, "en")

	t.Run("glossary must use the template source locale", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/project-templates"), map[string]any{
			"name": "Mismatch", "sourceLocale": "zh-CN", "targetLocales": []string{"en"}, "glossaryIds": []string{glossaryID},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "glossary_source_locale_mismatch")
	})

	t.Run("source locale cannot be a target", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/project-templates"), map[string]any{
			"name": "Clash", "sourceLocale": "en", "targetLocales": []string{"EN"},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "invalid_project_template")
	})

	t.Run("names are unique per workspace", func(t *testing.T) {
		createTemplate(t, api, scope, map[string]any{"name": "Docs", "sourceLocale": "en", "targetLocales": []string{"fr"}})
		rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/project-templates"), map[string]any{
			"name": "Docs", "sourceLocale": "en", "targetLocales": []string{"de"},
		})
		require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	})

	t.Run("overriding the source locale rechecks glossaries", func(t *testing.T) {
		tmpl := createTemplate(t, api, scope, map[string]any{
			"name": "English glossary", "sourceLocale": "en", "targetLocales": []string{"fr"}, "glossaryIds": []string{glossaryID},
		})
		rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
			"name": "Chinese source", "templateId": tmpl.ProjectTemplate.ID, "sourceLocale": "zh-CN",
		})
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "glossary_source_locale_mismatch")
	})

	t.Run("unknown template", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
			"name": "Nope", "templateId": "00000000-0000-0000-0000-000000000000",
		})
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "project_template_not_found")
	})
}

func TestProjectTemplatePermissions(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "developer"})
	developer := &projectAPI{pool: scope.Pool, membership: scope.Membership("developer")}
	admin := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(developer, scope, http.MethodPost, scope.OrgPath("/project-templates"), map[string]any{
		"name": "Dev template", "sourceLocale": "en", "targetLocales": []string{"fr"},
	})
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	tmpl := createTemplate(t, admin, scope, map[string]any{"name": "Shared", "sourceLocale": "en", "targetLocales": []string{"fr"}})

	list := projectMutationRequest(developer, scope, http.MethodGet, scope.OrgPath("/project-templates"), nil)
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), tmpl.ProjectTemplate.ID)

	created := projectMutationRequest(developer, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name": "From template", "templateId": tmpl.ProjectTemplate.ID,
	})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())

	del := projectMutationRequest(developer, scope, http.MethodDelete, scope.OrgPath("/project-templates/"+tmpl.ProjectTemplate.ID), nil)
	require.Equal(t, http.StatusForbidden, del.Code, del.Body.String())
}

func TestProjectTemplateFromProjectUpdateDelete(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects"), map[string]any{
		"name": "Marketing site", "translationContext": "Formal tone", "sourceLocale": "en", "targetLocales": []string{"fr", "de"},
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var project projectResponseBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &project))

	tmpl := createTemplate(t, api, scope, map[string]any{"name": "From marketing", "fromProjectId": project.Project.ID})
	require.Equal(t, "en", tmpl.ProjectTemplate.SourceLocale)
	require.Equal(t, []string{"fr", "de"}, tmpl.ProjectTemplate.TargetLocales)
	require.Equal(t, "Formal tone", tmpl.ProjectTemplate.TranslationContext)
	require.Len(t, tmpl.ProjectTemplate.MemoryIDs, 1, "the project's TM is copied")
	require.Equal(t, project.Project.TeamID, tmpl.ProjectTemplate.TeamID)

	path := scope.OrgPath("/project-templates/" + tmpl.ProjectTemplate.ID)
	patch := projectMutationRequest(api, scope, http.MethodPatch, path, map[string]any{"targetLocales": []string{"ja"}, "teamId": nil})
	require.Equal(t, http.StatusOK, patch.Code, patch.Body.String())
	var patched projectTemplateResponse
	require.NoError(t, json.Unmarshal(patch.Body.Bytes(), &patched))
	require.Equal(t, []string{"ja"}, patched.ProjectTemplate.TargetLocales)
	require.Nil(t, patched.ProjectTemplate.TeamID)
	require.Equal(t, "Formal tone", patched.ProjectTemplate.TranslationContext, "absent fields keep their value")

	empty := projectMutationRequest(api, scope, http.MethodPatch, path, map[string]any{})
	require.Equal(t, http.StatusBadRequest, empty.Code, empty.Body.String())

	del := projectMutationRequest(api, scope, http.MethodDelete, path, nil)
	require.Equal(t, http.StatusNoContent, del.Code, del.Body.String())
	get := projectMutationRequest(api, scope, http.MethodGet, path, nil)
	require.Equal(t, http.StatusNotFound, get.Code, get.Body.String())
}
