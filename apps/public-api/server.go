package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

const maxTokenLength = 512

type apiServer struct {
	auth  authenticator
	store resourceStore
}

func newHandler(auth authenticator, stores ...resourceStore) http.Handler {
	var store resourceStore
	if len(stores) > 0 {
		store = stores[0]
	}
	s := apiServer{auth: auth, store: store}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/openapi.yaml", s.openAPISpec)
	mux.HandleFunc("/docs", s.docs)
	mux.HandleFunc("/v1/me", s.me)
	mux.HandleFunc("/v1/projects", s.projects)
	mux.HandleFunc("/v1/projects/", s.project)
	mux.HandleFunc("/v1/queries", s.queries)
	mux.HandleFunc("/v1/queries/", s.query)
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})
}

func (s apiServer) health(w http.ResponseWriter, r *http.Request) {
	if allowRead(w, r) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (s apiServer) me(w http.ResponseWriter, r *http.Request) {
	if !allowRead(w, r) {
		return
	}
	p, ok := s.authenticate(w, r, "")
	if ok {
		writeJSON(w, http.StatusOK, struct {
			Principal principal `json:"principal"`
		}{p})
	}
}

func (s apiServer) projects(w http.ResponseWriter, r *http.Request) {
	if !allowRead(w, r) {
		return
	}
	if r.URL.Path != "/v1/projects" {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return
	}
	p, ok := s.authenticate(w, r, "projects:read")
	if !ok {
		return
	}
	page, valid := parsePagination(w, r.URL.Query(), 25)
	if !valid {
		return
	}
	if s.store == nil {
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is unavailable")
		return
	}
	projects, total, err := s.store.listProjects(r.Context(), p, page.Limit, page.Offset)
	if err != nil {
		slog.Error("list projects failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Projects are temporarily unavailable")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Projects   []project  `json:"projects"`
		Pagination pagination `json:"pagination"`
	}{projects, page})
}

func (s apiServer) project(w http.ResponseWriter, r *http.Request) {
	if !allowRead(w, r) {
		return
	}
	projectID, ok := resourceID(r.URL.Path, "/v1/projects/")
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return
	}
	p, authenticated := s.authenticate(w, r, "projects:read")
	if !authenticated {
		return
	}
	if s.store == nil {
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is unavailable")
		return
	}
	item, err := s.store.getProject(r.Context(), p, projectID)
	switch {
	case errors.Is(err, errResourceNotFound):
		writeError(w, http.StatusNotFound, "project_not_found", "Project not found")
	case err != nil:
		slog.Error("get project failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Project is temporarily unavailable")
	default:
		writeJSON(w, http.StatusOK, struct {
			Project project `json:"project"`
		}{item})
	}
}

func (s apiServer) queries(w http.ResponseWriter, r *http.Request) {
	if !allowRead(w, r) {
		return
	}
	if r.URL.Path != "/v1/queries" {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return
	}
	p, ok := s.authenticate(w, r, "queries:read")
	if !ok || !requireQueriesEntitlement(w, p) {
		return
	}
	filters, valid := parseQueryFilters(w, r.URL.Query())
	if !valid {
		return
	}
	if s.store == nil {
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is unavailable")
		return
	}
	queries, total, err := s.store.listQueries(r.Context(), p, filters)
	if err != nil {
		slog.Error("list queries failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Queries are temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Queries    []queryRecord `json:"queries"`
		Pagination pagination    `json:"pagination"`
	}{queries, pagination{Offset: filters.Offset, Limit: filters.Limit, Total: total}})
}

func (s apiServer) query(w http.ResponseWriter, r *http.Request) {
	if !allowRead(w, r) {
		return
	}
	queryID, ok := resourceID(r.URL.Path, "/v1/queries/")
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return
	}
	p, authenticated := s.authenticate(w, r, "queries:read")
	if !authenticated || !requireQueriesEntitlement(w, p) {
		return
	}
	if s.store == nil {
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is unavailable")
		return
	}
	item, err := s.store.getQuery(r.Context(), p, queryID)
	switch {
	case errors.Is(err, errResourceNotFound):
		writeError(w, http.StatusNotFound, "query_not_found", "Query not found")
	case err != nil:
		slog.Error("get query failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Query is temporarily unavailable")
	default:
		writeJSON(w, http.StatusOK, struct {
			Query queryRecord `json:"query"`
		}{item})
	}
}

func (s apiServer) authenticate(w http.ResponseWriter, r *http.Request, permission string) (principal, bool) {
	tokens := r.Header.Values("X-Api-Key")
	if len(tokens) != 1 || tokens[0] == "" || len(tokens[0]) > maxTokenLength || strings.TrimSpace(tokens[0]) != tokens[0] || strings.Contains(tokens[0], ",") {
		writeError(w, http.StatusUnauthorized, "unauthorized", "A personal access token is required in x-api-key")
		return principal{}, false
	}
	p, err := s.auth.authenticate(r.Context(), tokens[0])
	switch {
	case errors.Is(err, errUnauthorized):
		writeError(w, http.StatusUnauthorized, "unauthorized", "Invalid or revoked API key")
	case errors.Is(err, errForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "Workspace access denied")
	case err != nil:
		writeError(w, http.StatusServiceUnavailable, "authentication_unavailable", "Authentication is temporarily unavailable")
	case permission != "" && !contains(p.Permissions, permission):
		writeError(w, http.StatusForbidden, "forbidden", "Missing required permission: "+permission)
	default:
		return p, true
	}
	return principal{}, false
}

func requireQueriesEntitlement(w http.ResponseWriter, p principal) bool {
	if p.Entitlements.Queries {
		return true
	}
	writeError(w, http.StatusForbidden, "feature_unavailable", "Queries is not included in the workspace plan")
	return false
}

func parsePagination(w http.ResponseWriter, values url.Values, defaultLimit int) (pagination, bool) {
	limit, ok := parseBoundedInt(values.Get("limit"), defaultLimit, 1, 100)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_query", "limit must be an integer between 1 and 100")
		return pagination{}, false
	}
	offset, ok := parseBoundedInt(values.Get("offset"), 0, 0, 1_000_000)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_query", "offset must be a non-negative integer")
		return pagination{}, false
	}
	return pagination{Limit: limit, Offset: offset}, true
}

func parseQueryFilters(w http.ResponseWriter, values url.Values) (queryFilters, bool) {
	page, ok := parsePagination(w, values, 50)
	if !ok {
		return queryFilters{}, false
	}
	filters := queryFilters{
		ProjectID: strings.TrimSpace(values.Get("projectId")),
		Status:    values.Get("status"),
		IssueType: values.Get("issueType"),
		Priority:  values.Get("priority"),
		Locale:    strings.TrimSpace(values.Get("locale")),
		Assignee:  values.Get("assignee"),
		Search:    strings.TrimSpace(values.Get("search")),
		Sort:      values.Get("sort"),
		SortDir:   values.Get("sortDir"),
		Limit:     page.Limit,
		Offset:    page.Offset,
	}
	if filters.Sort == "" {
		filters.Sort = "status"
	}
	if filters.SortDir == "" {
		filters.SortDir = "asc"
	}
	validAssignee := filters.Assignee == "" || filters.Assignee == "me" || filters.Assignee == "unassigned"
	if !validAssignee {
		_, assigneeErr := uuid.Parse(filters.Assignee)
		validAssignee = assigneeErr == nil
	}
	valid := member(filters.Status, "", "all", "open", "in_progress", "resolved", "wont_fix") &&
		member(filters.IssueType, "", "all", "general_question", "translation_mistake", "context_request", "source_mistake", "glossary_violation", "qa_failure") &&
		member(filters.Priority, "", "P0", "P1", "P2") &&
		member(filters.Sort, "updated_at", "created_at", "priority", "status") &&
		member(filters.SortDir, "asc", "desc") && validAssignee && len(filters.Search) <= 200 && len(filters.Locale) <= 32 && len(filters.ProjectID) <= 128
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return queryFilters{}, false
	}
	return filters, true
}

func parseBoundedInt(raw string, fallback, minimum, maximum int) (int, bool) {
	if raw == "" {
		return fallback, true
	}
	value, err := strconv.Atoi(raw)
	return value, err == nil && value >= minimum && value <= maximum
}

func resourceID(path, prefix string) (string, bool) {
	raw := strings.TrimPrefix(path, prefix)
	if raw == "" || strings.Contains(raw, "/") {
		return "", false
	}
	value, err := url.PathUnescape(raw)
	return value, err == nil && value != "" && len(value) <= 128
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func member(value string, allowed ...string) bool { return contains(allowed, value) }

func allowRead(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	w.Header().Set("Allow", "GET, HEAD")
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Use GET or HEAD")
	return false
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}{code, message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("response write failed", "status", status)
	}
}
