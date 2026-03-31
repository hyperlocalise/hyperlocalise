package phrase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

const (
	AdapterName         = "phrase"
	defaultTokenEnvName = "PHRASE_API_TOKEN"
	ModeStrings         = "strings"
	ModeFiles           = "files"
)

type Config struct {
	ProjectID       string   `json:"projectID"`
	APIToken        string   `json:"-"`
	APITokenEnv     string   `json:"apiTokenEnv,omitempty"`
	Mode            string   `json:"mode,omitempty"`
	SourceLanguage  string   `json:"sourceLanguage,omitempty"`
	TargetLanguages []string `json:"targetLanguages,omitempty"`
	TimeoutSeconds  int      `json:"timeoutSeconds,omitempty"`
	FileFormat      string   `json:"fileFormat,omitempty"`
}

type StringTranslation struct {
	Key     string
	Context string
	Locale  string
	Value   string
}

type ListStringsInput struct {
	ProjectID string
	APIToken  string
	Locales   []string
}

type UpsertStringsInput struct {
	ProjectID string
	APIToken  string
	Entries   []StringTranslation
}

type ExportFileInput struct {
	ProjectID      string
	APIToken       string
	Locales        []string
	SourceLanguage string
	Format         string
}

type ImportFileInput struct {
	ProjectID string
	APIToken  string
	Entries   []storage.Entry
	Format    string
}

type Client interface {
	ListStrings(ctx context.Context, in ListStringsInput) ([]StringTranslation, string, error)
	UpsertStrings(ctx context.Context, in UpsertStringsInput) (string, error)
	ExportFile(ctx context.Context, in ExportFileInput) ([]storage.Entry, string, error)
	ImportFile(ctx context.Context, in ImportFileInput) (string, error)
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
		return nil, fmt.Errorf("phrase adapter: client must not be nil")
	}
	return &Adapter{cfg: cfg, client: client}, nil
}

func ParseConfig(raw json.RawMessage) (Config, error) {
	var cfg Config
	if len(raw) == 0 {
		return cfg, fmt.Errorf("phrase config: must not be empty")
	}

	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return cfg, fmt.Errorf("phrase config: decode: %w", err)
	}
	if _, exists := rawMap["apiToken"]; exists {
		return cfg, fmt.Errorf("phrase config: apiToken is not supported; use %s", defaultTokenEnvName)
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("phrase config: decode: %w", err)
	}

	if strings.TrimSpace(cfg.APITokenEnv) == "" {
		cfg.APITokenEnv = defaultTokenEnvName
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		cfg.APIToken = os.Getenv(cfg.APITokenEnv)
		if strings.TrimSpace(cfg.APIToken) == "" && cfg.APITokenEnv != defaultTokenEnvName {
			cfg.APIToken = os.Getenv(defaultTokenEnvName)
		}
	}
	if strings.TrimSpace(cfg.Mode) == "" {
		cfg.Mode = ModeStrings
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}
	if strings.TrimSpace(cfg.FileFormat) == "" {
		cfg.FileFormat = "json"
	}

	if err := validateConfig(cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func validateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return fmt.Errorf("phrase config: projectID is required")
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		return fmt.Errorf("phrase config: API token is required (%s)", defaultTokenEnvName)
	}
	mode := strings.ToLower(strings.TrimSpace(cfg.Mode))
	if mode != ModeStrings && mode != ModeFiles {
		return fmt.Errorf("phrase config: mode must be %q or %q", ModeStrings, ModeFiles)
	}
	if mode == ModeFiles && strings.TrimSpace(cfg.FileFormat) == "" {
		return fmt.Errorf("phrase config: fileFormat is required in files mode")
	}
	return nil
}

func (a *Adapter) Name() string { return AdapterName }

func (a *Adapter) Capabilities() storage.Capabilities {
	mode := strings.ToLower(strings.TrimSpace(a.cfg.Mode))
	return storage.Capabilities{
		SupportsContext:    mode == ModeStrings,
		SupportsVersions:   false,
		SupportsDeletes:    false,
		SupportsNamespaces: false,
	}
}

func (a *Adapter) Pull(ctx context.Context, req storage.PullRequest) (storage.PullResult, error) {
	switch strings.ToLower(strings.TrimSpace(a.cfg.Mode)) {
	case ModeFiles:
		return a.pullFiles(ctx, req)
	default:
		return a.pullStrings(ctx, req)
	}
}

func (a *Adapter) pullStrings(ctx context.Context, req storage.PullRequest) (storage.PullResult, error) {
	locales := req.Locales
	if len(locales) == 0 && len(a.cfg.TargetLanguages) > 0 {
		locales = append([]string(nil), a.cfg.TargetLanguages...)
	}

	stringsResp, revision, err := a.client.ListStrings(ctx, ListStringsInput{ProjectID: a.cfg.ProjectID, APIToken: a.cfg.APIToken, Locales: locales})
	if err != nil {
		return storage.PullResult{}, fmt.Errorf("phrase pull strings: %w", err)
	}

	now := time.Now().UTC()
	entries := normalizeEntriesFromStrings(stringsResp, revision, now)
	retrievedAt := now
	return storage.PullResult{Snapshot: storage.CatalogSnapshot{Entries: entries, Revision: revision, RetrievedAt: &retrievedAt}}, nil
}

func (a *Adapter) pullFiles(ctx context.Context, req storage.PullRequest) (storage.PullResult, error) {
	locales := req.Locales
	if len(locales) == 0 && len(a.cfg.TargetLanguages) > 0 {
		locales = append([]string(nil), a.cfg.TargetLanguages...)
	}

	entries, revision, err := a.client.ExportFile(ctx, ExportFileInput{
		ProjectID:      a.cfg.ProjectID,
		APIToken:       a.cfg.APIToken,
		Locales:        locales,
		SourceLanguage: a.cfg.SourceLanguage,
		Format:         a.cfg.FileFormat,
	})
	if err != nil {
		return storage.PullResult{}, fmt.Errorf("phrase pull files: %w", err)
	}

	now := time.Now().UTC()
	normalized := normalizeEntries(entries, revision, now)
	retrievedAt := now
	return storage.PullResult{Snapshot: storage.CatalogSnapshot{Entries: normalized, Revision: revision, RetrievedAt: &retrievedAt}}, nil
}

func (a *Adapter) Push(ctx context.Context, req storage.PushRequest) (storage.PushResult, error) {
	switch strings.ToLower(strings.TrimSpace(a.cfg.Mode)) {
	case ModeFiles:
		return a.pushFiles(ctx, req)
	default:
		return a.pushStrings(ctx, req)
	}
}

func (a *Adapter) pushStrings(ctx context.Context, req storage.PushRequest) (storage.PushResult, error) {
	payload, applied := entriesToStringPayload(req.Entries)
	if len(payload) == 0 {
		return storage.PushResult{Revision: time.Now().UTC().Format(time.RFC3339Nano)}, nil
	}

	revision, err := a.client.UpsertStrings(ctx, UpsertStringsInput{ProjectID: a.cfg.ProjectID, APIToken: a.cfg.APIToken, Entries: payload})
	if err != nil {
		indexes := sentIndexesFromError(err)
		partialApplied := make([]storage.EntryID, 0, len(indexes))
		for _, idx := range indexes {
			if idx >= 0 && idx < len(applied) {
				partialApplied = append(partialApplied, applied[idx])
			}
		}
		return storage.PushResult{Applied: partialApplied}, fmt.Errorf("phrase push strings: %w", err)
	}
	return storage.PushResult{Applied: applied, Revision: revision}, nil
}

func (a *Adapter) pushFiles(ctx context.Context, req storage.PushRequest) (storage.PushResult, error) {
	entries := filterEntries(req.Entries)
	if len(entries) == 0 {
		return storage.PushResult{Revision: time.Now().UTC().Format(time.RFC3339Nano)}, nil
	}
	revision, err := a.client.ImportFile(ctx, ImportFileInput{ProjectID: a.cfg.ProjectID, APIToken: a.cfg.APIToken, Entries: entries, Format: a.cfg.FileFormat})
	if err != nil {
		return storage.PushResult{}, fmt.Errorf("phrase push files: %w", err)
	}
	applied := make([]storage.EntryID, 0, len(entries))
	for _, entry := range entries {
		applied = append(applied, entry.ID())
	}
	return storage.PushResult{Applied: applied, Revision: revision}, nil
}

func filterEntries(entries []storage.Entry) []storage.Entry {
	filtered := make([]storage.Entry, 0, len(entries))
	for _, entry := range entries {
		if strings.TrimSpace(entry.Key) == "" || strings.TrimSpace(entry.Locale) == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}
		filtered = append(filtered, storage.Entry{Key: strings.TrimSpace(entry.Key), Context: entry.Context, Locale: strings.TrimSpace(entry.Locale), Value: entry.Value})
	}
	return filtered
}

func entriesToStringPayload(entries []storage.Entry) ([]StringTranslation, []storage.EntryID) {
	payload := make([]StringTranslation, 0, len(entries))
	applied := make([]storage.EntryID, 0, len(entries))
	indexByID := make(map[storage.EntryID]int, len(entries))

	for _, entry := range entries {
		key := strings.TrimSpace(entry.Key)
		locale := strings.TrimSpace(entry.Locale)
		if key == "" || locale == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}
		id := storage.EntryID{Key: key, Context: entry.Context, Locale: locale}
		tr := StringTranslation{Key: key, Context: entry.Context, Locale: locale, Value: entry.Value}
		if idx, exists := indexByID[id]; exists {
			payload[idx] = tr
			continue
		}
		indexByID[id] = len(payload)
		payload = append(payload, tr)
		applied = append(applied, id)
	}
	return payload, applied
}

func normalizeEntriesFromStrings(source []StringTranslation, revision string, now time.Time) []storage.Entry {
	entries := make([]storage.Entry, 0, len(source))
	for _, tr := range source {
		if strings.TrimSpace(tr.Key) == "" || strings.TrimSpace(tr.Locale) == "" || strings.TrimSpace(tr.Value) == "" {
			continue
		}
		entries = append(entries, storage.Entry{
			Key:     strings.TrimSpace(tr.Key),
			Context: tr.Context,
			Locale:  strings.TrimSpace(tr.Locale),
			Value:   tr.Value,
			Provenance: storage.EntryProvenance{
				Origin:    storage.OriginHuman,
				State:     storage.StateCurated,
				UpdatedAt: now,
			},
			Remote: storage.RemoteMeta{Adapter: AdapterName, Revision: revision},
		})
	}
	return entries
}

func normalizeEntries(source []storage.Entry, revision string, now time.Time) []storage.Entry {
	entries := make([]storage.Entry, 0, len(source))
	for _, entry := range source {
		if strings.TrimSpace(entry.Key) == "" || strings.TrimSpace(entry.Locale) == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}
		entry.Key = strings.TrimSpace(entry.Key)
		entry.Locale = strings.TrimSpace(entry.Locale)
		entry.Provenance = storage.EntryProvenance{Origin: storage.OriginHuman, State: storage.StateCurated, UpdatedAt: now}
		entry.Remote = storage.RemoteMeta{Adapter: AdapterName, Revision: revision}
		entries = append(entries, entry)
	}
	return entries
}

var errPartialUpsert = errors.New("partial upsert")

type partialUpsertError struct {
	sentIndexes []int
	cause       error
}

func (e *partialUpsertError) Error() string {
	return fmt.Sprintf("%v: sent %d entries before failure: %v", errPartialUpsert, len(e.sentIndexes), e.cause)
}

func (e *partialUpsertError) Unwrap() error { return e.cause }

func sentIndexesFromError(err error) []int {
	var partial *partialUpsertError
	if errors.As(err, &partial) {
		out := make([]int, len(partial.sentIndexes))
		copy(out, partial.sentIndexes)
		return out
	}
	return nil
}
