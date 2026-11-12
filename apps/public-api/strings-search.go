package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/keymeta"
)

const (
	maxSearchLimit     = 1000
	defaultSearchLimit = 100
)

// stringSearchBody is POST /strings/search: the GET list's filters in a body, so one call can
// look up as many key names as a key job selects.
type stringSearchBody struct {
	Keys          []string `json:"keys"`
	KeyPrefix     string   `json:"keyPrefix"`
	Search        string   `json:"search"`
	FilePath      string   `json:"filePath"`
	Tags          []string `json:"tags"`
	IncludeHidden bool     `json:"includeHidden"`
	Limit         *int     `json:"limit"`
	Offset        int      `json:"offset"`
}

func (s apiServer) projectStringsSearch(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
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
	var body stringSearchBody
	if !decodeJSONBodyLimit(w, r, &body, maxStringBatchBodyBytes) {
		return
	}
	limit := defaultSearchLimit
	if body.Limit != nil {
		limit = *body.Limit
	}
	filters := stringFilters{
		Keys:          body.Keys,
		KeyPrefix:     body.KeyPrefix,
		Tags:          body.Tags,
		Search:        strings.TrimSpace(body.Search),
		FilePath:      strings.TrimSpace(body.FilePath),
		IncludeHidden: body.IncludeHidden,
		Limit:         limit,
		Offset:        body.Offset,
	}
	if limit < 1 || limit > maxSearchLimit || body.Offset < 0 || body.Offset > 1_000_000 ||
		len(filters.KeyPrefix) > 1000 || len(filters.Search) > 200 || len(filters.FilePath) > 2048 ||
		!validKeyNames(filters.Keys, maxSelectedStrings) || !keymeta.ValidTags(filters.Tags, maxTagFilters) {
		writeError(w, http.StatusBadRequest, "invalid_body",
			"keys takes up to 1,000 names, tags up to 10, limit 1 to 1,000; search is at most 200 characters")
		return
	}
	items, total, err := s.store.listStrings(r.Context(), p, projectID, filters)
	if err != nil {
		writeStoreError(w, err, "search strings")
		return
	}
	missing := []string{}
	if len(filters.Keys) > 0 {
		if missing, err = s.store.missingStringKeys(r.Context(), p, projectID, filters.Keys); err != nil {
			writeStoreError(w, err, "search strings")
			return
		}
	}
	writeJSON(w, http.StatusOK, struct {
		Strings     []translationString `json:"strings"`
		MissingKeys []string            `json:"missingKeys"`
		Pagination  pagination          `json:"pagination"`
	}{items, missing, pagination{Limit: limit, Offset: body.Offset, Total: total}})
}

// missingStringKeys returns the keys, in request order, that name no string in the project, in
// any file and whether hidden or not.
func (s *postgresStore) missingStringKeys(ctx context.Context, actor principal, projectID string, keys []string) ([]string, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT q.key FROM unnest($3::text[]) WITH ORDINALITY AS q(key, n)
		WHERE NOT EXISTS (
			SELECT 1 FROM project_translation_keys k
			WHERE k.organization_id = $1 AND k.project_id = $2 AND k.key = q.key
		)
		GROUP BY q.key ORDER BY min(q.n)`, actor.OrganizationID, scope.ID, keys)
	if err != nil {
		return nil, fmt.Errorf("find missing keys: %w", err)
	}
	defer rows.Close()
	missing := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("scan missing key: %w", err)
		}
		missing = append(missing, key)
	}
	return missing, rows.Err()
}

// likePrefix escapes LIKE wildcards so prefix matches literally.
func likePrefix(prefix string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix) + "%"
}
