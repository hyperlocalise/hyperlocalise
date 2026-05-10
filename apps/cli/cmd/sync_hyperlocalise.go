package cmd

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

const hyperlocaliseManifestVersion = 1

type hyperlocaliseSyncRuntime struct {
	cfg          *config.I18NConfig
	configPath   string
	projectID    string
	apiBaseURL   string
	apiKey       string
	manifestPath string
	timeout      time.Duration
	client       *hyperlocaliseAPIClient
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

type hyperlocaliseSyncManifest struct {
	Version            int                         `json:"version"`
	Complete           bool                        `json:"complete"`
	GeneratedAt        time.Time                   `json:"generatedAt"`
	ProjectID          string                      `json:"projectId"`
	APIBaseURL         string                      `json:"apiBaseUrl"`
	ConfigPath         string                      `json:"configPath,omitempty"`
	Repository         string                      `json:"repository,omitempty"`
	Ref                string                      `json:"ref,omitempty"`
	CommitSHA          string                      `json:"commitSha,omitempty"`
	WorkflowRunID      string                      `json:"workflowRunId,omitempty"`
	WorkflowRunAttempt string                      `json:"workflowRunAttempt,omitempty"`
	Jobs               []hyperlocaliseManifestJob  `json:"jobs"`
	FailedItems        []hyperlocaliseManifestFail `json:"failedItems,omitempty"`
}

type hyperlocaliseManifestJob struct {
	JobID         string            `json:"jobId"`
	SourceFileID  string            `json:"sourceFileId"`
	Bucket        string            `json:"bucket"`
	SourcePath    string            `json:"sourcePath"`
	SourceHash    string            `json:"sourceHash"`
	FileFormat    string            `json:"fileFormat"`
	SourceLocale  string            `json:"sourceLocale"`
	TargetLocales []string          `json:"targetLocales"`
	TargetPaths   map[string]string `json:"targetPaths"`
	Status        string            `json:"status"`
}

type hyperlocaliseManifestFail struct {
	SourcePath string `json:"sourcePath"`
	Message    string `json:"message"`
}

type hyperlocalisePushReport struct {
	Action       string `json:"action"`
	Complete     bool   `json:"complete"`
	PlannedFiles int    `json:"plannedFiles"`
	CreatedJobs  int    `json:"createdJobs"`
	FailedItems  int    `json:"failedItems"`
	ManifestPath string `json:"manifestPath,omitempty"`
	DryRun       bool   `json:"dryRun"`
}

type hyperlocalisePullReport struct {
	Action       string `json:"action"`
	Complete     bool   `json:"complete"`
	Jobs         int    `json:"jobs"`
	Downloaded   int    `json:"downloaded"`
	Skipped      int    `json:"skipped"`
	ManifestPath string `json:"manifestPath,omitempty"`
	DryRun       bool   `json:"dryRun"`
}

type hyperlocaliseAPIClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type hyperlocaliseUploadFileResponse struct {
	File struct {
		ID string `json:"id"`
	} `json:"file"`
}

type hyperlocaliseCreateJobResponse struct {
	Job struct {
		ID     string `json:"id"`
		Type   string `json:"type"`
		Status string `json:"status"`
	} `json:"job"`
}

type hyperlocaliseJobResponse struct {
	Job hyperlocaliseJob `json:"job"`
}

type hyperlocaliseJob struct {
	ID             string          `json:"id"`
	Status         string          `json:"status"`
	LastError      string          `json:"lastError"`
	OutcomePayload json.RawMessage `json:"outcomePayload"`
}

type hyperlocaliseFileJobOutcome struct {
	OutputFiles []hyperlocaliseOutputFile `json:"outputFiles"`
}

type hyperlocaliseOutputFile struct {
	FileID   string `json:"fileId"`
	Locale   string `json:"locale"`
	Filename string `json:"filename"`
}

func newHyperlocaliseSyncRuntime(configPath, manifestOverride string) (*hyperlocaliseSyncRuntime, error) {
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

	manifestPath := strings.TrimSpace(manifestOverride)
	if manifestPath == "" {
		manifestPath = strings.TrimSpace(cfg.Hyperlocalise.ManifestPath)
	}
	if manifestPath == "" {
		return nil, fmt.Errorf("hyperlocalise manifest path is required")
	}

	timeout := time.Duration(cfg.Hyperlocalise.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 20 * time.Minute
	}

	apiBaseURL := strings.TrimRight(strings.TrimSpace(cfg.Hyperlocalise.APIBaseURL), "/")
	return &hyperlocaliseSyncRuntime{
		cfg:          cfg,
		configPath:   configPath,
		projectID:    projectID,
		apiBaseURL:   apiBaseURL,
		apiKey:       apiKey,
		manifestPath: manifestPath,
		timeout:      timeout,
		client: &hyperlocaliseAPIClient{
			baseURL:    apiBaseURL,
			apiKey:     apiKey,
			httpClient: &http.Client{Timeout: timeout},
		},
	}, nil
}

func runHyperlocalisePush(ctx context.Context, rt *hyperlocaliseSyncRuntime, o syncCommonOptions) (hyperlocalisePushReport, error) {
	if len(o.keyPrefixes) > 0 {
		return hyperlocalisePushReport{}, fmt.Errorf("sync push through Hyperlocalise jobs does not support --key-prefix")
	}

	plans, err := planHyperlocaliseFiles(rt.cfg, o.locales)
	if err != nil {
		return hyperlocalisePushReport{}, err
	}

	report := hyperlocalisePushReport{
		Action:       "push",
		PlannedFiles: len(plans),
		ManifestPath: rt.manifestPath,
		DryRun:       o.dryRun,
	}
	if o.dryRun {
		report.Complete = true
		return report, nil
	}

	manifest := newHyperlocaliseManifest(rt)
	for _, plan := range plans {
		sourceFileID, uploadErr := rt.client.uploadFile(ctx, rt.projectID, plan)
		if uploadErr != nil {
			manifest.FailedItems = append(manifest.FailedItems, hyperlocaliseManifestFail{
				SourcePath: plan.SourcePath,
				Message:    uploadErr.Error(),
			})
			continue
		}

		job, createErr := rt.client.createFileJob(ctx, rt.projectID, sourceFileID, plan)
		if createErr != nil {
			manifest.FailedItems = append(manifest.FailedItems, hyperlocaliseManifestFail{
				SourcePath: plan.SourcePath,
				Message:    createErr.Error(),
			})
			continue
		}

		manifest.Jobs = append(manifest.Jobs, hyperlocaliseManifestJob{
			JobID:         job.Job.ID,
			SourceFileID:  sourceFileID,
			Bucket:        plan.Bucket,
			SourcePath:    plan.SourcePath,
			SourceHash:    plan.SourceHash,
			FileFormat:    plan.FileFormat,
			SourceLocale:  plan.SourceLocale,
			TargetLocales: append([]string(nil), plan.TargetLocales...),
			TargetPaths:   cloneStringMap(plan.TargetPaths),
			Status:        job.Job.Status,
		})
	}

	manifest.Complete = len(manifest.FailedItems) == 0
	if err := writeHyperlocaliseManifest(rt.manifestPath, manifest); err != nil {
		return report, err
	}

	report.Complete = manifest.Complete
	report.CreatedJobs = len(manifest.Jobs)
	report.FailedItems = len(manifest.FailedItems)
	if !manifest.Complete {
		return report, fmt.Errorf("hyperlocalise push failed for %d item(s); wrote partial manifest to %s", len(manifest.FailedItems), rt.manifestPath)
	}

	return report, nil
}

func runHyperlocalisePull(ctx context.Context, rt *hyperlocaliseSyncRuntime, o syncCommonOptions, wait bool, timeout time.Duration) (hyperlocalisePullReport, error) {
	if len(o.keyPrefixes) > 0 {
		return hyperlocalisePullReport{}, fmt.Errorf("sync pull through Hyperlocalise jobs does not support --key-prefix")
	}

	manifest, err := readHyperlocaliseManifest(rt.manifestPath)
	if err != nil {
		return hyperlocalisePullReport{}, err
	}
	if !manifest.Complete {
		return hyperlocalisePullReport{}, fmt.Errorf("hyperlocalise manifest is incomplete; rerun sync push before pulling")
	}
	if manifest.ProjectID != "" && manifest.ProjectID != rt.projectID {
		return hyperlocalisePullReport{}, fmt.Errorf("hyperlocalise manifest project %q does not match configured project %q", manifest.ProjectID, rt.projectID)
	}

	if timeout <= 0 {
		timeout = rt.timeout
	}

	report := hyperlocalisePullReport{
		Action:       "pull",
		Complete:     true,
		Jobs:         len(manifest.Jobs),
		ManifestPath: rt.manifestPath,
		DryRun:       o.dryRun,
	}

	deadline := time.Now().Add(timeout)
	for _, manifestJob := range manifest.Jobs {
		job, err := waitForHyperlocaliseJob(ctx, rt.client, manifestJob.JobID, wait, deadline)
		if err != nil {
			return report, err
		}

		outcome, err := parseHyperlocaliseFileOutcome(job)
		if err != nil {
			return report, err
		}

		for _, outputFile := range outcome.OutputFiles {
			targetPath := strings.TrimSpace(manifestJob.TargetPaths[outputFile.Locale])
			if targetPath == "" {
				report.Skipped++
				continue
			}
			if o.dryRun {
				report.Downloaded++
				continue
			}
			content, err := rt.client.downloadFile(ctx, outputFile.FileID)
			if err != nil {
				return report, fmt.Errorf("download output file %s for job %s: %w", outputFile.FileID, manifestJob.JobID, err)
			}
			if err := writeFileAtomic(targetPath, content); err != nil {
				return report, fmt.Errorf("write target file %q: %w", targetPath, err)
			}
			report.Downloaded++
		}
	}

	return report, nil
}

func waitForHyperlocaliseJob(ctx context.Context, client *hyperlocaliseAPIClient, jobID string, wait bool, deadline time.Time) (hyperlocaliseJob, error) {
	for {
		job, err := client.getJob(ctx, jobID)
		if err != nil {
			return hyperlocaliseJob{}, err
		}

		switch job.Status {
		case "succeeded":
			return job, nil
		case "failed", "cancelled":
			if strings.TrimSpace(job.LastError) != "" {
				return hyperlocaliseJob{}, fmt.Errorf("hyperlocalise job %s %s: %s", jobID, job.Status, job.LastError)
			}
			return hyperlocaliseJob{}, fmt.Errorf("hyperlocalise job %s %s", jobID, job.Status)
		case "queued", "running", "waiting_for_review":
			if !wait {
				return hyperlocaliseJob{}, fmt.Errorf("hyperlocalise job %s is %s; rerun with --wait or pull later", jobID, job.Status)
			}
			if time.Now().After(deadline) {
				return hyperlocaliseJob{}, fmt.Errorf("timed out waiting for hyperlocalise job %s", jobID)
			}
			select {
			case <-ctx.Done():
				return hyperlocaliseJob{}, ctx.Err()
			case <-time.After(5 * time.Second):
			}
		default:
			return hyperlocaliseJob{}, fmt.Errorf("hyperlocalise job %s has unknown status %q", jobID, job.Status)
		}
	}
}

func newHyperlocaliseManifest(rt *hyperlocaliseSyncRuntime) hyperlocaliseSyncManifest {
	return hyperlocaliseSyncManifest{
		Version:            hyperlocaliseManifestVersion,
		Complete:           false,
		GeneratedAt:        time.Now().UTC(),
		ProjectID:          rt.projectID,
		APIBaseURL:         rt.apiBaseURL,
		ConfigPath:         rt.configPath,
		Repository:         os.Getenv("GITHUB_REPOSITORY"),
		Ref:                os.Getenv("GITHUB_REF"),
		CommitSHA:          os.Getenv("GITHUB_SHA"),
		WorkflowRunID:      os.Getenv("GITHUB_RUN_ID"),
		WorkflowRunAttempt: os.Getenv("GITHUB_RUN_ATTEMPT"),
	}
}

func planHyperlocaliseFiles(cfg *config.I18NConfig, localeFilter []string) ([]hyperlocaliseFilePlan, error) {
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
			sourcePath := pathresolver.ResolveSourcePath(mapping.From, cfg.Locales.Source)
			fileFormat := inferHyperlocaliseFileFormat(sourcePath)
			if fileFormat == "" {
				return nil, fmt.Errorf("unsupported source file format for %q", sourcePath)
			}
			sourceHash, err := sha256File(sourcePath)
			if err != nil {
				return nil, fmt.Errorf("hash source file %q: %w", sourcePath, err)
			}
			targetPaths := make(map[string]string, len(targetLocales))
			for _, locale := range targetLocales {
				targetPaths[locale] = pathresolver.ResolveTargetPath(mapping.To, cfg.Locales.Source, locale)
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
	case ".csv":
		return "csv"
	default:
		return ""
	}
}

func sha256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

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

func (c *hyperlocaliseAPIClient) createFileJob(ctx context.Context, projectID, sourceFileID string, plan hyperlocaliseFilePlan) (hyperlocaliseCreateJobResponse, error) {
	payload := map[string]any{
		"type":      "file",
		"projectId": projectID,
		"fileInput": map[string]any{
			"sourceFileId":  sourceFileID,
			"fileFormat":    plan.FileFormat,
			"sourceLocale":  plan.SourceLocale,
			"targetLocales": plan.TargetLocales,
			"metadata":      hyperlocaliseJobMetadata(plan),
		},
	}

	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		return hyperlocaliseCreateJobResponse{}, err
	}

	var response hyperlocaliseCreateJobResponse
	if err := c.doJSON(ctx, http.MethodPost, "/v1/jobs", "application/json", &body, &response); err != nil {
		return hyperlocaliseCreateJobResponse{}, err
	}
	if strings.TrimSpace(response.Job.ID) == "" {
		return hyperlocaliseCreateJobResponse{}, fmt.Errorf("create job response did not include job id")
	}
	return response, nil
}

func hyperlocaliseJobMetadata(plan hyperlocaliseFilePlan) map[string]string {
	metadata := map[string]string{
		"sourcePath": plan.SourcePath,
		"sourceHash": plan.SourceHash,
		"bucket":     plan.Bucket,
	}
	for _, item := range []struct {
		key string
		env string
	}{
		{key: "repository", env: "GITHUB_REPOSITORY"},
		{key: "ref", env: "GITHUB_REF"},
		{key: "commitSha", env: "GITHUB_SHA"},
		{key: "workflowRunId", env: "GITHUB_RUN_ID"},
		{key: "workflowRunAttempt", env: "GITHUB_RUN_ATTEMPT"},
	} {
		if value := strings.TrimSpace(os.Getenv(item.env)); value != "" {
			metadata[item.key] = value
		}
	}
	return metadata
}

func (c *hyperlocaliseAPIClient) getJob(ctx context.Context, jobID string) (hyperlocaliseJob, error) {
	var response hyperlocaliseJobResponse
	if err := c.doJSON(ctx, http.MethodGet, "/v1/jobs/"+jobID, "", nil, &response); err != nil {
		return hyperlocaliseJob{}, err
	}
	return response.Job, nil
}

func (c *hyperlocaliseAPIClient) downloadFile(ctx context.Context, fileID string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v1/files/"+fileID+"/download", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("hyperlocalise api returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return io.ReadAll(resp.Body)
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
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("hyperlocalise api returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode hyperlocalise response: %w", err)
	}
	return nil
}

func parseHyperlocaliseFileOutcome(job hyperlocaliseJob) (hyperlocaliseFileJobOutcome, error) {
	if len(job.OutcomePayload) == 0 || string(job.OutcomePayload) == "null" {
		return hyperlocaliseFileJobOutcome{}, fmt.Errorf("hyperlocalise job %s has no output payload", job.ID)
	}

	var outcome hyperlocaliseFileJobOutcome
	if err := json.Unmarshal(job.OutcomePayload, &outcome); err != nil {
		return hyperlocaliseFileJobOutcome{}, fmt.Errorf("decode output payload for job %s: %w", job.ID, err)
	}
	if len(outcome.OutputFiles) == 0 {
		return hyperlocaliseFileJobOutcome{}, fmt.Errorf("hyperlocalise job %s has no output files", job.ID)
	}
	return outcome, nil
}

func writeHyperlocaliseManifest(path string, manifest hyperlocaliseSyncManifest) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("manifest path is required")
	}
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return writeFileAtomic(path, content)
}

func readHyperlocaliseManifest(path string) (hyperlocaliseSyncManifest, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return hyperlocaliseSyncManifest{}, fmt.Errorf("read hyperlocalise manifest %q: %w", path, err)
	}
	var manifest hyperlocaliseSyncManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return hyperlocaliseSyncManifest{}, fmt.Errorf("decode hyperlocalise manifest %q: %w", path, err)
	}
	if manifest.Version != hyperlocaliseManifestVersion {
		return hyperlocaliseSyncManifest{}, fmt.Errorf("unsupported hyperlocalise manifest version %d", manifest.Version)
	}
	return manifest, nil
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
			"action=%s complete=%t planned_files=%d created_jobs=%d failed_items=%d dry_run=%t manifest=%s\n",
			report.Action,
			report.Complete,
			report.PlannedFiles,
			report.CreatedJobs,
			report.FailedItems,
			report.DryRun,
			report.ManifestPath,
		)
		return err
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "md", "markdown":
		_, err := fmt.Fprintf(w, "## Hyperlocalise Push\n\n- Complete: `%t`\n- Planned files: `%d`\n- Created jobs: `%d`\n- Failed items: `%d`\n- Manifest: `%s`\n", report.Complete, report.PlannedFiles, report.CreatedJobs, report.FailedItems, report.ManifestPath)
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
			"action=%s complete=%t jobs=%d downloaded=%d skipped=%d dry_run=%t manifest=%s\n",
			report.Action,
			report.Complete,
			report.Jobs,
			report.Downloaded,
			report.Skipped,
			report.DryRun,
			report.ManifestPath,
		)
		return err
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "md", "markdown":
		_, err := fmt.Fprintf(w, "## Hyperlocalise Pull\n\n- Complete: `%t`\n- Jobs: `%d`\n- Downloaded: `%d`\n- Skipped: `%d`\n- Manifest: `%s`\n", report.Complete, report.Jobs, report.Downloaded, report.Skipped, report.ManifestPath)
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
	case ".po", ".strings", ".stringsdict":
		return "text/plain"
	default:
		return "application/octet-stream"
	}
}

func escapeQuotes(value string) string {
	return strings.ReplaceAll(value, `"`, `\"`)
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return nil
	}
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}
