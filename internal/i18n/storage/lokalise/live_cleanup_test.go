package lokalise

import (
	"context"
	"strings"
	"testing"

	lokaliseapi "github.com/lokalise/go-lokalise-api/v5"
)

// liveTestKeyRegistry tracks key names created during a single live test run and
// deletes only those keys on cleanup.
type liveTestKeyRegistry struct {
	names map[string]struct{}
}

func newLiveTestKeyRegistry(t *testing.T, client *HTTPClient, projectID string) *liveTestKeyRegistry {
	t.Helper()
	registry := &liveTestKeyRegistry{names: make(map[string]struct{})}
	t.Cleanup(func() {
		registry.cleanup(t, client, projectID)
	})
	return registry
}

func (r *liveTestKeyRegistry) Track(names ...string) {
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		r.names[name] = struct{}{}
	}
}

func (r *liveTestKeyRegistry) cleanup(t *testing.T, client *HTTPClient, projectID string) {
	if client == nil || strings.TrimSpace(projectID) == "" || len(r.names) == 0 {
		return
	}

	ctx := context.Background()
	keysSvc := client.api.Keys()
	keysSvc.SetContext(ctx)

	var ids []int64
	cursor := ""
	for {
		keysSvc.SetListOptions(lokaliseapi.KeyListOptions{
			Limit:      500,
			Pagination: "cursor",
			Cursor:     cursor,
		})
		resp, err := keysSvc.List(projectID)
		if err != nil {
			t.Logf("live cleanup: list keys: %v", err)
			return
		}
		for _, key := range resp.Keys {
			name := extractKeyName(key.KeyName)
			if _, ok := r.names[name]; ok {
				ids = append(ids, key.KeyID)
			}
		}
		if !resp.HasNextCursor() {
			break
		}
		cursor = resp.NextCursor()
	}
	if len(ids) == 0 {
		return
	}
	if _, err := keysSvc.BulkDelete(projectID, ids); err != nil {
		t.Logf("live cleanup: delete %d keys: %v", len(ids), err)
	}
}
