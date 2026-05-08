package phrase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// SourceUploadInput describes one Phrase source file upload.
type SourceUploadInput struct {
	ProjectID          string
	APIToken           string
	LocaleID           string
	FilePath           string
	FileFormat         string
	Branch             string
	Tags               []string
	UpdateTranslations bool
	SkipUploadTags     bool
}

// SourceUploadSummary contains Phrase's upload summary counters.
type SourceUploadSummary struct {
	TranslationKeysCreated     int `json:"translation_keys_created"`
	TranslationKeysUpdated     int `json:"translation_keys_updated"`
	TranslationKeysUnmentioned int `json:"translation_keys_unmentioned"`
	TranslationsCreated        int `json:"translations_created"`
	TranslationsUpdated        int `json:"translations_updated"`
	TranslationKeysIgnored     int `json:"translation_keys_ignored"`
}

// SourceUploadResult is the normalized subset of Phrase's upload response used by CLI output.
type SourceUploadResult struct {
	ID       string              `json:"id"`
	Filename string              `json:"filename"`
	Format   string              `json:"format"`
	State    string              `json:"state"`
	Summary  SourceUploadSummary `json:"summary"`
}

// UploadSourceFile uploads one source file to Phrase Strings.
func (c *HTTPClient) UploadSourceFile(ctx context.Context, in SourceUploadInput) (SourceUploadResult, error) {
	if strings.TrimSpace(in.ProjectID) == "" {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload: project id is required")
	}
	if strings.TrimSpace(in.APIToken) == "" {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload: api token is required")
	}
	if strings.TrimSpace(in.LocaleID) == "" {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload: source locale is required")
	}
	if strings.TrimSpace(in.FileFormat) == "" {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload: file format is required")
	}
	if strings.TrimSpace(in.FilePath) == "" {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload: file path is required")
	}
	file, err := os.Open(in.FilePath)
	if err != nil {
		return SourceUploadResult{}, fmt.Errorf("open source file %q: %w", in.FilePath, err)
	}
	defer func() {
		_ = file.Close()
	}()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("file_format", strings.TrimSpace(in.FileFormat)); err != nil {
		return SourceUploadResult{}, err
	}
	if err := writer.WriteField("locale_id", strings.TrimSpace(in.LocaleID)); err != nil {
		return SourceUploadResult{}, err
	}
	if branch := strings.TrimSpace(in.Branch); branch != "" {
		if err := writer.WriteField("branch", branch); err != nil {
			return SourceUploadResult{}, err
		}
	}
	if tags := joinTrimmed(in.Tags); tags != "" {
		if err := writer.WriteField("tags", tags); err != nil {
			return SourceUploadResult{}, err
		}
	}
	if in.UpdateTranslations {
		if err := writer.WriteField("update_translations", "true"); err != nil {
			return SourceUploadResult{}, err
		}
	}
	if in.SkipUploadTags {
		if err := writer.WriteField("skip_upload_tags", "true"); err != nil {
			return SourceUploadResult{}, err
		}
	}
	part, err := writer.CreateFormFile("file", filepath.Base(in.FilePath))
	if err != nil {
		return SourceUploadResult{}, err
	}
	if _, err := io.Copy(part, file); err != nil {
		return SourceUploadResult{}, fmt.Errorf("read source file %q: %w", in.FilePath, err)
	}
	if err := writer.Close(); err != nil {
		return SourceUploadResult{}, err
	}

	var out SourceUploadResult
	path := fmt.Sprintf("/projects/%s/uploads", url.PathEscape(in.ProjectID))
	if err := c.doMultipart(ctx, http.MethodPost, path, in.APIToken, writer.FormDataContentType(), body.Bytes(), &out); err != nil {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload %q: %w", in.FilePath, err)
	}
	return out, nil
}

func (c *HTTPClient) doMultipart(ctx context.Context, method, path, token, contentType string, bodyBytes []byte, out any) error {
	attempt := 0
	for {
		req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(bodyBytes))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "token "+token)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", contentType)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			if !shouldRetry(nil, err) || attempt >= maxRetries {
				return err
			}
			delay := retryDelay(attempt, nil)
			attempt++
			if err := sleepWithContext(ctx, delay); err != nil {
				return err
			}
			continue
		}

		rawBody, readErr := io.ReadAll(resp.Body)
		closeErr := resp.Body.Close()
		if readErr != nil {
			return readErr
		}
		if closeErr != nil {
			return closeErr
		}
		if shouldRetry(resp, nil) && attempt < maxRetries {
			delay := retryDelay(attempt, resp)
			attempt++
			if err := sleepWithContext(ctx, delay); err != nil {
				return err
			}
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("phrase API %s %s failed: status=%d body=%s", method, path, resp.StatusCode, strings.TrimSpace(string(rawBody)))
		}
		if out != nil && len(rawBody) > 0 {
			if err := json.Unmarshal(rawBody, out); err != nil {
				return fmt.Errorf("decode response: %w", err)
			}
		}
		return nil
	}
}

func joinTrimmed(values []string) string {
	trimmed := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			if s := strings.TrimSpace(part); s != "" {
				trimmed = append(trimmed, s)
			}
		}
	}
	return strings.Join(trimmed, ",")
}
