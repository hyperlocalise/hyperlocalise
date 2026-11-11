package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"time"
)

const jobEventsLimit = 500

type jobEventRecord struct {
	ID            string          `json:"id"`
	JobID         string          `json:"jobId"`
	WorkflowRunID *string         `json:"workflowRunId"`
	ActorUserID   *string         `json:"actorUserId"`
	Type          string          `json:"type"`
	Locale        *string         `json:"locale"`
	Payload       json.RawMessage `json:"payload"`
	CreatedAt     string          `json:"createdAt"`
}

// orgJobEventsHandler returns a job's progress log oldest first. Past the cap
// it keeps the newest events so terminal outcomes stay visible.
func (api *projectAPI) orgJobEventsHandler(r *http.Request, actor projectActor) (any, int, error) {
	jobID, ok := jobIDParam(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectJobNotFound()
	}
	var visible bool
	if err := api.pool.QueryRow(r.Context(), `
        select exists (
            select 1 from jobs j
            where `+overviewJobsVisibleSQL()+` and j.id = $4
        )`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, jobID,
	).Scan(&visible); err != nil {
		return nil, 0, fmt.Errorf("check job visibility: %w", err)
	}
	if !visible {
		return nil, 0, projectJobNotFound()
	}

	rows, err := api.pool.Query(r.Context(), `
        select id::text, job_id, workflow_run_id, actor_user_id::text, type, locale, payload, created_at
        from job_events
        where organization_id = $1 and job_id = $2
        order by created_at desc, id desc
        limit $3`,
		actor.organizationID, jobID, jobEventsLimit,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list job events: %w", err)
	}
	defer rows.Close()

	events := []jobEventRecord{}
	for rows.Next() {
		var event jobEventRecord
		var createdAt time.Time
		if err := rows.Scan(&event.ID, &event.JobID, &event.WorkflowRunID, &event.ActorUserID,
			&event.Type, &event.Locale, &event.Payload, &createdAt); err != nil {
			return nil, 0, fmt.Errorf("scan job event: %w", err)
		}
		event.CreatedAt = formatPublicJobTime(createdAt)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate job events: %w", err)
	}
	slices.Reverse(events)
	return map[string][]jobEventRecord{"events": events}, http.StatusOK, nil
}
