package main

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeProjectAdminStore struct {
	adminErr     error
	projectPatch projectPatch
	upserts      []stringUpsert
	batch        stringBatchResult
}

func (s *fakeProjectAdminStore) updateProject(_ context.Context, _ principal, projectID string, patch projectPatch) (project, error) {
	s.projectPatch = patch
	return project{ID: projectID, TargetLocales: patch.TargetLocales}, s.adminErr
}

func (s *fakeProjectAdminStore) upsertStrings(_ context.Context, _ principal, _ string, items []stringUpsert) (stringBatchResult, error) {
	s.upserts = items
	return s.batch, s.adminErr
}

var projectWriteScopes = effectivePermissions([]string{"files:read", "files:write"}, "admin")

func TestProjectsWritePermission(t *testing.T) {
	require.Contains(t, effectivePermissions([]string{"files:write"}, "developer"), "projects:write")
	require.NotContains(t, effectivePermissions([]string{"files:write"}, "translator"), "projects:write")
	require.NotContains(t, effectivePermissions([]string{"files:read"}, "admin"), "projects:write")
}

func TestUpdateProjectRoute(t *testing.T) {
	t.Run("updates fields", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(projectWriteScopes...), store, http.MethodPatch, "/v1/projects/project-1",
			`{"name":" Web ","translationContext":"Crypto exchange","targetLocales":["es-419","az"]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "Web", *store.projectPatch.Name)
		require.Equal(t, "Crypto exchange", *store.projectPatch.TranslationContext)
		require.Equal(t, []string{"es-419", "az"}, store.projectPatch.TargetLocales)
	})

	t.Run("get still works", func(t *testing.T) {
		store := &fakeResourceStore{project: project{ID: "project-1", TargetLocales: []string{}}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1", "")
		require.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("requires projects:write", func(t *testing.T) {
		translator := effectivePermissions([]string{"files:read", "files:write"}, "translator")
		w := sendResource(t, resourcePrincipal(translator...), &fakeResourceStore{}, http.MethodPatch, "/v1/projects/project-1", `{"name":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("rejects invalid bodies and maps errors", func(t *testing.T) {
		for _, body := range []string{`{}`, `{"name":""}`, `{"sourceLocale":"en"}`} {
			w := sendResource(t, resourcePrincipal(projectWriteScopes...), &fakeResourceStore{}, http.MethodPatch, "/v1/projects/project-1", body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
		for err, code := range map[error]string{
			errInvalidTargetLocales: "invalid_target_locales",
			errSourceInTargets:      "source_in_targets",
			errProjectNotNative:     "project_not_native",
		} {
			store := &fakeResourceStore{}
			store.adminErr = err
			w := sendResource(t, resourcePrincipal(projectWriteScopes...), store, http.MethodPatch, "/v1/projects/project-1", `{"targetLocales":["fr"]}`)
			require.Contains(t, w.Body.String(), code)
		}
	})
}

func TestStringsBatchRoute(t *testing.T) {
	t.Run("parses items", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.batch = stringBatchResult{Created: 1, Updated: 1, Strings: []translationString{}}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects/project-1/strings/batch",
			`{"strings":[{"key":" a ","sourceText":" A ","filePath":"en.json","maxLength":20,"context":null},{"key":"b","hidden":true}]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.JSONEq(t, `{"created":1,"updated":1,"strings":[]}`, w.Body.String())
		require.Len(t, store.upserts, 2)
		require.Equal(t, "a", store.upserts[0].Key)
		require.Equal(t, "A", *store.upserts[0].SourceText)
		require.Equal(t, "en.json", *store.upserts[0].FilePath)
		require.Equal(t, 20, *store.upserts[0].MaxLength.Value)
		require.True(t, store.upserts[0].Context.Set)
		require.False(t, store.upserts[1].Context.Set)
		require.True(t, *store.upserts[1].Hidden)
	})

	t.Run("rejects invalid batches", func(t *testing.T) {
		tooMany := `{"strings":[` + strings.TrimSuffix(strings.Repeat(`{"key":"k","sourceText":"s"},`, 501), ",") + `]}`
		for _, body := range []string{`{"strings":[]}`, `{"strings":[{"key":""}]}`, `{"strings":[{"key":"a","maxLength":0}]}`, tooMany} {
			w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/projects/project-1/strings/batch", body)
			require.Equal(t, http.StatusBadRequest, w.Code)
		}
	})

	t.Run("reports the failing item", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.adminErr = errStringBatchItem{index: 3, err: errSegmentLocked}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects/project-1/strings/batch", `{"strings":[{"key":"a","sourceText":"A"}]}`)
		require.Equal(t, http.StatusConflict, w.Code)
		require.Equal(t, "3", w.Header().Get("X-Failed-Item"))
		require.Contains(t, w.Body.String(), "segment_locked")
	})
}

func TestStringListKeyFilter(t *testing.T) {
	store := &fakeResourceStore{}
	w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/strings?key=a&key=b.c", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, []string{"a", "b.c"}, store.stringFilters.Keys)
}

func TestNormalizeTargetLocales(t *testing.T) {
	en := "en"
	locales, err := normalizeTargetLocales([]string{"es-419", "ES-419", "az", "iw", "pt-br"}, &en)
	require.NoError(t, err)
	require.Equal(t, []string{"es-419", "az", "he", "pt-BR"}, locales)
	_, err = normalizeTargetLocales([]string{"fr", "EN"}, &en)
	require.ErrorIs(t, err, errSourceInTargets)
	for _, bad := range [][]string{{}, {"en_US"}, {"not a locale"}} {
		_, err = normalizeTargetLocales(bad, nil)
		require.ErrorIs(t, err, errInvalidTargetLocales)
	}
}
