package phrase

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/antihax/optional"
	phraseapi "github.com/phrase/phrase-go/v4"
)

// SourceUploadInput describes one Phrase source file upload.
type SourceUploadInput struct {
	ProjectID             string
	APIToken              string
	LocaleID              string
	FilePath              string
	FileFormat            string
	Branch                string
	Tags                  []string
	UpdateTranslations    bool
	SkipUploadTags        bool
	UpdateTranslationKeys *bool
	UpdateDescriptions    *bool
	SkipUnverification    *bool
	FileEncoding          string
	LocaleMapping         map[string]any
	FormatOptions         map[string]any
	Autotranslate         *bool
	MarkReviewed          *bool
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
	opts := phraseapi.UploadCreateOpts{}
	if branch := strings.TrimSpace(in.Branch); branch != "" {
		opts.Branch = optional.NewString(branch)
	}
	if tags := joinTrimmed(in.Tags); tags != "" {
		opts.Tags = optional.NewString(tags)
	}
	if in.UpdateTranslations {
		opts.UpdateTranslations = optional.NewBool(true)
	}
	if in.SkipUploadTags {
		opts.SkipUploadTags = optional.NewBool(true)
	}
	if in.UpdateTranslationKeys != nil {
		opts.UpdateTranslationKeys = optional.NewBool(*in.UpdateTranslationKeys)
	}
	if in.UpdateDescriptions != nil {
		opts.UpdateDescriptions = optional.NewBool(*in.UpdateDescriptions)
	}
	if in.SkipUnverification != nil {
		opts.SkipUnverification = optional.NewBool(*in.SkipUnverification)
	}
	if fileEncoding := strings.TrimSpace(in.FileEncoding); fileEncoding != "" {
		opts.FileEncoding = optional.NewString(fileEncoding)
	}
	if len(in.LocaleMapping) > 0 {
		opts.LocaleMapping = optional.NewInterface(in.LocaleMapping)
	}
	if len(in.FormatOptions) > 0 {
		opts.FormatOptions = optional.NewInterface(in.FormatOptions)
	}
	if in.Autotranslate != nil {
		opts.Autotranslate = optional.NewBool(*in.Autotranslate)
	}
	if in.MarkReviewed != nil {
		opts.MarkReviewed = optional.NewBool(*in.MarkReviewed)
	}

	upload, err := c.uploadSourceFile(ctx, strings.TrimSpace(in.APIToken), strings.TrimSpace(in.ProjectID), in.FilePath, strings.TrimSpace(in.FileFormat), strings.TrimSpace(in.LocaleID), &opts)
	if err != nil {
		return SourceUploadResult{}, fmt.Errorf("phrase source upload %q: %w", in.FilePath, err)
	}
	return sourceUploadResultFromPhrase(upload), nil
}

func (c *HTTPClient) uploadSourceFile(ctx context.Context, token, projectID, filePath, fileFormat, localeID string, opts *phraseapi.UploadCreateOpts) (phraseapi.Upload, error) {
	authCtx := context.WithValue(ctx, phraseapi.ContextAPIKey, phraseapi.APIKey{Key: token, Prefix: "token"})
	attempt := 0
	for {
		upload, resp, err := c.uploadSourceFileAttempt(authCtx, projectID, filePath, fileFormat, localeID, opts)
		if err == nil {
			return upload, nil
		}
		if upload, ok := successfulUploadFromError(resp, err); ok {
			return upload, nil
		}
		if !shouldRetry(apiResponseHTTPResponse(resp), err) || attempt >= maxRetries {
			return phraseapi.Upload{}, phraseAPIError("POST", fmt.Sprintf("/projects/%s/uploads", projectID), resp, err)
		}
		delay := retryDelay(attempt, apiResponseHTTPResponse(resp))
		attempt++
		if err := sleepWithContext(ctx, delay); err != nil {
			return phraseapi.Upload{}, err
		}
	}
}

func (c *HTTPClient) uploadSourceFileAttempt(ctx context.Context, projectID, filePath, fileFormat, localeID string, opts *phraseapi.UploadCreateOpts) (phraseapi.Upload, *phraseapi.APIResponse, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return phraseapi.Upload{}, nil, fmt.Errorf("open source file %q: %w", filePath, err)
	}
	defer func() {
		_ = file.Close()
	}()

	return c.phraseClient.UploadsApi.UploadCreate(ctx, projectID, file, fileFormat, localeID, opts)
}

func successfulUploadFromError(resp *phraseapi.APIResponse, err error) (phraseapi.Upload, bool) {
	if resp == nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return phraseapi.Upload{}, false
	}
	bodyErr, ok := err.(interface{ Body() []byte })
	if !ok || len(bodyErr.Body()) == 0 {
		return phraseapi.Upload{}, false
	}
	var upload phraseapi.Upload
	if err := json.Unmarshal(bodyErr.Body(), &upload); err != nil {
		return phraseapi.Upload{}, false
	}
	return upload, true
}

func apiResponseHTTPResponse(resp *phraseapi.APIResponse) *http.Response {
	if resp == nil {
		return nil
	}
	return resp.Response
}

func phraseAPIError(method, path string, resp *phraseapi.APIResponse, err error) error {
	if resp == nil {
		return err
	}
	var body []byte
	if bodyErr, ok := err.(interface{ Body() []byte }); ok {
		body = bodyErr.Body()
	}
	return fmt.Errorf("phrase API %s %s failed: status=%d body=%s", method, path, resp.StatusCode, strings.TrimSpace(string(body)))
}

func sourceUploadResultFromPhrase(upload phraseapi.Upload) SourceUploadResult {
	return SourceUploadResult{
		ID:       upload.Id,
		Filename: upload.Filename,
		Format:   upload.Format,
		State:    upload.State,
		Summary: SourceUploadSummary{
			TranslationKeysCreated:     int(upload.Summary.TranslationKeysCreated),
			TranslationKeysUpdated:     int(upload.Summary.TranslationKeysUpdated),
			TranslationKeysUnmentioned: int(upload.Summary.TranslationKeysUnmentioned),
			TranslationsCreated:        int(upload.Summary.TranslationsCreated),
			TranslationsUpdated:        int(upload.Summary.TranslationsUpdated),
			TranslationKeysIgnored:     int(upload.Summary.TranslationKeysIgnored),
		},
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
