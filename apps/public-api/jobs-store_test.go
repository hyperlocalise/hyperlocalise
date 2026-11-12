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
	require.Equal(t, "en", *items[0].SourceLocale)
	require.Nil(t, items[0].SourceFile)
	require.Nil(t, items[0].TargetLocales)

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
	require.Equal(t, map[string]any{
		"jobId": jobID, "kind": "translation", "projectId": f.project,
		"changedFields": []any{"title", "description", "dueAt", "owner"},
	}, events[0].Payload)

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

	// The first update changes the owner, due date and details; the second only the description.
	rows, err := f.pool.Query(ctx, `SELECT type, to_status::text, assignee_type::text FROM job_change_events
		WHERE job_id = $1 AND type <> 'job.created' ORDER BY occurred_at`, jobID)
	require.NoError(t, err)
	var changes [][3]string
	for rows.Next() {
		var changeType, toStatus string
		var assigneeType *string
		require.NoError(t, rows.Scan(&changeType, &toStatus, &assigneeType))
		assignee := ""
		if assigneeType != nil {
			assignee = *assigneeType
		}
		changes = append(changes, [3]string{changeType, toStatus, assignee})
	}
	require.NoError(t, rows.Err())
	require.Equal(t, [][3]string{
		{"job.assignee_changed", "queued", ""},
		{"job.due_date_changed", "queued", ""},
		{"job.details_changed", "queued", ""},
		{"job.details_changed", "queued", ""},
		{"job.assignee_changed", "queued", "user"},
	}, changes)

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

func TestJobStoreSourceFile(t *testing.T) {
	f := newDBFixture(t)
	const path = "docs/zh/guide.docx"
	fileID := f.sourceFile(t, path)
	storedID := "file_" + uuid.NewString()
	f.exec(t, `INSERT INTO stored_files (id, organization_id, role, source_kind, storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256)
		VALUES ($1, $2, 'source', 'repository_file', 'test', $1, $1, 'guide.docx', 'application/octet-stream', 2, 'x')`, storedID, f.actor.OrganizationID)
	var versionID string
	require.NoError(t, f.pool.QueryRow(t.Context(), `INSERT INTO repository_source_file_versions (organization_id, project_id, repository_source_file_id, source_path, stored_file_id)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`, f.actor.OrganizationID, f.project, fileID, path, storedID).Scan(&versionID))
	jobID := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload)
		VALUES ($1, $2, $3, 'proofread', 'succeeded', $4::jsonb)`, jobID, f.actor.OrganizationID, f.project,
		`{"sourceFileId":"`+storedID+`","sourceLocale":"zh-CN","targetLocales":["en-US"]}`)
	f.exec(t, `INSERT INTO translation_job_details (job_id, type, source_file_version_id) VALUES ($1, 'file', $2)`, jobID, versionID)

	item, err := f.store.getJob(t.Context(), f.actor, jobID)
	require.NoError(t, err)
	require.Equal(t, &jobSourceFile{FileID: storedID, Path: ptr(path)}, item.SourceFile)
	require.Equal(t, "zh-CN", *item.SourceLocale)
	require.Equal(t, &[]string{"en-US"}, item.TargetLocales)
}

func TestJobSourceFields(t *testing.T) {
	fileID, blank, path := "file_1", " ", "a/b.json"
	require.Equal(t, &jobSourceFile{FileID: fileID, Path: &path}, jobSourceFileOf(&fileID, &path))
	require.Equal(t, &jobSourceFile{FileID: fileID}, jobSourceFileOf(&fileID, nil))
	require.Nil(t, jobSourceFileOf(nil, &path))
	require.Nil(t, jobSourceFileOf(&blank, &path))

	require.Equal(t, &[]string{"fr", "de"}, jobTargetLocales([]byte(`["fr","de"]`)))
	for _, raw := range []string{"", "null", `"fr"`, `[1]`} {
		require.Nil(t, jobTargetLocales([]byte(raw)), raw)
	}
}

func TestJobPatchHelpers(t *testing.T) {
	t.Parallel()
	owner := "user-1"
	title := "Launch"
	description := "Release"
	due := time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC)
	later := due.Add(time.Hour)

	require.Equal(t, [2]string{"", ""}, jobAssignment{}.key())
	require.Equal(t, [2]string{"user-1", "user"}, jobAssignment{OwnerUserID: &owner, AssigneeType: ptr("user")}.key())

	require.True(t, sameTime(nil, nil))
	require.False(t, sameTime(&due, nil))
	require.True(t, sameTime(&due, ptr(due)))
	require.False(t, sameTime(&due, &later))

	require.True(t, sameString(nil, nil))
	require.False(t, sameString(&title, nil))
	require.True(t, sameString(&title, ptr("Launch")))
	require.False(t, sameString(&title, &description))

	require.Empty(t, jobPatch{}.changedFields())
	require.Equal(t, []string{"title", "description", "dueAt", "owner"}, jobPatch{
		Title:       &title,
		Description: optionalString{Set: true, Value: &description},
		DueAt:       optionalTime{Set: true, Value: &due},
		OwnerEmail:  optionalString{Set: true},
	}.changedFields())
}
