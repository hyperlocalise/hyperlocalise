package cmd

import (
	"bufio"
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
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

const (
	githubReleaseAPIBase = "https://api.github.com/repos/quiet-circles/hyperlocalise/releases"
	githubRawContentBase = "https://raw.githubusercontent.com/quiet-circles/hyperlocalise"
	installerAssetName   = "install.sh"
)

type githubRelease struct {
	TagName string               `json:"tag_name"`
	Assets  []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

var (
	selfUpdateRunner   = runSelfUpdate
	updateHTTPClient   = &http.Client{Timeout: 10 * time.Second}
	selfUpdateExecutor = executeUpdateInstaller
)

func newUpdateCmd() *cobra.Command {
	return &cobra.Command{
		Use:          "update [version]",
		Short:        "Update hyperlocalise using the tagged bootstrap installer",
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

	script, err := downloadInstallerScript(ctx, release.TagName)
	if err != nil {
		return err
	}

	if err := selfUpdateExecutor(ctx, script, release.TagName, stdout, stderr); err != nil {
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

func downloadInstallerScript(ctx context.Context, tag string) ([]byte, error) {
	scriptURL := installerScriptURL(tag)
	script, err := downloadAsset(ctx, scriptURL)
	if err != nil {
		return nil, fmt.Errorf("download installer script for %s: %w", tag, err)
	}
	if len(bytes.TrimSpace(script)) == 0 {
		return nil, fmt.Errorf("download installer script for %s: empty response", tag)
	}
	return script, nil
}

func installerScriptURL(tag string) string {
	return fmt.Sprintf("%s/%s/%s", githubRawContentBase, url.PathEscape(tag), installerAssetName)
}

func executeUpdateInstaller(ctx context.Context, script []byte, version string, stdout io.Writer, stderr io.Writer) error {
	command := exec.CommandContext(ctx, "bash")
	command.Stdin = bytes.NewReader(script)
	command.Stdout = stdout
	command.Stderr = stderr
	command.Env = append(os.Environ(), "VERSION="+version)
	return command.Run()
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

func findAssetByName(assets []githubReleaseAsset, name string) (*githubReleaseAsset, error) {
	for i := range assets {
		if assets[i].Name != name {
			continue
		}
		if strings.TrimSpace(assets[i].BrowserDownloadURL) == "" {
			return nil, fmt.Errorf("asset %q missing download URL", name)
		}
		return &assets[i], nil
	}

	return nil, fmt.Errorf("release missing asset %q", name)
}

func checksumForAsset(checksums []byte, assetName string) (string, error) {
	scanner := bufio.NewScanner(bytes.NewReader(checksums))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		filename := strings.TrimLeft(fields[len(fields)-1], "*")
		if filename != assetName && filepath.Base(filename) != assetName {
			continue
		}

		hash, err := parseSHA256Hex(fields[0])
		if err != nil {
			return "", fmt.Errorf("invalid checksum entry for %q: %w", assetName, err)
		}

		return hash, nil
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("scan checksums: %w", err)
	}

	return "", fmt.Errorf("checksum entry not found for %q", assetName)
}

func parseSHA256Hex(value string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if len(trimmed) != 64 {
		return "", fmt.Errorf("expected 64 hex chars, got %d", len(trimmed))
	}

	if _, err := hex.DecodeString(trimmed); err != nil {
		return "", fmt.Errorf("invalid sha256 hex: %w", err)
	}

	return trimmed, nil
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
