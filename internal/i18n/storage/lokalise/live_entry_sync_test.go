package lokalise

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestLiveEntrySyncPullPushAndLocaleFilter(t *testing.T) {
	token := strings.TrimSpace(os.Getenv("LOKALISE_API_TOKEN"))
	projectID := strings.TrimSpace(os.Getenv("LOKALISE_PROJECT_ID"))
	if strings.TrimSpace(os.Getenv("LOKALISE_LIVE")) == "" {
		t.Skip("set LOKALISE_LIVE=1 with LOKALISE_API_TOKEN and LOKALISE_PROJECT_ID to run live entry sync")
	}

	httpClient := mustLiveHTTPClient(t, token)
	adapter, err := NewWithClient(Config{
		ProjectID:      projectID,
		APIToken:       token,
		TimeoutSeconds: 60,
	}, httpClient)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}
	scheduleLiveTestKeyCleanup(t, httpClient, projectID)

	ctx := context.Background()
	viPull, err := adapter.Pull(ctx, storage.PullRequest{Locales: []string{"vi"}})
	if err != nil {
		t.Fatalf("pull vi: %v", err)
	}
	for _, entry := range viPull.Snapshot.Entries {
		if entry.Locale != "vi" {
			t.Fatalf("pull vi returned locale %q", entry.Locale)
		}
	}

	missing, err := adapter.Pull(ctx, storage.PullRequest{Locales: []string{"en-US"}})
	if err != nil {
		t.Fatalf("pull en-US: %v", err)
	}
	if len(missing.Snapshot.Entries) != 0 {
		t.Fatalf("expected no en-US entries on en/vi project, got %d", len(missing.Snapshot.Entries))
	}

	stamp := time.Now().UTC().Format("20060102T150405")
	key := fmt.Sprintf("hl662.live.%s", stamp)
	value := fmt.Sprintf("live-%s", stamp)
	push, err := adapter.Push(ctx, storage.PushRequest{
		Entries: []storage.Entry{
			{Key: key, Context: "hl662", Locale: "vi", Value: value},
			{Key: key + ".empty", Context: "hl662", Locale: "vi", Value: "   "},
		},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if len(push.Applied) != 1 {
		t.Fatalf("applied = %d, want 1 (empty skipped)", len(push.Applied))
	}

	if _, mapErr := adapter.Push(ctx, storage.PushRequest{
		Entries: []storage.Entry{{Key: "hl662.enus." + stamp, Context: "hl662", Locale: "en-US", Value: "mapped"}},
	}); mapErr != nil {
		t.Logf("en-US push rejected as expected if project has no en_US: %v", mapErr)
	}

	verify, err := adapter.Pull(ctx, storage.PullRequest{
		EntryIDs: []storage.EntryID{{Key: key, Context: "hl662", Locale: "vi"}},
	})
	if err != nil {
		t.Fatalf("verify pull: %v", err)
	}
	found := false
	for _, entry := range verify.Snapshot.Entries {
		if entry.Key == key && entry.Locale == "vi" {
			found = true
			if entry.Value != value {
				t.Fatalf("verify value mismatch")
			}
		}
	}
	if !found {
		t.Fatalf("pushed key missing from verify pull")
	}

	t.Logf("live ok: vi_entries=%d applied=%d", len(viPull.Snapshot.Entries), len(push.Applied))
}

func mustLiveHTTPClient(t *testing.T, token string) *HTTPClient {
	t.Helper()
	client, err := NewHTTPClient(Config{APIToken: token, TimeoutSeconds: 60})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}
	return client
}
