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
	DownloadOptions
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
	DownloadOptions
}

// DownloadOptions mirrors the Phrase locale download params that the CLI config can pass through.
type DownloadOptions struct {
	IncludeEmptyTranslations      *bool
	ExcludeEmptyZeroForms         *bool
	IncludeTranslatedKeys         *bool
	KeepNotranslateTags           *bool
	Encoding                      string
	IncludeUnverifiedTranslations *bool
	UseLastReviewedVersion        *bool
	FallbackLocaleID              string
	FormatOptions                 map[string]any
	SourceLocaleID                string
	TranslationKeyPrefix          string
	FilterByPrefix                *bool
	UseLocaleFallback             *bool
	SkipUnverifiedTranslations    *bool
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
	applyLocaleDownloadOptions(&opts, in.DownloadOptions)

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
	applyLocaleDownloadOptions(&opts, in.DownloadOptions)

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

func applyLocaleDownloadOptions(opts *phraseapi.LocaleDownloadOpts, in DownloadOptions) {
	if opts == nil {
		return
	}
	if in.IncludeEmptyTranslations != nil {
		opts.IncludeEmptyTranslations = optional.NewBool(*in.IncludeEmptyTranslations)
	}
	if in.ExcludeEmptyZeroForms != nil {
		opts.ExcludeEmptyZeroForms = optional.NewBool(*in.ExcludeEmptyZeroForms)
	}
	if in.IncludeTranslatedKeys != nil {
		opts.IncludeTranslatedKeys = optional.NewBool(*in.IncludeTranslatedKeys)
	}
	if in.KeepNotranslateTags != nil {
		opts.KeepNotranslateTags = optional.NewBool(*in.KeepNotranslateTags)
	}
	if encoding := strings.TrimSpace(in.Encoding); encoding != "" {
		opts.Encoding = optional.NewString(encoding)
	}
	if in.IncludeUnverifiedTranslations != nil {
		opts.IncludeUnverifiedTranslations = optional.NewBool(*in.IncludeUnverifiedTranslations)
	}
	if in.UseLastReviewedVersion != nil {
		opts.UseLastReviewedVersion = optional.NewBool(*in.UseLastReviewedVersion)
	}
	if fallbackLocaleID := strings.TrimSpace(in.FallbackLocaleID); fallbackLocaleID != "" {
		opts.FallbackLocaleId = optional.NewString(fallbackLocaleID)
	}
	if len(in.FormatOptions) > 0 {
		opts.FormatOptions = optional.NewInterface(in.FormatOptions)
	}
	if sourceLocaleID := strings.TrimSpace(in.SourceLocaleID); sourceLocaleID != "" {
		opts.SourceLocaleId = optional.NewString(sourceLocaleID)
	}
	if translationKeyPrefix := strings.TrimSpace(in.TranslationKeyPrefix); translationKeyPrefix != "" {
		opts.TranslationKeyPrefix = optional.NewString(translationKeyPrefix)
	}
	if in.FilterByPrefix != nil {
		opts.FilterByPrefix = optional.NewBool(*in.FilterByPrefix)
	}
	if in.UseLocaleFallback != nil {
		opts.UseLocaleFallback = optional.NewBool(*in.UseLocaleFallback)
	}
	if in.SkipUnverifiedTranslations != nil {
		opts.SkipUnverifiedTranslations = optional.NewBool(*in.SkipUnverifiedTranslations)
	}
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
