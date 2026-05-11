package smartling

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

const (
	AdapterName             = "smartling"
	defaultUserSecretEnvVar = "SMARTLING_USER_SECRET"
	ModeStrings             = "strings"
	ModeFiles               = "files"
)

type Config struct {
	ProjectID       string   `json:"projectID"`
	UserIdentifier  string   `json:"userIdentifier"`
	UserSecret      string   `json:"-"`
	UserSecretEnv   string   `json:"userSecretEnv,omitempty"`
	TargetLanguages []string `json:"targetLanguages,omitempty"`
	TimeoutSeconds  int      `json:"timeoutSeconds,omitempty"`
	Mode            string   `json:"mode,omitempty"`
	FileFormat      string   `json:"fileFormat,omitempty"`
	FileURI         string   `json:"fileURI,omitempty"`
}

type StringTranslation struct {
	Key     string `json:"stringText"`
	Context string `json:"instruction,omitempty"`
	Locale  string `json:"targetLocaleId"`
	Value   string `json:"translation"`
}

type ListTranslationsInput struct {
	ProjectID string
	Locales   []string
}

type UpsertTranslationsInput struct {
	ProjectID string
	Entries   []StringTranslation
}

type Client interface {
	ListTranslations(ctx context.Context, in ListTranslationsInput) ([]StringTranslation, string, error)
	UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error)
	UploadSourceFile(ctx context.Context, in SourceUploadInput) (SourceUploadResult, error)
	ExportFile(ctx context.Context, in ExportFileInput) ([]storage.Entry, string, error)
	ImportFile(ctx context.Context, in ImportFileInput) (string, error)
}

type ExportFileInput struct {
	ProjectID string
	FileURI   string
	FileType  string
	Locales   []string
}

type ImportFileInput struct {
	ProjectID string
	FileURI   string
	FileType  string
	Entries   []storage.Entry
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
		return nil, fmt.Errorf("smartling adapter: client must not be nil")
	}
	return &Adapter{cfg: cfg, client: client}, nil
}

func ParseConfig(raw json.RawMessage) (Config, error) {
	var cfg Config
	if len(raw) == 0 {
		return cfg, fmt.Errorf("smartling config: must not be empty")
	}
	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return cfg, fmt.Errorf("smartling config: decode: %w", err)
	}
	if _, exists := rawMap["userSecret"]; exists {
		return cfg, fmt.Errorf("smartling config: userSecret is not supported; use %s", defaultUserSecretEnvVar)
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("smartling config: decode: %w", err)
	}

	if strings.TrimSpace(cfg.UserSecretEnv) == "" {
		cfg.UserSecretEnv = defaultUserSecretEnvVar
	}
	if strings.TrimSpace(cfg.UserSecret) == "" {
		cfg.UserSecret = os.Getenv(cfg.UserSecretEnv)
		if strings.TrimSpace(cfg.UserSecret) == "" && cfg.UserSecretEnv != defaultUserSecretEnvVar {
			cfg.UserSecret = os.Getenv(defaultUserSecretEnvVar)
		}
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}
	if strings.TrimSpace(cfg.Mode) == "" {
		cfg.Mode = ModeStrings
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
		return fmt.Errorf("smartling config: projectID is required")
	}
	if strings.TrimSpace(cfg.UserIdentifier) == "" {
		return fmt.Errorf("smartling config: userIdentifier is required")
	}
	if strings.TrimSpace(cfg.UserSecret) == "" {
		return fmt.Errorf("smartling config: user secret is required (%s)", defaultUserSecretEnvVar)
	}
	mode := strings.ToLower(strings.TrimSpace(cfg.Mode))
	if mode != ModeStrings && mode != ModeFiles {
		return fmt.Errorf("smartling config: mode must be %q or %q", ModeStrings, ModeFiles)
	}
	if mode == ModeFiles {
		if strings.TrimSpace(cfg.FileURI) == "" {
			return fmt.Errorf("smartling config: fileURI is required in files mode")
		}
		if strings.TrimSpace(cfg.FileFormat) == "" {
			return fmt.Errorf("smartling config: fileFormat is required in files mode")
		}
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

	stringsOut, revision, err := a.client.ListTranslations(ctx, ListTranslationsInput{
		ProjectID: a.cfg.ProjectID,
		Locales:   locales,
	})
	if err != nil {
		return storage.PullResult{}, fmt.Errorf("smartling pull strings: %w", err)
	}

	entries := make([]storage.Entry, 0, len(stringsOut))
	now := time.Now().UTC()
	for _, item := range stringsOut {
		if strings.TrimSpace(item.Locale) == "" || strings.TrimSpace(item.Value) == "" {
			continue
		}
		entries = append(entries, storage.Entry{
			Key:     item.Key,
			Context: item.Context,
			Locale:  item.Locale,
			Value:   item.Value,
			Provenance: storage.EntryProvenance{
				Origin:    storage.OriginHuman,
				State:     storage.StateCurated,
				UpdatedAt: now,
			},
			Remote: storage.RemoteMeta{Adapter: AdapterName, Revision: revision},
		})
	}

	retrievedAt := now
	return storage.PullResult{Snapshot: storage.CatalogSnapshot{Entries: entries, Revision: revision, RetrievedAt: &retrievedAt}}, nil
}

func (a *Adapter) pullFiles(ctx context.Context, req storage.PullRequest) (storage.PullResult, error) {
	locales := req.Locales
	if len(locales) == 0 && len(a.cfg.TargetLanguages) > 0 {
		locales = append([]string(nil), a.cfg.TargetLanguages...)
	}

	entries, revision, err := a.client.ExportFile(ctx, ExportFileInput{
		ProjectID: a.cfg.ProjectID,
		FileURI:   a.cfg.FileURI,
		FileType:  a.cfg.FileFormat,
		Locales:   locales,
	})

	now := time.Now().UTC()
	normalized := normalizeEntries(entries, revision, now)
	retrievedAt := now
	result := storage.PullResult{Snapshot: storage.CatalogSnapshot{Entries: normalized, Revision: revision, RetrievedAt: &retrievedAt}}
	if err != nil {
		return result, fmt.Errorf("smartling pull files: %w", err)
	}
	return result, nil
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
	payload := make([]StringTranslation, 0, len(req.Entries))
	applied := make([]storage.EntryID, 0, len(req.Entries))
	indexByID := make(map[storage.EntryID]int, len(req.Entries))
	for _, entry := range req.Entries {
		key := strings.TrimSpace(entry.Key)
		locale := strings.TrimSpace(entry.Locale)
		if key == "" || locale == "" || strings.TrimSpace(entry.Value) == "" {
			continue
		}

		id := entry.ID()
		translation := StringTranslation{
			Key:     key,
			Context: strings.TrimSpace(entry.Context),
			Locale:  locale,
			Value:   entry.Value,
		}
		if idx, exists := indexByID[id]; exists {
			// Keep one write per EntryID and let the newest entry win.
			payload[idx] = translation
			continue
		}

		indexByID[id] = len(payload)
		payload = append(payload, translation)
		applied = append(applied, entry.ID())
	}

	revision, err := a.client.UpsertTranslations(ctx, UpsertTranslationsInput{ProjectID: a.cfg.ProjectID, Entries: payload})
	if err != nil {
		return storage.PushResult{}, fmt.Errorf("smartling push strings: %w", err)
	}
	return storage.PushResult{Applied: applied, Revision: revision}, nil
}

func (a *Adapter) pushFiles(ctx context.Context, req storage.PushRequest) (storage.PushResult, error) {
	entries := filterEntries(req.Entries)
	if len(entries) == 0 {
		return storage.PushResult{Revision: time.Now().UTC().Format(time.RFC3339Nano)}, nil
	}
	revision, err := a.client.ImportFile(ctx, ImportFileInput{
		ProjectID: a.cfg.ProjectID,
		FileURI:   a.cfg.FileURI,
		FileType:  a.cfg.FileFormat,
		Entries:   entries,
	})
	if err != nil {
		return storage.PushResult{}, fmt.Errorf("smartling push files: %w", err)
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

func (a *Adapter) FileWorkflowCapabilities() storage.FileWorkflowCapabilities {
	return storage.FileWorkflowCapabilities{
		SupportsSourceUpload: true,
	}
}

func (a *Adapter) UploadSources(ctx context.Context, req storage.FileUploadSourcesRequest) (storage.FileOperationResult, error) {
	result := storage.FileOperationResult{}
	for _, fileGroup := range req.Config.Files {
		sourcePaths, err := resolveSourcePaths(req.Config.BasePath, fileGroup.Source)
		if err != nil {
			return result, err
		}

		if len(sourcePaths) == 0 {
			result.Warnings = append(result.Warnings, storage.Warning{
				Message: fmt.Sprintf("source pattern %q matched no files", fileGroup.Source),
			})
			continue
		}

		for _, path := range sourcePaths {
			// In Smartling, fileUri is typically the relative path from project root
			fileUri, err := filepath.Rel(req.Config.BasePath, path)
			if err != nil {
				fileUri = filepath.Base(path)
			}
			fileUri = filepath.ToSlash(fileUri)

			ext := strings.ToLower(filepath.Ext(path))
			fileType := FileTypeForExtension(ext)
			if fileType == "" {
				result.Warnings = append(result.Warnings, storage.Warning{
					Message: fmt.Sprintf("unsupported file extension %q for %s, skipping", ext, path),
				})
				result.Skipped = append(result.Skipped, path)
				continue
			}

			_, err = a.client.UploadSourceFile(ctx, SourceUploadInput{
				ProjectID: req.Config.ProjectID,
				FileURI:   fileUri,
				FilePath:  path,
				FileType:  fileType,
				Authorize: true,
			})
			if err != nil {
				return result, fmt.Errorf("upload %s: %w", path, err)
			}
			result.Processed = append(result.Processed, path)
		}
	}
	return result, nil
}

func (a *Adapter) UploadTranslations(ctx context.Context, req storage.FileUploadTranslationsRequest) (storage.FileOperationResult, error) {
	return storage.FileOperationResult{}, fmt.Errorf("smartling adapter: UploadTranslations not implemented")
}

func (a *Adapter) DownloadTranslations(ctx context.Context, req storage.FileDownloadTranslationsRequest) (storage.FileOperationResult, error) {
	return storage.FileOperationResult{}, fmt.Errorf("smartling adapter: DownloadTranslations not implemented")
}
