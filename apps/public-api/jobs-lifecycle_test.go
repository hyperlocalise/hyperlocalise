package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeJobLifecycleStore struct {
	lifecycleErr    error
	lifecycleAction string
	lifecycleJobID  string
}

func (s *fakeJobLifecycleStore) completeJob(_ context.Context, _ principal, jobID string) (job, error) {
	s.lifecycleAction, s.lifecycleJobID = "complete", jobID
	return job{ID: jobID, Kind: "proofread", Status: "succeeded"}, s.lifecycleErr
}

func (s *fakeJobLifecycleStore) cancelJob(_ context.Context, _ principal, jobID string) (job, error) {
	s.lifecycleAction, s.lifecycleJobID = "cancel", jobID
	return job{ID: jobID, Kind: "translation", Status: "cancelled"}, s.lifecycleErr
}

func TestJobLifecycleRoutes(t *testing.T) {
	for _, action := range []string{"complete", "cancel"} {
		t.Run(action+" returns the job", func(t *testing.T) {
			store := &fakeResourceStore{}
			w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs/job_1/"+action, "")
			require.Equal(t, http.StatusOK, w.Code, w.Body.String())
			require.Equal(t, action, store.lifecycleAction)
			require.Equal(t, "job_1", store.lifecycleJobID)
			require.Contains(t, w.Body.String(), `"job":{"id":"job_1"`)
		})
	}

	t.Run("requires jobs:write", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(jobReadScopes...), store, http.MethodPost, "/v1/jobs/job_1/cancel", "")
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Empty(t, store.lifecycleAction)
	})

	t.Run("rejects other methods", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobWriteScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/jobs/job_1/complete", "")
		require.Equal(t, http.StatusMethodNotAllowed, w.Code)
		require.Equal(t, "POST", w.Header().Get("Allow"))
	})

	t.Run("no store", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobWriteScopes...), nil, http.MethodPost, "/v1/jobs/job_1/complete", "")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
	})

	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{errJobNotFound, http.StatusNotFound, "job_not_found"},
		{errJobActionUnavailable, http.StatusConflict, "job_action_unavailable"},
		{errNotTaskAssignee, http.StatusForbidden, "not_task_assignee"},
	} {
		t.Run("maps "+tc.code, func(t *testing.T) {
			store := &fakeResourceStore{}
			store.lifecycleErr = tc.err
			w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs/job_1/complete", "")
			require.Equal(t, tc.status, w.Code)
			require.Contains(t, w.Body.String(), `"error":"`+tc.code+`"`)
		})
	}
}

func TestJobLifecycleDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	insertJob := func(t *testing.T, kind, status, metadata string, owner *string) string {
		id := "job_" + uuid.NewString()
		f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload, owner_user_id, assignee_type)
			VALUES ($1, $2, $3, $4::job_kind, $5::job_status, $6::jsonb, $7, CASE WHEN $7::uuid IS NULL THEN NULL ELSE 'user'::job_assignee_type END)`,
			id, f.actor.OrganizationID, f.project, kind, status, `{"metadata":`+metadata+`}`, owner)
		return id
	}
	statusOf := func(t *testing.T, jobID string) (status string, outcome map[string]any, completed bool) {
		var raw []byte
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT status::text, outcome_payload, completed_at IS NOT NULL FROM jobs WHERE id = $1`, jobID).
			Scan(&status, &raw, &completed))
		require.NoError(t, json.Unmarshal(raw, &outcome))
		return status, outcome, completed
	}
	changeEvents := func(t *testing.T, jobID string) [][2]string {
		rows, err := f.pool.Query(ctx, `SELECT from_status::text, to_status::text FROM job_change_events
			WHERE job_id = $1 AND type = 'job.status_changed' ORDER BY occurred_at`, jobID)
		require.NoError(t, err)
		defer rows.Close()
		var out [][2]string
		for rows.Next() {
			var pair [2]string
			require.NoError(t, rows.Scan(&pair[0], &pair[1]))
			out = append(out, pair)
		}
		return out
	}
	jobEvents := func(t *testing.T, jobID string) []string {
		rows, err := f.pool.Query(ctx, `SELECT type FROM job_events WHERE job_id = $1 ORDER BY created_at`, jobID)
		require.NoError(t, err)
		defer rows.Close()
		var out []string
		for rows.Next() {
			var eventType string
			require.NoError(t, rows.Scan(&eventType))
			out = append(out, eventType)
		}
		return out
	}

	t.Run("complete finishes an open proofread task", func(t *testing.T) {
		jobID := insertJob(t, "proofread", "waiting_for_review", `{"title":"Review FR"}`, &f.actor.UserID)
		done, err := f.store.completeJob(ctx, f.actor, jobID)
		require.NoError(t, err)
		require.Equal(t, "succeeded", done.Status)
		require.NotNil(t, done.CompletedAt)
		status, outcome, completed := statusOf(t, jobID)
		require.Equal(t, "succeeded", status)
		require.Equal(t, map[string]any{"code": "marked_done_by_user"}, outcome)
		require.True(t, completed)
		require.Equal(t, [][2]string{{"waiting_for_review", "succeeded"}}, changeEvents(t, jobID))
		require.Equal(t, []string{"job_marked_done"}, jobEvents(t, jobID))

		var started bool
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM reporting_workspaces WHERE organization_id = $1)`,
			f.actor.OrganizationID).Scan(&started))
		require.True(t, started)

		_, err = f.store.completeJob(ctx, f.actor, jobID)
		require.ErrorIs(t, err, errJobActionUnavailable)
	})

	t.Run("complete refuses other tasks", func(t *testing.T) {
		for _, jobID := range []string{
			insertJob(t, "translation", "waiting_for_review", `{}`, nil),
			insertJob(t, "proofread", "queued", `{}`, nil),
			insertJob(t, "proofread", "waiting_for_review", `{"workflowTaskStep":"edit"}`, nil),
		} {
			_, err := f.store.completeJob(ctx, f.actor, jobID)
			require.ErrorIs(t, err, errJobActionUnavailable)
		}
		_, err := f.store.completeJob(ctx, f.actor, "job_missing")
		require.ErrorIs(t, err, errJobNotFound)
	})

	t.Run("only reviewers and managers complete someone else's task", func(t *testing.T) {
		jobID := insertJob(t, "proofread", "waiting_for_review", `{}`, nil)
		translator := f.actor
		translator.Role = "translator"
		_, err := f.store.completeJob(ctx, translator, jobID)
		require.ErrorIs(t, err, errNotTaskAssignee)

		reviewer := f.actor
		reviewer.Role = "reviewer"
		_, err = f.store.completeJob(ctx, reviewer, jobID)
		require.NoError(t, err)
	})

	t.Run("cancel stops an open job", func(t *testing.T) {
		jobID := insertJob(t, "translation", "running", `{}`, nil)
		f.exec(t, `UPDATE jobs SET workflow_run_id = 'wrun_1' WHERE id = $1`, jobID)
		cancelled, err := f.store.cancelJob(ctx, f.actor, jobID)
		require.NoError(t, err)
		require.Equal(t, "cancelled", cancelled.Status)
		status, outcome, completed := statusOf(t, jobID)
		require.Equal(t, "cancelled", status)
		require.Equal(t, map[string]any{"code": "cancelled_by_user", "message": "Cancelled by user"}, outcome)
		require.True(t, completed)
		var workflowRun *string
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT workflow_run_id FROM jobs WHERE id = $1`, jobID).Scan(&workflowRun))
		require.Nil(t, workflowRun)
		require.Equal(t, [][2]string{{"running", "cancelled"}}, changeEvents(t, jobID))
		require.Equal(t, []string{"job_cancelled"}, jobEvents(t, jobID))

		events := f.activities(t, "job_cancelled")
		require.Len(t, events, 1)
		require.Equal(t, jobID, events[0].TargetID)
		require.Equal(t, map[string]any{"jobId": jobID, "kind": "translation", "projectId": f.project, "status": "cancelled"}, events[0].Payload)

		_, err = f.store.cancelJob(ctx, f.actor, jobID)
		require.ErrorIs(t, err, errJobActionUnavailable)
	})

	t.Run("cancel refuses provider jobs", func(t *testing.T) {
		jobID := insertJob(t, "translation", "queued", `{}`, nil)
		f.exec(t, `INSERT INTO external_job_details (job_id, organization_id, provider_kind, external_job_id, external_status)
			VALUES ($1, $2, 'phrase', 'ext-1', 'new')`, jobID, f.actor.OrganizationID)
		_, err := f.store.cancelJob(ctx, f.actor, jobID)
		require.ErrorIs(t, err, errJobActionUnavailable)
	})

	t.Run("reporting capture runs for each status", func(t *testing.T) {
		// The action only logs a failed capture, so its SQL is checked here.
		jobID := insertJob(t, "proofread", "succeeded", `{}`, nil)
		for _, status := range []string{"succeeded", "cancelled", "waiting_for_review"} {
			require.NoError(t, captureJobStatus(ctx, f.pool, f.actor.OrganizationID, jobID, status), status)
		}
	})

	t.Run("members without project access see no job", func(t *testing.T) {
		jobID := insertJob(t, "translation", "queued", `{}`, nil)
		outsider := principal{UserID: uuid.NewString(), OrganizationID: f.actor.OrganizationID, Role: "admin"}
		_, err := f.store.cancelJob(ctx, outsider, jobID)
		require.ErrorIs(t, err, errJobNotFound)
	})
}
