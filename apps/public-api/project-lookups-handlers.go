package main

import (
	"errors"
	"net/http"
	"strings"
)

func writeSourceFileStoreError(w http.ResponseWriter, err error, operation string) {
	if errors.Is(err, errProjectSourceFileNotFound) {
		writeError(w, http.StatusNotFound, "source_file_not_found", "Source file not found")
		return
	}
	writeStoreError(w, err, operation)
}

// projectSourceFiles lists a project's tracked source files with their import settings. path and
// branch narrow the list to an exact match.
func (s apiServer) projectSourceFiles(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	filters := sourceFileFilters{
		Branch: strings.TrimSpace(values.Get("branch")),
		Path:   strings.TrimSpace(values.Get("path")),
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if len(filters.Branch) > 256 || len(filters.Path) > 1024 {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return
	}
	items, total, err := s.store.listSourceFiles(r.Context(), p, projectID, filters)
	if err != nil {
		writeSourceFileStoreError(w, err, "list source files")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		SourceFiles []projectSourceFile `json:"sourceFiles"`
		Pagination  pagination          `json:"pagination"`
	}{items, page})
}

// projectSourceFile reads one tracked source file and its import settings.
func (s apiServer) projectSourceFile(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	fileID, ok := pathID(w, r, "fileId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	item, err := s.store.getSourceFile(r.Context(), p, projectID, fileID)
	if err != nil {
		writeSourceFileStoreError(w, err, "get source file")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		SourceFile projectSourceFile `json:"sourceFile"`
	}{item})
}

// projectContentSyncRoute reads a project's built-in content sync and its latest runs.
func (s apiServer) projectContentSyncRoute(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "projects:read")
	if !ok {
		return
	}
	item, err := s.store.getProjectContentSync(r.Context(), p, projectID)
	if err != nil {
		writeStoreError(w, err, "get content sync")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		ContentSync projectContentSync `json:"contentSync"`
	}{item})
}
