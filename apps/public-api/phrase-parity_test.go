package main

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeParityStore struct {
	parityErr          error
	deletedProjectID   string
	markerScreenshotID string
	metadataProjectID  string
	metadataKeys       []stringMetadataKey
}

func (s *fakeParityStore) deleteProject(_ context.Context, _ principal, projectID string) error {
	s.deletedProjectID = projectID
	return s.parityErr
}

func (s *fakeParityStore) listScreenshotMarkers(_ context.Context, _ principal, _, screenshotID string) ([]screenshotMarker, error) {
	s.markerScreenshotID = screenshotID
	return []screenshotMarker{{ID: "marker-1", ScreenshotID: screenshotID, StringID: "string-1", Key: "home.title", Source: "manual"}}, s.parityErr
}

func (s *fakeParityStore) listStringMetadataKeys(_ context.Context, _ principal, projectID string) ([]stringMetadataKey, error) {
	s.metadataProjectID = projectID
	return s.metadataKeys, s.parityErr
}

func TestPhraseParityRoutes(t *testing.T) {
	readScopes := effectivePermissions([]string{"files:read"}, "member")
	writeScopes := effectivePermissions([]string{"files:read", "files:write"}, "developer")

	t.Run("deletes a project", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodDelete, "/v1/projects/project-1", "")
		require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
		require.Equal(t, "project-1", store.deletedProjectID)
	})

	t.Run("delete needs projects:write", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodDelete, "/v1/projects/project-1", "")
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Empty(t, store.deletedProjectID)
	})

	t.Run("delete refuses the last project of a team glossary", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.parityErr = errTeamGlossaryNeedsProject
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodDelete, "/v1/projects/project-1", "")
		require.Equal(t, http.StatusConflict, w.Code)
		require.Contains(t, w.Body.String(), `"error":"glossary_team_project_required"`)
	})

	t.Run("project detail names its methods", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/projects/project-1", "")
		require.Equal(t, http.StatusMethodNotAllowed, w.Code)
		require.Equal(t, "GET, HEAD, PATCH, DELETE", w.Header().Get("Allow"))
	})

	t.Run("patch takes active", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPatch, "/v1/projects/project-1", `{"active":false}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.NotNil(t, store.projectPatch.Active)
		require.False(t, *store.projectPatch.Active)
	})

	t.Run("restoring past the project limit", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.adminErr = errProjectLimitReached
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPatch, "/v1/projects/project-1", `{"active":true}`)
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), `"error":"workspace_resource_limit_reached"`)
	})

	t.Run("lists screenshot markers", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/screenshots/shot-1/markers", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "shot-1", store.markerScreenshotID)
		require.Contains(t, w.Body.String(), `"markers":[{"id":"marker-1"`)
	})

	t.Run("marker list needs strings:read", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/projects/project-1/screenshots/shot-1/markers", "")
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("lists string metadata keys", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.metadataKeys = []stringMetadataKey{{Key: "ticket", StringCount: 3}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/string-metadata-keys?projectId=project-1", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "project-1", store.metadataProjectID)
		require.JSONEq(t, `{"keys":[{"key":"ticket","stringCount":3}]}`, w.Body.String())
	})

	t.Run("string create and patch carry custom metadata", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects/project-1/strings",
			`{"key":"home.title","sourceText":"Home","customMetadata":{"ticket":"WX-1"}}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, map[string]string{"ticket": "WX-1"}, store.created.CustomMetadata)

		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPatch, "/v1/projects/project-1/strings/string-1",
			`{"customMetadata":{"ticket":null,"owner":"growth"}}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Nil(t, store.patch.CustomMetadata["ticket"])
		require.Equal(t, "growth", *store.patch.CustomMetadata["owner"])
	})

	t.Run("rejects invalid custom metadata", func(t *testing.T) {
		for _, body := range []string{
			`{"customMetadata":{"bad key":"x"}}`,
			`{"customMetadata":{"_x":"x"}}`,
			`{"customMetadata":{"ok":1}}`,
		} {
			w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPatch, "/v1/projects/p/strings/s", body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
	})
}

func TestStringCustomMetadataDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()

	created, err := f.store.createString(ctx, f.actor, f.project, stringCreate{
		Key: "home.title", SourceText: "Home", CustomMetadata: map[string]string{"ticket": "WX-1", "owner": "growth"},
	})
	require.NoError(t, err)
	require.Equal(t, map[string]string{"ticket": "WX-1", "owner": "growth"}, created.CustomMetadata)

	plain := f.createString(t, "", "home.body", "Welcome", nil)
	require.Equal(t, map[string]string{}, plain.CustomMetadata)

	// App-owned metadata beside `custom` stays as it is.
	f.exec(t, `UPDATE project_translation_keys SET metadata = metadata || '{"contentKind":"image_url"}'::jsonb WHERE id = $1`, created.ID)
	team := "web"
	updated, err := f.store.updateString(ctx, f.actor, f.project, created.ID, stringPatch{
		CustomMetadata: map[string]*string{"ticket": nil, "team": &team},
	})
	require.NoError(t, err)
	require.Equal(t, map[string]string{"owner": "growth", "team": "web"}, updated.CustomMetadata)
	var kind string
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT metadata->>'contentKind' FROM project_translation_keys WHERE id = $1`, created.ID).Scan(&kind))
	require.Equal(t, "image_url", kind)

	got, err := f.store.getString(ctx, f.actor, f.project, created.ID)
	require.NoError(t, err)
	require.Equal(t, updated.CustomMetadata, got.CustomMetadata)

	keys, err := f.store.listStringMetadataKeys(ctx, f.actor, "")
	require.NoError(t, err)
	require.Equal(t, []stringMetadataKey{{Key: "owner", StringCount: 1}, {Key: "team", StringCount: 1}}, keys)
	keys, err = f.store.listStringMetadataKeys(ctx, f.actor, f.project)
	require.NoError(t, err)
	require.Len(t, keys, 2)
	_, err = f.store.listStringMetadataKeys(ctx, f.actor, "project_missing")
	require.ErrorIs(t, err, errProjectNotFound)

	// Removing every key drops `custom`.
	updated, err = f.store.updateString(ctx, f.actor, f.project, created.ID, stringPatch{
		CustomMetadata: map[string]*string{"owner": nil, "team": nil},
	})
	require.NoError(t, err)
	require.Equal(t, map[string]string{}, updated.CustomMetadata)
	var hasCustom bool
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT metadata ? 'custom' FROM project_translation_keys WHERE id = $1`, created.ID).Scan(&hasCustom))
	require.False(t, hasCustom)

	tooMany := map[string]*string{}
	value := "x"
	for i := range maxCustomMetadataEntries + 1 {
		tooMany[uuid.NewString()[:8]+string(rune('a'+i%26))] = &value
	}
	_, err = f.store.updateString(ctx, f.actor, f.project, created.ID, stringPatch{CustomMetadata: tooMany})
	require.ErrorIs(t, err, errTooManyCustomMetadata)
}

func TestProjectStatusAndDeleteDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	inactive := false
	active := true

	archived, err := f.store.updateProject(ctx, f.actor, f.project, projectPatch{Active: &inactive})
	require.NoError(t, err)
	require.False(t, archived.Active)
	events := f.activities(t, "project_settings_changed")
	require.Equal(t, []any{"active"}, events[len(events)-1].Payload["changedFields"])

	// Without Autumn a workspace holds one active project, so restoring needs a free slot.
	other := "project_" + uuid.NewString()[:8]
	f.exec(t, `INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales)
		VALUES ($1, $2, $3, 'Other', $4, 'native', 'en', '["fr"]'::jsonb)`,
		other, f.actor.OrganizationID, f.actor.UserID, "O"+strings.ToUpper(uuid.NewString()[:7]))
	_, err = f.store.updateProject(ctx, f.actor, f.project, projectPatch{Active: &active})
	require.ErrorIs(t, err, errProjectLimitReached)

	require.NoError(t, f.store.deleteProject(ctx, f.actor, other))
	restored, err := f.store.updateProject(ctx, f.actor, f.project, projectPatch{Active: &active})
	require.NoError(t, err)
	require.True(t, restored.Active)
	deleted := f.activities(t, "project_deleted")
	require.Len(t, deleted, 1)
	require.Equal(t, map[string]any{"resourceId": other}, deleted[0].Payload)
	require.ErrorIs(t, f.store.deleteProject(ctx, f.actor, other), errProjectNotFound)

	// The last native project of a team glossary stays.
	teamID, glossaryID := uuid.NewString(), uuid.NewString()
	f.exec(t, `INSERT INTO teams (id, organization_id, slug, name) VALUES ($1, $2, 'loc', 'Localization')`, teamID, f.actor.OrganizationID)
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale, source, control_level, team_id)
		VALUES ($1, $2, 'Team terms', 'en', 'native', 'team', $3)`, glossaryID, f.actor.OrganizationID, teamID)
	f.exec(t, `INSERT INTO project_glossaries (organization_id, project_id, glossary_id) VALUES ($1, $2, $3)`,
		f.actor.OrganizationID, f.project, glossaryID)
	require.ErrorIs(t, f.store.deleteProject(ctx, f.actor, f.project), errTeamGlossaryNeedsProject)

	f.exec(t, `DELETE FROM project_glossaries WHERE glossary_id = $1`, glossaryID)
	require.NoError(t, f.store.deleteProject(ctx, f.actor, f.project))
	_, err = f.store.getProject(ctx, f.actor, f.project)
	require.ErrorIs(t, err, errResourceNotFound)
}
