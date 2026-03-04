package cmd

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

const (
	githubReleaseAPIBase = "https://api.github.com/repos/quiet-circles/hyperlocalise/releases"
	installerAssetName   = "install.sh"
)

type githubRelease struct {
	TagName string               `json:"tag_name"`
	Assets  []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Digest             string `json:"digest"`
}

var (
	selfUpdateRunner = runSelfUpdate
	updateHTTPClient = &http.Client{Timeout: 10 * time.Second}
)

func newUpdateCmd() *cobra.Command {
	return &cobra.Command{
		Use:          "update [version]",
		Short:        "Update hyperlocalise with checksum-verified installer",
		Args:         cobra.MaximumNArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			version := ""
			if len(args) == 1 {
				version = args[0]
			}

			if err := selfUpdateRunner(cmd.Context(), version, cmd.OutOrStdout(), cmd.ErrOrStderr()); err != nil {
				return fmt.Errorf("self update: %w", err)
			}

			return nil
		},
	}
}

func runSelfUpdate(ctx context.Context, version string, stdout io.Writer, stderr io.Writer) error {
	release, err := fetchRelease(ctx, version)
	if err != nil {
		return err
	}

	installerAsset, err := findInstallerAsset(release.Assets)
	if err != nil {
		return err
	}

	expectedDigest, err := parseSHA256Digest(installerAsset.Digest)
	if err != nil {
		return fmt.Errorf("invalid installer digest for release %s: %w", release.TagName, err)
	}

	script, err := downloadAsset(ctx, installerAsset.BrowserDownloadURL)
	if err != nil {
		return fmt.Errorf("download installer asset: %w", err)
	}

	actualDigest := sha256Hex(script)
	if actualDigest != expectedDigest {
		return fmt.Errorf("installer checksum mismatch: expected %s got %s", expectedDigest, actualDigest)
	}

	command := exec.CommandContext(ctx, "bash")
	command.Stdin = bytes.NewReader(script)
	command.Stdout = stdout
	command.Stderr = stderr
	command.Env = append(os.Environ(), "VERSION="+release.TagName)

	if err := command.Run(); err != nil {
		return fmt.Errorf("run installer command: %w", err)
	}

	return nil
}

func fetchRelease(ctx context.Context, version string) (*githubRelease, error) {
	requestCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	releaseURL := githubReleaseAPIBase + "/latest"
	if tag := normalizeTag(version); tag != "" {
		releaseURL = githubReleaseAPIBase + "/tags/" + url.PathEscape(tag)
	}

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, releaseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create release metadata request: %w", err)
	}

	resp, err := updateHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request release metadata: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			// Response body has already been consumed; close errors are non-fatal here.
			_ = closeErr
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("release metadata returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read release metadata response: %w", err)
	}

	var release githubRelease
	if err := json.Unmarshal(body, &release); err != nil {
		return nil, fmt.Errorf("decode release metadata response: %w", err)
	}

	if strings.TrimSpace(release.TagName) == "" {
		return nil, fmt.Errorf("release metadata missing tag_name")
	}

	return &release, nil
}

func findInstallerAsset(assets []githubReleaseAsset) (*githubReleaseAsset, error) {
	for i := range assets {
		if assets[i].Name == installerAssetName {
			if strings.TrimSpace(assets[i].BrowserDownloadURL) == "" {
				return nil, fmt.Errorf("installer asset missing download URL")
			}

			return &assets[i], nil
		}
	}

	return nil, fmt.Errorf("release missing installer asset %q", installerAssetName)
}

func downloadAsset(ctx context.Context, assetURL string) ([]byte, error) {
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, assetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create asset request: %w", err)
	}

	resp, err := updateHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request asset: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			// Response body has already been consumed; close errors are non-fatal here.
			_ = closeErr
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("asset request returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read asset response: %w", err)
	}

	return body, nil
}

func parseSHA256Digest(digest string) (string, error) {
	trimmed := strings.TrimSpace(digest)
	if !strings.HasPrefix(trimmed, "sha256:") {
		return "", fmt.Errorf("unsupported digest %q", digest)
	}

	value := strings.TrimPrefix(trimmed, "sha256:")
	if len(value) != 64 {
		return "", fmt.Errorf("expected 64 hex chars, got %d", len(value))
	}

	if _, err := hex.DecodeString(value); err != nil {
		return "", fmt.Errorf("invalid sha256 hex: %w", err)
	}

	return strings.ToLower(value), nil
}

func sha256Hex(input []byte) string {
	sum := sha256.Sum256(input)
	return hex.EncodeToString(sum[:])
}

func normalizeTag(version string) string {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return ""
	}

	if strings.HasPrefix(trimmed, "v") {
		return trimmed
	}

	return "v" + trimmed
}
