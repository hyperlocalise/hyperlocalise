package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// Custom metadata is free-form text a caller keeps on a string, such as a ticket or a source
// system's ID. It lives under `custom` in the key's metadata, beside what the app keeps there.
const (
	maxCustomMetadataEntries    = 50
	maxCustomMetadataValueBytes = 2000
)

var customMetadataKeyPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)

// customMetadataColumn reads a key's custom metadata, or NULL when it holds none.
const customMetadataColumn = `CASE WHEN jsonb_typeof(k.metadata->'custom') = 'object' THEN k.metadata->'custom' END`

// decodeCustomMetadata reads stored custom metadata. Values that are not strings are skipped.
func decodeCustomMetadata(raw []byte) map[string]string {
	out := map[string]string{}
	var stored map[string]json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &stored) != nil {
		return out
	}
	for key, value := range stored {
		var text string
		if json.Unmarshal(value, &text) == nil {
			out[key] = text
		}
	}
	return out
}

func validCustomMetadataEntry(key, value string) bool {
	return customMetadataKeyPattern.MatchString(key) && len(value) <= maxCustomMetadataValueBytes
}

// validCustomMetadata checks the custom metadata of a new string.
func validCustomMetadata(metadata map[string]string) bool {
	if len(metadata) > maxCustomMetadataEntries {
		return false
	}
	for key, value := range metadata {
		if !validCustomMetadataEntry(key, value) {
			return false
		}
	}
	return true
}

// validCustomMetadataPatch checks a merge patch: a string sets the key, null removes it.
func validCustomMetadataPatch(patch map[string]*string) bool {
	if len(patch) > maxCustomMetadataEntries*2 {
		return false
	}
	for key, value := range patch {
		if value == nil {
			if !customMetadataKeyPattern.MatchString(key) {
				return false
			}
			continue
		}
		if !validCustomMetadataEntry(key, *value) {
			return false
		}
	}
	return true
}

// mergeCustomMetadata applies a merge patch to stored custom metadata.
func mergeCustomMetadata(current map[string]string, patch map[string]*string) (map[string]string, error) {
	merged := make(map[string]string, len(current)+len(patch))
	for key, value := range current {
		merged[key] = value
	}
	for key, value := range patch {
		if value == nil {
			delete(merged, key)
		} else {
			merged[key] = *value
		}
	}
	if len(merged) > maxCustomMetadataEntries {
		return nil, errTooManyCustomMetadata
	}
	return merged, nil
}

// customMetadataSet is the SQL that stores custom metadata on a key, given the JSON object as
// parameter placeholder; an empty object removes `custom`.
func customMetadataSet(metadata map[string]string, placeholder string) (string, string, error) {
	base := `CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END`
	if len(metadata) == 0 {
		return "metadata = (" + base + ") - 'custom'", "", nil
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return "", "", fmt.Errorf("encode custom metadata: %w", err)
	}
	return "metadata = jsonb_set(" + base + ", '{custom}', " + placeholder + "::jsonb)", string(encoded), nil
}

// stringMetadataKey is a custom metadata key in use, with how many strings carry it.
type stringMetadataKey struct {
	Key         string `json:"key"`
	StringCount int    `json:"stringCount"`
}

// listStringMetadataKeys lists the custom metadata keys on strings of the projects the token
// can access, or of one project.
func (s *postgresStore) listStringMetadataKeys(ctx context.Context, actor principal, projectID string) ([]stringMetadataKey, error) {
	where := newSQLFilter(accessibleProjectPredicate+" AND p.source = 'native'", actor.OrganizationID, actor.UserID)
	if projectID != "" {
		if _, err := loadProjectScope(ctx, s.pool, actor, projectID); err != nil {
			return nil, err
		}
		where.add("p.id = ?", projectID)
	}
	rows, err := s.pool.Query(ctx, `SELECT m.key, count(*)::int
		FROM projects p
		JOIN project_translation_keys k ON k.project_id = p.id AND k.organization_id = p.organization_id
		CROSS JOIN LATERAL jsonb_object_keys(k.metadata->'custom') m(key)
		WHERE `+where.sql()+` AND jsonb_typeof(k.metadata->'custom') = 'object'
		GROUP BY m.key
		ORDER BY m.key`, where.args...)
	if err != nil {
		return nil, fmt.Errorf("list string metadata keys: %w", err)
	}
	return collectRows(rows, func(row rowScanner) (stringMetadataKey, error) {
		var item stringMetadataKey
		err := row.Scan(&item.Key, &item.StringCount)
		return item, err
	})
}

// stringMetadataKeys lists the custom metadata keys in use on strings.
func (s apiServer) stringMetadataKeys(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	projectID := strings.TrimSpace(r.URL.Query().Get("projectId"))
	if len(projectID) > 128 {
		writeError(w, http.StatusBadRequest, "invalid_query", "projectId is invalid")
		return
	}
	items, err := s.store.listStringMetadataKeys(r.Context(), p, projectID)
	if err != nil {
		writeStoreError(w, err, "list string metadata keys")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Keys []stringMetadataKey `json:"keys"`
	}{items})
}
