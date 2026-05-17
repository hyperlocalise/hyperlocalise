package lokalise

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	lokaliseapi "github.com/lokalise/go-lokalise-api/v5"
)

const (
	maxSourceDownloadBundleBytes    int64 = 512 * 1024 * 1024
	maxSourceDownloadErrorBodyBytes int64 = 64 * 1024
)

// SourceDownloadInput describes one Lokalise source-locale file export.
type SourceDownloadInput struct {
	ProjectID    string
	SourceLocale string
	FileFormat   string
	AllPlatforms bool
}

// SourceDownloadResult is the normalized content returned by a Lokalise export.
type SourceDownloadResult struct {
	ProjectID    string
	SourceLocale string
	Format       string
	BundleURL    string
	Content      []byte
}

// DownloadSourceFile exports source-locale files from Lokalise and downloads the generated bundle.
func (c *HTTPClient) DownloadSourceFile(ctx context.Context, in SourceDownloadInput) (SourceDownloadResult, error) {
	if c == nil || c.api == nil {
		return SourceDownloadResult{}, fmt.Errorf("lokalise source download: client is nil")
	}
	projectID := strings.TrimSpace(in.ProjectID)
	sourceLocale := strings.TrimSpace(in.SourceLocale)
	format := strings.TrimSpace(in.FileFormat)
	if projectID == "" {
		return SourceDownloadResult{}, fmt.Errorf("lokalise source download: project id is required")
	}
	if strings.TrimSpace(c.apiToken) == "" {
		return SourceDownloadResult{}, fmt.Errorf("lokalise source download: api token is required")
	}
	if sourceLocale == "" {
		return SourceDownloadResult{}, fmt.Errorf("lokalise source download: source locale is required")
	}
	if format == "" {
		return SourceDownloadResult{}, fmt.Errorf("lokalise source download: file format is required")
	}

	originalFilenames := true
	allPlatforms := in.AllPlatforms
	filesSvc := c.api.Files()
	filesSvc.SetContext(ctx)
	resp, err := filesSvc.Download(projectID, lokaliseapi.FileDownload{
		Format:            format,
		OriginalFilenames: &originalFilenames,
		AllPlatforms:      allPlatforms,
		FilterLangs:       []string{sourceLocale},
	})
	if err != nil {
		return SourceDownloadResult{}, fmt.Errorf("request export bundle: %w", err)
	}

	bundleURL := strings.TrimSpace(resp.BundleURL)
	if bundleURL == "" {
		return SourceDownloadResult{}, fmt.Errorf("lokalise source download: empty bundle URL")
	}

	content, err := c.downloadBundle(ctx, bundleURL)
	if err != nil {
		return SourceDownloadResult{}, fmt.Errorf("download export bundle: %w", err)
	}
	return SourceDownloadResult{
		ProjectID:    projectID,
		SourceLocale: sourceLocale,
		Format:       format,
		BundleURL:    bundleURL,
		Content:      content,
	}, nil
}

func (c *HTTPClient) downloadBundle(ctx context.Context, bundleURL string) ([]byte, error) {
	httpClient := c.httpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, bundleURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build bundle request for bundle URL: invalid URL")
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GET bundle URL: %s", bundleRequestErrorMessage(err))
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	readLimit := maxSourceDownloadBundleBytes
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		readLimit = maxSourceDownloadErrorBodyBytes
	}

	content, readErr := readLimitedBundleBody(resp.Body, readLimit)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		if readErr != nil {
			return nil, fmt.Errorf("GET bundle URL: status %d and read error: %w", resp.StatusCode, readErr)
		}
		detail := strings.TrimSpace(string(content))
		if detail == "" {
			return nil, fmt.Errorf("GET bundle URL: status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("GET bundle URL: status %d: %s", resp.StatusCode, detail)
	}
	if readErr != nil {
		return nil, fmt.Errorf("read bundle response: %w", readErr)
	}
	if len(content) == 0 {
		return nil, fmt.Errorf("empty bundle response")
	}
	return content, nil
}

func bundleRequestErrorMessage(err error) string {
	if err == nil {
		return "request failed"
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		if urlErr.Err != nil {
			return urlErr.Err.Error()
		}
		return "request failed"
	}
	return err.Error()
}

func readLimitedBundleBody(body io.Reader, maxBytes int64) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > maxBytes {
		return nil, fmt.Errorf("response exceeds %d byte limit", maxBytes)
	}
	return content, nil
}
