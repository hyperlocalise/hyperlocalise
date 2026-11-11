package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type automationFixture struct {
	api      *automationAPI
	scope    *testenv.Scope
	activity *recordingActivityLogPublisher
}

func newAutomationFixture(t *testing.T, role string) *automationFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	activity := &recordingActivityLogPublisher{}
	return &automationFixture{
		api: &automationAPI{
			pool:        scope.Pool,
			membership:  scope.Membership(role),
			activityLog: activity,
		},
		scope:    scope,
		activity: activity,
	}
}

func (f *automationFixture) request(method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestWorkspaceAutomationCRUD(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	create := f.request(http.MethodPost, path, `{
        "name": "Nightly sync",
        "instructions": "Translate new source files.",
        "status": "paused",
        "projectId": "`+f.scope.ProjectID+`",
        "triggerConfig": {"mode": "manual"},
        "repositoryTarget": {"kind": "none"},
        "toolConfig": {},
        "skillIds": ["review-translation-changes"]
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	require.Equal(t, "no-store", create.Header().Get("Cache-Control"))

	var created struct {
		Automation workspaceAutomationRecord      `json:"automation"`
		RecentRuns []workspaceAutomationRunRecord `json:"recentRuns"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	require.Equal(t, "Nightly sync", created.Automation.Name)
	require.Equal(t, "paused", created.Automation.Status)
	require.Equal(t, "agent", created.Automation.Kind)
	require.Equal(t, f.scope.ProjectID, *created.Automation.ProjectID)
	require.Equal(t, []string{"review-translation-changes"}, created.Automation.SkillIDs)
	require.Empty(t, created.RecentRuns)
	require.Equal(t, f.scope.UserID, *created.Automation.AuthorUserID)

	events := f.activity.recorded()
	require.Len(t, events, 1)
	require.Equal(t, "automation_created", events[0].EventType)
	require.Equal(t, created.Automation.ID, events[0].TargetID)

	detail := f.request(http.MethodGet, path+"/"+created.Automation.ID, "")
	require.Equal(t, http.StatusOK, detail.Code, detail.Body.String())
	var got struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(detail.Body.Bytes(), &got))
	require.Equal(t, created.Automation.ID, got.Automation.ID)

	patch := f.request(http.MethodPatch, path+"/"+created.Automation.ID, `{"status":"active","name":"Nightly localisation"}`)
	require.Equal(t, http.StatusOK, patch.Code, patch.Body.String())
	var updated struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(patch.Body.Bytes(), &updated))
	require.Equal(t, "active", updated.Automation.Status)
	require.Equal(t, "Nightly localisation", updated.Automation.Name)

	list := f.request(http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	var listed struct {
		Automations []workspaceAutomationRecord `json:"automations"`
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listed))
	require.Len(t, listed.Automations, 1)

	del := f.request(http.MethodDelete, path+"/"+created.Automation.ID, "")
	require.Equal(t, http.StatusNoContent, del.Code, del.Body.String())
	require.Empty(t, del.Body.String())

	archived := f.request(http.MethodGet, path+"/"+created.Automation.ID, "")
	require.Equal(t, http.StatusOK, archived.Code, archived.Body.String())
	require.NoError(t, json.Unmarshal(archived.Body.Bytes(), &got))
	require.Equal(t, "archived", got.Automation.Status)

	eventTypes := make([]string, 0, len(f.activity.recorded()))
	for _, event := range f.activity.recorded() {
		eventTypes = append(eventTypes, event.EventType)
	}
	require.Contains(t, eventTypes, "automation_enabled")
	require.Contains(t, eventTypes, "automation_deleted")
}

func TestWorkspaceAutomationRejectsUnknownFieldsAndMissingInstructions(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	unknown := f.request(http.MethodPost, path, `{"name":"X","instructions":"Y","extra":true}`)
	require.Equal(t, http.StatusBadRequest, unknown.Code, unknown.Body.String())
	require.Contains(t, unknown.Body.String(), `"invalid_workspace_automation_payload"`)

	missing := f.request(http.MethodPost, path, `{"name":"X"}`)
	require.Equal(t, http.StatusBadRequest, missing.Code, missing.Body.String())
}

func TestWorkspaceAutomationForbiddenForTranslator(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "translator")
	rec := f.request(http.MethodGet, f.scope.OrgPath("/automations"), "")
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"forbidden"`)
}

func TestWorkspaceAutomationLocalizationManagerAllowed(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "localization_manager")
	rec := f.request(http.MethodPost, f.scope.OrgPath("/automations"), `{
        "name": "Manager bot",
        "instructions": "Keep strings in sync."
    }`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
}

func TestWorkspaceAutomationOverwritesClientPipesWorkosUserID(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	create := f.request(http.MethodPost, path, `{
        "name": "Mailchimp import",
        "instructions": "Import campaigns.",
        "toolConfig": {
            "mailchimp": {
                "enabled": true,
                "workosUserId": "user_victim_pipes_owner",
                "campaignIds": ["campaign_1"]
            },
            "hubspot": {
                "enabled": true,
                "workosUserId": "user_other_member"
            }
        }
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())

	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	assertToolConfigWorkosUserID(t, created.Automation.ToolConfig, "mailchimp", f.scope.WorkOSUserID)
	assertToolConfigWorkosUserID(t, created.Automation.ToolConfig, "hubspot", f.scope.WorkOSUserID)
	require.Equal(t, []any{"campaign_1"}, toolConfigField(t, created.Automation.ToolConfig, "mailchimp", "campaignIds"))

	patch := f.request(http.MethodPatch, path+"/"+created.Automation.ID, `{
        "toolConfig": {
            "mailchimp": {
                "enabled": true,
                "workosUserId": "user_victim_pipes_owner",
                "campaignIds": ["campaign_2"]
            }
        }
    }`)
	require.Equal(t, http.StatusOK, patch.Code, patch.Body.String())

	var updated struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(patch.Body.Bytes(), &updated))
	assertToolConfigWorkosUserID(t, updated.Automation.ToolConfig, "mailchimp", f.scope.WorkOSUserID)
	require.Equal(t, []any{"campaign_2"}, toolConfigField(t, updated.Automation.ToolConfig, "mailchimp", "campaignIds"))
}

func assertToolConfigWorkosUserID(t *testing.T, raw json.RawMessage, tool, want string) {
	t.Helper()
	id, ok := toolConfigWorkosUserID(t, raw, tool)
	require.True(t, ok, "expected %s.workosUserId", tool)
	require.Equal(t, want, id)
}

func TestStampedWorkspaceAutomationToolConfigFallsBackToAuthor(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	actor := automationActor{userID: f.scope.UserID, organizationID: f.scope.OrganizationID, role: "admin"}
	stamped, err := f.api.stampedWorkspaceAutomationToolConfig(
		t.Context(),
		actor,
		&f.scope.UserID,
		json.RawMessage(`{"mailchimp":{"enabled":true,"workosUserId":"user_victim_pipes_owner"}}`),
	)
	require.NoError(t, err)
	assertToolConfigWorkosUserID(t, stamped, "mailchimp", f.scope.WorkOSUserID)
}

func TestWorkspaceAutomationUnknownProject(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	rec := f.request(http.MethodPost, f.scope.OrgPath("/automations"), `{
        "name": "Missing project",
        "instructions": "Nope",
        "projectId": "missing_project"
    }`)
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"project_not_found"`)
}

func TestVisualWorkflowCRUD(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/visual-workflows")

	create := f.request(http.MethodPost, path, `{"name":"Publish flow","projectId":"`+f.scope.ProjectID+`"}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())

	var created struct {
		VisualWorkflow visualWorkflowRecord `json:"visualWorkflow"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	require.Equal(t, "Publish flow", created.VisualWorkflow.Name)
	require.Equal(t, "draft", created.VisualWorkflow.Status)
	require.Equal(t, 1, created.VisualWorkflow.Revision)
	require.Equal(t, f.scope.ProjectID, *created.VisualWorkflow.ProjectID)
	require.Contains(t, string(created.VisualWorkflow.Definition), `"schemaVersion":3`)
	require.Contains(t, string(created.VisualWorkflow.Definition), `"trigger.manual"`)
	require.Nil(t, created.VisualWorkflow.PublishedDefinition)

	events := f.activity.recorded()
	require.Len(t, events, 1)
	require.Equal(t, "visual_workflow_created", events[0].EventType)

	definition := `{
        "schemaVersion": 3,
        "name": "Publish flow",
        "nodes": [
            {"id": "trigger", "type": "trigger.manual", "config": {"kind": "trigger.manual"}},
            {"id": "http", "type": "action.http", "config": {"kind": "action.http", "url": "https://example.com"}}
        ],
        "edges": [{
            "id": "e1",
            "source": "trigger",
            "target": "http",
            "kind": "execution",
            "sourcePortId": "success",
            "targetPortId": "input"
        }],
        "editor": {"positions": {"trigger": {"x": 40, "y": 160}, "http": {"x": 240, "y": 160}}}
    }`
	patch := f.request(http.MethodPatch, path+"/"+created.VisualWorkflow.ID, `{
        "expectedRevision": 1,
        "definition": `+definition+`
    }`)
	require.Equal(t, http.StatusOK, patch.Code, patch.Body.String())
	var updated struct {
		VisualWorkflow visualWorkflowRecord `json:"visualWorkflow"`
	}
	require.NoError(t, json.Unmarshal(patch.Body.Bytes(), &updated))
	require.Equal(t, 2, updated.VisualWorkflow.Revision)
	require.Equal(t, 2, updated.VisualWorkflow.DefinitionVersion)
	require.Contains(t, string(updated.VisualWorkflow.Definition), `"action.http"`)

	stale := f.request(http.MethodPatch, path+"/"+created.VisualWorkflow.ID, `{
        "expectedRevision": 1,
        "name": "Stale"
    }`)
	require.Equal(t, http.StatusConflict, stale.Code, stale.Body.String())
	require.Contains(t, stale.Body.String(), `"version_conflict"`)

	list := f.request(http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	var listed struct {
		VisualWorkflows []visualWorkflowRecord `json:"visualWorkflows"`
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listed))
	require.Len(t, listed.VisualWorkflows, 1)

	del := f.request(http.MethodDelete, path+"/"+created.VisualWorkflow.ID, "")
	require.Equal(t, http.StatusNoContent, del.Code, del.Body.String())

	hidden := f.request(http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, hidden.Code, hidden.Body.String())
	require.NoError(t, json.Unmarshal(hidden.Body.Bytes(), &listed))
	require.Empty(t, listed.VisualWorkflows)

	archived := f.request(http.MethodGet, path+"/"+created.VisualWorkflow.ID, "")
	require.Equal(t, http.StatusOK, archived.Code, archived.Body.String())
	require.NoError(t, json.Unmarshal(archived.Body.Bytes(), &created))
	require.Equal(t, "archived", created.VisualWorkflow.Status)

	resurrect := f.request(http.MethodPatch, path+"/"+created.VisualWorkflow.ID, `{
        "expectedRevision": 2,
        "status": "active"
    }`)
	require.Equal(t, http.StatusNotFound, resurrect.Code, resurrect.Body.String())
}

func TestVisualWorkflowActivateRequiresPublishedDefinition(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/visual-workflows")
	create := f.request(http.MethodPost, path, `{"name":"Draft only"}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		VisualWorkflow visualWorkflowRecord `json:"visualWorkflow"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	activate := f.request(http.MethodPatch, path+"/"+created.VisualWorkflow.ID, `{
        "expectedRevision": 1,
        "status": "active"
    }`)
	require.Equal(t, http.StatusBadRequest, activate.Code, activate.Body.String())
	require.Contains(t, activate.Body.String(), `"invalid_definition"`)
}

func TestAutomationAPIUnavailableWithoutPool(t *testing.T) {
	api := &automationAPI{}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/automations", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), `"automations_unavailable"`)
}
