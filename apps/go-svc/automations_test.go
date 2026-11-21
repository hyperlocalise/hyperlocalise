package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
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

func TestWorkspaceAutomationListIncludesLatestAgentRun(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	create := f.request(http.MethodPost, path, `{
        "name": "Daily localisation review",
        "instructions": "Review localisation."
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into workspace_automation_runs (
            automation_id, organization_id, trigger_source, status, error, completed_at, created_at
        ) values
            ($1, $2, 'scheduled', 'succeeded', null, '2026-06-01T11:00:00Z', '2026-06-01T11:00:00Z'),
            ($1, $2, 'scheduled', 'failed', '{"message":"Slack channel missing"}', '2026-06-01T12:00:00Z', '2026-06-01T12:00:00Z')`,
		created.Automation.ID, f.scope.OrganizationID)
	require.NoError(t, err)

	list := f.request(http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	var listed struct {
		Automations []workspaceAutomationRecord `json:"automations"`
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listed))
	require.Len(t, listed.Automations, 1)
	require.Equal(t, created.Automation.ID, listed.Automations[0].ID)
	require.NotNil(t, listed.Automations[0].LastRunStatus)
	require.Equal(t, "failed", *listed.Automations[0].LastRunStatus)
	require.NotNil(t, listed.Automations[0].LastRunError)
	require.Equal(t, "Slack channel missing", *listed.Automations[0].LastRunError)
	require.NotNil(t, listed.Automations[0].LastRunAt)
	require.Equal(t, "2026-06-01T12:00:00.000Z", *listed.Automations[0].LastRunAt)
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

func TestWorkspaceAutomationRejectsOversizedAndInvalidFields(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	tooLongName := f.request(http.MethodPost, path, `{
        "name": "`+strings.Repeat("n", automationNameMaxChars+1)+`",
        "instructions": "Keep strings in sync."
    }`)
	require.Equal(t, http.StatusBadRequest, tooLongName.Code, tooLongName.Body.String())
	require.Contains(t, tooLongName.Body.String(), `"invalid_workspace_automation_payload"`)

	tooLongInstructions := f.request(http.MethodPost, path, `{
        "name": "Nightly",
        "instructions": "`+strings.Repeat("x", automationInstructionsMax+1)+`"
    }`)
	require.Equal(t, http.StatusBadRequest, tooLongInstructions.Code, tooLongInstructions.Body.String())

	tooManySkills := `{"name":"Skills","skillIds":[`
	for i := 0; i < automationSkillMaxCount+1; i++ {
		if i > 0 {
			tooManySkills += ","
		}
		tooManySkills += `"skill-` + itoa(i) + `"`
	}
	tooManySkills += `]}`
	overflow := f.request(http.MethodPost, path, tooManySkills)
	require.Equal(t, http.StatusBadRequest, overflow.Code, overflow.Body.String())

	longSkill := f.request(http.MethodPost, path, `{
        "name": "Skill",
        "skillIds": ["`+strings.Repeat("s", automationSkillIDMax+1)+`"]
    }`)
	require.Equal(t, http.StatusBadRequest, longSkill.Code, longSkill.Body.String())

	blankSkill := f.request(http.MethodPost, path, `{"name":"Skill","skillIds":["  "]}`)
	require.Equal(t, http.StatusBadRequest, blankSkill.Code, blankSkill.Body.String())
}

func TestWorkspaceAutomationDedupesSkillIDsAndAllowsSkillOnlyCreate(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	create := f.request(http.MethodPost, path, `{
        "name": "Skill bot",
        "skillIds": ["review-translation-changes", " review-translation-changes ", "qa-review"]
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	require.Equal(t, []string{"review-translation-changes", "qa-review"}, created.Automation.SkillIDs)
	require.Equal(t, "", created.Automation.Instructions)
}

func TestWorkspaceAutomationContentSyncRequiresProjectAndSyncConfig(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	missingProject := f.request(http.MethodPost, path, `{
        "name": "Sync",
        "kind": "content_sync",
        "syncConfig": {"provider": "github"}
    }`)
	require.Equal(t, http.StatusBadRequest, missingProject.Code, missingProject.Body.String())
	require.Contains(t, missingProject.Body.String(), `"project_required"`)

	missingSync := f.request(http.MethodPost, path, `{
        "name": "Sync",
        "kind": "content_sync",
        "projectId": "`+f.scope.ProjectID+`"
    }`)
	require.Equal(t, http.StatusBadRequest, missingSync.Code, missingSync.Body.String())
	require.Contains(t, missingSync.Body.String(), `"invalid_workspace_automation_payload"`)

	created := f.request(http.MethodPost, path, `{
        "name": "Sync",
        "kind": "content_sync",
        "projectId": "`+f.scope.ProjectID+`",
        "syncConfig": {"provider": "github"}
    }`)
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var body struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &body))
	require.Equal(t, "content_sync", body.Automation.Kind)
	require.Equal(t, "", body.Automation.Instructions)
	require.Empty(t, body.Automation.SkillIDs)
}

func TestParseBoundedIntRejectsOutOfRange(t *testing.T) {
	n, err := parseBoundedInt("50", 1, 100)
	require.NoError(t, err)
	require.Equal(t, 50, n)

	_, err = parseBoundedInt("0", 1, 100)
	require.Error(t, err)
	_, err = parseBoundedInt("101", 1, 100)
	require.Error(t, err)
	_, err = parseBoundedInt("", 0, 10)
	require.Error(t, err)
	_, err = parseBoundedInt("-1", 0, 10)
	require.Error(t, err)
	_, err = parseBoundedInt("1a", 0, 10)
	require.Error(t, err)
}

func TestWorkspaceAutomationListRejectsInvalidQuery(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")

	for _, query := range []string{
		"?limit=0",
		"?limit=101",
		"?limit=1&limit=2",
		"?offset=-1",
		"?status=running",
		"?status=active&status=paused",
	} {
		rec := f.request(http.MethodGet, path+query, "")
		require.Equal(t, http.StatusBadRequest, rec.Code, query+" "+rec.Body.String())
		require.Contains(t, rec.Body.String(), `"invalid_query_params"`)
	}
}

func TestWorkspaceAutomationReassignsOwnerToOrgMember(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")
	create := f.request(http.MethodPost, path, `{
        "name": "Owned bot",
        "instructions": "Keep strings in sync."
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	otherUserID := uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into users (id, workos_user_id, email)
        values ($1, $2, $3)`,
		otherUserID, "user_"+otherUserID, otherUserID+"@example.com")
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = f.scope.Pool.Exec(context.Background(), `delete from users where id=$1`, otherUserID)
	})
	_, err = f.scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, 'member')`,
		f.scope.OrganizationID, otherUserID, "om_"+otherUserID)
	require.NoError(t, err)

	reassigned := f.request(http.MethodPatch, path+"/"+created.Automation.ID, `{"authorUserId":"`+otherUserID+`"}`)
	require.Equal(t, http.StatusOK, reassigned.Code, reassigned.Body.String())
	var updated struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(reassigned.Body.Bytes(), &updated))
	require.Equal(t, otherUserID, *updated.Automation.AuthorUserID)

	unknown := f.request(http.MethodPatch, path+"/"+created.Automation.ID, `{"authorUserId":"`+uuid.NewString()+`"}`)
	require.Equal(t, http.StatusBadRequest, unknown.Code, unknown.Body.String())
	require.Contains(t, unknown.Body.String(), `"invalid_workspace_automation_payload"`)

	invalidID := f.request(http.MethodPatch, path+"/"+created.Automation.ID, `{"authorUserId":"not-a-uuid"}`)
	require.Equal(t, http.StatusBadRequest, invalidID.Code, invalidID.Body.String())
}

func TestWorkspaceAutomationPatchRequiresInstructionsOrSkill(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")
	create := f.request(http.MethodPost, path, `{
        "name": "Owned bot",
        "instructions": "Keep strings in sync."
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	cleared := f.request(http.MethodPatch, path+"/"+created.Automation.ID, `{"instructions":""}`)
	require.Equal(t, http.StatusBadRequest, cleared.Code, cleared.Body.String())
	require.Contains(t, cleared.Body.String(), `"instructions_or_skill_required"`)
}

func TestWorkspaceAutomationListsAndForwardsRuns(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")
	create := f.request(http.MethodPost, path, `{
        "name": "Manual review",
        "instructions": "Review localisation.",
        "status": "active",
        "triggerConfig": {"mode": "manual"}
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	empty := f.request(http.MethodGet, path+"/"+created.Automation.ID+"/runs", "")
	require.Equal(t, http.StatusOK, empty.Code, empty.Body.String())
	var listed struct {
		AutomationRuns []workspaceAutomationRunRecord `json:"automationRuns"`
	}
	require.NoError(t, json.Unmarshal(empty.Body.Bytes(), &listed))
	require.Empty(t, listed.AutomationRuns)

	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into workspace_automation_runs (
            automation_id, organization_id, trigger_source, status, created_at
        ) values
            ($1, $2, 'manual', 'queued', '2026-06-01T12:00:00Z'),
            ($1, $2, 'scheduled', 'succeeded', '2026-06-01T11:00:00Z')`,
		created.Automation.ID, f.scope.OrganizationID)
	require.NoError(t, err)

	runs := f.request(http.MethodGet, path+"/"+created.Automation.ID+"/runs?limit=1", "")
	require.Equal(t, http.StatusOK, runs.Code, runs.Body.String())
	require.NoError(t, json.Unmarshal(runs.Body.Bytes(), &listed))
	require.Len(t, listed.AutomationRuns, 1)
	require.Equal(t, "manual", listed.AutomationRuns[0].TriggerSource)

	missing := f.request(http.MethodPost, path+"/"+uuid.NewString()+"/runs", `{"idempotencyKey":"run-1"}`)
	require.Equal(t, http.StatusNotFound, missing.Code, missing.Body.String())
	require.Contains(t, missing.Body.String(), `"workspace_automation_not_found"`)

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	unconfigured := f.request(http.MethodPost, path+"/"+created.Automation.ID+"/runs", `{"idempotencyKey":"run-1"}`)
	require.Equal(t, http.StatusServiceUnavailable, unconfigured.Code, unconfigured.Body.String())
	require.Contains(t, unconfigured.Body.String(), `"automations_workflow_unconfigured"`)

	var gotAction string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		require.NoError(t, json.Unmarshal(body, &decoded))
		gotAction, _ = decoded["action"].(string)
		payload, _ := decoded["payload"].(map[string]any)
		require.Equal(t, created.Automation.ID, payload["automationId"])
		require.Equal(t, f.scope.UserID, payload["userId"])
		require.Equal(t, "run-1", payload["idempotencyKey"])
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"result":{"automationRun":{"id":"run-1","status":"queued"},"dispatch":{"runId":"run-1","outcome":"enqueued"}}}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	queued := f.request(http.MethodPost, path+"/"+created.Automation.ID+"/runs", `{"idempotencyKey":"run-1"}`)
	require.Equal(t, http.StatusAccepted, queued.Code, queued.Body.String())
	require.Equal(t, "run_workspace_automation", gotAction)
	require.Contains(t, queued.Body.String(), `"run-1"`)
}

func TestVisualWorkflowPublishTestAndRuns(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/visual-workflows")
	create := f.request(http.MethodPost, path, `{"name":"Publish flow"}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		VisualWorkflow visualWorkflowRecord `json:"visualWorkflow"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	empty := f.request(http.MethodGet, path+"/"+created.VisualWorkflow.ID+"/runs", "")
	require.Equal(t, http.StatusOK, empty.Code, empty.Body.String())
	var listed struct {
		Runs []visualWorkflowRunRecord `json:"runs"`
	}
	require.NoError(t, json.Unmarshal(empty.Body.Bytes(), &listed))
	require.Empty(t, listed.Runs)

	runID := uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into visual_workflow_runs (
            id, organization_id, visual_workflow_id, trigger_source, mode, status
        ) values ($1, $2, $3, 'manual', 'live', 'queued')`,
		runID, f.scope.OrganizationID, created.VisualWorkflow.ID)
	require.NoError(t, err)

	runs := f.request(http.MethodGet, path+"/"+created.VisualWorkflow.ID+"/runs", "")
	require.Equal(t, http.StatusOK, runs.Code, runs.Body.String())
	require.NoError(t, json.Unmarshal(runs.Body.Bytes(), &listed))
	require.Len(t, listed.Runs, 1)
	require.Equal(t, runID, listed.Runs[0].ID)
	require.Equal(t, "live", listed.Runs[0].Mode)

	detail := f.request(http.MethodGet, path+"/"+created.VisualWorkflow.ID+"/runs/"+runID, "")
	require.Equal(t, http.StatusOK, detail.Code, detail.Body.String())
	var got struct {
		Run visualWorkflowRunRecord `json:"run"`
	}
	require.NoError(t, json.Unmarshal(detail.Body.Bytes(), &got))
	require.Equal(t, runID, got.Run.ID)

	missingRun := f.request(http.MethodGet, path+"/"+created.VisualWorkflow.ID+"/runs/"+uuid.NewString(), "")
	require.Equal(t, http.StatusNotFound, missingRun.Code, missingRun.Body.String())
	require.Contains(t, missingRun.Body.String(), `"visual_workflow_run_not_found"`)

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	unconfigured := f.request(http.MethodPost, path+"/"+created.VisualWorkflow.ID+"/publish", `{"expectedRevision":1}`)
	require.Equal(t, http.StatusServiceUnavailable, unconfigured.Code, unconfigured.Body.String())

	var gotAction string
	var gotPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		require.NoError(t, json.Unmarshal(body, &decoded))
		gotAction, _ = decoded["action"].(string)
		gotPayload, _ = decoded["payload"].(map[string]any)
		w.Header().Set("Content-Type", "application/json")
		if gotAction == "publish_visual_workflow" {
			_, _ = w.Write([]byte(`{"result":{"visualWorkflow":{"id":"` + created.VisualWorkflow.ID + `","status":"active","revision":2}}}`))
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"result":{"run":{"id":"run-2","status":"queued"},"dispatch":{"runId":"run-2","enqueued":true}}}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)

	publish := f.request(http.MethodPost, path+"/"+created.VisualWorkflow.ID+"/publish", `{"expectedRevision":1}`)
	require.Equal(t, http.StatusOK, publish.Code, publish.Body.String())
	require.Equal(t, "publish_visual_workflow", gotAction)
	require.Equal(t, float64(1), gotPayload["expectedRevision"])

	testRun := f.request(http.MethodPost, path+"/"+created.VisualWorkflow.ID+"/test", `{
        "idempotencyKey":"test-1",
        "definition":{"schemaVersion":3,"name":"Publish flow","nodes":[],"edges":[],"editor":{"positions":{}}},
        "mode":"live"
    }`)
	require.Equal(t, http.StatusAccepted, testRun.Code, testRun.Body.String())
	require.Equal(t, "test_visual_workflow", gotAction)
	require.Equal(t, "live", gotPayload["mode"])

	live := f.request(http.MethodPost, path+"/"+created.VisualWorkflow.ID+"/runs", `{"idempotencyKey":"live-1"}`)
	require.Equal(t, http.StatusAccepted, live.Code, live.Body.String())
	require.Equal(t, "run_visual_workflow", gotAction)
}

func TestVisualWorkflowRunsRejectInvalidQueryAndArchived(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/visual-workflows")
	create := f.request(http.MethodPost, path, `{"name":"Archived flow"}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		VisualWorkflow visualWorkflowRecord `json:"visualWorkflow"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	invalidID := f.request(http.MethodGet, path+"/not-a-uuid/runs", "")
	require.Equal(t, http.StatusNotFound, invalidID.Code, invalidID.Body.String())
	require.Contains(t, invalidID.Body.String(), `"visual_workflow_not_found"`)

	for _, query := range []string{"?limit=0", "?limit=101", "?limit=1&limit=2", "?offset=-1"} {
		rec := f.request(http.MethodGet, path+"/"+created.VisualWorkflow.ID+"/runs"+query, "")
		require.Equal(t, http.StatusBadRequest, rec.Code, query+" "+rec.Body.String())
		require.Contains(t, rec.Body.String(), `"invalid_query_params"`)
	}

	del := f.request(http.MethodDelete, path+"/"+created.VisualWorkflow.ID, "")
	require.Equal(t, http.StatusNoContent, del.Code, del.Body.String())

	archivedTest := f.request(http.MethodPost, path+"/"+created.VisualWorkflow.ID+"/test", `{
        "idempotencyKey":"test-archived",
        "definition":{"schemaVersion":3,"name":"Archived flow","nodes":[],"edges":[],"editor":{"positions":{}}},
        "mode":"live"
    }`)
	require.Equal(t, http.StatusNotFound, archivedTest.Code, archivedTest.Body.String())
	require.Contains(t, archivedTest.Body.String(), `"visual_workflow_not_found"`)

	archivedRun := f.request(http.MethodPost, path+"/"+created.VisualWorkflow.ID+"/runs", `{"idempotencyKey":"live-archived"}`)
	require.Equal(t, http.StatusNotFound, archivedRun.Code, archivedRun.Body.String())
	require.Contains(t, archivedRun.Body.String(), `"visual_workflow_not_found"`)

	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	foreign := f.request(http.MethodGet, other.OrgPath("/visual-workflows")+"/"+created.VisualWorkflow.ID+"/runs", "")
	require.Equal(t, http.StatusForbidden, foreign.Code, foreign.Body.String())
}

func TestWorkspaceAutomationRunsRejectInvalidQueryAndForeignID(t *testing.T) {
	testenv.Require(t)
	f := newAutomationFixture(t, "admin")
	path := f.scope.OrgPath("/automations")
	create := f.request(http.MethodPost, path, `{
        "name": "Run history",
        "instructions": "Keep a log.",
        "triggerConfig": {"mode": "manual"}
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Automation workspaceAutomationRecord `json:"automation"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	invalidID := f.request(http.MethodGet, path+"/not-a-uuid/runs", "")
	require.Equal(t, http.StatusNotFound, invalidID.Code, invalidID.Body.String())
	require.Contains(t, invalidID.Body.String(), `"workspace_automation_not_found"`)

	for _, query := range []string{"?limit=0", "?offset=-1"} {
		rec := f.request(http.MethodGet, path+"/"+created.Automation.ID+"/runs"+query, "")
		require.Equal(t, http.StatusBadRequest, rec.Code, query+" "+rec.Body.String())
		require.Contains(t, rec.Body.String(), `"invalid_query_params"`)
	}

	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	foreign := f.request(http.MethodGet, other.OrgPath("/automations")+"/"+created.Automation.ID+"/runs", "")
	require.Equal(t, http.StatusForbidden, foreign.Code, foreign.Body.String())
}
