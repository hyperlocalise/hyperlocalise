package lokalise

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const apiBaseURL = "https://api.lokalise.com/api2"

type HTTPClient struct {
	baseURL string
	http    *http.Client
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

func (c *HTTPClient) ListKeys(ctx context.Context, in ListKeysInput) ([]KeyTranslation, string, error) {
	revision := time.Now().UTC().Format(time.RFC3339Nano)
	allowed := make(map[string]struct{}, len(in.Locales))
	for _, locale := range in.Locales {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			continue
		}
		allowed[trimmed] = struct{}{}
	}

	const pageSize = 500
	page := 1
	out := make([]KeyTranslation, 0)

	for {
		endpoint := fmt.Sprintf("/projects/%s/keys?include_translations=1&limit=%d&page=%d", url.PathEscape(in.ProjectID), pageSize, page)

		var resp struct {
			TotalPages int `json:"total_pages"`
			Keys       []struct {
				KeyName      json.RawMessage `json:"key_name"`
				Description  string          `json:"description"`
				Translations []struct {
					LanguageISO string          `json:"language_iso"`
					Language    string          `json:"language"`
					Translation json.RawMessage `json:"translation"`
				} `json:"translations"`
			} `json:"keys"`
		}

		if err := c.getJSON(ctx, endpoint, in.APIToken, &resp); err != nil {
			return nil, "", err
		}

		for _, key := range resp.Keys {
			keyName := parseKeyName(key.KeyName)
			if keyName == "" {
				continue
			}
			for _, tr := range key.Translations {
				locale := strings.TrimSpace(tr.LanguageISO)
				if locale == "" {
					locale = strings.TrimSpace(tr.Language)
				}
				if locale == "" {
					continue
				}
				if len(allowed) > 0 {
					if _, ok := allowed[locale]; !ok {
						continue
					}
				}
				value := parseTranslationValue(tr.Translation)
				if strings.TrimSpace(value) == "" {
					continue
				}
				out = append(out, KeyTranslation{
					Key:     keyName,
					Context: key.Description,
					Locale:  locale,
					Value:   value,
				})
			}
		}

		if len(resp.Keys) < pageSize {
			break
		}
		if resp.TotalPages > 0 && page >= resp.TotalPages {
			break
		}
		page++
	}

	return out, revision, nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	type groupedKey struct {
		Key     string
		Context string
	}

	byKey := make(map[groupedKey][]map[string]string)
	for _, entry := range in.Entries {
		if strings.TrimSpace(entry.Key) == "" || strings.TrimSpace(entry.Locale) == "" {
			continue
		}
		group := groupedKey{Key: entry.Key, Context: entry.Context}
		byKey[group] = append(byKey[group], map[string]string{
			"language_iso": entry.Locale,
			"translation":  entry.Value,
		})
	}

	keys := make([]map[string]any, 0, len(byKey))
	for group, translations := range byKey {
		payload := map[string]any{
			"key_name":     map[string]string{"web": group.Key},
			"platforms":    []string{"web"},
			"translations": translations,
		}
		if strings.TrimSpace(group.Context) != "" {
			payload["description"] = group.Context
		}
		keys = append(keys, payload)
	}

	if len(keys) == 0 {
		return time.Now().UTC().Format(time.RFC3339Nano), nil
	}

	body := map[string]any{"keys": keys}
	endpoint := fmt.Sprintf("/projects/%s/keys", url.PathEscape(in.ProjectID))
	if err := c.postJSON(ctx, endpoint, in.APIToken, body, &struct{}{}); err != nil {
		return "", err
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

func parseKeyName(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		return strings.TrimSpace(asString)
	}
	var asMap map[string]string
	if err := json.Unmarshal(raw, &asMap); err == nil {
		if v := strings.TrimSpace(asMap["web"]); v != "" {
			return v
		}
		for _, value := range asMap {
			if v := strings.TrimSpace(value); v != "" {
				return v
			}
		}
	}
	return ""
}

func parseTranslationValue(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		return asString
	}
	var asMap map[string]any
	if err := json.Unmarshal(raw, &asMap); err == nil {
		if v, ok := asMap["other"].(string); ok {
			return v
		}
		if v, ok := asMap["one"].(string); ok {
			return v
		}
		for _, value := range asMap {
			switch typed := value.(type) {
			case string:
				if strings.TrimSpace(typed) != "" {
					return typed
				}
			case float64:
				return strconv.FormatFloat(typed, 'f', -1, 64)
			}
		}
	}
	return ""
}

func (c *HTTPClient) getJSON(ctx context.Context, endpoint, apiToken string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+endpoint, nil)
	if err != nil {
		return fmt.Errorf("lokalise request build %s: %w", endpoint, err)
	}
	req.Header.Set("X-Api-Token", apiToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("lokalise request %s: %w", endpoint, err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("lokalise request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("lokalise decode %s response: %w", endpoint, err)
	}

	return nil
}

func (c *HTTPClient) postJSON(ctx context.Context, endpoint, apiToken string, in, out any) error {
	raw, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("lokalise encode %s request: %w", endpoint, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, bytes.NewBuffer(raw))
	if err != nil {
		return fmt.Errorf("lokalise request build %s: %w", endpoint, err)
	}
	req.Header.Set("X-Api-Token", apiToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("lokalise request %s: %w", endpoint, err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("lokalise request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		if err == io.EOF {
			return nil
		}
		return fmt.Errorf("lokalise decode %s response: %w", endpoint, err)
	}

	return nil
}
