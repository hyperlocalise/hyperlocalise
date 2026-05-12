package poeditor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const apiBaseURL = "https://api.poeditor.com/v2"

type apiEnvelope struct {
	Response struct {
		Status  string `json:"status"`
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"response"`
}

func (e apiEnvelope) check(endpoint string) error {
	status := strings.ToLower(strings.TrimSpace(e.Response.Status))
	code := strings.TrimSpace(e.Response.Code)
	message := strings.TrimSpace(e.Response.Message)
	if status == "" || status == "success" {
		return nil
	}
	if message == "" {
		message = "request failed"
	}
	if code != "" {
		return fmt.Errorf("poeditor request %s: api error %s: %s", endpoint, code, message)
	}
	return fmt.Errorf("poeditor request %s: api error: %s", endpoint, message)
}

type translationContent struct {
	stringValue string
}

func (c *translationContent) UnmarshalJSON(data []byte) error {
	var value string
	if err := json.Unmarshal(data, &value); err == nil {
		c.stringValue = value
		return nil
	}
	var object map[string]string
	if err := json.Unmarshal(data, &object); err == nil {
		raw, err := json.Marshal(object)
		if err != nil {
			return err
		}
		c.stringValue = string(raw)
		return nil
	}
	return fmt.Errorf("unsupported translation content: %s", strings.TrimSpace(string(data)))
}

func (c translationContent) String() string {
	return c.stringValue
}

type HTTPClient struct {
	baseURL string
	http    *http.Client
}

type UploadTermsFileInput struct {
	ProjectID string
	APIToken  string
	FilePath  string
	SyncTerms bool
	Tags      string
}

type multipartField struct {
	key   string
	value string
}

type UploadTermsFileResult struct {
	Terms struct {
		Parsed  int `json:"parsed"`
		Added   int `json:"added"`
		Deleted int `json:"deleted"`
	} `json:"terms"`
	Translations struct {
		Parsed  int `json:"parsed"`
		Added   int `json:"added"`
		Updated int `json:"updated"`
	} `json:"translations"`
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &HTTPClient{
		baseURL: apiBaseURL,
		http: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

func (c *HTTPClient) ListTerms(ctx context.Context, in ListTermsInput) ([]TermTranslation, string, error) {
	locales := trimLocales(in.Locales)
	if len(locales) == 0 {
		discovered, err := c.listLanguages(ctx, in)
		if err != nil {
			return nil, "", err
		}
		locales = discovered
	}

	out := make([]TermTranslation, 0)
	for _, locale := range locales {
		terms, err := c.listTermsForLanguage(ctx, in, locale)
		if err != nil {
			return nil, "", err
		}
		out = append(out, terms...)
	}

	revision := time.Now().UTC().Format(time.RFC3339Nano)
	return out, revision, nil
}

func (c *HTTPClient) listLanguages(ctx context.Context, in ListTermsInput) ([]string, error) {
	var response struct {
		apiEnvelope
		Result struct {
			Languages []struct {
				Code string `json:"code"`
			} `json:"languages"`
		} `json:"result"`
	}
	values := url.Values{}
	values.Set("api_token", in.APIToken)
	values.Set("id", in.ProjectID)
	if err := c.postForm(ctx, "/languages/list", values, &response); err != nil {
		return nil, err
	}
	locales := make([]string, 0, len(response.Result.Languages))
	for _, language := range response.Result.Languages {
		code := strings.TrimSpace(language.Code)
		if code != "" {
			locales = append(locales, code)
		}
	}
	return locales, nil
}

func (c *HTTPClient) listTermsForLanguage(ctx context.Context, in ListTermsInput, locale string) ([]TermTranslation, error) {
	var response struct {
		apiEnvelope
		Result struct {
			Terms []struct {
				Term        string `json:"term"`
				Context     string `json:"context"`
				Translation struct {
					Content translationContent `json:"content"`
				} `json:"translation"`
			} `json:"terms"`
		} `json:"result"`
	}
	values := url.Values{}
	values.Set("api_token", in.APIToken)
	values.Set("id", in.ProjectID)
	values.Set("language", locale)
	if err := c.postForm(ctx, "/terms/list", values, &response); err != nil {
		return nil, err
	}

	out := make([]TermTranslation, 0, len(response.Result.Terms))
	for _, term := range response.Result.Terms {
		value := term.Translation.Content.String()
		if strings.TrimSpace(value) == "" {
			continue
		}
		out = append(out, TermTranslation{
			Term:    term.Term,
			Context: term.Context,
			Locale:  locale,
			Value:   value,
		})
	}
	return out, nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	byLocale := make(map[string][]translationUpdate)
	terms := make([]termAdd, 0, len(in.Entries))
	seenTerms := make(map[string]struct{}, len(in.Entries))
	for _, entry := range in.Entries {
		if strings.TrimSpace(entry.Locale) == "" {
			continue
		}
		termKey := entry.Term + "\x00" + entry.Context
		if _, exists := seenTerms[termKey]; !exists {
			terms = append(terms, termAdd{
				Term:    entry.Term,
				Context: entry.Context,
			})
			seenTerms[termKey] = struct{}{}
		}
		item := translationUpdate{
			Term: entry.Term,
			Translation: translationUpdateValue{
				Content: entry.Value,
			},
		}
		if strings.TrimSpace(entry.Context) != "" {
			item.Context = entry.Context
		}
		byLocale[entry.Locale] = append(byLocale[entry.Locale], item)
	}

	if len(terms) > 0 {
		raw, err := json.Marshal(terms)
		if err != nil {
			return "", fmt.Errorf("marshal poeditor terms payload: %w", err)
		}
		values := url.Values{}
		values.Set("api_token", in.APIToken)
		values.Set("id", in.ProjectID)
		values.Set("data", string(raw))

		var response struct{ apiEnvelope }
		if err := c.postForm(ctx, "/terms/add", values, &response); err != nil {
			return "", err
		}
	}

	for locale, items := range byLocale {
		raw, err := json.Marshal(items)
		if err != nil {
			return "", fmt.Errorf("marshal poeditor translations payload: %w", err)
		}

		values := url.Values{}
		values.Set("api_token", in.APIToken)
		values.Set("id", in.ProjectID)
		values.Set("language", locale)
		values.Set("data", string(raw))

		var response struct{ apiEnvelope }
		if err := c.postForm(ctx, "/translations/update", values, &response); err != nil {
			return "", err
		}
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) UploadTermsFile(ctx context.Context, in UploadTermsFileInput) (UploadTermsFileResult, error) {
	var result UploadTermsFileResult
	if strings.TrimSpace(in.ProjectID) == "" {
		return result, fmt.Errorf("poeditor upload terms: project id is required")
	}
	if strings.TrimSpace(in.APIToken) == "" {
		return result, fmt.Errorf("poeditor upload terms: API token is required")
	}
	if strings.TrimSpace(in.FilePath) == "" {
		return result, fmt.Errorf("poeditor upload terms: file path is required")
	}

	fields := []multipartField{
		{key: "api_token", value: in.APIToken},
		{key: "id", value: in.ProjectID},
		{key: "updating", value: "terms"},
	}
	if in.SyncTerms {
		fields = append(fields, multipartField{key: "sync_terms", value: "1"})
	}
	if strings.TrimSpace(in.Tags) != "" {
		fields = append(fields, multipartField{key: "tags", value: in.Tags})
	}

	var response struct {
		apiEnvelope
		Result UploadTermsFileResult `json:"result"`
	}
	if err := c.postMultipartFile(ctx, "/projects/upload", fields, "file", in.FilePath, &response); err != nil {
		return result, err
	}
	return response.Result, nil
}

type termAdd struct {
	Term    string `json:"term"`
	Context string `json:"context,omitempty"`
}

type translationUpdate struct {
	Term        string                 `json:"term"`
	Context     string                 `json:"context,omitempty"`
	Translation translationUpdateValue `json:"translation"`
}

type translationUpdateValue struct {
	Content string `json:"content"`
}

func trimLocales(locales []string) []string {
	seen := make(map[string]struct{}, len(locales))
	out := make([]string, 0, len(locales))
	for _, locale := range locales {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func (c *HTTPClient) postForm(ctx context.Context, endpoint string, values url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, bytes.NewBufferString(values.Encode()))
	if err != nil {
		return fmt.Errorf("poeditor request build %s: %w", endpoint, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("poeditor request %s: %w", endpoint, err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("poeditor request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("poeditor decode %s response: %w", endpoint, err)
	}
	if envelope, ok := out.(interface {
		check(string) error
	}); ok {
		if err := envelope.check(endpoint); err != nil {
			return err
		}
	}

	return nil
}

func (c *HTTPClient) postMultipartFile(ctx context.Context, endpoint string, fields []multipartField, fileFieldName, filePath string, out any) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("poeditor request %s: open file: %w", endpoint, err)
	}
	defer func() {
		_ = file.Close()
	}()

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)
	writeErrCh := make(chan error, 1)
	go func() {
		var werr error
		defer func() {
			_ = pw.CloseWithError(werr)
			writeErrCh <- werr
		}()
		for _, field := range fields {
			if werr = writer.WriteField(field.key, field.value); werr != nil {
				werr = fmt.Errorf("write form field %s: %w", field.key, werr)
				return
			}
		}
		var part io.Writer
		part, werr = writer.CreateFormFile(fileFieldName, filepath.Base(filePath))
		if werr != nil {
			werr = fmt.Errorf("create form file: %w", werr)
			return
		}
		if _, werr = io.Copy(part, file); werr != nil {
			werr = fmt.Errorf("copy file to form: %w", werr)
			return
		}
		if werr = writer.Close(); werr != nil {
			werr = fmt.Errorf("close multipart writer: %w", werr)
		}
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, pr)
	if err != nil {
		_ = pr.CloseWithError(err)
		writeErr := <-writeErrCh
		return errors.Join(fmt.Errorf("poeditor request build %s: %w", endpoint, err), writeErr)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.http.Do(req)
	if err != nil {
		_ = pr.CloseWithError(err)
		writeErr := <-writeErrCh
		return errors.Join(fmt.Errorf("poeditor request %s: %w", endpoint, err), writeErr)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		writeErr := <-writeErrCh
		return errors.Join(fmt.Errorf("poeditor request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body))), writeErr)
	}

	decodeErr := json.NewDecoder(resp.Body).Decode(out)
	writeErr := <-writeErrCh
	if decodeErr != nil {
		return errors.Join(fmt.Errorf("poeditor decode %s response: %w", endpoint, decodeErr), writeErr)
	}
	if envelope, ok := out.(interface {
		check(string) error
	}); ok {
		if err := envelope.check(endpoint); err != nil {
			return errors.Join(err, writeErr)
		}
	}
	return writeErr
}
