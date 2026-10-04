package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type stubOverviewFlags struct {
	enabled bool
}

func (s stubOverviewFlags) Enabled(context.Context, string, string, string) (bool, error) {
	return s.enabled, nil
}

func overviewTestAPI(t *testing.T, role string, automationsEnabled bool) (*overviewAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	return &overviewAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		flags:      stubOverviewFlags{enabled: automationsEnabled},
	}, scope
}

func overviewRequest(api *overviewAPI, scope *testenv.Scope, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestOverviewRoutes(t *testing.T) {
	t.Run("returns metrics for jobs translations and issues", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		_, err := scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload, created_at, updated_at)
            values ($1, $2, $3, 'translation', 'queued', '{"sourceText":"Hello"}'::jsonb, now(), now())`,
			"job_"+scope.ProjectID+"_metrics", scope.OrganizationID, scope.ProjectID)
		require.NoError(t, err)
		mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Missing CTA", "open", "general_question", nil)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/metrics"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Metrics struct {
				Jobs struct {
					Count  int   `json:"count"`
					Series []int `json:"series"`
				} `json:"jobs"`
				Issues struct {
					Open int `json:"open"`
					P1   int `json:"p1"`
				} `json:"issues"`
				Automations *struct {
					Total  int `json:"total"`
					Paused int `json:"paused"`
				} `json:"automations"`
			} `json:"metrics"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Metrics.Jobs.Series, overviewLookbackDays)
		require.GreaterOrEqual(t, body.Metrics.Jobs.Count, 1)
		require.Equal(t, 1, body.Metrics.Issues.Open)
		require.Nil(t, body.Metrics.Automations)
	})

	t.Run("returns ranked job activity", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		_, err := scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload, created_at, updated_at)
            values ($1, $2, $3, 'translation', 'failed', '{"sourceText":"Broken"}'::jsonb, now(), now())`,
			"job_"+scope.ProjectID+"_failed", scope.OrganizationID, scope.ProjectID)
		require.NoError(t, err)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/activity"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Activity []overviewActivityItem `json:"activity"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.NotEmpty(t, body.Activity)
		require.Equal(t, "job", body.Activity[0].Kind)
		require.True(t, body.Activity[0].Attention)
	})

	t.Run("resolves stored file display names in activity titles", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		fileID := "file_" + uuid.NewString()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into stored_files (
                id, organization_id, project_id, role, source_kind,
                storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
            ) values ($1, $2, $3, 'source', 'chat_upload', 'test', $1, $1, 'brief.docx', 'application/octet-stream', 12, 'deadbeef')`,
			fileID, scope.OrganizationID, scope.ProjectID)
		require.NoError(t, err)
		jobID := "job_" + scope.ProjectID + "_file"
		_, err = scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload, created_at, updated_at)
            values ($1, $2, $3, 'translation', 'succeeded', $4::jsonb, now(), now())`,
			jobID, scope.OrganizationID, scope.ProjectID,
			`{"sourceFileId":"`+fileID+`"}`)
		require.NoError(t, err)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/activity"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Activity []overviewActivityItem `json:"activity"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.NotEmpty(t, body.Activity)
		require.Equal(t, jobID, body.Activity[0].ID)
		require.Equal(t, overviewResolvedTitle{Kind: "text", Text: "brief.docx"}, body.Activity[0].Title)
	})

	t.Run("returns native projects with extras", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		_, err := scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload, created_at, updated_at)
            values ($1, $2, $3, 'translation', 'queued', '{"sourceText":"Hello"}'::jsonb, now(), now())`,
			"job_"+scope.ProjectID+"_open", scope.OrganizationID, scope.ProjectID)
		require.NoError(t, err)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/projects"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Projects []overviewProjectItem `json:"projects"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Projects, 1)
		require.Equal(t, scope.ProjectID, body.Projects[0].ID)
		require.Equal(t, "native", body.Projects[0].Source)
		require.GreaterOrEqual(t, body.Projects[0].OpenCount, 1)
	})

	t.Run("loads extras for materialized projects beyond the preview limit", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		older := "ext:crowdin:older"
		middle := "ext:crowdin:middle"
		newer := "ext:crowdin:newer"
		for _, project := range []struct {
			id, name, identifier string
			updatedAt            string
		}{
			{older, "Older Crowdin", "OLDCRWD", "2026-01-01T00:00:00Z"},
			{middle, "Middle Crowdin", "MIDCRWD", "2026-02-01T00:00:00Z"},
			{newer, "Newer Crowdin", "NEWCRWD", "2026-03-01T00:00:00Z"},
		} {
			_, err := scope.Pool.Exec(t.Context(), `
                insert into projects (
                    id, organization_id, created_by_user_id, name, identifier, source,
                    external_provider_kind, external_project_id, created_at, updated_at
                ) values ($1, $2, $3, $4, $5, 'external_tms', 'crowdin', $6, $7, $7)`,
				project.id, scope.OrganizationID, scope.UserID, project.name, project.identifier,
				strings.TrimPrefix(project.id, "ext:crowdin:"), project.updatedAt)
			require.NoError(t, err)
		}
		_, err := scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload, created_at, updated_at)
            values ($1, $2, $3, 'translation', 'failed', '{"sourceText":"Broken"}'::jsonb, $4, $4)`,
			"job_older_failed", scope.OrganizationID, older, "2026-01-02T00:00:00Z")
		require.NoError(t, err)
		_, err = scope.Pool.Exec(t.Context(), `
            insert into linked_domains (
                id, organization_id, created_by_user_id, domain_key, domain_slug, source_url,
                status, verification_token, project_id
            ) values ($1, $2, $3, $4, $5, $6, 'verified', 'token', $7)`,
			uuid.NewString(), scope.OrganizationID, scope.UserID,
			scope.Slug+".docs.example", scope.Slug+"-docs-example",
			"https://docs.example/", older)
		require.NoError(t, err)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/projects"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Projects []overviewProjectItem `json:"projects"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))

		byID := make(map[string]overviewProjectItem, len(body.Projects))
		for _, project := range body.Projects {
			byID[project.ID] = project
		}
		require.Contains(t, byID, older)
		require.Contains(t, byID, middle)
		require.Contains(t, byID, newer)
		require.Equal(t, 1, byID[older].FailedCount)
		require.NotNil(t, byID[older].Domain)
		require.Equal(t, scope.Slug+".docs.example", *byID[older].Domain)
		require.NotNil(t, byID[older].LatestJobTitle)
		require.Equal(t, "text", byID[older].LatestJobTitle.Kind)
		require.Equal(t, "Broken", byID[older].LatestJobTitle.Text)
	})

	t.Run("returns open board issues", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		_, identifier := mustOrgIssueFull(t, scope, scope.ProjectID, 8, "Missing CTA", "open", "general_question", nil)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/board"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Board []overviewBoardItem `json:"board"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Board, 1)
		require.Equal(t, identifier, body.Board[0].Identifier)
		require.Equal(t, "Missing CTA", body.Board[0].Title)
	})

	t.Run("hides automations without the flag", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		rec := overviewRequest(api, scope, scope.OrgPath("/overview/automations"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"automations":[]}`, rec.Body.String())
	})

	t.Run("returns recent automation runs when enabled", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", true)
		automationID := uuid.NewString()
		runID := uuid.NewString()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into workspace_automations (id, organization_id, name, instructions, status)
            values ($1, $2, 'Nightly sync', 'sync', 'active')`,
			automationID, scope.OrganizationID)
		require.NoError(t, err)
		_, err = scope.Pool.Exec(t.Context(), `
            insert into workspace_automation_runs (id, automation_id, organization_id, trigger_source, status)
            values ($1, $2, $3, 'scheduled', 'succeeded')`,
			runID, automationID, scope.OrganizationID)
		require.NoError(t, err)

		rec := overviewRequest(api, scope, scope.OrgPath("/overview/automations"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Automations []overviewAutomationItem `json:"automations"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Automations, 1)
		require.Equal(t, "Nightly sync", body.Automations[0].Name)
		require.Equal(t, "scheduled", body.Automations[0].TriggerSource)
	})

	t.Run("requires a session", func(t *testing.T) {
		api, scope := overviewTestAPI(t, "admin", false)
		mux := http.NewServeMux()
		api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
		req := httptest.NewRequest(http.MethodGet, scope.OrgPath("/overview/metrics"), nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}
