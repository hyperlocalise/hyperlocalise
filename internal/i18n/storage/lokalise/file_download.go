package lokalise

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
	lokaliseapi "github.com/lokalise/go-lokalise-api/v5"
)

const defaultTranslationBundleStructure = "%LANG_ISO%.%FORMAT%"

var maxTranslationBundleBytes int64 = 256 << 20

// TranslationFileDownloadRequest identifies a Lokalise file export.
type TranslationFileDownloadRequest struct {
	ProjectID       string
	TargetLanguages []string
	Format          string
	BundleStructure string
}

// TranslationFile is one extracted file from a Lokalise download bundle.
type TranslationFile struct {
	Locale  string
	Name    string
	Content []byte
}

// TranslationFileDownloadResult summarizes a Lokalise translation file export.
type TranslationFileDownloadResult struct {
	Files     []TranslationFile
	BundleURL string
	Warning   string
}

// DownloadTranslationFiles downloads a Lokalise file export and extracts one file per requested locale.
func (c *HTTPClient) DownloadTranslationFiles(ctx context.Context, req TranslationFileDownloadRequest) (TranslationFileDownloadResult, error) {
	if c == nil || c.api == nil {
		return TranslationFileDownloadResult{}, fmt.Errorf("lokalise translation download: client is nil")
	}
	projectID := strings.TrimSpace(req.ProjectID)
	if projectID == "" {
		return TranslationFileDownloadResult{}, fmt.Errorf("lokalise translation download: project id is required")
	}
	targetLocales := normalizeTranslationDownloadLanguages(req.TargetLanguages)
	if len(targetLocales) == 0 {
		return TranslationFileDownloadResult{}, fmt.Errorf("lokalise translation download: at least one target locale is required")
	}
	format := normalizeTranslationDownloadFormat(req.Format)
	if format == "" {
		return TranslationFileDownloadResult{}, fmt.Errorf("lokalise translation download: format is required")
	}
	bundleStructure := strings.TrimSpace(req.BundleStructure)
	if bundleStructure == "" {
		bundleStructure = defaultTranslationBundleStructure
	}
	if !strings.Contains(bundleStructure, "%LANG_ISO%") {
		return TranslationFileDownloadResult{}, fmt.Errorf("lokalise translation download: bundle structure must include %%LANG_ISO%%")
	}

	filesSvc := c.api.Files()
	filesSvc.SetContext(ctx)
	originalFilenames := false
	download, err := filesSvc.Download(projectID, lokaliseapi.FileDownload{
		Format:            format,
		OriginalFilenames: &originalFilenames,
		BundleStructure:   bundleStructure,
		FilterLangs:       targetLocales,
	})
	if err != nil {
		return TranslationFileDownloadResult{}, fmt.Errorf("request lokalise translation download: %w", err)
	}
	if strings.TrimSpace(download.BundleURL) == "" {
		return TranslationFileDownloadResult{}, fmt.Errorf("lokalise translation download: response did not include bundle URL")
	}

	payload, err := c.downloadURL(ctx, download.BundleURL)
	if err != nil {
		return TranslationFileDownloadResult{}, err
	}
	files, err := extractLokaliseTranslationBundle(payload, targetLocales, format, bundleStructure)
	if err != nil {
		return TranslationFileDownloadResult{}, err
	}
	return TranslationFileDownloadResult{
		Files:     files,
		BundleURL: download.BundleURL,
		Warning:   download.Warning,
	}, nil
}

func (c *HTTPClient) downloadURL(ctx context.Context, rawURL string) ([]byte, error) {
	httpClient := c.httpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create lokalise bundle request: %w", err)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download lokalise bundle: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download lokalise bundle: unexpected status %s", resp.Status)
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxTranslationBundleBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read lokalise bundle: %w", err)
	}
	if int64(len(payload)) > maxTranslationBundleBytes {
		return nil, fmt.Errorf("read lokalise bundle: bundle too large (max %d bytes)", maxTranslationBundleBytes)
	}
	return payload, nil
}

func extractLokaliseTranslationBundle(payload []byte, targetLocales []string, format, bundleStructure string) ([]TranslationFile, error) {
	reader, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return nil, fmt.Errorf("read lokalise translation bundle: %w", err)
	}
	byName := make(map[string]*zip.File, len(reader.File))
	for _, file := range reader.File {
		if file == nil || file.FileInfo().IsDir() {
			continue
		}
		byName[normalizeBundlePath(file.Name)] = file
	}
	if len(byName) == 0 {
		return nil, fmt.Errorf("lokalise translation download: downloaded bundle did not contain files")
	}

	files := make([]TranslationFile, 0, len(targetLocales))
	for _, locale := range targetLocales {
		expectedName := renderLokaliseBundlePath(bundleStructure, locale, format)
		file, ok := byName[expectedName]
		if !ok {
			return nil, fmt.Errorf("lokalise translation download: downloaded bundle did not include locale %q at %q", locale, expectedName)
		}
		content, err := readZipFile(file)
		if err != nil {
			return nil, err
		}
		files = append(files, TranslationFile{
			Locale:  locale,
			Name:    expectedName,
			Content: content,
		})
	}
	return files, nil
}

func readZipFile(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open lokalise bundle file %q: %w", file.Name, err)
	}
	defer func() {
		_ = reader.Close()
	}()
	content, err := io.ReadAll(io.LimitReader(reader, maxTranslationBundleBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read lokalise bundle file %q: %w", file.Name, err)
	}
	if int64(len(content)) > maxTranslationBundleBytes {
		return nil, fmt.Errorf("read lokalise bundle file %q: file too large (max %d bytes)", file.Name, maxTranslationBundleBytes)
	}
	return content, nil
}

func renderLokaliseBundlePath(pattern, locale, format string) string {
	rendered := strings.ReplaceAll(pattern, "%LANG_ISO%", locale)
	rendered = strings.ReplaceAll(rendered, "%FORMAT%", normalizeTranslationDownloadFormat(format))
	return normalizeBundlePath(rendered)
}

func normalizeBundlePath(path string) string {
	return strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(path)), "/")
}

func normalizeTranslationDownloadFormat(format string) string {
	trimmed := strings.TrimPrefix(strings.TrimSpace(format), ".")
	if strings.EqualFold(trimmed, "yml") {
		return "yaml"
	}
	return trimmed
}

func normalizeTranslationDownloadLanguages(languages []string) []string {
	return locales.NormalizeList(languages)
}
