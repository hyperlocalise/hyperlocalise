package main

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func mustJobEvent(t *testing.T, scope *testenv.Scope, jobID, eventType, locale, payload string, at time.Time) {
	t.Helper()
	var localeArg *string
	if locale != "" {
		localeArg = &locale
	}
	_, err := scope.Pool.Exec(t.Context(), `
        insert into job_events (job_id, organization_id, workflow_run_id, type, locale, payload, created_at)
        values ($1, $2, 'run-1', $3, $4, $5::jsonb, $6)`,
		jobID, scope.OrganizationID, eventType, localeArg, payload, at)
	require.NoError(t, err)
}

func decodeJobEvents(t *testing.T, body []byte) []map[string]any {
	t.Helper()
	var decoded struct {
		Events []map[string]any `json:"events"`
	}
	require.NoError(t, json.Unmarshal(body, &decoded))
	return decoded.Events
}

func TestOrgJobEvents(t *testing.T) {
	t.Run("returns events oldest first", func(t *testing.T) {
		f := newProjectJobsFixture(t, "admin")
		jobID := mustProjectJob(t, f.scope, projectJobSeed{jobType: "file", status: "running"})
		base := time.Date(2026, 10, 14, 1, 2, 3, 0, time.UTC)
		mustJobEvent(t, f.scope, jobID, "locale_progress", "fr-FR", `{"translatedCount":4,"totalCount":10}`, base.Add(time.Second))
		mustJobEvent(t, f.scope, jobID, "job_started", "", `{"targetLocales":["fr-FR"]}`, base)

		rec := f.get(t, "/jobs/"+jobID+"/events")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		events := decodeJobEvents(t, rec.Body.Bytes())
		require.Len(t, events, 2)
		require.Equal(t, "job_started", events[0]["type"])
		require.Nil(t, events[0]["locale"])
		require.Equal(t, "2026-10-14T01:02:03.000Z", events[0]["createdAt"])
		require.Equal(t, "run-1", events[0]["workflowRunId"])
		require.Equal(t, "locale_progress", events[1]["type"])
		require.Equal(t, "fr-FR", events[1]["locale"])
		require.Equal(t, map[string]any{"translatedCount": 4.0, "totalCount": 10.0}, events[1]["payload"])
	})

	t.Run("returns an empty list for jobs without events", func(t *testing.T) {
		f := newProjectJobsFixture(t, "admin")
		jobID := mustProjectJob(t, f.scope, projectJobSeed{jobType: "file"})

		rec := f.get(t, "/jobs/"+jobID+"/events")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"events":[]}`, rec.Body.String())
	})

	t.Run("keeps the newest events past the cap", func(t *testing.T) {
		f := newProjectJobsFixture(t, "admin")
		jobID := mustProjectJob(t, f.scope, projectJobSeed{jobType: "file"})
		base := time.Now().Add(-time.Hour)
		_, err := f.scope.Pool.Exec(t.Context(), `
            insert into job_events (job_id, organization_id, type, payload, created_at)
            select $1, $2, 'locale_progress', '{}'::jsonb, $3::timestamptz + make_interval(secs => n)
            from generate_series(1, $4::int) as n`,
			jobID, f.scope.OrganizationID, base, jobEventsLimit)
		require.NoError(t, err)
		mustJobEvent(t, f.scope, jobID, "job_succeeded", "", `{}`, base.Add(time.Duration(jobEventsLimit+1)*time.Second))

		events := decodeJobEvents(t, f.get(t, "/jobs/"+jobID+"/events").Body.Bytes())
		require.Len(t, events, jobEventsLimit)
		require.Equal(t, "job_succeeded", events[len(events)-1]["type"])
	})

	t.Run("hides jobs the actor cannot read", func(t *testing.T) {
		f := newProjectJobsFixture(t, "admin")
		other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		otherJob := mustProjectJob(t, other, projectJobSeed{jobType: "file"})
		mustJobEvent(t, other, otherJob, "job_started", "", `{}`, time.Now())

		requireProjectJobsError(t, f.get(t, "/jobs/"+otherJob+"/events"), http.StatusNotFound, "job_not_found", "Job not found")
		requireProjectJobsError(t, f.get(t, "/jobs/job_"+uuid.NewString()+"/events"), http.StatusNotFound, "job_not_found", "Job not found")
	})
}
