package main

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestJobStoreDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	jobID := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload, owner_user_id)
		VALUES ($1, $2, $3, 'translation', 'queued', $4::jsonb, $5)`,
		jobID, f.actor.OrganizationID, f.project, `{"metadata":{"title":"Old","ticket":"WX-1","count":3},"sourceLocale":"en"}`, f.actor.UserID)
	otherJob := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, kind, status, input_payload)
		VALUES ($1, $2, 'research', 'succeeded', '{}'::jsonb)`, otherJob, f.actor.OrganizationID)

	items, total, err := f.store.listJobs(ctx, f.actor, jobFilters{Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, items, 2)

	items, total, err = f.store.listJobs(ctx, f.actor, jobFilters{ProjectID: f.project, Status: "queued", Kind: "translation", Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, jobID, items[0].ID)
	require.Equal(t, "Old", *items[0].Title)
	require.NotNil(t, items[0].OwnerEmail)

	// Members without team access see neither job.
	member := principal{UserID: uuid.NewString(), OrganizationID: f.actor.OrganizationID}
	_, total, err = f.store.listJobs(ctx, member, jobFilters{Limit: 10})
	require.NoError(t, err)
	require.Zero(t, total)
	_, err = f.store.getJob(ctx, member, jobID)
	require.ErrorIs(t, err, errJobNotFound)

	due := time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC)
	title := "Launch"
	description := "Release copy"
	updated, err := f.store.updateJob(ctx, f.actor, jobID, jobPatch{
		Title:       &title,
		Description: optionalString{Set: true, Value: &description},
		DueAt:       optionalTime{Set: true, Value: &due},
		OwnerEmail:  optionalString{Set: true},
	})
	require.NoError(t, err)
	require.Equal(t, "Launch", *updated.Title)
	require.Equal(t, "Release copy", *updated.Description)
	require.True(t, due.Equal(*updated.DueAt))
	require.Nil(t, updated.OwnerEmail)
	events := f.activities(t, "job_updated")
	require.Len(t, events, 1)
	require.Equal(t, jobID, events[0].TargetID)
	require.Equal(t, map[string]any{"jobId": jobID, "kind": "translation", "projectId": f.project,
		"changedFields": []any{"title", "description", "dueAt", "owner"}}, events[0].Payload)

	var payload map[string]any
	var raw []byte
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT input_payload FROM jobs WHERE id = $1`, jobID).Scan(&raw))
	require.NoError(t, json.Unmarshal(raw, &payload))
	require.Equal(t, map[string]any{"title": "Launch", "description": "Release copy", "ticket": "WX-1"}, payload["metadata"])
	require.Equal(t, "en", payload["sourceLocale"])

	updated, err = f.store.updateJob(ctx, f.actor, jobID, jobPatch{Description: optionalString{Set: true}})
	require.NoError(t, err)
	require.Nil(t, updated.Description)
	require.Equal(t, "Launch", *updated.Title)

	var email string
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, f.actor.UserID).Scan(&email))
	updated, err = f.store.updateJob(ctx, f.actor, jobID, jobPatch{OwnerEmail: optionalString{Set: true, Value: &email}})
	require.NoError(t, err)
	require.Equal(t, email, *updated.OwnerEmail)

	missing := "nobody@example.com"
	_, err = f.store.updateJob(ctx, f.actor, jobID, jobPatch{OwnerEmail: optionalString{Set: true, Value: &missing}})
	require.ErrorIs(t, err, errJobOwnerNotFound)

	_, err = f.store.updateJob(ctx, f.actor, otherJob, jobPatch{Title: &title})
	require.ErrorIs(t, err, errJobProjectRequired)
	_, err = f.store.updateJob(ctx, f.actor, "job_missing", jobPatch{Title: &title})
	require.ErrorIs(t, err, errJobNotFound)
	// Failed updates record nothing.
	require.Len(t, f.activities(t, "job_updated"), 3)
}
