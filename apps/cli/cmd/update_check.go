package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/Masterminds/semver/v3"
	"github.com/mattn/go-isatty"
)

const (
	latestReleaseURL = "https://api.github.com/repos/hyperlocalise/hyperlocalise/releases/latest"

	// updateCheckTTL is how long a release lookup, successful or not, is reused before asking
	// GitHub again.
	updateCheckTTL = 24 * time.Hour
	// updateCheckFinishWait is how long a finished command waits for a lookup still in flight.
	// The lookup starts with the command, so it has usually finished by then.
	updateCheckFinishWait = 300 * time.Millisecond
)

type releaseInfo struct {
	TagName string `json:"tag_name"`
}

var latestVersionFetcher = fetchLatestVersion

// updateCheckCachePath returns the file that caches the latest release, or "" to disable the
// cache. Tests replace it.
var updateCheckCachePath = defaultUpdateCheckCachePath

type updateCheckCache struct {
	CheckedAt time.Time `json:"checkedAt"`
	Latest    string    `json:"latest,omitempty"`
}

// updateCheck is a latest-release lookup that runs alongside a command.
type updateCheck struct {
	current *semver.Version
	done    chan struct{}
	latest  *semver.Version
}

// updateNoticeEnabled reports whether to look for a newer release. CI runs and redirected stderr
// skip it: nobody reads the notice there, and repeated runs exhaust GitHub's anonymous rate limit.
func updateNoticeEnabled(stderr io.Writer) bool {
	if ci := strings.TrimSpace(os.Getenv("CI")); ci != "" && !strings.EqualFold(ci, "false") && ci != "0" {
		return false
	}
	f, ok := stderr.(*os.File)
	if !ok {
		return false
	}
	return isatty.IsTerminal(f.Fd()) || isatty.IsCygwinTerminal(f.Fd())
}

// startUpdateCheck begins looking up the latest release in the background. It returns nil for
// builds without a semver version.
func startUpdateCheck(ctx context.Context, version string) *updateCheck {
	currentVersion, ok := normalizeSemver(version)
	if !ok {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	check := &updateCheck{current: currentVersion, done: make(chan struct{})}
	go func() {
		defer close(check.done)
		check.latest = latestVersion(ctx)
	}()
	return check
}

// finish prints the update notice if the lookup completes within wait and found a newer release.
func (c *updateCheck) finish(w io.Writer, wait time.Duration) {
	if c == nil {
		return
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-c.done:
	case <-timer.C:
		return
	}
	if c.latest == nil || !c.latest.GreaterThan(c.current) {
		return
	}

	// lipgloss drops the colors when w is not a terminal or NO_COLOR is set.
	name := commandName()
	muted := lipgloss.NewStyle().Faint(true)
	highlight := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("149"))
	_, _ = lipgloss.Fprint(w, "\n"+
		muted.Render(fmt.Sprintf("%s update available: %s → ", name, c.current.Original()))+
		highlight.Render(c.latest.Original())+
		muted.Render(", run ")+
		highlight.Render(name+" update")+
		"\n")
}

// latestVersion returns the latest release from the cache while it is fresh, and otherwise asks
// GitHub and caches the answer. A failed lookup falls back to the cached release, which may be nil.
func latestVersion(ctx context.Context) *semver.Version {
	cachePath := updateCheckCachePath()
	cache, fresh := readUpdateCheckCache(cachePath, time.Now())
	cached, _ := normalizeSemver(cache.Latest)
	if fresh {
		return cached
	}

	latest, err := latestVersionFetcher(ctx)
	if err != nil {
		if ctx.Err() == nil {
			// Remember the failure too, so an offline machine does not retry on every command.
			writeUpdateCheckCache(cachePath, updateCheckCache{CheckedAt: time.Now(), Latest: cache.Latest})
		}
		return cached
	}
	writeUpdateCheckCache(cachePath, updateCheckCache{CheckedAt: time.Now(), Latest: latest.Original()})
	return latest
}

func defaultUpdateCheckCachePath() string {
	dir, err := os.UserCacheDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "hyperlocalise", "update-check.json")
}

func readUpdateCheckCache(path string, now time.Time) (updateCheckCache, bool) {
	var cache updateCheckCache
	if path == "" {
		return cache, false
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return cache, false
	}
	if err := json.Unmarshal(content, &cache); err != nil {
		return updateCheckCache{}, false
	}
	age := now.Sub(cache.CheckedAt)
	return cache, age >= 0 && age < updateCheckTTL
}

// writeUpdateCheckCache is best effort: a cache that cannot be written only costs a lookup.
func writeUpdateCheckCache(path string, cache updateCheckCache) {
	if path == "" {
		return
	}
	content, err := json.Marshal(cache)
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(path, content, 0o644)
}

func fetchLatestVersion(ctx context.Context) (*semver.Version, error) {
	requestCtx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, latestReleaseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create latest release request: %w", err)
	}
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request latest release: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			// Response body has already been consumed; close errors are non-fatal here.
			_ = closeErr
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("latest release returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read latest release response: %w", err)
	}

	var release releaseInfo
	if err := json.Unmarshal(body, &release); err != nil {
		return nil, fmt.Errorf("decode latest release response: %w", err)
	}

	latestVersion, ok := normalizeSemver(release.TagName)
	if !ok {
		return nil, fmt.Errorf("latest release tag %q is not semver", release.TagName)
	}

	return latestVersion, nil
}

func normalizeSemver(version string) (*semver.Version, bool) {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return nil, false
	}

	trimmed = strings.TrimPrefix(trimmed, "v")

	parsed, err := semver.NewVersion(trimmed)
	if err != nil {
		return nil, false
	}

	return parsed, true
}
