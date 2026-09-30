package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

type fakeResourceStore struct {
	projects     []project
	project      project
	queries      []queryRecord
	query        queryRecord
	total        int
	err          error
	queryFilters queryFilters
	projectID    string
	queryID      string
}

func (s *fakeResourceStore) listProjects(context.Context, principal, int, int) ([]project, int, error) {
	return s.projects, s.total, s.err
}

func (s *fakeResourceStore) getProject(_ context.Context, _ principal, id string) (project, error) {
	s.projectID = id
	return s.project, s.err
}

func (s *fakeResourceStore) listQueries(_ context.Context, _ principal, filters queryFilters) ([]queryRecord, int, error) {
	s.queryFilters = filters
	return s.queries, s.total, s.err
}

func (s *fakeResourceStore) getQuery(_ context.Context, _ principal, id string) (queryRecord, error) {
	s.queryID = id
	return s.query, s.err
}

func resourcePrincipal(scopes ...string) principal {
	return principal{
		TokenID:        "token-1",
		UserID:         "00000000-0000-0000-0000-000000000001",
		OrganizationID: "00000000-0000-0000-0000-000000000002",
		Permissions:    scopes,
		Entitlements:   entitlements{Queries: true},
	}
}

func requestResource(t *testing.T, p principal, store resourceStore, target string) *httptest.ResponseRecorder {
	t.Helper()
	h := newHandler(authFunc(func(context.Context, string) (principal, error) { return p, nil }), store)
	r := httptest.NewRequest(http.MethodGet, target, nil)
	r.Header.Set("X-Api-Key", "hl_test")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestProjectRoutes(t *testing.T) {
	store := &fakeResourceStore{projects: []project{{ID: "project-1", TargetLocales: []string{}}}, total: 1}
	w := requestResource(t, resourcePrincipal("projects:read"), store, "/v1/projects?limit=10&offset=2")
	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, `{"projects":[{"id":"project-1","name":"","identifier":"","description":"","source":"","externalProviderKind":null,"externalProjectId":null,"sourceLocale":null,"targetLocales":[],"externalProjectUrl":null,"active":false,"createdAt":"0001-01-01T00:00:00Z","updatedAt":"0001-01-01T00:00:00Z"}],"pagination":{"offset":2,"limit":10,"total":1}}`, w.Body.String())

	w = requestResource(t, resourcePrincipal("files:read"), store, "/v1/projects")
	require.Equal(t, http.StatusForbidden, w.Code)
	require.Contains(t, w.Body.String(), "projects:read")

	store.err = errResourceNotFound
	w = requestResource(t, resourcePrincipal("projects:read"), store, "/v1/projects/other-team")
	require.Equal(t, http.StatusNotFound, w.Code)
	require.Contains(t, w.Body.String(), "project_not_found")
}

func TestQueryRoutes(t *testing.T) {
	store := &fakeResourceStore{queries: []queryRecord{{ID: "query-1"}}, total: 1}
	w := requestResource(t, resourcePrincipal("queries:read"), store, "/v1/queries?status=open&priority=P1&assignee=me&sort=priority&sortDir=desc")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "open", store.queryFilters.Status)
	require.Equal(t, "P1", store.queryFilters.Priority)
	require.Equal(t, "me", store.queryFilters.Assignee)
	require.Equal(t, "priority", store.queryFilters.Sort)
	require.Equal(t, "desc", store.queryFilters.SortDir)

	p := resourcePrincipal("queries:read")
	p.Entitlements.Queries = false
	w = requestResource(t, p, store, "/v1/queries")
	require.Equal(t, http.StatusForbidden, w.Code)
	require.Contains(t, w.Body.String(), "feature_unavailable")

	w = requestResource(t, resourcePrincipal("queries:read"), store, "/v1/queries?assignee=not-a-uuid")
	require.Equal(t, http.StatusBadRequest, w.Code)

	store.err = errors.New("database unavailable")
	w = requestResource(t, resourcePrincipal("queries:read"), store, "/v1/queries/HL-123")
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.NotContains(t, w.Body.String(), "database unavailable")
}

func TestOpenAPIDocumentCoversImplementedResources(t *testing.T) {
	var document struct {
		OpenAPI string                    `yaml:"openapi"`
		Paths   map[string]map[string]any `yaml:"paths"`
	}
	require.NoError(t, yaml.Unmarshal(openAPIDocument, &document))
	require.Equal(t, "3.1.0", document.OpenAPI)
	for _, path := range []string{"/health", "/v1/me", "/v1/projects", "/v1/projects/{projectId}", "/v1/queries", "/v1/queries/{queryId}"} {
		require.Contains(t, document.Paths, path)
		require.Contains(t, document.Paths[path], "get")
	}

	w := httptest.NewRecorder()
	newHandler(authFunc(func(context.Context, string) (principal, error) { return principal{}, nil })).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/openapi.yaml", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "application/yaml", w.Header().Get("Content-Type"))
}
