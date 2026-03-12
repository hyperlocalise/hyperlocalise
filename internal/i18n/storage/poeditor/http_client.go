package poeditor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
)

const apiBaseURL = "https://api.poeditor.com/v2"

type HTTPClient struct {
	baseURL string
	http    *http.Client
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	client := &HTTPClient{
		baseURL: apiBaseURL,
		http: &http.Client{
			Timeout: timeout,
		},
	}
	debug("http_client", "new", map[string]any{
		"base_url":        client.baseURL,
		"timeout_seconds": int(timeout / time.Second),
	})
	return client, nil
}

func (c *HTTPClient) ListTerms(ctx context.Context, in ListTermsInput) ([]TermTranslation, string, error) {
	debug("http_client", "list_terms", map[string]any{
		"project_id": strings.TrimSpace(in.ProjectID),
		"locales":    append([]string(nil), in.Locales...),
	})
	terms, revision, err := c.listTermsRaw(ctx, in)
	if err != nil {
		return nil, "", err
	}

	allowed := make(map[string]struct{}, len(in.Locales))
	for _, locale := range in.Locales {
		allowed[strings.TrimSpace(locale)] = struct{}{}
	}

	out := make([]TermTranslation, 0)
	for _, term := range terms {
		for _, tr := range term.Translations {
			if len(allowed) > 0 {
				if _, ok := allowed[tr.Language]; !ok {
					continue
				}
			}
			out = append(out, TermTranslation{
				Term:    term.Term,
				Context: term.Context,
				Locale:  tr.Language,
				Value:   tr.Content,
			})
		}
	}

	return out, revision, nil
}

func (c *HTTPClient) ListProjectTerms(ctx context.Context, in ListTermsInput) ([]TermKey, string, error) {
	debug("http_client", "list_project_terms", map[string]any{
		"project_id": strings.TrimSpace(in.ProjectID),
	})
	terms, revision, err := c.listTermsRaw(ctx, in)
	if err != nil {
		return nil, "", err
	}
	out := make([]TermKey, 0, len(terms))
	for _, term := range terms {
		out = append(out, TermKey{Term: term.Term, Context: term.Context})
	}
	return out, revision, nil
}

func (c *HTTPClient) AvailableLanguages(ctx context.Context, apiToken string) ([]string, error) {
	debug("http_client", "available_languages", map[string]any{})
	values := url.Values{}
	values.Set("api_token", apiToken)
	var response struct {
		Result struct {
			Languages []struct {
				Code string `json:"code"`
			} `json:"languages"`
		} `json:"result"`
	}
	if err := c.postForm(ctx, "/languages/available", values, &response); err != nil {
		return nil, err
	}
	codes := make([]string, 0, len(response.Result.Languages))
	for _, language := range response.Result.Languages {
		codes = append(codes, language.Code)
	}
	return codes, nil
}

func (c *HTTPClient) ExportFile(ctx context.Context, in ExportFileInput) ([]TermTranslation, string, error) {
	debug("http_client", "export_file", map[string]any{
		"project_id": strings.TrimSpace(in.ProjectID),
		"locales":    append([]string(nil), in.Locales...),
		"type":       in.Type,
	})
	out := make([]TermTranslation, 0)
	for _, locale := range in.Locales {
		exportURL, err := c.exportURL(ctx, in.ProjectID, in.APIToken, locale, in.Type)
		if err != nil {
			return nil, "", err
		}
		payload, err := c.downloadExport(ctx, exportURL)
		if err != nil {
			return nil, "", err
		}
		var values map[string]string
		if err := json.Unmarshal(payload, &values); err != nil {
			return nil, "", fmt.Errorf("decode exported %s file: %w", locale, err)
		}
		for key, value := range values {
			out = append(out, TermTranslation{Term: key, Locale: locale, Value: value})
		}
	}
	return out, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) UploadFile(ctx context.Context, in UploadFileInput) (UploadFileResult, string, error) {
	debug("http_client", "upload_file", map[string]any{
		"project_id":  strings.TrimSpace(in.ProjectID),
		"locale":      in.Locale,
		"entry_count": len(in.Entries),
		"updating":    in.Updating,
		"sync_terms":  in.SyncTerms,
	})
	content, err := encodeEntriesJSON(in.Entries)
	if err != nil {
		return UploadFileResult{}, "", fmt.Errorf("encode upload file: %w", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("api_token", in.APIToken); err != nil {
		return UploadFileResult{}, "", err
	}
	if err := writer.WriteField("id", in.ProjectID); err != nil {
		return UploadFileResult{}, "", err
	}
	if err := writer.WriteField("language", in.Locale); err != nil {
		return UploadFileResult{}, "", err
	}
	if err := writer.WriteField("updating", in.Updating); err != nil {
		return UploadFileResult{}, "", err
	}
	if in.SyncTerms {
		if err := writer.WriteField("sync_terms", "1"); err != nil {
			return UploadFileResult{}, "", err
		}
	}
	filePart, err := writer.CreateFormFile("file", fileNameForLocale(in.Locale, in.Type))
	if err != nil {
		return UploadFileResult{}, "", err
	}
	if _, err := filePart.Write(content); err != nil {
		return UploadFileResult{}, "", err
	}
	if err := writer.Close(); err != nil {
		return UploadFileResult{}, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/projects/upload", &body)
	if err != nil {
		debug("http_client", "upload_file_build_error", map[string]any{"error": err.Error()})
		return UploadFileResult{}, "", fmt.Errorf("poeditor upload build request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	fields := map[string]any{
		"api_token":          "[redacted]",
		"id":                 in.ProjectID,
		"language":           in.Locale,
		"updating":           in.Updating,
		"multipart_filename": fileNameForLocale(in.Locale, in.Type),
		"file_bytes":         len(content),
	}
	if in.SyncTerms {
		fields["sync_terms"] = "1"
	}
	debug("http_client", "upload_file_request_start", map[string]any{
		"endpoint": "/projects/upload",
		"fields":   fields,
	})

	resp, err := c.http.Do(req)
	if err != nil {
		debug("http_client", "upload_file_request_error", map[string]any{"error": err.Error()})
		return UploadFileResult{}, "", fmt.Errorf("poeditor upload request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		debug("http_client", "upload_file_status_error", map[string]any{
			"status_code": resp.StatusCode,
			"body":        strings.TrimSpace(string(payload)),
		})
		return UploadFileResult{}, "", fmt.Errorf("poeditor upload status %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}

	var response struct {
		Result struct {
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
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		debug("http_client", "upload_file_decode_error", map[string]any{"error": err.Error()})
		return UploadFileResult{}, "", fmt.Errorf("poeditor upload decode response: %w", err)
	}
	result := UploadFileResult{
		TermsParsed:         response.Result.Terms.Parsed,
		TermsAdded:          response.Result.Terms.Added,
		TermsDeleted:        response.Result.Terms.Deleted,
		TranslationsParsed:  response.Result.Translations.Parsed,
		TranslationsAdded:   response.Result.Translations.Added,
		TranslationsUpdated: response.Result.Translations.Updated,
	}
	debug("http_client", "upload_file_response", map[string]any{
		"status_code":          resp.StatusCode,
		"terms_parsed":         result.TermsParsed,
		"terms_added":          result.TermsAdded,
		"terms_deleted":        result.TermsDeleted,
		"translations_parsed":  result.TranslationsParsed,
		"translations_added":   result.TranslationsAdded,
		"translations_updated": result.TranslationsUpdated,
	})
	return result, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	debug("http_client", "upsert_translations_start", map[string]any{
		"project_id":      strings.TrimSpace(in.ProjectID),
		"entry_count":     len(in.Entries),
		"source_language": strings.TrimSpace(in.SourceLanguage),
	})
	byLocale := make(map[string][]map[string]string)
	for _, entry := range in.Entries {
		if strings.TrimSpace(entry.Locale) == "" {
			continue
		}
		item := map[string]string{
			"term":        entry.Term,
			"translation": entry.Value,
		}
		if strings.TrimSpace(entry.Context) != "" {
			item["context"] = entry.Context
		}
		byLocale[entry.Locale] = append(byLocale[entry.Locale], item)
	}

	locales := orderedLocales(byLocale, in.SourceLanguage)
	for _, locale := range locales {
		items := byLocale[locale]
		debug("http_client", "upsert_translations_locale", map[string]any{
			"locale": locale,
			"count":  len(items),
		})
		raw, err := json.Marshal(items)
		if err != nil {
			return "", fmt.Errorf("marshal poeditor translations payload: %w", err)
		}

		values := url.Values{}
		values.Set("api_token", in.APIToken)
		values.Set("id", in.ProjectID)
		values.Set("language", locale)
		values.Set("data", string(raw))

		var response struct {
			Result struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"result"`
		}
		if err := c.postForm(ctx, "/translations/update", values, &response); err != nil {
			debug("http_client", "upsert_translations_error", map[string]any{
				"locale": locale,
				"error":  err.Error(),
			})
			return "", err
		}
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) AddTerms(ctx context.Context, in TermMutationInput) (string, error) {
	debug("http_client", "add_terms", map[string]any{
		"project_id": strings.TrimSpace(in.ProjectID),
		"count":      len(in.Terms),
	})
	return c.postTermsMutation(ctx, "/terms/add", in)
}

func (c *HTTPClient) DeleteTerms(ctx context.Context, in TermMutationInput) (string, error) {
	debug("http_client", "delete_terms", map[string]any{
		"project_id": strings.TrimSpace(in.ProjectID),
		"count":      len(in.Terms),
	})
	return c.postTermsMutation(ctx, "/terms/delete", in)
}

func (c *HTTPClient) listTermsRaw(ctx context.Context, in ListTermsInput) ([]termRecord, string, error) {
	var response struct {
		Result struct {
			Code  string       `json:"code"`
			Terms []termRecord `json:"terms"`
		} `json:"result"`
	}

	values := url.Values{}
	values.Set("api_token", in.APIToken)
	values.Set("id", in.ProjectID)
	if len(in.Locales) == 1 {
		values.Set("language", in.Locales[0])
	}
	if err := c.postForm(ctx, "/terms/list", values, &response); err != nil {
		return nil, "", err
	}
	if len(in.Locales) == 1 {
		for i := range response.Result.Terms {
			if response.Result.Terms[i].Translation.Language == "" {
				response.Result.Terms[i].Translation.Language = in.Locales[0]
			}
			if strings.TrimSpace(response.Result.Terms[i].Translation.Content) != "" {
				response.Result.Terms[i].Translations = append(response.Result.Terms[i].Translations, response.Result.Terms[i].Translation)
			}
		}
	}
	return response.Result.Terms, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) postTermsMutation(ctx context.Context, endpoint string, in TermMutationInput) (string, error) {
	if len(in.Terms) == 0 {
		return time.Now().UTC().Format(time.RFC3339Nano), nil
	}
	payload := make([]map[string]string, 0, len(in.Terms))
	for _, term := range in.Terms {
		item := map[string]string{"term": term.Term}
		if term.Context != "" {
			item["context"] = term.Context
		}
		payload = append(payload, item)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal poeditor terms payload: %w", err)
	}
	values := url.Values{}
	values.Set("api_token", in.APIToken)
	values.Set("id", in.ProjectID)
	values.Set("data", string(raw))
	var response struct {
		Result struct {
			Code string `json:"code"`
		} `json:"result"`
	}
	if err := c.postForm(ctx, endpoint, values, &response); err != nil {
		return "", err
	}
	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

type termRecord struct {
	Term         string              `json:"term"`
	Context      string              `json:"context"`
	Translation  translationRecord   `json:"translation"`
	Translations []translationRecord `json:"translations"`
}

type translationRecord struct {
	Language string `json:"language"`
	Content  string `json:"content"`
}

func orderedLocales(byLocale map[string][]map[string]string, sourceLanguage string) []string {
	locales := make([]string, 0, len(byLocale))
	for locale := range byLocale {
		locales = append(locales, locale)
	}
	slices.Sort(locales)
	sourceLanguage = strings.TrimSpace(sourceLanguage)
	if sourceLanguage == "" {
		return locales
	}
	index := slices.Index(locales, sourceLanguage)
	if index <= 0 {
		return locales
	}
	return append([]string{sourceLanguage}, append(locales[:index], locales[index+1:]...)...)
}

func encodeEntriesJSON(entries []storage.Entry) ([]byte, error) {
	values := make(map[string]string, len(entries))
	for _, entry := range entries {
		if _, exists := values[entry.Key]; exists {
			return nil, fmt.Errorf("duplicate key %q in upload payload for locale %q", entry.Key, entry.Locale)
		}
		values[entry.Key] = entry.Value
	}
	return json.Marshal(values)
}

func fileNameForLocale(locale, fileType string) string {
	ext := "json"
	if strings.TrimSpace(fileType) != "" && !strings.EqualFold(strings.TrimSpace(fileType), "key_value_json") {
		ext = strings.TrimSpace(fileType)
	}
	trimmed := strings.TrimSpace(locale)
	if trimmed == "" {
		trimmed = "locale"
	}
	return trimmed + "." + ext
}

func (c *HTTPClient) exportURL(ctx context.Context, projectID, apiToken, locale, fileType string) (string, error) {
	debug("http_client", "export_url_request", map[string]any{
		"project_id": projectID,
		"language":   locale,
		"type":       fileType,
	})
	var response struct {
		Result struct {
			URL string `json:"url"`
		} `json:"result"`
	}
	values := url.Values{}
	values.Set("api_token", apiToken)
	values.Set("id", projectID)
	values.Set("language", locale)
	values.Set("type", fileType)
	if err := c.postForm(ctx, "/projects/export", values, &response); err != nil {
		return "", err
	}
	url := strings.TrimSpace(response.Result.URL)
	debug("http_client", "export_url_response", map[string]any{
		"language":     locale,
		"download_url": url,
	})
	return url, nil
}

func (c *HTTPClient) downloadExport(ctx context.Context, downloadURL string) ([]byte, error) {
	debug("http_client", "export_download_start", map[string]any{
		"download_url": truncateDebugValue(downloadURL, 300),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		debug("http_client", "export_download_build_error", map[string]any{"error": err.Error()})
		return nil, fmt.Errorf("poeditor export download request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		debug("http_client", "export_download_request_error", map[string]any{"error": err.Error()})
		return nil, fmt.Errorf("poeditor export download: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		debug("http_client", "export_download_status_error", map[string]any{
			"status_code": resp.StatusCode,
			"body":        strings.TrimSpace(string(body)),
		})
		return nil, fmt.Errorf("poeditor export download status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		debug("http_client", "export_download_read_error", map[string]any{"error": err.Error()})
		return nil, fmt.Errorf("poeditor export read body: %w", err)
	}
	debug("http_client", "export_download_complete", map[string]any{
		"status_code": resp.StatusCode,
		"bytes":       len(payload),
	})
	return payload, nil
}

func (c *HTTPClient) postForm(ctx context.Context, endpoint string, values url.Values, out any) error {
	debug("http_client", "request_start", map[string]any{
		"endpoint": endpoint,
		"fields":   sanitizeValues(values),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, bytes.NewBufferString(values.Encode()))
	if err != nil {
		debug("http_client", "request_build_error", map[string]any{"endpoint": endpoint, "error": err.Error()})
		return fmt.Errorf("poeditor request build %s: %w", endpoint, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		debug("http_client", "request_error", map[string]any{"endpoint": endpoint, "error": err.Error()})
		return fmt.Errorf("poeditor request %s: %w", endpoint, err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		debug("http_client", "request_status_error", map[string]any{
			"endpoint":    endpoint,
			"status_code": resp.StatusCode,
			"body":        strings.TrimSpace(string(body)),
		})
		return fmt.Errorf("poeditor request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		debug("http_client", "response_decode_error", map[string]any{"endpoint": endpoint, "error": err.Error()})
		return fmt.Errorf("poeditor decode %s response: %w", endpoint, err)
	}
	debug("http_client", "request_complete", map[string]any{
		"endpoint":    endpoint,
		"status_code": resp.StatusCode,
	})

	return nil
}

func sanitizeValues(values url.Values) map[string]any {
	out := make(map[string]any, len(values))
	for key, items := range values {
		switch key {
		case "api_token":
			out[key] = "[redacted]"
		case "data":
			out[key] = truncateDebugValue(strings.Join(items, ","), 1000)
		default:
			out[key] = strings.Join(items, ",")
		}
	}
	return out
}

func truncateDebugValue(value string, maxLen int) string {
	if maxLen <= 0 || len(value) <= maxLen {
		return value
	}
	return value[:maxLen] + "...(truncated)"
}
