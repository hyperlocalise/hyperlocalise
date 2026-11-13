package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIssueSheetGetTemplateConfig(t *testing.T) {
	actor := issueSheetActor{userID: "user-1", organizationID: issueSheetTestOrgID, role: "admin"}
	project := issueSheetProject{ID: "proj_1", Identifier: "HL"}

	t.Run("empty", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetRow("issue_template_config", []byte(`{}`)))}
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		value, status, err := api.getTemplateConfigHandler(req, actor, project)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, map[string]any{
			"templateConfig": map[string]any{"defaultTemplateKey": nil, "assigneeByTemplate": []map[string]any{}},
		}, value)
	})

	t.Run("assignable", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("issue_template_config", []byte(`{"defaultTemplateKey":"bug","assigneeByTemplate":{"bug":"user-9"}}`)),
			issueSheetRow("select exists", true),
		)}
		value, status, err := api.getTemplateConfig(t.Context(), actor, project)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		config := value.(map[string]any)["templateConfig"].(map[string]any)
		require.Equal(t, "bug", config["defaultTemplateKey"])
		require.Equal(t, []map[string]any{{
			"templateKey": "bug", "userId": "user-9", "assignable": true,
		}}, config["assigneeByTemplate"])
	})

	t.Run("not assignable", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("issue_template_config", []byte(`{"assigneeByTemplate":{"bug":"user-9"}}`)),
			issueSheetRow("select exists", false),
		)}
		value, _, err := api.getTemplateConfig(t.Context(), actor, project)
		require.NoError(t, err)
		assignees := value.(map[string]any)["templateConfig"].(map[string]any)["assigneeByTemplate"].([]map[string]any)
		require.Equal(t, false, assignees[0]["assignable"])
	})

	t.Run("invalid stored json", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetRow("issue_template_config", []byte(`{`)))}
		_, _, err := api.getTemplateConfig(t.Context(), actor, project)
		require.Error(t, err)
	})

	t.Run("read error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetDBStep{kind: "row", sql: "issue_template_config", err: errors.New("db down")})}
		_, _, err := api.getTemplateConfig(t.Context(), actor, project)
		require.EqualError(t, err, "db down")
	})

	t.Run("assignee lookup error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("issue_template_config", []byte(`{"assigneeByTemplate":{"bug":"user-9"}}`)),
			issueSheetDBStep{kind: "row", sql: "select exists", err: errors.New("db down")},
		)}
		_, _, err := api.getTemplateConfig(t.Context(), actor, project)
		require.EqualError(t, err, "db down")
	})
}

func TestIssueSheetPutTemplateConfig(t *testing.T) {
	actor := issueSheetActor{userID: "user-1", organizationID: issueSheetTestOrgID, role: "admin"}
	project := issueSheetProject{ID: "proj_1", Identifier: "HL"}
	stored := `{"assigneeByTemplate":{"bug":"user-9"},"defaultTemplateKey":"bug"}`

	t.Run("saves config", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select exists", true),
			issueSheetDBStep{
				kind: "exec", sql: "update projects set issue_template_config",
				args: []any{issueSheetTestOrgID, "proj_1", stored}, affected: 1,
			},
			issueSheetRow("issue_template_config", []byte(stored)),
			issueSheetRow("select exists", true),
		)}
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"defaultTemplateKey":"bug","assigneeByTemplate":{"bug":"user-9"}}`))
		value, status, err := api.putTemplateConfigHandler(req, actor, project)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, "bug", value.(map[string]any)["templateConfig"].(map[string]any)["defaultTemplateKey"])
	})

	t.Run("empty assignee map", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetDBStep{
				kind: "exec", sql: "update projects set issue_template_config",
				args: []any{issueSheetTestOrgID, "proj_1", `{"assigneeByTemplate":{}}`}, affected: 1,
			},
			issueSheetRow("issue_template_config", []byte(`{"assigneeByTemplate":{}}`)),
		)}
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"defaultTemplateKey":""}`))
		value, status, err := api.putTemplateConfig(t.Context(), actor, project, req)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		require.Nil(t, value.(map[string]any)["templateConfig"].(map[string]any)["defaultTemplateKey"])
	})

	t.Run("assignee not assignable", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetRow("select exists", false))}
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"assigneeByTemplate":{"bug":"user-9"}}`))
		_, _, err := api.putTemplateConfig(t.Context(), actor, project, req)
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, "assignee_not_assignable", failure.code)
	})

	t.Run("invalid payload", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t)}
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{`))
		_, _, err := api.putTemplateConfig(t.Context(), actor, project, req)
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, http.StatusBadRequest, failure.status)
	})

	t.Run("member forbidden", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t)}
		member := actor
		member.role = "member"
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{}`))
		_, _, err := api.putTemplateConfigHandler(req, member, project)
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, http.StatusForbidden, failure.status)
	})

	t.Run("update error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetDBStep{
			kind: "exec", sql: "update projects set issue_template_config", err: errors.New("db down"),
		})}
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{}`))
		_, _, err := api.putTemplateConfig(t.Context(), actor, project, req)
		require.EqualError(t, err, "db down")
	})
}
