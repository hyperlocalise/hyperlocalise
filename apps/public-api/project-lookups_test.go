package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeProjectLookupStore struct {
	lookupErr         error
	lookupProjectID   string
	lookupFileID      string
	sourceFileFilters sourceFileFilters
	sourceFiles       []projectSourceFile
	contentSync       projectContentSync
}

func (s *fakeProjectLookupStore) listSourceFiles(_ context.Context, _ principal, projectID string, filters sourceFileFilters) ([]projectSourceFile, int, error) {
	s.lookupProjectID, s.sourceFileFilters = projectID, filters
	return s.sourceFiles, len(s.sourceFiles), s.lookupErr
}

func (s *fakeProjectLookupStore) getSourceFile(_ context.Context, _ principal, projectID, fileID string) (projectSourceFile, error) {
	s.lookupProjectID, s.lookupFileID = projectID, fileID
	return projectSourceFile{ID: fileID, Path: "en.json", PlaceholderPatterns: []string{}}, s.lookupErr
}

func (s *fakeProjectLookupStore) getProjectContentSync(_ context.Context, _ principal, projectID string) (projectContentSync, error) {
	s.lookupProjectID = projectID
	return s.contentSync, s.lookupErr
}

func TestProjectLookupRoutes(t *testing.T) {
	readScopes := effectivePermissions([]string{"files:read"}, "member")

	t.Run("lists source files with filters", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.sourceFiles = []projectSourceFile{{ID: "file-1", Path: "locales/en.json", Branch: "main", MessageFormat: "icu", PlaceholderPatterns: []string{}}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet,
			"/v1/projects/project-1/source-files?path=locales/en.json&branch=main&limit=10", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "project-1", store.lookupProjectID)
		require.Equal(t, sourceFileFilters{Path: "locales/en.json", Branch: "main", Limit: 10}, store.sourceFileFilters)
		require.Contains(t, w.Body.String(), `"sourceFiles":[{"id":"file-1","path":"locales/en.json","branch":"main","messageFormat":"icu"`)
		require.Contains(t, w.Body.String(), `"pagination":{"offset":0,"limit":10,"total":1}`)
	})

	t.Run("reads one source file", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/source-files/file-1", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "file-1", store.lookupFileID)
		require.Contains(t, w.Body.String(), `"sourceFile":{"id":"file-1"`)
	})

	t.Run("missing source file", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.lookupErr = errProjectSourceFileNotFound
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/source-files/file-1", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), `"error":"source_file_not_found"`)
	})

	t.Run("reads the content sync", func(t *testing.T) {
		store := &fakeResourceStore{}
		provider := "gitlab"
		store.contentSync = projectContentSync{
			Sync: &contentSyncSettings{ID: "sync-1", Provider: &provider, Config: json.RawMessage(`{"provider":"gitlab"}`), Schedule: "daily"},
			Runs: []contentSyncRun{},
		}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/content-sync", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"contentSync":{"sync":{"id":"sync-1","provider":"gitlab","config":{"provider":"gitlab"},"schedule":"daily"`)
	})

	t.Run("missing project", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.lookupErr = errProjectNotFound
		for _, target := range []string{"/v1/projects/p/source-files", "/v1/projects/p/content-sync"} {
			w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, target, "")
			require.Equal(t, http.StatusNotFound, w.Code, target)
			require.Contains(t, w.Body.String(), `"error":"project_not_found"`)
		}
	})

	t.Run("requires read scopes", func(t *testing.T) {
		for _, target := range []string{"/v1/projects/p/source-files", "/v1/projects/p/source-files/f", "/v1/projects/p/content-sync"} {
			w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodGet, target, "")
			require.Equal(t, http.StatusForbidden, w.Code, target)
		}
	})

	t.Run("rejects invalid filters", func(t *testing.T) {
		long := make([]byte, 1025)
		for i := range long {
			long[i] = 'a'
		}
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/projects/p/source-files?path="+string(long), "")
		require.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestProjectLookupsDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()

	t.Run("source files carry their import settings", func(t *testing.T) {
		fileID := f.sourceFile(t, "locales/en.json")
		f.sourceFile(t, "docs/en.html")
		f.exec(t, `UPDATE repository_source_files SET message_format = 'icu', placeholder_patterns = '["%\\d+"]'::jsonb,
			import_settings = '{"json":{"keyPathFilter":"ui.*"}}'::jsonb WHERE id = $1`, fileID)

		items, total, err := f.store.listSourceFiles(ctx, f.actor, f.project, sourceFileFilters{Limit: 10})
		require.NoError(t, err)
		require.Equal(t, 2, total)
		require.Equal(t, "docs/en.html", items[0].Path)
		require.Equal(t, []string{}, items[0].PlaceholderPatterns)
		require.Equal(t, "auto", items[0].MessageFormat)

		items, total, err = f.store.listSourceFiles(ctx, f.actor, f.project, sourceFileFilters{Path: "locales/en.json", Branch: "main", Limit: 10})
		require.NoError(t, err)
		require.Equal(t, 1, total)
		require.Equal(t, fileID, items[0].ID)
		require.Equal(t, "icu", items[0].MessageFormat)
		require.Equal(t, []string{`%\d+`}, items[0].PlaceholderPatterns)
		require.JSONEq(t, `{"json":{"keyPathFilter":"ui.*"}}`, string(items[0].ImportSettings))
		require.JSONEq(t, `{"enabled":false,"template":"default"}`, string(items[0].Segmentation))

		item, err := f.store.getSourceFile(ctx, f.actor, f.project, fileID)
		require.NoError(t, err)
		require.Equal(t, "locales/en.json", item.Path)

		_, err = f.store.getSourceFile(ctx, f.actor, f.project, uuid.NewString())
		require.ErrorIs(t, err, errProjectSourceFileNotFound)
		_, err = f.store.getSourceFile(ctx, f.actor, f.project, "not-a-uuid")
		require.ErrorIs(t, err, errProjectSourceFileNotFound)

		outsider := principal{UserID: uuid.NewString(), OrganizationID: f.actor.OrganizationID}
		_, _, err = f.store.listSourceFiles(ctx, outsider, f.project, sourceFileFilters{Limit: 10})
		require.ErrorIs(t, err, errProjectNotFound)
	})

	t.Run("content sync and its latest runs", func(t *testing.T) {
		sync, err := f.store.getProjectContentSync(ctx, f.actor, f.project)
		require.NoError(t, err)
		require.Nil(t, sync.Sync)
		require.Equal(t, []contentSyncRun{}, sync.Runs)

		var syncID string
		require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO project_content_syncs (organization_id, project_id, sync_config, schedule)
			VALUES ($1, $2, '{"provider":"gitlab","connectionId":"c1","resourceKey":"group/app","projectFolder":"locales"}'::jsonb, 'daily')
			RETURNING id`, f.actor.OrganizationID, f.project).Scan(&syncID))
		f.exec(t, `INSERT INTO project_content_sync_runs (sync_id, organization_id, project_id, trigger, status, summary, completed_at, created_at)
			VALUES ($1, $2, $3, 'scheduled', 'succeeded', '{"pushed":{"pullRequestUrl":"https://gitlab.example.com/mr/1"}}'::jsonb, now(), now() - interval '1 hour')`,
			syncID, f.actor.OrganizationID, f.project)
		f.exec(t, `INSERT INTO project_content_sync_runs (sync_id, organization_id, project_id, trigger, status, summary, error_code, error_message)
			VALUES ($1, $2, $3, 'manual', 'failed', '{"provider":"github"}'::jsonb, 'push_failed', 'GitLab refused the push')`,
			syncID, f.actor.OrganizationID, f.project)

		sync, err = f.store.getProjectContentSync(ctx, f.actor, f.project)
		require.NoError(t, err)
		require.NotNil(t, sync.Sync)
		require.Equal(t, syncID, sync.Sync.ID)
		require.Equal(t, "gitlab", *sync.Sync.Provider)
		require.Equal(t, "daily", sync.Sync.Schedule)
		require.Len(t, sync.Runs, 2)
		require.Equal(t, "failed", sync.Runs[0].Status)
		require.Equal(t, "github", *sync.Runs[0].Provider)
		require.Equal(t, "push_failed", *sync.Runs[0].ErrorCode)
		require.Nil(t, sync.Runs[0].PullRequestURL)
		require.Equal(t, "gitlab", *sync.Runs[1].Provider)
		require.Equal(t, "https://gitlab.example.com/mr/1", *sync.Runs[1].PullRequestURL)
	})
}
