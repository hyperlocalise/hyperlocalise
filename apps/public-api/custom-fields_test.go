package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/customfield"
	"github.com/hyperlocalise/hyperlocalise/internal/projecttemplate"
	"github.com/stretchr/testify/require"
)

// fakeExtrasStore satisfies resourceStore's custom field, string search, and bulk job methods.
type fakeExtrasStore struct {
	extrasErr     error
	field         customfield.Field
	fieldInput    customfield.CreateInput
	fieldUpdate   customfield.UpdateInput
	fieldID       string
	projectValues map[string]json.RawMessage
	missingKeys   []string
	bulkJobIDs    []string
	bulkPatch     jobPatch
}

func (s *fakeExtrasStore) listCustomFields(context.Context, principal) ([]customfield.Field, error) {
	return []customfield.Field{s.field}, s.extrasErr
}

func (s *fakeExtrasStore) getCustomField(_ context.Context, _ principal, id string) (customfield.Field, error) {
	s.fieldID = id
	return s.field, s.extrasErr
}

func (s *fakeExtrasStore) createCustomField(_ context.Context, _ principal, in customfield.CreateInput) (customfield.Field, error) {
	s.fieldInput = in
	return s.field, s.extrasErr
}

func (s *fakeExtrasStore) updateCustomField(_ context.Context, _ principal, id string, in customfield.UpdateInput) (customfield.Field, error) {
	s.fieldID, s.fieldUpdate = id, in
	return s.field, s.extrasErr
}

func (s *fakeExtrasStore) deleteCustomField(_ context.Context, _ principal, id string) error {
	s.fieldID = id
	return s.extrasErr
}

func (s *fakeExtrasStore) getProjectCustomFields(context.Context, principal, string) ([]customfield.ProjectValue, error) {
	return []customfield.ProjectValue{}, s.extrasErr
}

func (s *fakeExtrasStore) setProjectCustomFields(_ context.Context, _ principal, _ string, values map[string]json.RawMessage) ([]customfield.ProjectValue, error) {
	s.projectValues = values
	return []customfield.ProjectValue{}, s.extrasErr
}

func (s *fakeExtrasStore) missingStringKeys(context.Context, principal, string, []string) ([]string, error) {
	return s.missingKeys, s.extrasErr
}

func (s *fakeExtrasStore) bulkUpdateJobs(_ context.Context, _ principal, ids []string, patch jobPatch) ([]job, error) {
	s.bulkJobIDs, s.bulkPatch = ids, patch
	items := make([]job, len(ids))
	for i, id := range ids {
		items[i] = job{ID: id}
	}
	return items, s.extrasErr
}

func TestCustomFieldPermissions(t *testing.T) {
	require.Contains(t, readScopes, "custom-fields:read")
	require.NotContains(t, writeScopes, "custom-fields:write")
	require.Contains(t, templateManagerScopes, "custom-fields:write")
}

func TestCustomFieldRoutes(t *testing.T) {
	t.Run("lists for readers", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.field = customfield.Field{ID: "f-1", Key: "request_ref", Options: []customfield.Option{}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/custom-fields", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"customFields":[{"id":"f-1","key":"request_ref"`)
	})

	t.Run("create needs custom-fields:write", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/custom-fields", `{"key":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("creates", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(templateManagerScopes...), store, http.MethodPost, "/v1/custom-fields",
			`{"key":"markets","name":"Markets","type":"multi_select","options":[{"value":"EU"},{"value":"LATAM"}]}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, "multi_select", store.fieldInput.Type)
		require.Len(t, store.fieldInput.Options, 2)
	})

	t.Run("patch needs a field and lists options by key", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(templateManagerScopes...), store, http.MethodPatch, "/v1/custom-fields/markets", `{}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		store.field = customfield.Field{Options: []customfield.Option{{ID: "o-1", Value: "EU"}}}
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/custom-fields/markets/options", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "markets", store.fieldID)
		require.Contains(t, w.Body.String(), `"options":[{"id":"o-1","value":"EU"}]`)
	})

	t.Run("sets project values with projects:write", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPut, "/v1/projects/p1/custom-fields", `{"customFields":{"a":"b"}}`)
		require.Equal(t, http.StatusForbidden, w.Code)
		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPut, "/v1/projects/p1/custom-fields",
			`{"customFields":{"request_ref":"REQ-7","due":null}}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.JSONEq(t, `"REQ-7"`, string(store.projectValues["request_ref"]))
		require.Equal(t, "null", string(store.projectValues["due"]))
	})

	t.Run("maps errors", func(t *testing.T) {
		cases := []struct {
			err    error
			status int
			code   string
		}{
			{customfield.ErrNotFound, http.StatusNotFound, "custom_field_not_found"},
			{customfield.ErrKeyTaken, http.StatusConflict, "custom_field_key_taken"},
			{customfield.ValidationError{Field: "options", Message: "bad"}, http.StatusBadRequest, "invalid_body"},
		}
		for _, tc := range cases {
			store := &fakeResourceStore{}
			store.extrasErr = tc.err
			w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/custom-fields/x", "")
			require.Equal(t, tc.status, w.Code, w.Body.String())
			require.Contains(t, w.Body.String(), tc.code)
		}
	})

	t.Run("project create passes custom fields", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects",
			`{"name":"REQ-7","customFields":{"request_ref":"REQ-7"}}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.JSONEq(t, `"REQ-7"`, string(store.projectCreate.CustomFields["request_ref"]))
	})
}

func TestCustomFieldStore(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()

	ref, err := f.store.createCustomField(ctx, f.actor, customfield.CreateInput{Key: "request_ref", Name: "Request", Type: "text"})
	require.NoError(t, err)
	_, err = f.store.createCustomField(ctx, f.actor, customfield.CreateInput{Key: "request_ref", Name: "Again", Type: "text"})
	require.ErrorIs(t, err, customfield.ErrKeyTaken)
	_, err = f.store.createCustomField(ctx, f.actor, customfield.CreateInput{Key: "Bad Key", Name: "x", Type: "text"})
	require.ErrorAs(t, err, &customfield.ValidationError{})
	_, err = f.store.createCustomField(ctx, f.actor, customfield.CreateInput{Key: "tier", Name: "Tier", Type: "single_select"})
	require.ErrorAs(t, err, &customfield.ValidationError{}, "select fields need options")

	markets, err := f.store.createCustomField(ctx, f.actor, customfield.CreateInput{
		Key: "markets", Name: "Markets", Type: "multi_select",
		Options: []customfield.OptionInput{{Value: "EU"}, {Value: "LATAM"}, {Value: "APAC"}},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"EU", "LATAM", "APAC"}, optionValues(markets.Options))
	eu, latam, apac := markets.Options[0].ID, markets.Options[1].ID, markets.Options[2].ID

	values, err := f.store.setProjectCustomFields(ctx, f.actor, f.project, map[string]json.RawMessage{
		"request_ref": json.RawMessage(`" REQ-7 "`),
		markets.ID:    json.RawMessage(`["eu", "` + apac + `"]`),
	})
	require.NoError(t, err)
	require.Len(t, values, 2)
	byKey := map[string]customfield.ProjectValue{}
	for _, value := range values {
		byKey[value.Key] = value
	}
	require.Equal(t, "REQ-7", byKey["request_ref"].Value)
	require.Equal(t, []customfield.Option{{ID: eu, Value: "EU"}, {ID: apac, Value: "APAC"}}, byKey["markets"].Value)
	require.Len(t, f.activities(t, "project_settings_changed"), 1)

	_, err = f.store.setProjectCustomFields(ctx, f.actor, f.project, map[string]json.RawMessage{"markets": json.RawMessage(`["Mars"]`)})
	require.ErrorAs(t, err, &customfield.ValidationError{})
	_, err = f.store.setProjectCustomFields(ctx, f.actor, f.project, map[string]json.RawMessage{"nope": json.RawMessage(`"x"`)})
	require.ErrorAs(t, err, &customfield.ValidationError{})

	// Renaming keeps an option's selections; dropping one removes it from values. EU and LATAM
	// swap values to check renames cannot clash.
	updated, err := f.store.updateCustomField(ctx, f.actor, "markets", customfield.UpdateInput{Options: &[]customfield.OptionInput{
		{ID: &latam, Value: "EU"}, {ID: &eu, Value: "Europe"}, {Value: "MEA"},
	}})
	require.NoError(t, err)
	require.Equal(t, []string{"EU", "Europe", "MEA"}, optionValues(updated.Options))
	values, err = f.store.getProjectCustomFields(ctx, f.actor, f.project)
	require.NoError(t, err)
	for _, value := range values {
		if value.Key == "markets" {
			require.Equal(t, []customfield.Option{{ID: eu, Value: "Europe"}}, value.Value)
		}
	}

	// Dropping the last chosen option clears the value.
	_, err = f.store.updateCustomField(ctx, f.actor, markets.ID, customfield.UpdateInput{Options: &[]customfield.OptionInput{{ID: &latam, Value: "EU"}}})
	require.NoError(t, err)
	values, err = f.store.getProjectCustomFields(ctx, f.actor, f.project)
	require.NoError(t, err)
	require.Len(t, values, 1)
	require.Equal(t, "request_ref", values[0].Key)

	values, err = f.store.setProjectCustomFields(ctx, f.actor, f.project, map[string]json.RawMessage{"request_ref": json.RawMessage(`null`)})
	require.NoError(t, err)
	require.Empty(t, values)

	// A new project takes values in its create transaction.
	f.store.autumn = allowingAutumn(t)
	en := "en"
	created, err := f.store.createProject(ctx, f.actor, projectCreate{
		ProjectRequest: projecttemplate.ProjectRequest{Name: "REQ-8", SourceLocale: &en, TargetLocales: &[]string{"vi"}},
		CustomFields:   map[string]json.RawMessage{"request_ref": json.RawMessage(`"REQ-8"`)},
	})
	require.NoError(t, err)
	values, err = f.store.getProjectCustomFields(ctx, f.actor, created.ID)
	require.NoError(t, err)
	require.Equal(t, "REQ-8", values[0].Value)
	_, err = f.store.createProject(ctx, f.actor, projectCreate{
		ProjectRequest: projecttemplate.ProjectRequest{Name: "REQ-9", SourceLocale: &en, TargetLocales: &[]string{"vi"}},
		CustomFields:   map[string]json.RawMessage{"request_ref": json.RawMessage(`42`)},
	})
	require.ErrorAs(t, err, &customfield.ValidationError{})

	require.NoError(t, f.store.deleteCustomField(ctx, f.actor, ref.ID))
	values, err = f.store.getProjectCustomFields(ctx, f.actor, created.ID)
	require.NoError(t, err)
	require.Empty(t, values)
	require.ErrorIs(t, f.store.deleteCustomField(ctx, f.actor, ref.ID), customfield.ErrNotFound)
}

func optionValues(options []customfield.Option) []string {
	values := make([]string, len(options))
	for i, option := range options {
		values[i] = option.Value
	}
	return values
}

func TestStringSearch(t *testing.T) {
	t.Run("route checks the body and reports missing keys", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.missingKeys = []string{"gone"}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/projects/p1/strings/search",
			`{"keys":["home.title","gone"],"limit":500}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"missingKeys":["gone"]`)
		require.Contains(t, w.Body.String(), `"limit":500`)
		require.Equal(t, []string{"home.title", "gone"}, store.stringFilters.Keys)

		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/projects/p1/strings/search", `{"limit":1001}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/projects/p1/strings/search", `{"keys":[""]}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("database", func(t *testing.T) {
		f := newDBFixture(t)
		ctx := t.Context()
		f.createString(t, "", "home.title", "Home", nil)
		f.createString(t, "", "home_title", "Underscore", nil)
		f.createString(t, "", "checkout.pay", "Pay", nil)

		items, total, err := f.store.listStrings(ctx, f.actor, f.project, stringFilters{KeyPrefix: "home.", Limit: 10})
		require.NoError(t, err)
		require.Equal(t, 1, total, "the prefix's dot and underscore match literally")
		require.Equal(t, "home.title", items[0].Key)

		missing, err := f.store.missingStringKeys(ctx, f.actor, f.project, []string{"zz", "home.title", "aa", "zz"})
		require.NoError(t, err)
		require.Equal(t, []string{"zz", "aa"}, missing)
	})
}

func TestJobsBulkUpdate(t *testing.T) {
	t.Run("route", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs/bulk-update",
			`{"jobIds":["b"," a ","b"],"dueAt":"2026-12-01T09:00:00Z"}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, []string{"b", "a"}, store.bulkJobIDs)
		require.True(t, store.bulkPatch.DueAt.Set)

		w = sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs/bulk-update", `{"jobIds":["a"]}`)
		require.Equal(t, http.StatusBadRequest, w.Code, "a change is required")
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/jobs/bulk-update", `{"jobIds":["a"],"title":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)

		store.extrasErr = jobBulkError{JobID: "a", Err: errJobNotFound}
		w = sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPost, "/v1/jobs/bulk-update", `{"jobIds":["a"],"title":"x"}`)
		require.Equal(t, http.StatusNotFound, w.Code)
		require.JSONEq(t, `{"error":"job_not_found","message":"Job not found","details":{"jobId":"a"}}`, w.Body.String())
	})

	t.Run("database", func(t *testing.T) {
		f := newDBFixture(t)
		ctx := t.Context()
		ids := []string{"job_" + uuid.NewString(), "job_" + uuid.NewString()}
		for _, id := range ids {
			f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload)
				VALUES ($1, $2, $3, 'translation', 'queued', '{}'::jsonb)`, id, f.actor.OrganizationID, f.project)
		}
		due := time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC)
		items, err := f.store.bulkUpdateJobs(ctx, f.actor, []string{ids[1], ids[0]}, jobPatch{DueAt: optionalTime{Set: true, Value: &due}})
		require.NoError(t, err)
		require.Equal(t, ids[1], items[0].ID)
		for _, item := range items {
			require.True(t, due.Equal(*item.DueAt))
		}
		require.Len(t, f.activities(t, "job_updated"), 2)

		// One unknown job rolls back the whole update.
		title := "Changed"
		_, err = f.store.bulkUpdateJobs(ctx, f.actor, []string{ids[0], "job_missing"}, jobPatch{Title: &title})
		require.ErrorIs(t, err, errJobNotFound)
		var bulk jobBulkError
		require.ErrorAs(t, err, &bulk)
		require.Equal(t, "job_missing", bulk.JobID)
		unchanged, err := f.store.getJob(ctx, f.actor, ids[0])
		require.NoError(t, err)
		require.Nil(t, unchanged.Title)
	})
}
