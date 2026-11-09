package main

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type fakeJobStore struct {
	jobErr     error
	jobs       []job
	jobTotal   int
	jobFilters jobFilters
	jobID      string
	jobPatch   jobPatch
}

func (s *fakeJobStore) listJobs(_ context.Context, _ principal, filters jobFilters) ([]job, int, error) {
	s.jobFilters = filters
	return s.jobs, s.jobTotal, s.jobErr
}

func (s *fakeJobStore) getJob(_ context.Context, _ principal, jobID string) (job, error) {
	s.jobID = jobID
	return job{ID: jobID, Kind: "translation", Status: "queued"}, s.jobErr
}

func (s *fakeJobStore) updateJob(_ context.Context, _ principal, jobID string, patch jobPatch) (job, error) {
	s.jobID, s.jobPatch = jobID, patch
	return job{ID: jobID, Title: patch.Title}, s.jobErr
}

var (
	jobReadScopes  = effectivePermissions([]string{"jobs:read"}, "member")
	jobWriteScopes = effectivePermissions([]string{"jobs:read", "jobs:write"}, "developer")
)

func TestJobRoutes(t *testing.T) {
	t.Run("list parses filters", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.jobs = []job{{ID: "job_1", Kind: "translation", Status: "succeeded"}}
		store.jobTotal = 1
		w := sendResource(t, resourcePrincipal(jobReadScopes...), store, http.MethodGet, "/v1/jobs?projectId=project-1&status=succeeded&kind=translation&limit=5", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, jobFilters{ProjectID: "project-1", Status: "succeeded", Kind: "translation", Limit: 5}, store.jobFilters)
		require.Contains(t, w.Body.String(), `"jobs":[{"id":"job_1"`)
		require.Contains(t, w.Body.String(), `"pagination":{"offset":0,"limit":5,"total":1}`)
	})

	t.Run("list rejects invalid filters", func(t *testing.T) {
		for _, target := range []string{"/v1/jobs?status=done", "/v1/jobs?kind=other", "/v1/jobs?limit=0"} {
			w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodGet, target, "")
			require.Equal(t, http.StatusBadRequest, w.Code, target)
		}
	})

	t.Run("requires jobs:read", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/jobs", "")
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("get one job", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(jobReadScopes...), store, http.MethodGet, "/v1/jobs/job_1", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, "job_1", store.jobID)

		store.jobErr = errJobNotFound
		w = sendResource(t, resourcePrincipal(jobReadScopes...), store, http.MethodGet, "/v1/jobs/job_2", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "job_not_found")
	})

	t.Run("patch updates fields", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPatch, "/v1/jobs/job_1",
			`{"title":" Launch ","description":null,"dueAt":"2026-12-01T09:00:00Z","ownerEmail":"pm@example.com"}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "Launch", *store.jobPatch.Title)
		require.True(t, store.jobPatch.Description.Set)
		require.Nil(t, store.jobPatch.Description.Value)
		require.Equal(t, time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC), store.jobPatch.DueAt.Value.UTC())
		require.Equal(t, "pm@example.com", *store.jobPatch.OwnerEmail.Value)

		w = sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPatch, "/v1/jobs/job_1", `{"dueAt":null,"ownerEmail":null}`)
		require.Equal(t, http.StatusOK, w.Code)
		require.True(t, store.jobPatch.DueAt.Set)
		require.Nil(t, store.jobPatch.DueAt.Value)
		require.True(t, store.jobPatch.OwnerEmail.Set)
		require.Nil(t, store.jobPatch.OwnerEmail.Value)
	})

	t.Run("patch rejects invalid bodies", func(t *testing.T) {
		for _, body := range []string{`{}`, `{"title":""}`, `{"dueAt":"tomorrow"}`, `{"ownerEmail":"nope"}`, `{"status":"done"}`} {
			w := sendResource(t, resourcePrincipal(jobWriteScopes...), &fakeResourceStore{}, http.MethodPatch, "/v1/jobs/job_1", body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
	})

	t.Run("patch requires jobs:write and maps errors", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodPatch, "/v1/jobs/job_1", `{"title":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)

		for err, code := range map[error]string{
			errJobNotUpdatable:     "provider_job_not_updatable",
			errJobOwnerNotFound:    "owner_not_found",
			errJobOwnerUnassigable: "assignee_not_assignable",
			errJobProjectRequired:  "project_required",
		} {
			store := &fakeResourceStore{}
			store.jobErr = err
			w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPatch, "/v1/jobs/job_1", `{"title":"x"}`)
			require.Contains(t, w.Body.String(), code)
		}
	})
}

func TestJobOutputFiles(t *testing.T) {
	file, result := "file", "file_result"
	files := jobOutputFiles(&file, &result, []byte(`{"outputFiles":[{"fileId":"f1","locale":"fr","filename":"fr.json"}]}`))
	require.Equal(t, &[]jobOutputFile{{FileID: "f1", Locale: "fr", Filename: "fr.json"}}, files)
	require.Nil(t, jobOutputFiles(&file, &result, []byte(`{"outputFiles":[{"fileId":"f1","locale":""}]}`)))
	str := "string"
	require.Nil(t, jobOutputFiles(&str, &result, []byte(`{"outputFiles":[]}`)))
}
