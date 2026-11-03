package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/spf13/cobra"
)

const releaseAssetsHost = "https://github.com/hyperlocalise/hyperlocalise/releases/download/v1.2.3"

type fakeReleaseServer struct {
	release      githubRelease
	releaseCode  int
	releaseBody  string
	installer    string
	checksums    string
	assetCode    int
	requestPaths []string
}

func (f *fakeReleaseServer) start(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.requestPaths = append(f.requestPaths, r.URL.EscapedPath())
		switch {
		case strings.HasPrefix(r.URL.Path, "/repos/hyperlocalise/hyperlocalise/releases/"):
			if f.releaseCode != 0 {
				w.WriteHeader(f.releaseCode)
				return
			}
			if f.releaseBody != "" {
				_, _ = w.Write([]byte(f.releaseBody))
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tag_name": f.release.TagName,
				"assets":   releaseAssetsJSON(f.release.Assets),
			})
		case strings.HasSuffix(r.URL.Path, "/"+installerAssetName):
			if f.assetCode != 0 {
				w.WriteHeader(f.assetCode)
				return
			}
			_, _ = w.Write([]byte(f.installer))
		case strings.HasSuffix(r.URL.Path, "/"+checksumsAssetName):
			_, _ = w.Write([]byte(f.checksums))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	redirectUpdateHTTPClient(t, server)
	return server
}

func releaseAssetsJSON(assets []githubReleaseAsset) []map[string]string {
	out := make([]map[string]string, 0, len(assets))
	for _, asset := range assets {
		out = append(out, map[string]string{"name": asset.Name, "browser_download_url": asset.BrowserDownloadURL})
	}
	return out
}

func defaultReleaseAssets() []githubReleaseAsset {
	return []githubReleaseAsset{
		{Name: installerAssetName, BrowserDownloadURL: releaseAssetsHost + "/" + installerAssetName},
		{Name: checksumsAssetName, BrowserDownloadURL: releaseAssetsHost + "/" + checksumsAssetName},
	}
}

func TestFetchReleaseUsesLatestAndTagEndpoints(t *testing.T) {
	fake := &fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()}}
	fake.start(t)

	release, err := fetchRelease(context.Background(), "")
	if err != nil {
		t.Fatalf("fetch latest release: %v", err)
	}
	if release.TagName != "v1.2.3" || len(release.Assets) != 2 {
		t.Fatalf("unexpected release: %+v", release)
	}

	if _, err := fetchRelease(context.Background(), "1.2.3"); err != nil {
		t.Fatalf("fetch tagged release: %v", err)
	}

	want := []string{
		"/repos/hyperlocalise/hyperlocalise/releases/latest",
		"/repos/hyperlocalise/hyperlocalise/releases/tags/v1.2.3",
	}
	if strings.Join(fake.requestPaths, ",") != strings.Join(want, ",") {
		t.Fatalf("request paths = %v, want %v", fake.requestPaths, want)
	}
}

func TestFetchReleaseErrors(t *testing.T) {
	tests := []struct {
		name    string
		fake    fakeReleaseServer
		wantErr string
	}{
		{name: "non-200 status", fake: fakeReleaseServer{releaseCode: http.StatusNotFound}, wantErr: "release metadata returned status 404"},
		{name: "invalid json", fake: fakeReleaseServer{releaseBody: "{"}, wantErr: "decode release metadata response"},
		{name: "missing tag", fake: fakeReleaseServer{releaseBody: `{"tag_name":"  "}`}, wantErr: "release metadata missing tag_name"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fake := tc.fake
			fake.start(t)
			_, err := fetchRelease(context.Background(), "")
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestRunSelfUpdateRunsVerifiedInstaller(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash is not available")
	}
	script := "echo \"installed $VERSION\"\n"
	fake := &fakeReleaseServer{
		release:   githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()},
		installer: script,
		checksums: fmt.Sprintf("# release checksums\nshort\n%s  dist/%s\n", sha256Hex([]byte(script)), installerAssetName),
	}
	fake.start(t)

	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	if err := runSelfUpdate(context.Background(), "1.2.3", stdout, stderr); err != nil {
		t.Fatalf("runSelfUpdate: %v (stderr=%s)", err, stderr.String())
	}
	if got := stdout.String(); got != "installed v1.2.3\n" {
		t.Fatalf("installer stdout = %q", got)
	}
}

func TestRunSelfUpdateInstallerFailure(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash is not available")
	}
	script := "exit 3\n"
	fake := &fakeReleaseServer{
		release:   githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()},
		installer: script,
		checksums: sha256Hex([]byte(script)) + "  " + installerAssetName + "\n",
	}
	fake.start(t)

	err := runSelfUpdate(context.Background(), "", &bytes.Buffer{}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "run installer command") {
		t.Fatalf("expected installer failure, got %v", err)
	}
}

func TestRunSelfUpdateRejectsBadReleases(t *testing.T) {
	validChecksum := sha256Hex([]byte("echo ok\n"))
	tests := []struct {
		name    string
		fake    fakeReleaseServer
		wantErr string
	}{
		{
			name:    "release lookup fails",
			fake:    fakeReleaseServer{releaseCode: http.StatusInternalServerError},
			wantErr: "release metadata returned status 500",
		},
		{
			name: "missing installer asset",
			fake: fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: []githubReleaseAsset{
				{Name: checksumsAssetName, BrowserDownloadURL: releaseAssetsHost + "/" + checksumsAssetName},
			}}},
			wantErr: `release missing asset "install.sh"`,
		},
		{
			name: "missing checksums asset",
			fake: fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: []githubReleaseAsset{
				{Name: installerAssetName, BrowserDownloadURL: releaseAssetsHost + "/" + installerAssetName},
			}}},
			wantErr: `release v1.2.3: release missing asset "checksums.txt"`,
		},
		{
			name: "installer asset without url",
			fake: fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: []githubReleaseAsset{
				{Name: installerAssetName, BrowserDownloadURL: " "},
			}}},
			wantErr: `asset "install.sh" missing download URL`,
		},
		{
			name:    "installer download fails",
			fake:    fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()}, assetCode: http.StatusForbidden},
			wantErr: "download installer asset: asset request returned status 403",
		},
		{
			name: "checksums download fails",
			fake: fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: []githubReleaseAsset{
				{Name: installerAssetName, BrowserDownloadURL: releaseAssetsHost + "/" + installerAssetName},
				{Name: checksumsAssetName, BrowserDownloadURL: releaseAssetsHost + "/missing.txt"},
			}}, installer: "echo ok\n"},
			wantErr: "download checksums asset: asset request returned status 404",
		},
		{
			name:    "checksum entry missing",
			fake:    fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()}, installer: "echo ok\n", checksums: validChecksum + "  other.sh\n"},
			wantErr: `resolve installer checksum: checksum entry not found for "install.sh"`,
		},
		{
			name:    "checksum entry malformed",
			fake:    fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()}, installer: "echo ok\n", checksums: strings.Repeat("z", 64) + "  install.sh\n"},
			wantErr: "invalid sha256 hex",
		},
		{
			name:    "checksum mismatch",
			fake:    fakeReleaseServer{release: githubRelease{TagName: "v1.2.3", Assets: defaultReleaseAssets()}, installer: "echo tampered\n", checksums: validChecksum + "  install.sh\n"},
			wantErr: "installer checksum mismatch: expected " + validChecksum,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fake := tc.fake
			fake.start(t)
			err := runSelfUpdate(context.Background(), "", &bytes.Buffer{}, &bytes.Buffer{})
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestDownloadAssetRejectsInvalidURL(t *testing.T) {
	if _, err := downloadAsset(context.Background(), "://bad"); err == nil || !strings.Contains(err.Error(), "create asset request") {
		t.Fatalf("expected request construction error, got %v", err)
	}
}

func TestParseSHA256HexRejectsNonHex(t *testing.T) {
	if _, err := parseSHA256Hex(strings.Repeat("g", 64)); err == nil || !strings.Contains(err.Error(), "invalid sha256 hex") {
		t.Fatalf("expected invalid hex error, got %v", err)
	}
	got, err := parseSHA256Hex("  " + strings.Repeat("AB", 32) + " ")
	if err != nil || got != strings.Repeat("ab", 32) {
		t.Fatalf("expected lower-cased digest, got %q err=%v", got, err)
	}
}

func TestFetchLatestVersionFromReleaseEndpoint(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"tag_name":"v2.1.0"}`))
	}))
	t.Cleanup(server.Close)
	redirectDefaultTransport(t, server)

	version, err := fetchLatestVersion(context.Background())
	if err != nil {
		t.Fatalf("fetchLatestVersion: %v", err)
	}
	if version.String() != "2.1.0" {
		t.Fatalf("version = %s, want 2.1.0", version)
	}
	if gotPath != "/repos/hyperlocalise/hyperlocalise/releases/latest" {
		t.Fatalf("request path = %q", gotPath)
	}
}

func TestFetchLatestVersionErrors(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		wantErr string
	}{
		{name: "non-200", status: http.StatusTooManyRequests, wantErr: "latest release returned status 429"},
		{name: "invalid json", status: http.StatusOK, body: "not json", wantErr: "decode latest release response"},
		{name: "non semver tag", status: http.StatusOK, body: `{"tag_name":"nightly"}`, wantErr: `latest release tag "nightly" is not semver`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)
			redirectDefaultTransport(t, server)

			_, err := fetchLatestVersion(context.Background())
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestNotifyIfUpdateAvailableSkipsWhenNotNewerOrUnversioned(t *testing.T) {
	originalFetcher := latestVersionFetcher
	t.Cleanup(func() { latestVersionFetcher = originalFetcher })

	calls := 0
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		calls++
		return semver.MustParse("1.0.0"), nil
	}

	for _, version := range []string{"v1.0.0", "1.1.0", "dev", ""} {
		errBuffer := &bytes.Buffer{}
		command := &cobra.Command{}
		command.SetErr(errBuffer)
		notifyIfUpdateAvailable(command, version)
		if got := errBuffer.String(); got != "" {
			t.Fatalf("version %q: expected no banner, got %q", version, got)
		}
	}
	if calls != 2 {
		t.Fatalf("expected fetcher to run only for semver versions, got %d calls", calls)
	}
}
