package lokalise

import (
	"context"
	"strings"
	"testing"

	lokaliseapi "github.com/lokalise/go-lokalise-api/v5"
)

// scheduleLiveTestKeyCleanup removes keys created by live entry-sync tests (hl662.* prefix or description).
func scheduleLiveTestKeyCleanup(t *testing.T, client *HTTPClient, projectID string) {
	t.Helper()
	t.Cleanup(func() {
		if client == nil || strings.TrimSpace(projectID) == "" {
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
				if strings.HasPrefix(name, "hl662.") || key.Description == "hl662" {
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
	})
}
