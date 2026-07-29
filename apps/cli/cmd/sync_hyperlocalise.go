package cmd

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"
	"github.com/hyperlocalise/hyperlocalise/internal/pathguard"
	"github.com/hyperlocalise/hyperlocalise/pkg/hyperlocaliseapi"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

var (
	hyperlocaliseMaxDownloadBytes int64 = 50 * 1024 * 1024 // 50 MB
	errPullReconstructionSkipped        = errors.New("pull reconstruction skipped")
)

type hyperlocaliseSyncRuntime struct {
	cfg        *config.I18NConfig
	configPath string
	configRoot string
	projectID  string
	apiBaseURL string
	apiKey     string
	client     *hyperlocaliseAPIClient
}

type hyperlocaliseFilePlan struct {
	Bucket        string            `json:"bucket"`
	SourcePath    string            `json:"sourcePath"`
	SourceHash    string            `json:"sourceHash"`
	FileFormat    string            `json:"fileFormat"`
	SourceLocale  string            `json:"sourceLocale"`
	TargetLocales []string          `json:"targetLocales"`
	TargetPaths   map[string]string `json:"targetPaths"`
}

type hyperlocalisePushReport struct {
	Action        string `json:"action"`
	Complete      bool   `json:"complete"`
	PlannedFiles  int    `json:"plannedFiles"`
	UploadedFiles int    `json:"uploadedFiles"`
	FailedItems   int    `json:"failedItems"`
	DryRun        bool   `json:"dryRun"`
}

type hyperlocalisePullReport struct {
	Action       string `json:"action"`
	Complete     bool   `json:"complete"`
	PlannedFiles int    `json:"plannedFiles"`
	Downloaded   int    `json:"downloaded"`
	Skipped      int    `json:"skipped"`
	DryRun       bool   `json:"dryRun"`
}

type hyperlocaliseAPIClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type hyperlocaliseAPIError struct {
	StatusCode int
	Body       string
}

func (e *hyperlocaliseAPIError) Error() string {
	return fmt.Sprintf("hyperlocalise api returned %d: %s", e.StatusCode, strings.TrimSpace(e.Body))
}

func isHyperlocaliseNotFound(err error) bool {
	var apiErr *hyperlocaliseAPIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound
}

type hyperlocaliseUploadFileResponse struct {
	File struct {
		ID string `json:"id"`
	} `json:"file"`
}

func newHyperlocaliseSyncRuntime(configPath string) (*hyperlocaliseSyncRuntime, error) {
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, err
	}
	if cfg.Hyperlocalise == nil {
		return nil, fmt.Errorf("hyperlocalise config is required: add top-level \"hyperlocalise\" with project_id and api settings")
	}

	projectID := strings.TrimSpace(cfg.Hyperlocalise.ProjectID)
	if projectID == "" && strings.TrimSpace(cfg.Hyperlocalise.ProjectIDEnv) != "" {
		projectID = strings.TrimSpace(os.Getenv(strings.TrimSpace(cfg.Hyperlocalise.ProjectIDEnv)))
	}
	if projectID == "" {
		return nil, fmt.Errorf("hyperlocalise project id is required: set hyperlocalise.project_id or %s", cfg.Hyperlocalise.ProjectIDEnv)
	}

	apiKeyEnv := strings.TrimSpace(cfg.Hyperlocalise.APIKeyEnv)
	apiKey := strings.TrimSpace(os.Getenv(apiKeyEnv))
	if apiKey == "" {
		return nil, fmt.Errorf("hyperlocalise api key is required: set %s", apiKeyEnv)
	}

	timeout := time.Duration(cfg.Hyperlocalise.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 20 * time.Minute
	}

	apiBaseURL := strings.TrimRight(strings.TrimSpace(cfg.Hyperlocalise.APIBaseURL), "/")
	if err := hyperlocaliseapi.ValidateAPIBaseURL(apiBaseURL); err != nil {
		return nil, err
	}
	configRoot, err := config.ConfigDirectory(configPath)
	if err != nil {
		return nil, fmt.Errorf("resolve hyperlocalise config directory: %w", err)
	}
	return &hyperlocaliseSyncRuntime{
		cfg:        cfg,
		configPath: configPath,
		configRoot: configRoot,
		projectID:  projectID,
		apiBaseURL: apiBaseURL,
		apiKey:     apiKey,
		client: &hyperlocaliseAPIClient{
			baseURL:    apiBaseURL,
			apiKey:     apiKey,
			httpClient: &http.Client{Timeout: timeout},
		},
	}, nil
}

func runHyperlocalisePush(ctx context.Context, rt *hyperlocaliseSyncRuntime, o syncCommonOptions) (hyperlocalisePushReport, error) {
	plans, err := planHyperlocaliseFiles(rt.cfg, o.locales)
	if err != nil {
		return hyperlocalisePushReport{}, err
	}

	report := hyperlocalisePushReport{
		Action:       "push",
		PlannedFiles: len(plans),
		DryRun:       o.dryRun,
	}
	if o.dryRun {
		report.Complete = true
		report.UploadedFiles = len(plans)
		return report, nil
	}

	var failedItems []string
	for _, plan := range plans {
		if _, uploadErr := rt.client.uploadFile(ctx, rt.projectID, plan); uploadErr != nil {
			failedItems = append(failedItems, fmt.Sprintf("%s: %v", plan.SourcePath, uploadErr))
			continue
		}
		report.UploadedFiles++
	}

	report.FailedItems = len(failedItems)
	report.Complete = len(failedItems) == 0
	if !report.Complete {
		return report, fmt.Errorf("hyperlocalise push failed for %d item(s): %s", len(failedItems), strings.Join(failedItems, "; "))
	}

	return report, nil
}

func runHyperlocalisePull(ctx context.Context, rt *hyperlocaliseSyncRuntime, o syncCommonOptions) (hyperlocalisePullReport, error) {
	plans, err := planHyperlocaliseFilesWithOptions(rt.cfg, o.locales, false)
	if err != nil {
		return hyperlocalisePullReport{}, err
	}

	report := hyperlocalisePullReport{
		Action:       "pull",
		PlannedFiles: len(plans),
		DryRun:       o.dryRun,
	}

	for _, plan := range plans {
		for _, locale := range plan.TargetLocales {
			targetPath := strings.TrimSpace(plan.TargetPaths[locale])
			if targetPath == "" {
				report.Skipped++
				continue
			}
			resolvedTargetPath, err := rt.resolveTargetPath(targetPath)
			if err != nil {
				report.Complete = false
				return report, fmt.Errorf("target path for source %q locale %q: %w", plan.SourcePath, locale, err)
			}
			if o.dryRun {
				report.Downloaded++
				continue
			}

			var content []byte
			if isHyperlocaliseImageFileFormat(plan.FileFormat) {
				content, err = rt.client.downloadImageVariant(ctx, rt.projectID, plan.SourcePath, locale)
				if err != nil {
					if isHyperlocaliseNotFound(err) {
						report.Skipped++
						continue
					}
					report.Complete = false
					return report, fmt.Errorf("download image variant for source %q locale %q: %w", plan.SourcePath, locale, err)
				}
				if err := writeFileAtomic(resolvedTargetPath, content); err != nil {
					report.Complete = false
					return report, fmt.Errorf("write target file %q: %w", resolvedTargetPath, err)
				}
				report.Downloaded++
				continue
			}

			content, err = rt.client.downloadTranslationExport(ctx, rt.projectID, plan.SourcePath, locale)
			if err != nil {
				if isHyperlocaliseNotFound(err) {
					report.Skipped++
					continue
				}
				report.Complete = false
				return report, fmt.Errorf("download translation for source %q locale %q: %w", plan.SourcePath, locale, err)
			}
			exported, err := rt.reconstructPullFile(plan, locale, targetPath, content)
			if errors.Is(err, errPullReconstructionSkipped) {
				report.Skipped++
				continue
			}
			if err != nil {
				report.Complete = false
				return report, fmt.Errorf("reconstruct translation for source %q locale %q: %w", plan.SourcePath, locale, err)
			}
			if err := writeFileAtomic(resolvedTargetPath, exported); err != nil {
				report.Complete = false
				return report, fmt.Errorf("write target file %q: %w", resolvedTargetPath, err)
			}
			report.Downloaded++
		}
	}

	report.Complete = true
	return report, nil
}

func (rt *hyperlocaliseSyncRuntime) resolveTargetPath(targetPath string) (string, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", fmt.Errorf("target path is empty")
	}
	if strings.TrimSpace(rt.configRoot) == "" {
		return "", fmt.Errorf("config root is not configured")
	}

	candidate := trimmed
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(rt.configRoot, candidate)
	}
	if err := pathguard.EnsureUnderRoot(rt.configRoot, candidate); err != nil {
		return "", err
	}
	return candidate, nil
}

func pullAcceptsRawPrefilledExport(targetPath string) bool {
	switch strings.ToLower(filepath.Ext(targetPath)) {
	case ".json", ".jsonc":
		return true
	default:
		return false
	}
}

func (rt *hyperlocaliseSyncRuntime) reconstructPullFile(plan hyperlocaliseFilePlan, locale, targetPath string, prefilledJSON []byte) ([]byte, error) {
	var prefilled map[string]string
	if err := json.Unmarshal(prefilledJSON, &prefilled); err != nil {
		return nil, fmt.Errorf("parse translation export JSON: %w", err)
	}

	resolvedTargetPath, err := runsvc.ResolveExportPath(rt.configRoot, targetPath)
	if err != nil {
		return nil, fmt.Errorf("resolve target path %q: %w", targetPath, err)
	}

	if len(prefilled) == 0 && pullAcceptsRawPrefilledExport(resolvedTargetPath) {
		return prefilledJSON, nil
	}

	sourcePath, err := runsvc.ResolveExportPath(rt.configRoot, plan.SourcePath)
	if err != nil {
		if pullAcceptsRawPrefilledExport(resolvedTargetPath) {
			return prefilledJSON, nil
		}
		return nil, errPullReconstructionSkipped
	}
	if _, err := os.Stat(sourcePath); err != nil {
		if os.IsNotExist(err) {
			if pullAcceptsRawPrefilledExport(resolvedTargetPath) {
				return prefilledJSON, nil
			}
			return nil, errPullReconstructionSkipped
		}
		return nil, fmt.Errorf("stat source file %q: %w", plan.SourcePath, err)
	}

	return runsvc.ExportPrefilledTarget(runsvc.ExportInput{
		TargetPath:   resolvedTargetPath,
		SourcePath:   sourcePath,
		SourceLocale: plan.SourceLocale,
		TargetLocale: locale,
		Prefilled:    prefilled,
		ProjectRoot:  rt.configRoot,
	})
}

func planHyperlocaliseFiles(cfg *config.I18NConfig, localeFilter []string) ([]hyperlocaliseFilePlan, error) {
	return planHyperlocaliseFilesWithOptions(cfg, localeFilter, true)
}

func planHyperlocaliseFilesWithOptions(cfg *config.I18NConfig, localeFilter []string, hashSources bool) ([]hyperlocaliseFilePlan, error) {
	targetLocales, err := resolveHyperlocaliseTargetLocales(cfg.Locales.Targets, localeFilter)
	if err != nil {
		return nil, err
	}

	bucketNames := make([]string, 0, len(cfg.Buckets))
	for name := range cfg.Buckets {
		bucketNames = append(bucketNames, name)
	}
	sort.Strings(bucketNames)

	plans := make([]hyperlocaliseFilePlan, 0)
	for _, bucketName := range bucketNames {
		bucket := cfg.Buckets[bucketName]
		for _, mapping := range bucket.Files {
			sourcePattern := pathresolver.ResolveSourcePath(mapping.From, cfg.Locales.Source)
			sourcePaths, err := resolveSourcePathsForStatus(sourcePattern)
			if err != nil {
				return nil, fmt.Errorf("resolve source paths for %q: %w", sourcePattern, err)
			}
			for _, sourcePath := range sourcePaths {
				if shouldIgnoreSourcePathForStatus(sourcePath, cfg.Locales.Targets) {
					continue
				}
				fileFormat := inferHyperlocaliseFileFormat(sourcePath)
				if fileFormat == "" {
					return nil, fmt.Errorf("unsupported source file format for %q", sourcePath)
				}
				sourceHash := ""
				if hashSources {
					sourceHash, err = sha256File(sourcePath)
					if err != nil {
						return nil, fmt.Errorf("hash source file %q: %w", sourcePath, err)
					}
				}
				targetPaths := make(map[string]string, len(targetLocales))
				for _, locale := range targetLocales {
					targetPattern := pathresolver.ResolveTargetPath(mapping.To, cfg.Locales.Source, locale)
					targetPath, err := resolveTargetPathForStatus(sourcePattern, targetPattern, sourcePath)
					if err != nil {
						return nil, fmt.Errorf("resolve target path for source %q: %w", sourcePath, err)
					}
					targetPaths[locale] = targetPath
				}
				plans = append(plans, hyperlocaliseFilePlan{
					Bucket:        bucketName,
					SourcePath:    sourcePath,
					SourceHash:    sourceHash,
					FileFormat:    fileFormat,
					SourceLocale:  cfg.Locales.Source,
					TargetLocales: append([]string(nil), targetLocales...),
					TargetPaths:   targetPaths,
				})
			}
		}
	}

	return plans, nil
}

func resolveHyperlocaliseTargetLocales(configured, requested []string) ([]string, error) {
	if len(requested) == 0 {
		return append([]string(nil), configured...), nil
	}

	allowed := make(map[string]struct{}, len(configured))
	for _, locale := range configured {
		allowed[locale] = struct{}{}
	}

	targets := make([]string, 0, len(requested))
	seen := map[string]struct{}{}
	for _, locale := range requested {
		locale = strings.TrimSpace(locale)
		if locale == "" {
			continue
		}
		if _, ok := allowed[locale]; !ok {
			return nil, fmt.Errorf("locale %q is not configured in locales.targets", locale)
		}
		if _, ok := seen[locale]; ok {
			continue
		}
		seen[locale] = struct{}{}
		targets = append(targets, locale)
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("at least one target locale is required")
	}
	return targets, nil
}

func inferHyperlocaliseFileFormat(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".json":
		return "json"
	case ".jsonc":
		return "jsonc"
	case ".arb":
		return "arb"
	case ".xlf", ".xlif", ".xliff":
		return "xliff"
	case ".po":
		return "po"
	case ".html":
		return "html"
	case ".md":
		return "markdown"
	case ".mdx":
		return "mdx"
	case ".strings":
		return "strings"
	case ".stringsdict":
		return "stringsdict"
	case ".xcstrings":
		return "xcstrings"
	case ".csv":
		return "csv"
	case ".ftl":
		return "fluent"
	case ".properties":
		return "properties"
	case ".png":
		return "png"
	case ".jpg", ".jpeg":
		return "jpeg"
	case ".webp":
		return "webp"
	default:
		return ""
	}
}

func isHyperlocaliseImageFileFormat(format string) bool {
	switch format {
	case "png", "jpeg", "webp":
		return true
	default:
		return false
	}
}

func sha256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func (c *hyperlocaliseAPIClient) uploadFile(ctx context.Context, projectID string, plan hyperlocaliseFilePlan) (string, error) {
	content, err := os.ReadFile(plan.SourcePath)
	if err != nil {
		return "", err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("projectId", projectID); err != nil {
		return "", err
	}
	_ = writer.WriteField("sourcePath", plan.SourcePath)
	_ = writer.WriteField("sourceHash", plan.SourceHash)
	_ = writer.WriteField("commitSha", os.Getenv("GITHUB_SHA"))
	_ = writer.WriteField("workflowRunId", os.Getenv("GITHUB_RUN_ID"))

	partHeader := make(textproto.MIMEHeader)
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, escapeQuotes(filepath.Base(plan.SourcePath))))
	partHeader.Set("Content-Type", contentTypeForPath(plan.SourcePath))
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(content); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	var response hyperlocaliseUploadFileResponse
	if err := c.doJSON(ctx, http.MethodPost, "/v1/files", writer.FormDataContentType(), &body, &response); err != nil {
		return "", err
	}
	if strings.TrimSpace(response.File.ID) == "" {
		return "", fmt.Errorf("upload response did not include file id")
	}
	return response.File.ID, nil
}

func (c *hyperlocaliseAPIClient) downloadTranslationExport(ctx context.Context, projectID, sourcePath, locale string) ([]byte, error) {
	query := url.Values{}
	query.Set("sourcePath", sourcePath)
	query.Set("locale", locale)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		c.baseURL+"/v1/projects/"+url.PathEscape(projectID)+"/translations/download?"+query.Encode(),
		nil,
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &hyperlocaliseAPIError{StatusCode: resp.StatusCode, Body: string(body)}
	}

	content, err := io.ReadAll(io.LimitReader(resp.Body, hyperlocaliseMaxDownloadBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > hyperlocaliseMaxDownloadBytes {
		return nil, fmt.Errorf("downloaded translation export exceeds maximum size of %d bytes", hyperlocaliseMaxDownloadBytes)
	}
	return content, nil
}

func (c *hyperlocaliseAPIClient) downloadImageVariant(ctx context.Context, projectID, sourcePath, locale string) ([]byte, error) {
	query := url.Values{}
	query.Set("sourcePath", sourcePath)
	query.Set("locale", locale)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		c.baseURL+"/v1/projects/"+url.PathEscape(projectID)+"/images/download?"+query.Encode(),
		nil,
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &hyperlocaliseAPIError{StatusCode: resp.StatusCode, Body: string(body)}
	}

	content, err := io.ReadAll(io.LimitReader(resp.Body, hyperlocaliseMaxDownloadBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > hyperlocaliseMaxDownloadBytes {
		return nil, fmt.Errorf("downloaded image variant exceeds maximum size of %d bytes", hyperlocaliseMaxDownloadBytes)
	}
	return content, nil
}

func (c *hyperlocaliseAPIClient) doJSON(ctx context.Context, method, path, contentType string, body io.Reader, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return &hyperlocaliseAPIError{StatusCode: resp.StatusCode, Body: string(body)}
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode hyperlocalise response: %w", err)
	}
	return nil
}

func writeFileAtomic(path string, content []byte) error {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	dir := filepath.Dir(path)
	temp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tempName := temp.Name()
	if _, err := temp.Write(content); err != nil {
		_ = temp.Close()
		_ = os.Remove(tempName)
		return err
	}
	if err := temp.Close(); err != nil {
		_ = os.Remove(tempName)
		return err
	}
	if err := os.Chmod(tempName, 0o644); err != nil {
		_ = os.Remove(tempName)
		return err
	}
	return os.Rename(tempName, path)
}

func writeHyperlocalisePushReport(w io.Writer, report hyperlocalisePushReport, output string) error {
	switch strings.ToLower(strings.TrimSpace(output)) {
	case "", "text":
		_, err := fmt.Fprintf(
			w,
			"action=%s complete=%t planned_files=%d uploaded_files=%d failed_items=%d dry_run=%t\n",
			report.Action,
			report.Complete,
			report.PlannedFiles,
			report.UploadedFiles,
			report.FailedItems,
			report.DryRun,
		)
		return err
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "md", "markdown":
		_, err := fmt.Fprintf(
			w,
			"## Hyperlocalise Push\n\n- Complete: `%t`\n- Planned files: `%d`\n- Uploaded files: `%d`\n- Failed items: `%d`\n",
			report.Complete,
			report.PlannedFiles,
			report.UploadedFiles,
			report.FailedItems,
		)
		return err
	default:
		return fmt.Errorf("unsupported output format %q", output)
	}
}

func writeHyperlocalisePullReport(w io.Writer, report hyperlocalisePullReport, output string) error {
	switch strings.ToLower(strings.TrimSpace(output)) {
	case "", "text":
		_, err := fmt.Fprintf(
			w,
			"action=%s complete=%t planned_files=%d downloaded=%d skipped=%d dry_run=%t\n",
			report.Action,
			report.Complete,
			report.PlannedFiles,
			report.Downloaded,
			report.Skipped,
			report.DryRun,
		)
		return err
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "md", "markdown":
		_, err := fmt.Fprintf(
			w,
			"## Hyperlocalise Pull\n\n- Complete: `%t`\n- Planned files: `%d`\n- Downloaded: `%d`\n- Skipped: `%d`\n",
			report.Complete,
			report.PlannedFiles,
			report.Downloaded,
			report.Skipped,
		)
		return err
	default:
		return fmt.Errorf("unsupported output format %q", output)
	}
}

func contentTypeForPath(path string) string {
	if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
		return contentType
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".mdx":
		return "text/markdown"
	case ".po", ".strings", ".stringsdict", ".ftl", ".properties":
		return "text/plain"
	case ".xcstrings":
		return "application/json"
	default:
		return "application/octet-stream"
	}
}

func escapeQuotes(value string) string {
	return strings.ReplaceAll(value, `"`, `\"`)
}
