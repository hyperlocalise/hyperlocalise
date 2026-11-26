package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestOrgJobRetryForwardsWorkflow(t *testing.T) {
	got := captureOrgJobWorkflow(t)
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.SetPathValue("jobId", "job-1")
	api := &projectAPI{pool: nativeJobActionPool{projectID: "proj-1"}}
	_, _, err := api.orgJobRetryHandler(req, projectActor{
		role:           "admin",
		userID:         "user-1",
		organizationID: "org-1",
	})
	require.Error(t, err)
	require.Equal(t, "job_action", got["action"])
	payload, ok := got["payload"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "retry", payload["action"])
	require.Equal(t, "job-1", payload["jobId"])
	require.Equal(t, "proj-1", payload["projectId"])
}

func TestOrgJobLifecycleForwardsEachAction(t *testing.T) {
	api := &projectAPI{pool: nativeJobActionPool{projectID: "proj-1"}}
	admin := projectActor{role: "admin", userID: "user-1", organizationID: "org-1"}
	for _, tc := range []struct {
		action  string
		handler func(*http.Request, projectActor) (any, int, error)
	}{
		{"cancel", api.orgJobCancelHandler},
		{"mark_failed", api.orgJobMarkFailedHandler},
		{"mark_done", api.orgJobMarkDoneHandler},
	} {
		t.Run(tc.action, func(t *testing.T) {
			got := captureOrgJobWorkflow(t)
			req := httptest.NewRequest(http.MethodPost, "/", nil)
			req.SetPathValue("jobId", "job-1")
			_, _, err := tc.handler(req, admin)
			require.Error(t, err)
			payload, ok := got["payload"].(map[string]any)
			require.True(t, ok)
			require.Equal(t, tc.action, payload["action"])
			require.Equal(t, "job-1", payload["jobId"])
			require.Equal(t, "proj-1", payload["projectId"])
		})
	}
}

func TestOrgJobLifecycleForbidsMembersAndBlankJobs(t *testing.T) {
	api := &projectAPI{pool: nativeJobActionPool{projectID: "proj-1"}}
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.SetPathValue("jobId", "job-1")
	_, _, err := api.orgJobRetryHandler(req, projectActor{
		role:           "member",
		userID:         "user-1",
		organizationID: "org-1",
	})
	requireForbidden(t, err)

	blank := httptest.NewRequest(http.MethodPost, "/", nil)
	blank.SetPathValue("jobId", "  ")
	_, _, err = api.orgJobCancelHandler(blank, projectActor{
		role:           "admin",
		userID:         "user-1",
		organizationID: "org-1",
	})
	requireWorkflowFailure(t, err, http.StatusNotFound, "job_not_found")

	_, _, err = (&projectAPI{}).orgJobMarkFailedHandler(req, projectActor{
		role:           "admin",
		userID:         "user-1",
		organizationID: "org-1",
	})
	requireWorkflowFailure(t, err, http.StatusServiceUnavailable, "projects_unavailable")
}

func TestOrgNativeJobProjectID(t *testing.T) {
	t.Run("resolves a native job the workspace can see", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		jobID := mustProjectJob(t, scope, projectJobSeed{})
		api := &projectAPI{pool: scope.Pool}
		projectID, err := api.orgNativeJobProjectID(t.Context(), projectActor{
			role:           "admin",
			userID:         scope.UserID,
			organizationID: scope.OrganizationID,
		}, jobID)
		require.NoError(t, err)
		require.Equal(t, scope.ProjectID, projectID)
	})

	t.Run("hides TMS jobs and jobs from another workspace", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		tmsJob := mustProjectJob(t, scope, projectJobSeed{})
		mustExternalJobDetails(t, scope, tmsJob, "synced", "[]")
		api := &projectAPI{pool: scope.Pool}
		admin := projectActor{role: "admin", userID: scope.UserID, organizationID: scope.OrganizationID}
		_, err := api.orgNativeJobProjectID(t.Context(), admin, tmsJob)
		requireWorkflowFailure(t, err, http.StatusNotFound, "job_not_found")

		foreign := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		foreignJob := mustProjectJob(t, foreign, projectJobSeed{})
		_, err = api.orgNativeJobProjectID(t.Context(), admin, foreignJob)
		requireWorkflowFailure(t, err, http.StatusNotFound, "job_not_found")
		_, err = api.orgNativeJobProjectID(t.Context(), admin, "job_"+uuid.NewString())
		requireWorkflowFailure(t, err, http.StatusNotFound, "job_not_found")
	})

	t.Run("limits a vendor to an open file task they own", func(t *testing.T) {
		f := newTaskFixture(t, vendorRole)
		api := &projectAPI{pool: f.scope.Pool}
		vendor := projectActor{
			role:           "reviewer",
			userID:         f.scope.UserID,
			organizationID: f.scope.OrganizationID,
			vendor:         true,
		}
		owner := f.scope.UserID
		otherJob := mustProjectJob(t, f.scope, projectJobSeed{kind: "translation", ownerUserID: &owner})
		_, err := api.orgNativeJobProjectID(t.Context(), vendor, otherJob)
		requireWorkflowFailure(t, err, http.StatusNotFound, "job_not_found")

		task := f.mustTask(t, taskSeed{})
		projectID, err := api.orgNativeJobProjectID(t.Context(), vendor, task)
		require.NoError(t, err)
		require.Equal(t, f.scope.ProjectID, projectID)
	})
}

func captureOrgJobWorkflow(t *testing.T) map[string]any {
	t.Helper()
	got := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/api/internal/iris/project-action", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&got))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]string{"id": "job-1"}})
	}))
	t.Cleanup(server.Close)
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	return got
}

type nativeJobActionPool struct {
	projectID string
}

func (p nativeJobActionPool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected query")
}

func (p nativeJobActionPool) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	if strings.Contains(query, "select j.project_id") {
		return scalarStringRow{p.projectID}
	}
	return noRowsRow{}
}

func (p nativeJobActionPool) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unexpected exec")
}

func (p nativeJobActionPool) Begin(context.Context) (pgx.Tx, error) {
	return nil, errors.New("unexpected begin")
}

type scalarStringRow struct {
	value string
}

func (r scalarStringRow) Scan(dest ...any) error {
	p, ok := dest[0].(**string)
	if !ok {
		return errors.New("unexpected scan destination")
	}
	value := r.value
	*p = &value
	return nil
}
