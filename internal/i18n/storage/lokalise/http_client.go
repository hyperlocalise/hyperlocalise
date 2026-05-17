package lokalise

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	lokaliseapi "github.com/lokalise/go-lokalise-api/v5"
)

const defaultBaseURL = "https://api.lokalise.com/api2"

type HTTPClient struct {
	// api serves the existing Lokalise key pull/push code paths.
	api *lokaliseapi.Api
	// apiToken is the single auth source for raw Lokalise API calls.
	apiToken string
	// baseURL and httpClient are kept for glossary and file endpoints that are called directly.
	baseURL    string
	httpClient *http.Client
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	httpClient := &http.Client{Timeout: timeout}
	return NewHTTPClientWithBaseURL(cfg, cfg.APIBaseURL, httpClient)
}

func NewHTTPClientWithBaseURL(cfg Config, baseURL string, httpClient *http.Client) (*HTTPClient, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("lokalise http client: client must not be nil")
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultBaseURL
	}
	if err := validateBaseURL(baseURL); err != nil {
		return nil, err
	}

	apiToken := strings.TrimSpace(cfg.APIToken)

	// Keep the SDK initialized with the same base URL/timeout as the raw client
	// so existing key sync, glossary export, and file upload behavior stay aligned.
	api, err := lokaliseapi.New(
		apiToken,
		lokaliseapi.WithBaseURL(baseURL),
		lokaliseapi.WithConnectionTimeout(httpClient.Timeout),
	)
	if err != nil {
		return nil, fmt.Errorf("lokalise client init: %w", err)
	}

	return &HTTPClient{
		api:        api,
		apiToken:   apiToken,
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
	}, nil
}

func validateBaseURL(baseURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return fmt.Errorf("lokalise http client: invalid base URL: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("lokalise http client: base URL must include scheme and host")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("lokalise http client: base URL must not include userinfo, query, or fragment")
	}
	if parsed.Scheme == "https" {
		return nil
	}
	if parsed.Scheme == "http" && isLoopbackHost(parsed.Hostname()) {
		return nil
	}
	return fmt.Errorf("lokalise http client: base URL must use https")
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
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

	cursor := ""
	out := make([]KeyTranslation, 0)

	for {
		keysSvc := c.api.Keys()
		keysSvc.SetContext(ctx)
		keysSvc.SetListOptions(lokaliseapi.KeyListOptions{
			IncludeTranslations: 1,
			Limit:               500,
			Pagination:          "cursor",
			Cursor:              cursor,
		})

		resp, err := keysSvc.List(in.ProjectID)
		if err != nil {
			return nil, "", fmt.Errorf("list keys: %w", err)
		}

		for _, key := range resp.Keys {
			keyName := extractKeyName(key.KeyName)
			if keyName == "" {
				continue
			}
			for _, tr := range key.Translations {
				locale := strings.TrimSpace(tr.LanguageISO)
				if locale == "" {
					continue
				}
				if len(allowed) > 0 {
					if _, ok := allowed[locale]; !ok {
						continue
					}
				}
				value := strings.TrimSpace(tr.Translation)
				if value == "" {
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

		if !resp.HasNextCursor() {
			break
		}
		cursor = resp.NextCursor()
	}

	return out, revision, nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	byKey := groupEntriesByKey(in.Entries)
	if len(byKey) == 0 {
		return time.Now().UTC().Format(time.RFC3339Nano), nil
	}

	existingKeyIDs, err := c.listExistingKeyIDs(ctx, in.ProjectID)
	if err != nil {
		return "", err
	}

	creates := make([]lokaliseapi.NewKey, 0, len(byKey))
	updates := make([]lokaliseapi.BulkUpdateKey, 0, len(byKey))

	for group, translations := range byKey {
		newKey := buildNewKey(group, translations)
		if keyID, ok := existingKeyIDs[group]; ok {
			updates = append(updates, lokaliseapi.BulkUpdateKey{
				KeyID:  keyID,
				NewKey: newKey,
			})
			continue
		}
		creates = append(creates, newKey)
	}

	keysSvc := c.api.Keys()
	keysSvc.SetContext(ctx)
	if len(updates) > 0 {
		if _, err := keysSvc.BulkUpdate(in.ProjectID, updates); err != nil {
			return "", fmt.Errorf("bulk update keys: %w", err)
		}
	}
	if len(creates) > 0 {
		if _, err := keysSvc.Create(in.ProjectID, creates); err != nil {
			return "", fmt.Errorf("create keys: %w", err)
		}
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

type groupedKey struct {
	Key     string
	Context string
}

func groupEntriesByKey(entries []KeyTranslation) map[groupedKey][]lokaliseapi.NewTranslation {
	byKey := make(map[groupedKey][]lokaliseapi.NewTranslation)
	for _, entry := range entries {
		key := strings.TrimSpace(entry.Key)
		locale := strings.TrimSpace(entry.Locale)
		if key == "" || locale == "" {
			continue
		}
		group := groupedKey{Key: key, Context: entry.Context}
		byKey[group] = append(byKey[group], lokaliseapi.NewTranslation{
			LanguageISO: locale,
			Translation: entry.Value,
		})
	}
	return byKey
}

func buildNewKey(group groupedKey, translations []lokaliseapi.NewTranslation) lokaliseapi.NewKey {
	platforms := []string{"web"}
	trans := translations
	newKey := lokaliseapi.NewKey{
		KeyName:      map[string]string{"web": group.Key},
		Platforms:    &platforms,
		Translations: &trans,
	}
	if strings.TrimSpace(group.Context) != "" {
		context := group.Context
		newKey.Description = &context
	}
	return newKey
}

func (c *HTTPClient) listExistingKeyIDs(ctx context.Context, projectID string) (map[groupedKey]int64, error) {
	out := make(map[groupedKey]int64)
	cursor := ""

	for {
		keysSvc := c.api.Keys()
		keysSvc.SetContext(ctx)
		keysSvc.SetListOptions(lokaliseapi.KeyListOptions{
			Limit:      500,
			Pagination: "cursor",
			Cursor:     cursor,
		})

		resp, err := keysSvc.List(projectID)
		if err != nil {
			return nil, fmt.Errorf("list existing keys: %w", err)
		}

		for _, key := range resp.Keys {
			keyName := extractKeyName(key.KeyName)
			if keyName == "" {
				continue
			}
			group := groupedKey{Key: keyName, Context: key.Description}
			if _, exists := out[group]; !exists {
				out[group] = key.KeyID
			}
		}

		if !resp.HasNextCursor() {
			break
		}
		cursor = resp.NextCursor()
	}

	return out, nil
}

func extractKeyName(platforms lokaliseapi.PlatformStrings) string {
	candidates := []string{platforms.Web, platforms.Ios, platforms.Android, platforms.Other}
	for _, candidate := range candidates {
		if trimmed := strings.TrimSpace(candidate); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
