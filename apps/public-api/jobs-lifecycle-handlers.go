package main

import (
	"context"
	"errors"
	"net/http"
)

var jobLifecycleErrorResponses = []storeErrorResponse{
	{errJobActionUnavailable, http.StatusConflict, "job_action_unavailable", "Job action is not available"},
	{errNotTaskAssignee, http.StatusForbidden, "not_task_assignee", "Only the task's owner, a reviewer, or a manager can complete this task"},
}

// jobComplete marks an open task for people done, as Mark done in the app.
func (s apiServer) jobComplete(w http.ResponseWriter, r *http.Request) {
	s.jobLifecycle(w, r, "complete job", resourceStore.completeJob)
}

// jobCancel cancels a queued, running, or waiting-for-review job, as Cancel in the app.
func (s apiServer) jobCancel(w http.ResponseWriter, r *http.Request) {
	s.jobLifecycle(w, r, "cancel job", resourceStore.cancelJob)
}

// jobLifecycle takes the action as a method expression, so it is only called once the store is
// known to be set.
func (s apiServer) jobLifecycle(w http.ResponseWriter, r *http.Request, operation string,
	action func(resourceStore, context.Context, principal, string) (job, error),
) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	jobID, ok := pathID(w, r, "jobId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	item, err := action(s.store, r.Context(), p, jobID)
	if err != nil {
		for _, response := range jobLifecycleErrorResponses {
			if errors.Is(err, response.err) {
				writeError(w, response.status, response.code, response.message)
				return
			}
		}
		writeJobStoreError(w, err, operation)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Job job `json:"job"`
	}{item})
}
