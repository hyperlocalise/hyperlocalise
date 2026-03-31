package phrase

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

const (
	defaultBaseURL  = "https://api.phrase.com/v2"
	maxRetries      = 3
	retryBaseDelay  = 250 * time.Millisecond
	defaultPageSize = 100
)

type HTTPClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &HTTPClient{baseURL: defaultBaseURL, httpClient: &http.Client{Timeout: timeout}}, nil
}

func NewHTTPClientWithBaseURL(cfg Config, baseURL string, client *http.Client) (*HTTPClient, error) {
	if client == nil {
		return nil, fmt.Errorf("phrase http client: client must not be nil")
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultBaseURL
	}
	return &HTTPClient{baseURL: strings.TrimRight(baseURL, "/"), httpClient: client}, nil
}

func (c *HTTPClient) ListStrings(ctx context.Context, in ListStringsInput) ([]StringTranslation, string, error) {
	locales, err := c.listLocales(ctx, in.ProjectID, in.APIToken, in.Locales)
	if err != nil {
		return nil, "", err
	}

	keys, err := c.listKeys(ctx, in.ProjectID, in.APIToken)
	if err != nil {
		return nil, "", err
	}

	entries := make([]StringTranslation, 0)
	for _, locale := range locales {
		translations, err := c.listTranslations(ctx, in.ProjectID, in.APIToken, locale)
		if err != nil {
			return nil, "", err
		}
		for _, tr := range translations {
			meta, ok := keys[tr.KeyID]
			if !ok {
				continue
			}
			entries = append(entries, StringTranslation{Key: meta.Name, Context: meta.Description, Locale: locale, Value: tr.Content})
		}
	}

	return entries, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) UpsertStrings(ctx context.Context, in UpsertStringsInput) (string, error) {
	if len(in.Entries) == 0 {
		return time.Now().UTC().Format(time.RFC3339Nano), nil
	}

	keysByName, err := c.listKeysByName(ctx, in.ProjectID, in.APIToken)
	if err != nil {
		return "", err
	}

	sent := make([]int, 0, len(in.Entries))
	for idx, entry := range in.Entries {
		keyID, resolveErr := c.ensureKey(ctx, in.ProjectID, in.APIToken, keysByName, entry.Key, entry.Context)
		if resolveErr != nil {
			return "", &partialUpsertError{sentIndexes: sent, cause: resolveErr}
		}
		if err := c.upsertTranslation(ctx, in.ProjectID, in.APIToken, keyID, entry.Locale, entry.Value); err != nil {
			return "", &partialUpsertError{sentIndexes: sent, cause: err}
		}
		sent = append(sent, idx)
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) ExportFile(ctx context.Context, in ExportFileInput) ([]storage.Entry, string, error) {
	payload := map[string]any{
		"locale_ids":      in.Locales,
		"format":          in.Format,
		"fallback_locale": in.SourceLanguage,
	}
	var start struct {
		ID string `json:"id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/projects/%s/exports", url.PathEscape(in.ProjectID)), in.APIToken, payload, &start); err != nil {
		return nil, "", fmt.Errorf("start export: %w", err)
	}

	content, err := c.waitForExportDownload(ctx, in.ProjectID, in.APIToken, start.ID)
	if err != nil {
		return nil, "", err
	}

	entries, err := decodeEntriesJSON(content)
	if err != nil {
		return nil, "", err
	}
	return entries, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) ImportFile(ctx context.Context, in ImportFileInput) (string, error) {
	content, err := encodeEntriesJSON(in.Entries)
	if err != nil {
		return "", err
	}
	payload := map[string]any{"file_format": in.Format, "file": string(content)}
	var start struct {
		ID string `json:"id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/projects/%s/imports", url.PathEscape(in.ProjectID)), in.APIToken, payload, &start); err != nil {
		return "", fmt.Errorf("start import: %w", err)
	}
	if err := c.waitForImport(ctx, in.ProjectID, in.APIToken, start.ID); err != nil {
		return "", err
	}
	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

type phraseKey struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type phraseTranslation struct {
	KeyID   string `json:"key_id"`
	Locale  string `json:"locale_name"`
	Content string `json:"content"`
}

func (c *HTTPClient) listLocales(ctx context.Context, projectID, token string, requested []string) ([]string, error) {
	if len(requested) > 0 {
		return requested, nil
	}
	var out []struct {
		Name string `json:"name"`
	}
	if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/projects/%s/locales", url.PathEscape(projectID)), token, nil, &out); err != nil {
		return nil, fmt.Errorf("list locales: %w", err)
	}
	locales := make([]string, 0, len(out))
	for _, item := range out {
		if trimmed := strings.TrimSpace(item.Name); trimmed != "" {
			locales = append(locales, trimmed)
		}
	}
	return locales, nil
}

func (c *HTTPClient) listKeys(ctx context.Context, projectID, token string) (map[string]phraseKey, error) {
	out := make(map[string]phraseKey)
	page := 1
	for {
		var keys []phraseKey
		path := fmt.Sprintf("/projects/%s/keys?page=%d&per_page=%d", url.PathEscape(projectID), page, defaultPageSize)
		if err := c.doJSON(ctx, http.MethodGet, path, token, nil, &keys); err != nil {
			return nil, fmt.Errorf("list keys: %w", err)
		}
		for _, key := range keys {
			out[key.ID] = key
		}
		if len(keys) < defaultPageSize {
			break
		}
		page++
	}
	return out, nil
}

func (c *HTTPClient) listKeysByName(ctx context.Context, projectID, token string) (map[string]phraseKey, error) {
	byID, err := c.listKeys(ctx, projectID, token)
	if err != nil {
		return nil, err
	}
	out := make(map[string]phraseKey, len(byID))
	for _, key := range byID {
		out[key.Name+"\x00"+key.Description] = key
	}
	return out, nil
}

func (c *HTTPClient) listTranslations(ctx context.Context, projectID, token, locale string) ([]phraseTranslation, error) {
	all := make([]phraseTranslation, 0)
	page := 1
	for {
		var pageItems []phraseTranslation
		path := fmt.Sprintf("/projects/%s/translations?locale_name=%s&page=%d&per_page=%d", url.PathEscape(projectID), url.QueryEscape(locale), page, defaultPageSize)
		if err := c.doJSON(ctx, http.MethodGet, path, token, nil, &pageItems); err != nil {
			return nil, fmt.Errorf("list translations: %w", err)
		}
		all = append(all, pageItems...)
		if len(pageItems) < defaultPageSize {
			break
		}
		page++
	}
	return all, nil
}

func (c *HTTPClient) ensureKey(ctx context.Context, projectID, token string, existing map[string]phraseKey, name, description string) (string, error) {
	lookup := name + "\x00" + description
	if key, ok := existing[lookup]; ok {
		return key.ID, nil
	}
	payload := map[string]any{"name": name, "description": description}
	var key phraseKey
	if err := c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/projects/%s/keys", url.PathEscape(projectID)), token, payload, &key); err != nil {
		return "", fmt.Errorf("create key: %w", err)
	}
	existing[lookup] = key
	return key.ID, nil
}

func (c *HTTPClient) upsertTranslation(ctx context.Context, projectID, token, keyID, locale, value string) error {
	payload := map[string]any{"key_id": keyID, "locale_name": locale, "content": value}
	return c.doJSON(ctx, http.MethodPost, fmt.Sprintf("/projects/%s/translations", url.PathEscape(projectID)), token, payload, nil)
}

func (c *HTTPClient) waitForExportDownload(ctx context.Context, projectID, token, exportID string) ([]byte, error) {
	for {
		var status struct {
			State       string `json:"state"`
			DownloadURL string `json:"download_url"`
		}
		if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/projects/%s/exports/%s", url.PathEscape(projectID), url.PathEscape(exportID)), token, nil, &status); err != nil {
			return nil, fmt.Errorf("poll export: %w", err)
		}
		switch strings.ToLower(strings.TrimSpace(status.State)) {
		case "success", "finished":
			return c.downloadURL(ctx, status.DownloadURL, token)
		case "failed", "error", "canceled":
			return nil, fmt.Errorf("export job %q ended with state %q", exportID, status.State)
		}
		if err := sleepWithContext(ctx, 500*time.Millisecond); err != nil {
			return nil, err
		}
	}
}

func (c *HTTPClient) waitForImport(ctx context.Context, projectID, token, importID string) error {
	for {
		var status struct {
			State string `json:"state"`
		}
		if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/projects/%s/imports/%s", url.PathEscape(projectID), url.PathEscape(importID)), token, nil, &status); err != nil {
			return fmt.Errorf("poll import: %w", err)
		}
		switch strings.ToLower(strings.TrimSpace(status.State)) {
		case "success", "finished":
			return nil
		case "failed", "error", "canceled":
			return fmt.Errorf("import job %q ended with state %q", importID, status.State)
		}
		if err := sleepWithContext(ctx, 500*time.Millisecond); err != nil {
			return err
		}
	}
}

func (c *HTTPClient) downloadURL(ctx context.Context, u, token string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("download response status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return io.ReadAll(resp.Body)
}

func (c *HTTPClient) doJSON(ctx context.Context, method, path, token string, payload any, out any) error {
	var bodyBytes []byte
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		bodyBytes = encoded
	}

	attempt := 0
	for {
		var body io.Reader
		if len(bodyBytes) > 0 {
			body = bytes.NewReader(bodyBytes)
		}
		req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "token "+token)
		req.Header.Set("Accept", "application/json")
		if payload != nil {
			req.Header.Set("Content-Type", "application/json")
		}

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

func shouldRetry(resp *http.Response, err error) bool {
	if err != nil {
		var netErr net.Error
		return errors.As(err, &netErr)
	}
	if resp == nil {
		return false
	}
	return resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= http.StatusInternalServerError
}

func retryDelay(attempt int, resp *http.Response) time.Duration {
	if resp != nil {
		retryAfter := strings.TrimSpace(resp.Header.Get("Retry-After"))
		if retryAfter != "" {
			if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds > 0 {
				return time.Duration(seconds) * time.Second
			}
		}
	}
	factor := math.Pow(2, float64(attempt))
	return time.Duration(float64(retryBaseDelay) * factor)
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func encodeEntriesJSON(entries []storage.Entry) ([]byte, error) {
	byLocale := make(map[string]map[string]string)
	for _, entry := range entries {
		if strings.TrimSpace(entry.Key) == "" || strings.TrimSpace(entry.Locale) == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}
		if _, ok := byLocale[entry.Locale]; !ok {
			byLocale[entry.Locale] = map[string]string{}
		}
		byLocale[entry.Locale][entry.Key] = entry.Value
	}
	return json.Marshal(byLocale)
}

func decodeEntriesJSON(content []byte) ([]storage.Entry, error) {
	var byLocale map[string]map[string]string
	if err := json.Unmarshal(content, &byLocale); err != nil {
		return nil, fmt.Errorf("decode export content: %w", err)
	}
	entries := make([]storage.Entry, 0)
	for locale, items := range byLocale {
		for key, value := range items {
			entries = append(entries, storage.Entry{Key: key, Locale: locale, Value: value})
		}
	}
	return entries, nil
}
