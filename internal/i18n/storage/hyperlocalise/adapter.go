package hyperlocalise

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/pkg/hyperlocaliseapi"
)

const (
	AdapterName         = "hyperlocalise"
	defaultAPIKeyEnv    = "HYPERLOCALISE_API_KEY"
	defaultAPIBaseURL   = "https://hyperlocalise.com/api"
	defaultTimeoutSecs  = 30
)

type Config struct {
	ProjectID       string   `json:"projectID"`
	APIBaseURL      string   `json:"apiBaseURL,omitempty"`
	APIKey          string   `json:"-"`
	APIKeyEnv       string   `json:"apiKeyEnv,omitempty"`
	SourcePath      string   `json:"sourcePath,omitempty"`
	SourceLanguage  string   `json:"sourceLanguage,omitempty"`
	TargetLanguages []string `json:"targetLanguages,omitempty"`
	TimeoutSeconds  int      `json:"timeoutSeconds,omitempty"`
}

type Client interface {
	ListTranslations(ctx context.Context, in ListTranslationsInput) (ListTranslationsResult, error)
	UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error)
}

type ListTranslationsInput struct {
	ProjectID  string
	APIKey     string
	SourcePath string
	Locales    []string
}

type UpsertTranslationsInput struct {
	ProjectID    string
	APIKey     string
	SourcePath string
	SourceLocale string
	Entries    []TranslationEntry
}

type TranslationEntry struct {
	Key     string `json:"key"`
	Context string `json:"context,omitempty"`
	Locale  string `json:"locale"`
	Value   string `json:"value"`
	Status  string `json:"status,omitempty"`
}

type ListTranslationsResult struct {
	Entries  []TranslationEntry
	Revision string
}

type Adapter struct {
	cfg    Config
	client Client
}

func New(raw json.RawMessage) (storage.StorageAdapter, error) {
	cfg, err := ParseConfig(raw)
	if err != nil {
		return nil, err
	}

	client, err := NewHTTPClient(cfg)
	if err != nil {
		return nil, err
	}

	return NewWithClient(cfg, client)
}

func NewWithClient(cfg Config, client Client) (*Adapter, error) {
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("hyperlocalise adapter: client must not be nil")
	}
	return &Adapter{cfg: cfg, client: client}, nil
}

func ParseConfig(raw json.RawMessage) (Config, error) {
	var cfg Config
	if len(raw) == 0 {
		return cfg, fmt.Errorf("hyperlocalise config: must not be empty")
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("hyperlocalise config: decode: %w", err)
	}

	if strings.TrimSpace(cfg.APIKeyEnv) == "" {
		cfg.APIKeyEnv = defaultAPIKeyEnv
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		cfg.APIKey = os.Getenv(cfg.APIKeyEnv)
	}
	if strings.TrimSpace(cfg.APIBaseURL) == "" {
		cfg.APIBaseURL = defaultAPIBaseURL
	}
	cfg.APIBaseURL = strings.TrimRight(strings.TrimSpace(cfg.APIBaseURL), "/")
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = defaultTimeoutSecs
	}

	if err := validateConfig(cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func validateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return fmt.Errorf("hyperlocalise config: projectID is required")
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return fmt.Errorf("hyperlocalise config: API key is required (%s)", defaultAPIKeyEnv)
	}
	if err := hyperlocaliseapi.ValidateAPIBaseURL(cfg.APIBaseURL); err != nil {
		return err
	}
	if strings.TrimSpace(cfg.SourcePath) == "" {
		return fmt.Errorf("hyperlocalise config: sourcePath is required")
	}
	return nil
}

func (a *Adapter) Name() string { return AdapterName }

func (a *Adapter) Capabilities() storage.Capabilities {
	return storage.Capabilities{
		SupportsContext:    true,
		SupportsVersions:   true,
		SupportsDeletes:    false,
		SupportsNamespaces: false,
	}
}

func (a *Adapter) Pull(ctx context.Context, req storage.PullRequest) (storage.PullResult, error) {
	locales := req.Locales
	if len(locales) == 0 && len(a.cfg.TargetLanguages) > 0 {
		locales = append([]string(nil), a.cfg.TargetLanguages...)
	}

	result, err := a.client.ListTranslations(ctx, ListTranslationsInput{
		ProjectID:  a.cfg.ProjectID,
		APIKey:     a.cfg.APIKey,
		SourcePath: a.cfg.SourcePath,
		Locales:    locales,
	})
	if err != nil {
		return storage.PullResult{}, fmt.Errorf("hyperlocalise pull: %w", err)
	}

	now := time.Now().UTC()
	entries := make([]storage.Entry, 0, len(result.Entries))
	for _, entry := range result.Entries {
		if strings.TrimSpace(entry.Locale) == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}
		state := storage.StateDraft
		if entry.Status == "approved" {
			state = storage.StateCurated
		}
		entries = append(entries, storage.Entry{
			Key:     entry.Key,
			Context: entry.Context,
			Locale:  entry.Locale,
			Value:   entry.Value,
			Provenance: storage.EntryProvenance{
				Origin:    storage.OriginHuman,
				State:     state,
				UpdatedAt: now,
			},
			Remote: storage.RemoteMeta{
				Adapter:  AdapterName,
				Revision: result.Revision,
			},
		})
	}

	retrievedAt := now
	return storage.PullResult{
		Snapshot: storage.CatalogSnapshot{
			Entries:     entries,
			Revision:    result.Revision,
			RetrievedAt: &retrievedAt,
		},
	}, nil
}

func (a *Adapter) Push(ctx context.Context, req storage.PushRequest) (storage.PushResult, error) {
	sourceLocale := strings.TrimSpace(a.cfg.SourceLanguage)
	payload := make([]TranslationEntry, 0, len(req.Entries))
	applied := make([]storage.EntryID, 0, len(req.Entries))
	indexByID := make(map[storage.EntryID]int, len(req.Entries))

	for _, entry := range req.Entries {
		key := strings.TrimSpace(entry.Key)
		locale := strings.TrimSpace(entry.Locale)
		if key == "" || locale == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}

		id := entry.ID()
		translation := TranslationEntry{
			Key:     key,
			Context: entry.Context,
			Locale:  locale,
			Value:   entry.Value,
		}
		if idx, exists := indexByID[id]; exists {
			payload[idx] = translation
			continue
		}

		indexByID[id] = len(payload)
		payload = append(payload, translation)
		applied = append(applied, id)
		if sourceLocale == "" {
			sourceLocale = locale
		}
	}

	if sourceLocale == "" {
		return storage.PushResult{}, fmt.Errorf("hyperlocalise push: source language is required")
	}

	revision, err := a.client.UpsertTranslations(ctx, UpsertTranslationsInput{
		ProjectID:    a.cfg.ProjectID,
		APIKey:       a.cfg.APIKey,
		SourcePath:   a.cfg.SourcePath,
		SourceLocale: sourceLocale,
		Entries:      payload,
	})
	if err != nil {
		return storage.PushResult{}, fmt.Errorf("hyperlocalise push: %w", err)
	}

	return storage.PushResult{
		Applied:  applied,
		Revision: revision,
	}, nil
}

type HTTPClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	return &HTTPClient{
		baseURL: cfg.APIBaseURL,
		apiKey:  cfg.APIKey,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second,
		},
	}, nil
}

func (c *HTTPClient) ListTranslations(ctx context.Context, in ListTranslationsInput) (ListTranslationsResult, error) {
	query := url.Values{}
	query.Set("sourcePath", in.SourcePath)
	if len(in.Locales) > 0 {
		query.Set("locales", strings.Join(in.Locales, ","))
	}

	var response struct {
		Translations []TranslationEntry `json:"translations"`
		Revision     string             `json:"revision"`
	}
	path := fmt.Sprintf("/v1/projects/%s/translations?%s", url.PathEscape(in.ProjectID), query.Encode())
	if err := c.doJSON(ctx, http.MethodGet, path, "", nil, &response); err != nil {
		return ListTranslationsResult{}, err
	}

	return ListTranslationsResult{
		Entries:  response.Translations,
		Revision: response.Revision,
	}, nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	payload := map[string]any{
		"sourcePath":   in.SourcePath,
		"sourceLocale": in.SourceLocale,
		"entries":      in.Entries,
	}
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		return "", err
	}

	var response struct {
		Result struct {
			Upserted int `json:"upserted"`
		} `json:"result"`
	}
	path := fmt.Sprintf("/v1/projects/%s/translations", url.PathEscape(in.ProjectID))
	if err := c.doJSON(ctx, http.MethodPut, path, "application/json", &body, &response); err != nil {
		return "", err
	}

	return fmt.Sprintf("upserted:%d", response.Result.Upserted), nil
}

func (c *HTTPClient) doJSON(ctx context.Context, method, path, contentType string, body io.Reader, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("hyperlocalise api %s %s: status %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode hyperlocalise response: %w", err)
	}
	return nil
}
