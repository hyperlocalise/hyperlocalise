package phrase

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/antihax/optional"
	phraseapi "github.com/phrase/phrase-go/v4"
)

// SourceDownloadInput describes one Phrase source locale download.
type SourceDownloadInput struct {
	ProjectID  string
	APIToken   string
	LocaleID   string
	FileFormat string
	Branch     string
	Tags       []string
}

// SourceDownloadResult is the normalized content returned by a Phrase locale download.
type SourceDownloadResult struct {
	LocaleID string
	Format   string
	Content  []byte
}

// TranslationDownloadInput describes one Phrase target locale download.
type TranslationDownloadInput struct {
	ProjectID  string
	APIToken   string
	LocaleID   string
	FileFormat string
	Branch     string
	Tags       []string
}

// TranslationDownloadResult is the normalized content returned by a Phrase target locale download.
type TranslationDownloadResult struct {
	LocaleID string
	Format   string
	Content  []byte
}

// DownloadSourceFile downloads source locale content from Phrase Strings.
func (c *HTTPClient) DownloadSourceFile(ctx context.Context, in SourceDownloadInput) (SourceDownloadResult, error) {
	if strings.TrimSpace(in.ProjectID) == "" {
		return SourceDownloadResult{}, fmt.Errorf("phrase source download: project id is required")
	}
	if strings.TrimSpace(in.APIToken) == "" {
		return SourceDownloadResult{}, fmt.Errorf("phrase source download: api token is required")
	}
	if strings.TrimSpace(in.LocaleID) == "" {
		return SourceDownloadResult{}, fmt.Errorf("phrase source download: source locale is required")
	}
	if strings.TrimSpace(in.FileFormat) == "" {
		return SourceDownloadResult{}, fmt.Errorf("phrase source download: file format is required")
	}

	opts := phraseapi.LocaleDownloadOpts{
		FileFormat: optional.NewString(strings.TrimSpace(in.FileFormat)),
	}
	if branch := strings.TrimSpace(in.Branch); branch != "" {
		opts.Branch = optional.NewString(branch)
	}
	if tags := joinTrimmed(in.Tags); tags != "" {
		opts.Tags = optional.NewString(tags)
	}

	content, err := c.downloadSourceFile(ctx, strings.TrimSpace(in.APIToken), strings.TrimSpace(in.ProjectID), strings.TrimSpace(in.LocaleID), &opts)
	if err != nil {
		return SourceDownloadResult{}, fmt.Errorf("phrase source download %q: %w", in.LocaleID, err)
	}
	return SourceDownloadResult{
		LocaleID: strings.TrimSpace(in.LocaleID),
		Format:   strings.TrimSpace(in.FileFormat),
		Content:  content,
	}, nil
}

// DownloadTranslationFile downloads target locale content from Phrase Strings.
func (c *HTTPClient) DownloadTranslationFile(ctx context.Context, in TranslationDownloadInput) (TranslationDownloadResult, error) {
	if strings.TrimSpace(in.ProjectID) == "" {
		return TranslationDownloadResult{}, fmt.Errorf("phrase translation download: project id is required")
	}
	if strings.TrimSpace(in.APIToken) == "" {
		return TranslationDownloadResult{}, fmt.Errorf("phrase translation download: api token is required")
	}
	if strings.TrimSpace(in.LocaleID) == "" {
		return TranslationDownloadResult{}, fmt.Errorf("phrase translation download: target locale is required")
	}
	if strings.TrimSpace(in.FileFormat) == "" {
		return TranslationDownloadResult{}, fmt.Errorf("phrase translation download: file format is required")
	}

	opts := phraseapi.LocaleDownloadOpts{
		FileFormat: optional.NewString(strings.TrimSpace(in.FileFormat)),
	}
	if branch := strings.TrimSpace(in.Branch); branch != "" {
		opts.Branch = optional.NewString(branch)
	}
	if tags := joinTrimmed(in.Tags); tags != "" {
		opts.Tags = optional.NewString(tags)
	}

	content, err := c.downloadSourceFile(ctx, strings.TrimSpace(in.APIToken), strings.TrimSpace(in.ProjectID), strings.TrimSpace(in.LocaleID), &opts)
	if err != nil {
		return TranslationDownloadResult{}, fmt.Errorf("phrase translation download %q: %w", in.LocaleID, err)
	}
	return TranslationDownloadResult{
		LocaleID: strings.TrimSpace(in.LocaleID),
		Format:   strings.TrimSpace(in.FileFormat),
		Content:  content,
	}, nil
}

func (c *HTTPClient) downloadSourceFile(ctx context.Context, token, projectID, localeID string, opts *phraseapi.LocaleDownloadOpts) ([]byte, error) {
	authCtx := context.WithValue(ctx, phraseapi.ContextAPIKey, phraseapi.APIKey{Key: token, Prefix: "token"})
	attempt := 0
	for {
		file, resp, err := c.phraseClient.LocalesApi.LocaleDownload(authCtx, projectID, localeID, opts)
		if err == nil {
			return readAndRemovePhraseTempFile(file)
		}
		if !shouldRetry(apiResponseHTTPResponse(resp), err) || attempt >= maxRetries {
			return nil, phraseAPIError("GET", fmt.Sprintf("/projects/%s/locales/%s/download", projectID, localeID), resp, err)
		}
		delay := retryDelay(attempt, apiResponseHTTPResponse(resp))
		attempt++
		if err := sleepWithContext(ctx, delay); err != nil {
			return nil, err
		}
	}
}

func readAndRemovePhraseTempFile(file *os.File) ([]byte, error) {
	if file == nil {
		return nil, fmt.Errorf("empty download response")
	}
	name := file.Name()
	defer func() {
		_ = file.Close()
		if name != "" {
			_ = os.Remove(name)
		}
	}()
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("seek download response: %w", err)
	}
	content, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("read download response: %w", err)
	}
	return content, nil
}
