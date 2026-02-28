package crowdin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const apiBaseURL = "https://api.crowdin.com/api/v2"

type HTTPClient struct {
	baseURL string
	http    *http.Client
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &HTTPClient{baseURL: apiBaseURL, http: &http.Client{Timeout: timeout}}, nil
}

func (c *HTTPClient) ListStrings(ctx context.Context, in ListStringsInput) ([]StringTranslation, string, error) {
	allowed := make(map[string]struct{}, len(in.Locales))
	for _, locale := range in.Locales {
		trimmed := strings.TrimSpace(locale)
		if trimmed != "" {
			allowed[trimmed] = struct{}{}
		}
	}

	entries := make([]StringTranslation, 0)
	offset := 0
	limit := 500

	for {
		endpoint := fmt.Sprintf("/projects/%s/translations?limit=%d&offset=%d", url.PathEscape(in.ProjectID), limit, offset)
		var response struct {
			Data []struct {
				Data struct {
					Identifier string `json:"identifier"`
					Context    string `json:"context"`
					LanguageID string `json:"languageId"`
					Text       string `json:"text"`
				} `json:"data"`
			} `json:"data"`
			Pagination struct {
				Offset int `json:"offset"`
				Limit  int `json:"limit"`
				Total  int `json:"totalCount"`
			} `json:"pagination"`
		}

		if err := c.getJSON(ctx, endpoint, in.APIToken, &response); err != nil {
			return nil, "", err
		}

		for _, item := range response.Data {
			locale := strings.TrimSpace(item.Data.LanguageID)
			if locale == "" {
				continue
			}
			if len(allowed) > 0 {
				if _, ok := allowed[locale]; !ok {
					continue
				}
			}
			value := strings.TrimSpace(item.Data.Text)
			if value == "" {
				continue
			}
			entries = append(entries, StringTranslation{Key: item.Data.Identifier, Context: item.Data.Context, Locale: locale, Value: value})
		}

		offset += response.Pagination.Limit
		if offset >= response.Pagination.Total || response.Pagination.Limit == 0 {
			break
		}
	}

	return entries, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	for _, entry := range in.Entries {
		if strings.TrimSpace(entry.Key) == "" || strings.TrimSpace(entry.Locale) == "" {
			continue
		}

		payload := map[string]string{"identifier": entry.Key, "languageId": entry.Locale, "text": entry.Value}
		if strings.TrimSpace(entry.Context) != "" {
			payload["context"] = entry.Context
		}
		if err := c.postJSON(ctx, fmt.Sprintf("/projects/%s/translations", url.PathEscape(in.ProjectID)), in.APIToken, payload, nil); err != nil {
			return "", err
		}
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) getJSON(ctx context.Context, endpoint, apiToken string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+endpoint, nil)
	if err != nil {
		return fmt.Errorf("crowdin request build %s: %w", endpoint, err)
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("crowdin request %s: %w", endpoint, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("crowdin request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("crowdin decode %s response: %w", endpoint, err)
	}

	return nil
}

func (c *HTTPClient) postJSON(ctx context.Context, endpoint, apiToken string, in any, out any) error {
	raw, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("crowdin marshal %s request: %w", endpoint, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("crowdin request build %s: %w", endpoint, err)
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("crowdin request %s: %w", endpoint, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("crowdin request %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("crowdin decode %s response: %w", endpoint, err)
	}

	return nil
}
