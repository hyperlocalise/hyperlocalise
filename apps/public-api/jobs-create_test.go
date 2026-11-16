package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeJobCreateStore struct {
	createErr         error
	createInput       jobCreate
	createIdempotency *jobIdempotency
	createReplayed    bool
}

func (s *fakeJobCreateStore) createJob(_ context.Context, _ principal, input jobCreate, idempotency *jobIdempotency) (createdJobResult, bool, error) {
	s.createInput, s.createIdempotency = input, idempotency
	status := "queued"
	if input.Type == "keys" {
		status = "waiting_for_review"
	}
	return createdJobResult{ID: "job_1", Type: input.Type, Status: status}, s.createReplayed, s.createErr
}

// newJSONRequest is an authenticated JSON request for the fake auth.
func newJSONRequest(method, target, body string) *http.Request {
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	r.Header.Set("X-Api-Key", "hl_test")
	r.Header.Set("Content-Type", "application/json")
	return r
}

func serve(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// The platform hashes with JSON.stringify; these digests come from the same objects in Node.
func TestJobCreateRequestHashMatchesPlatform(t *testing.T) {
	due := time.Date(2026, 12, 1, 19, 0, 0, 0, time.FixedZone("AEST", 10*60*60))
	cases := []struct {
		name  string
		input jobCreate
		want  string
	}{
		{"keys", jobCreate{
			Type: "keys", ProjectID: "proj_1", Title: "Launch <A&B>", DueAt: &due, OwnerEmail: "PM@Example.com",
			Keys: &keysJobInput{
				SourceLocale: "en", TargetLocales: []string{"pt-br", "de", "de"},
				Metadata: map[string]string{"b": "2", "a": "1"}, Keys: []string{"b.body", "a.title"},
			},
		}, "222b4107916e187462f6831ff1d0ec706166cc1b0f6486bdbd3983cb146b4047"},
		{"string", jobCreate{
			Type: "string", ProjectID: "proj_1",
			String: &stringJobInput{
				SourceText: "Hello", SourceLocale: "en", TargetLocales: []string{"fr"},
				Metadata: map[string]string{}, Context: strPtr(""), MaxLength: intPtr(40),
			},
		}, "48c0d0f4b9d457a0599ccf1292389d06034a76cbf2c45144dd65824bd16bf8cb"},
		{"file", jobCreate{
			Type: "file", ProjectID: "proj_1",
			File: &fileJobInput{
				SourceFileID: "file_1", FileFormat: "json", SourceLocale: "en",
				TargetLocales: []string{"fr", "de"}, Branch: strPtr("release/1"),
			},
		}, "da19f3eb5bbbcc61d67a05867d2cdb154c4f2dfd2013b6ccb4b84c718423c0c1"},
	}
	for _, tc := range cases {
		got, err := tc.input.requestHash()
		require.NoError(t, err, tc.name)
		require.Equal(t, tc.want, got, tc.name)
	}
}

func TestJobCreateRoutes(t *testing.T) {
	t.Run("creates a key job", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs",
			`{"type":"keys","projectId":" proj%201 ","title":" Launch ","keysInput":{"sourceLocale":"en","targetLocales":[" fr "],"tags":["release"]}}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.JSONEq(t, `{"job":{"id":"job_1","type":"keys","status":"waiting_for_review"}}`, w.Body.String())
		require.Equal(t, "proj 1", store.createInput.ProjectID)
		require.Equal(t, "Launch", store.createInput.Title)
		require.Equal(t, []string{"fr"}, store.createInput.Keys.TargetLocales)
		require.Nil(t, store.createIdempotency)
	})

	t.Run("trims a file job branch", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs",
			`{"type":"file","projectId":"p","fileInput":{"sourceFileId":"file_1","fileFormat":"json","sourceLocale":"en","targetLocales":["fr"],"branch":" /feature-checkout/ "}}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, "feature-checkout", *store.createInput.File.Branch)
	})

	t.Run("passes the idempotency key and replays", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.createReplayed = true
		body := `{"type":"string","projectId":"p","stringInput":{"sourceText":"Hi","sourceLocale":"en","targetLocales":["fr"]}}`
		h := newHandler(authFunc(func(context.Context, string) (principal, error) {
			return resourcePrincipal(jobWriteScopes...), nil
		}), store)
		r := newJSONRequest(http.MethodPost, "/v1/jobs", body)
		r.Header.Set("Idempotency-Key", "req-42")
		w := serve(h, r)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "true", w.Header().Get("Idempotent-Replayed"))
		require.Equal(t, "req-42", store.createIdempotency.Key)
		require.Len(t, store.createIdempotency.RequestHash, 64)
	})

	t.Run("rejects invalid bodies", func(t *testing.T) {
		for _, body := range []string{
			`{"type":"other","projectId":"p"}`,
			`{"type":"string","projectId":"p"}`,
			`{"type":"string","projectId":"p","stringInput":{"sourceText":" ","sourceLocale":"en","targetLocales":["fr"]}}`,
			`{"type":"file","projectId":"p","fileInput":{"sourceFileId":"f","fileFormat":"exe","sourceLocale":"en","targetLocales":["fr"]}}`,
			`{"type":"file","projectId":"p","fileInput":{"sourceFileId":"f","fileFormat":"json","sourceLocale":"en","targetLocales":["fr"],"branch":"a//b"}}`,
			`{"type":"keys","projectId":"p","keysInput":{"sourceLocale":"en","targetLocales":["fr"]}}`,
			`{"type":"keys","projectId":"p","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"],"tags":["b"]}}`,
			`{"type":"keys","projectId":"p","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"stringIds":["nope"]}}`,
			`{"type":"keys","projectId":"p","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"],"overwriteUnapproved":true}}`,
			`{"type":"keys","projectId":"p","title":"  ","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"]}}`,
			`{"type":"keys","projectId":"p","dueAt":"tomorrow","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"]}}`,
			`{"type":"string","projectId":"p","stringInput":{"sourceText":"Hi","sourceLocale":"en","targetLocales":["fr"]},"keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"]}}`,
		} {
			w := sendResource(t, resourcePrincipal(jobWriteScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/jobs", body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
			require.Contains(t, w.Body.String(), `"error":"invalid_job_payload"`, body)
		}
	})

	t.Run("rejects a bad idempotency key", func(t *testing.T) {
		h := newHandler(authFunc(func(context.Context, string) (principal, error) {
			return resourcePrincipal(jobWriteScopes...), nil
		}), &fakeResourceStore{})
		r := newJSONRequest(http.MethodPost, "/v1/jobs",
			`{"type":"string","projectId":"p","stringInput":{"sourceText":"Hi","sourceLocale":"en","targetLocales":["fr"]}}`)
		r.Header.Set("Idempotency-Key", "has space")
		w := serve(h, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), `"error":"invalid_idempotency_key"`)
	})

	t.Run("needs jobs:write", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/jobs",
			`{"type":"keys","projectId":"p","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"]}}`)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{errProjectNotFound, http.StatusNotFound, "project_not_found"},
		{errProjectNotNative, http.StatusConflict, "project_not_native"},
		{jobLocaleError{"job_target_locale_not_in_project", "nope"}, http.StatusBadRequest, "job_target_locale_not_in_project"},
		{jobFormatMismatchError{Expected: "yaml"}, http.StatusBadRequest, "source_file_format_mismatch"},
		{jobBudgetError{"slow down"}, http.StatusTooManyRequests, "organization_job_budget_exceeded"},
		{errJobSourceFileNotFound, http.StatusNotFound, "source_file_not_found"},
		{errJobSourceFileUnsupported, http.StatusBadRequest, "unsupported_source_file_format"},
		{errJobOwnerNotFound, http.StatusBadRequest, "owner_not_found"},
		{errIdempotencyKeyReused, http.StatusUnprocessableEntity, "idempotency_key_reused"},
		{errKeyJobNoStrings, http.StatusBadRequest, "no_strings_matched"},
		{errKeyJobTooManyStrings, http.StatusBadRequest, "too_many_strings"},
	} {
		t.Run("maps "+tc.code, func(t *testing.T) {
			store := &fakeResourceStore{}
			store.createErr = tc.err
			w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs",
				`{"type":"keys","projectId":"p","keysInput":{"sourceLocale":"en","targetLocales":["fr"],"keys":["a"]}}`)
			require.Equal(t, tc.status, w.Code)
			require.Contains(t, w.Body.String(), `"error":"`+tc.code+`"`)
		})
	}
}

func TestJobCreateDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "locales/en.json")
	home := f.createString(t, "locales/en.json", "home.title", "Home", nil)
	f.createString(t, "", "loose", "Loose", nil)
	f.exec(t, `UPDATE project_translation_keys SET tags = '{release}' WHERE id = $1`, home.ID)

	jobRow := func(t *testing.T, jobID string) (kind, status string, payload map[string]any, owner *string) {
		var raw []byte
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT kind::text, status::text, input_payload, owner_user_id::text FROM jobs WHERE id = $1`, jobID).
			Scan(&kind, &status, &raw, &owner))
		require.NoError(t, json.Unmarshal(raw, &payload))
		return kind, status, payload, owner
	}

	t.Run("key job with its strings", func(t *testing.T) {
		email := f.actor.UserID
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, f.actor.UserID).Scan(&email))
		created, replayed, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "keys", ProjectID: f.project, Title: "Review FR", OwnerEmail: email,
			Keys: &keysJobInput{
				SourceLocale: "EN", TargetLocales: []string{"FR"}, Tags: []string{"release"},
				Metadata: map[string]string{"workflowTaskStep": "edit", "ticket": "WX-1"},
			},
		}, nil)
		require.NoError(t, err)
		require.False(t, replayed)
		require.Equal(t, "waiting_for_review", created.Status)
		kind, status, payload, owner := jobRow(t, created.ID)
		require.Equal(t, "proofread", kind)
		require.Equal(t, "waiting_for_review", status)
		require.Equal(t, f.actor.UserID, *owner)
		require.Equal(t, "en", payload["sourceLocale"])
		require.Equal(t, []any{"fr"}, payload["targetLocales"])
		require.Equal(t, map[string]any{"ticket": "WX-1", "title": "Review FR"}, payload["metadata"])

		var keyIDs []string
		rows, err := f.pool.Query(ctx, `SELECT translation_key_id::text FROM translation_job_keys WHERE job_id = $1`, created.ID)
		require.NoError(t, err)
		for rows.Next() {
			var id string
			require.NoError(t, rows.Scan(&id))
			keyIDs = append(keyIDs, id)
		}
		require.Equal(t, []string{home.ID}, keyIDs)

		var changeType, toStatus string
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT type, to_status::text FROM job_change_events WHERE job_id = $1`, created.ID).
			Scan(&changeType, &toStatus))
		require.Equal(t, "job.created", changeType)
		require.Equal(t, "waiting_for_review", toStatus)
		events := f.activities(t, "job_created")
		require.Equal(t, map[string]any{"jobId": created.ID, "kind": "proofread", "projectId": f.project, "status": "waiting_for_review"},
			events[len(events)-1].Payload)

		_, _, err = f.store.createJob(ctx, f.actor, jobCreate{
			Type: "keys", ProjectID: f.project,
			Keys: &keysJobInput{SourceLocale: "en", TargetLocales: []string{"fr"}, Keys: []string{"loose"}},
		}, nil)
		require.ErrorIs(t, err, errKeyJobNoStrings)
	})

	t.Run("string job is recorded as queued", func(t *testing.T) {
		created, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "string", ProjectID: f.project,
			String: &stringJobInput{SourceText: "Hello", SourceLocale: "en", TargetLocales: []string{"de"}, MaxLength: intPtr(20)},
		}, nil)
		require.NoError(t, err)
		kind, status, payload, _ := jobRow(t, created.ID)
		require.Equal(t, "translation", kind)
		require.Equal(t, "queued", status)
		require.Equal(t, "Hello", payload["sourceText"])
		require.EqualValues(t, 20, payload["maxLength"])
		var detailType string
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT type FROM translation_job_details WHERE job_id = $1`, created.ID).Scan(&detailType))
		require.Equal(t, "string", detailType)
	})

	t.Run("file job binds the source file version", func(t *testing.T) {
		fileID := "file_" + uuid.NewString()
		f.exec(t, `INSERT INTO stored_files (id, organization_id, project_id, created_by_user_id, role, source_kind,
				storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256, metadata)
			VALUES ($1, $2, $3, $4, 'source', 'repository_file', 'vercel_blob', $1, 'https://blob.test/' || $1,
				'en.json', 'application/json', 2, 'abc', '{"sourcePath":"./locales//en.json","uploadSurface":"public_api"}'::jsonb)`,
			fileID, f.actor.OrganizationID, f.project, f.actor.UserID)

		_, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{SourceFileID: fileID, FileFormat: "yaml", SourceLocale: "en", TargetLocales: []string{"fr"}},
		}, nil)
		var mismatch jobFormatMismatchError
		require.ErrorAs(t, err, &mismatch)
		require.Equal(t, "json", mismatch.Expected)

		created, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{SourceFileID: fileID, FileFormat: "json", SourceLocale: "en", TargetLocales: []string{"fr"}},
		}, nil)
		require.NoError(t, err)
		var versionPath string
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT v.source_path FROM translation_job_details d
			JOIN repository_source_file_versions v ON v.id = d.source_file_version_id WHERE d.job_id = $1`, created.ID).Scan(&versionPath))
		require.Equal(t, "locales/en.json", versionPath)

		// The second job reuses the version the first one made.
		again, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{SourceFileID: fileID, FileFormat: "json", SourceLocale: "en", TargetLocales: []string{"de"}},
		}, nil)
		require.NoError(t, err)
		var versions int
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(DISTINCT source_file_version_id) FROM translation_job_details
			WHERE job_id = ANY($1)`, []string{created.ID, again.ID}).Scan(&versions))
		require.Equal(t, 1, versions)

		_, _, err = f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{SourceFileID: "file_missing", FileFormat: "json", SourceLocale: "en", TargetLocales: []string{"fr"}},
		}, nil)
		require.ErrorIs(t, err, errJobSourceFileNotFound)
	})

	t.Run("file job binds the named branch version", func(t *testing.T) {
		fileID := "file_" + uuid.NewString()
		f.exec(t, `INSERT INTO stored_files (id, organization_id, project_id, created_by_user_id, role, source_kind,
				storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256, metadata)
			VALUES ($1, $2, $3, $4, 'source', 'repository_file', 'vercel_blob', $1, 'https://blob.test/' || $1,
				'en.json', 'application/json', 2, 'abc', '{"sourcePath":"locales/en.json","uploadSurface":"public_api"}'::jsonb)`,
			fileID, f.actor.OrganizationID, f.project, f.actor.UserID)

		created, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{
				SourceFileID: fileID, FileFormat: "json", SourceLocale: "en",
				TargetLocales: []string{"fr"}, Branch: strPtr("feature-checkout"),
			},
		}, nil)
		require.NoError(t, err)
		kind, status, payload, _ := jobRow(t, created.ID)
		require.Equal(t, "translation", kind)
		require.Equal(t, "queued", status)
		require.Equal(t, "feature-checkout", payload["branch"])

		var branch string
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT sf.branch_name FROM translation_job_details d
			JOIN repository_source_file_versions v ON v.id = d.source_file_version_id
			JOIN repository_source_files sf ON sf.id = v.repository_source_file_id
			WHERE d.job_id = $1`, created.ID).Scan(&branch))
		require.Equal(t, "feature-checkout", branch)

		again, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{
				SourceFileID: fileID, FileFormat: "json", SourceLocale: "en",
				TargetLocales: []string{"de"}, Branch: strPtr("feature-checkout"),
			},
		}, nil)
		require.NoError(t, err)
		var versions int
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(DISTINCT source_file_version_id) FROM translation_job_details
			WHERE job_id = ANY($1)`, []string{created.ID, again.ID}).Scan(&versions))
		require.Equal(t, 1, versions)

		mainJob, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "file", ProjectID: f.project,
			File: &fileJobInput{
				SourceFileID: fileID, FileFormat: "json", SourceLocale: "en",
				TargetLocales: []string{"fr"}, Branch: strPtr("main"),
			},
		}, nil)
		require.NoError(t, err)
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT sf.branch_name FROM translation_job_details d
			JOIN repository_source_file_versions v ON v.id = d.source_file_version_id
			JOIN repository_source_files sf ON sf.id = v.repository_source_file_id
			WHERE d.job_id = $1`, mainJob.ID).Scan(&branch))
		require.Equal(t, "main", branch)
	})

	t.Run("locales must belong to the project", func(t *testing.T) {
		for _, tc := range []struct {
			source, target, code string
		}{
			{"fr", "de", "job_source_locale_not_in_project"},
			{"en", "ja", "job_target_locale_not_in_project"},
			{"en", "x_y", "invalid_job_target_locale"},
		} {
			_, _, err := f.store.createJob(ctx, f.actor, jobCreate{
				Type: "string", ProjectID: f.project,
				String: &stringJobInput{SourceText: "Hi", SourceLocale: tc.source, TargetLocales: []string{tc.target}},
			}, nil)
			var localeErr jobLocaleError
			require.ErrorAs(t, err, &localeErr, tc.code)
			require.Equal(t, tc.code, localeErr.Code)
		}
	})

	t.Run("idempotency replays and refuses a different body", func(t *testing.T) {
		input := jobCreate{
			Type: "string", ProjectID: f.project,
			String: &stringJobInput{SourceText: "Once", SourceLocale: "en", TargetLocales: []string{"fr"}},
		}
		hash, err := input.requestHash()
		require.NoError(t, err)
		key := &jobIdempotency{Key: "req-" + uuid.NewString(), RequestHash: hash}
		first, replayed, err := f.store.createJob(ctx, f.actor, input, key)
		require.NoError(t, err)
		require.False(t, replayed)
		second, replayed, err := f.store.createJob(ctx, f.actor, input, key)
		require.NoError(t, err)
		require.True(t, replayed)
		require.Equal(t, first, second)

		_, _, err = f.store.createJob(ctx, f.actor, input, &jobIdempotency{Key: key.Key, RequestHash: "other"})
		require.ErrorIs(t, err, errIdempotencyKeyReused)
	})

	t.Run("owner must be a workspace member", func(t *testing.T) {
		_, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "string", ProjectID: f.project, OwnerEmail: "nobody@example.com",
			String: &stringJobInput{SourceText: "Hi", SourceLocale: "en", TargetLocales: []string{"fr"}},
		}, nil)
		require.ErrorIs(t, err, errJobOwnerNotFound)
	})

	t.Run("the open job budget stops AI jobs, not key jobs", func(t *testing.T) {
		f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload)
			SELECT 'job_budget_' || g, $1, $2, 'translation', 'queued', '{}'::jsonb FROM generate_series(1, 50) g`,
			f.actor.OrganizationID, f.project)
		_, _, err := f.store.createJob(ctx, f.actor, jobCreate{
			Type: "string", ProjectID: f.project,
			String: &stringJobInput{SourceText: "Hi", SourceLocale: "en", TargetLocales: []string{"fr"}},
		}, nil)
		var budget jobBudgetError
		require.ErrorAs(t, err, &budget)
		_, _, err = f.store.createJob(ctx, f.actor, jobCreate{
			Type: "keys", ProjectID: f.project,
			Keys: &keysJobInput{SourceLocale: "en", TargetLocales: []string{"fr"}, StringIDs: []string{home.ID}},
		}, nil)
		require.NoError(t, err)
	})
}
