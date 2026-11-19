package cmd

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/spf13/cobra"
)

func TestMain(m *testing.M) {
	// Keep tests away from the developer's real update-check cache.
	updateCheckCachePath = func() string { return "" }
	os.Exit(m.Run())
}

// notifyIfUpdateAvailable runs an update check to completion and prints any notice.
func notifyIfUpdateAvailable(cmd *cobra.Command, version string) {
	startUpdateCheck(cmd.Context(), version).finish(cmd.ErrOrStderr(), time.Minute)
}

func useUpdateCheckCache(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "update-check.json")
	updateCheckCachePath = func() string { return path }
	t.Cleanup(func() { updateCheckCachePath = func() string { return "" } })
	return path
}

func TestLatestVersionUsesFreshCacheWithoutFetching(t *testing.T) {
	path := useUpdateCheckCache(t)
	writeUpdateCheckCache(path, updateCheckCache{CheckedAt: time.Now(), Latest: "2.0.0"})
	stubLatestVersionFetcher(t, func(context.Context) (*semver.Version, error) {
		t.Fatal("fetcher called despite a fresh cache")
		return nil, nil
	})

	if got := latestVersion(context.Background()); got == nil || got.String() != "2.0.0" {
		t.Fatalf("latestVersion() = %v, want 2.0.0", got)
	}
}

func TestLatestVersionRefreshesStaleCache(t *testing.T) {
	path := useUpdateCheckCache(t)
	writeUpdateCheckCache(path, updateCheckCache{CheckedAt: time.Now().Add(-2 * updateCheckTTL), Latest: "2.0.0"})
	calls := 0
	stubLatestVersionFetcher(t, func(context.Context) (*semver.Version, error) {
		calls++
		return semver.MustParse("3.0.0"), nil
	})

	if got := latestVersion(context.Background()); got == nil || got.String() != "3.0.0" {
		t.Fatalf("latestVersion() = %v, want 3.0.0", got)
	}
	if got := latestVersion(context.Background()); got == nil || got.String() != "3.0.0" {
		t.Fatalf("cached latestVersion() = %v, want 3.0.0", got)
	}
	if calls != 1 {
		t.Fatalf("fetcher calls = %d, want 1", calls)
	}
}

func TestLatestVersionCachesFailuresAndKeepsLastRelease(t *testing.T) {
	path := useUpdateCheckCache(t)
	writeUpdateCheckCache(path, updateCheckCache{CheckedAt: time.Now().Add(-2 * updateCheckTTL), Latest: "2.0.0"})
	calls := 0
	stubLatestVersionFetcher(t, func(context.Context) (*semver.Version, error) {
		calls++
		return nil, errors.New("offline")
	})

	for range 2 {
		if got := latestVersion(context.Background()); got == nil || got.String() != "2.0.0" {
			t.Fatalf("latestVersion() = %v, want last cached 2.0.0", got)
		}
	}
	if calls != 1 {
		t.Fatalf("fetcher calls = %d, want 1 after a cached failure", calls)
	}
}

func TestUpdateCheckFinishSkipsSlowLookup(t *testing.T) {
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	stubLatestVersionFetcher(t, func(context.Context) (*semver.Version, error) {
		<-release
		return semver.MustParse("2.0.0"), nil
	})

	errBuffer := &bytes.Buffer{}
	startUpdateCheck(context.Background(), "v1.0.0").finish(errBuffer, 10*time.Millisecond)
	if got := errBuffer.String(); got != "" {
		t.Fatalf("expected no notice for an unfinished lookup, got %q", got)
	}
}

func TestUpdateNoticeEnabledSkipsCIAndNonTerminals(t *testing.T) {
	t.Setenv("CI", "true")
	if updateNoticeEnabled(os.Stderr) {
		t.Fatal("expected update notice to be disabled in CI")
	}
	t.Setenv("CI", "")
	if updateNoticeEnabled(&bytes.Buffer{}) {
		t.Fatal("expected update notice to be disabled for non-file stderr")
	}
}

func TestNotifyIfUpdateAvailable(t *testing.T) {
	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return semver.MustParse("2.0.0"), nil
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	errBuffer := &bytes.Buffer{}
	command := &cobra.Command{}
	command.SetErr(errBuffer)

	notifyIfUpdateAvailable(command, "v1.0.0")

	output := errBuffer.String()
	if !strings.Contains(output, "hyperlocalise update available: 1.0.0 → 2.0.0, run hyperlocalise update") {
		t.Fatalf("expected update banner in output, got %q", output)
	}

	if strings.Contains(output, "\x1b[") {
		t.Fatalf("expected no ANSI colors for a non-terminal writer, got %q", output)
	}
}

func TestNotifyIfUpdateAvailableUsesAliasNameWhenInvokedAsHL(t *testing.T) {
	originalArg0 := os.Args[0]
	os.Args[0] = "hl"
	t.Cleanup(func() {
		os.Args[0] = originalArg0
	})

	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return semver.MustParse("2.0.0"), nil
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	errBuffer := &bytes.Buffer{}
	command := &cobra.Command{}
	command.SetErr(errBuffer)

	notifyIfUpdateAvailable(command, "v1.0.0")

	if !strings.Contains(errBuffer.String(), "hl update available: 1.0.0 → 2.0.0, run hl update") {
		t.Fatalf("expected hl upgrade command in output, got %q", errBuffer.String())
	}
}

func TestNotifyIfUpdateAvailableSkipsWhenLookupFails(t *testing.T) {
	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return nil, errors.New("network down")
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	errBuffer := &bytes.Buffer{}
	command := &cobra.Command{}
	command.SetErr(errBuffer)

	notifyIfUpdateAvailable(command, "v1.0.0")

	if got := errBuffer.String(); got != "" {
		t.Fatalf("expected no output when update check fails, got %q", got)
	}
}

func TestNormalizeSemver(t *testing.T) {
	testCases := []struct {
		name    string
		version string
		valid   bool
		want    string
	}{
		{name: "prefixed", version: "v1.2.3", valid: true, want: "1.2.3"},
		{name: "plain", version: "1.2.3", valid: true, want: "1.2.3"},
		{name: "invalid", version: "dev", valid: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, ok := normalizeSemver(tc.version)

			if ok != tc.valid {
				t.Fatalf("valid mismatch: got %t want %t", ok, tc.valid)
			}

			if tc.valid && parsed.String() != tc.want {
				t.Fatalf("version mismatch: got %q want %q", parsed.String(), tc.want)
			}
		})
	}
}
