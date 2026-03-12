package poeditor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
	"golang.org/x/text/language"
)

const (
	AdapterName         = "poeditor"
	defaultTokenEnvName = "POEDITOR_API_TOKEN"
)

type Config struct {
	ProjectID       string            `json:"projectID"`
	APIToken        string            `json:"-"`
	APITokenEnv     string            `json:"apiTokenEnv,omitempty"`
	SourceLanguage  string            `json:"sourceLanguage,omitempty"`
	TargetLanguages []string          `json:"targetLanguages,omitempty"`
	LocaleMap       map[string]string `json:"localeMap,omitempty"`
	TimeoutSeconds  int               `json:"timeoutSeconds,omitempty"`
}

type Client interface {
	ListTerms(ctx context.Context, in ListTermsInput) ([]TermTranslation, string, error)
	ListProjectTerms(ctx context.Context, in ListTermsInput) ([]TermKey, string, error)
	AvailableLanguages(ctx context.Context, apiToken string) ([]string, error)
	AddTerms(ctx context.Context, in TermMutationInput) (string, error)
	DeleteTerms(ctx context.Context, in TermMutationInput) (string, error)
	UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error)
	ExportFile(ctx context.Context, in ExportFileInput) ([]TermTranslation, string, error)
	UploadFile(ctx context.Context, in UploadFileInput) (UploadFileResult, string, error)
}

type Adapter struct {
	cfg    Config
	client Client

	supportedMu  sync.RWMutex
	supportedSet map[string]string
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
		return nil, fmt.Errorf("poeditor adapter: client must not be nil")
	}
	debug("adapter", "new", map[string]any{
		"project_id":      strings.TrimSpace(cfg.ProjectID),
		"source_language": strings.TrimSpace(cfg.SourceLanguage),
		"target_count":    len(cfg.TargetLanguages),
		"timeout_seconds": cfg.TimeoutSeconds,
	})
	return &Adapter{cfg: cfg, client: client}, nil
}

func ParseConfig(raw json.RawMessage) (Config, error) {
	var cfg Config
	if len(raw) == 0 {
		return cfg, fmt.Errorf("poeditor config: must not be empty")
	}
	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return cfg, fmt.Errorf("poeditor config: decode: %w", err)
	}
	if _, exists := rawMap["apiToken"]; exists {
		return cfg, fmt.Errorf("poeditor config: apiToken is not supported; use %s", defaultTokenEnvName)
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("poeditor config: decode: %w", err)
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
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}

	if err := validateConfig(cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func validateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return fmt.Errorf("poeditor config: projectID is required")
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		return fmt.Errorf("poeditor config: API token is required (%s)", defaultTokenEnvName)
	}
	return nil
}

func (a *Adapter) Name() string { return AdapterName }

func (a *Adapter) Capabilities() storage.Capabilities {
	return storage.Capabilities{
		SupportsContext:    false,
		SupportsVersions:   false,
		SupportsDeletes:    false,
		SupportsNamespaces: false,
	}
}

func (a *Adapter) Pull(ctx context.Context, req storage.PullRequest) (storage.PullResult, error) {
	debug("adapter", "pull_start", map[string]any{
		"project_id": strings.TrimSpace(a.cfg.ProjectID),
		"locales":    append([]string(nil), req.Locales...),
	})
	locales := req.Locales
	if len(locales) == 0 && len(a.cfg.TargetLanguages) > 0 {
		locales = append([]string(nil), a.cfg.TargetLanguages...)
	}
	remoteLocales, localeLookup, err := a.normalizeLocales(ctx, locales)
	if err != nil {
		debug("adapter", "pull_locale_normalize_error", map[string]any{"error": err.Error()})
		return storage.PullResult{}, fmt.Errorf("poeditor pull locale normalization: %w", err)
	}

	terms, revision, err := a.client.ExportFile(ctx, ExportFileInput{
		ProjectID: a.cfg.ProjectID,
		APIToken:  a.cfg.APIToken,
		Locales:   remoteLocales,
		Type:      "key_value_json",
	})
	if err != nil {
		debug("adapter", "pull_error", map[string]any{"error": err.Error()})
		return storage.PullResult{}, fmt.Errorf("poeditor export: %w", err)
	}

	entries := make([]storage.Entry, 0, len(terms))
	now := time.Now().UTC()
	for _, t := range terms {
		if strings.TrimSpace(t.Locale) == "" {
			continue
		}
		if strings.TrimSpace(t.Value) == "" {
			continue
		}
		entries = append(entries, storage.Entry{
			Key:     t.Term,
			Context: t.Context,
			Locale:  localeLookup.localForRemote(t.Locale),
			Value:   t.Value,
			Provenance: storage.EntryProvenance{
				Origin:    storage.OriginHuman,
				State:     storage.StateCurated,
				UpdatedAt: now,
			},
			Remote: storage.RemoteMeta{
				Adapter:  AdapterName,
				Revision: revision,
			},
		})
	}

	retrievedAt := now
	return storage.PullResult{
		Snapshot: storage.CatalogSnapshot{
			Entries:     entries,
			Revision:    revision,
			RetrievedAt: &retrievedAt,
		},
	}, nil
}

func (a *Adapter) Push(ctx context.Context, req storage.PushRequest) (storage.PushResult, error) {
	debug("adapter", "push_start", map[string]any{
		"project_id":  strings.TrimSpace(a.cfg.ProjectID),
		"entry_count": len(req.Entries),
		"locales":     append([]string(nil), req.Locales...),
		"scope":       strings.TrimSpace(req.Options["scope"]),
		"source_lang": strings.TrimSpace(a.cfg.SourceLanguage),
	})
	entriesByLocale := make(map[string][]storage.Entry)
	for _, entry := range req.Entries {
		if strings.TrimSpace(entry.Value) == "" {
			continue
		}
		if strings.TrimSpace(entry.Context) != "" {
			return storage.PushResult{}, fmt.Errorf("poeditor upload does not support entry context; found context for key %q", entry.Key)
		}
		remoteLocale, err := a.normalizeLocale(ctx, entry.Locale)
		if err != nil {
			debug("adapter", "push_locale_normalize_error", map[string]any{
				"locale": entry.Locale,
				"error":  err.Error(),
			})
			return storage.PushResult{}, fmt.Errorf("poeditor push locale normalization for %q: %w", entry.Locale, err)
		}
		entry.Locale = remoteLocale
		entriesByLocale[remoteLocale] = append(entriesByLocale[remoteLocale], entry)
	}

	result := storage.PushResult{}
	sourceLocale := a.remoteSourceLanguage(ctx)
	for _, locale := range sortedLocaleKeys(entriesByLocale) {
		updating := "translations"
		syncTerms := false
		if strings.EqualFold(locale, sourceLocale) {
			updating = "terms_translations"
			syncTerms = strings.EqualFold(strings.TrimSpace(req.Options["scope"]), "full")
		}
		out, revision, err := a.client.UploadFile(ctx, UploadFileInput{
			ProjectID: a.cfg.ProjectID,
			APIToken:  a.cfg.APIToken,
			Locale:    locale,
			Entries:   entriesByLocale[locale],
			Type:      "key_value_json",
			Updating:  updating,
			SyncTerms: syncTerms,
		})
		if err != nil {
			debug("adapter", "upload_locale_error", map[string]any{"locale": locale, "error": err.Error()})
			return result, fmt.Errorf("poeditor upload locale %s: %w", locale, err)
		}
		result.Revision = revision
		result.Warnings = append(result.Warnings, storage.Warning{
			Code: "poeditor_upload_summary",
			Message: fmt.Sprintf(
				"POEditor upload %s: terms parsed=%d added=%d deleted=%d; translations parsed=%d added=%d updated=%d",
				locale,
				out.TermsParsed,
				out.TermsAdded,
				out.TermsDeleted,
				out.TranslationsParsed,
				out.TranslationsAdded,
				out.TranslationsUpdated,
			),
		})
	}

	applied := make([]storage.EntryID, 0, len(req.Entries))
	for _, entry := range req.Entries {
		applied = append(applied, entry.ID())
	}
	result.Applied = applied
	debug("adapter", "push_complete", map[string]any{
		"applied_count": len(result.Applied),
		"warning_count": len(result.Warnings),
		"locale_count":  len(entriesByLocale),
	})

	return result, nil
}

type TermTranslation struct {
	Term    string
	Context string
	Locale  string
	Value   string
}

type TermKey struct {
	Term    string
	Context string
}

type ListTermsInput struct {
	ProjectID string
	APIToken  string
	Locales   []string
}

type UpsertTranslationsInput struct {
	ProjectID      string
	APIToken       string
	SourceLanguage string
	Entries        []TermTranslation
}

type TermMutationInput struct {
	ProjectID string
	APIToken  string
	Terms     []TermKey
}

type ExportFileInput struct {
	ProjectID string
	APIToken  string
	Locales   []string
	Type      string
}

type UploadFileInput struct {
	ProjectID string
	APIToken  string
	Locale    string
	Entries   []storage.Entry
	Type      string
	Updating  string
	SyncTerms bool
}

type UploadFileResult struct {
	TermsParsed         int
	TermsAdded          int
	TermsDeleted        int
	TranslationsParsed  int
	TranslationsAdded   int
	TranslationsUpdated int
}

func (a *Adapter) remoteSourceLanguage(ctx context.Context) string {
	locale, err := a.normalizeLocale(ctx, a.cfg.SourceLanguage)
	if err != nil {
		return a.cfg.SourceLanguage
	}
	return locale
}

func sortedLocaleKeys(entriesByLocale map[string][]storage.Entry) []string {
	keys := make([]string, 0, len(entriesByLocale))
	for locale := range entriesByLocale {
		keys = append(keys, locale)
	}
	sort.Strings(keys)
	return keys
}

func (a *Adapter) normalizeLocales(ctx context.Context, locales []string) ([]string, localeLookup, error) {
	lookup := localeLookup{
		remoteToLocal: make(map[string]string, len(locales)),
	}
	normalized := make([]string, 0, len(locales))
	seen := make(map[string]struct{}, len(locales))
	for _, locale := range locales {
		remote, err := a.normalizeLocale(ctx, locale)
		if err != nil {
			return nil, localeLookup{}, err
		}
		key := strings.ToLower(strings.TrimSpace(remote))
		if _, ok := seen[key]; !ok {
			normalized = append(normalized, remote)
			seen[key] = struct{}{}
		}
		lookup.remoteToLocal[key] = locale
	}
	return normalized, lookup, nil
}

func (a *Adapter) normalizeLocale(ctx context.Context, locale string) (string, error) {
	trimmed := strings.TrimSpace(locale)
	if trimmed == "" {
		return "", nil
	}
	if mapped, ok := a.configLocaleOverride(trimmed); ok {
		return mapped, nil
	}
	supported, err := a.supportedLanguages(ctx)
	if err != nil {
		return "", err
	}
	for _, candidate := range localeCandidates(trimmed) {
		if mapped, ok := supported[strings.ToLower(candidate)]; ok {
			return mapped, nil
		}
	}
	return "", fmt.Errorf("unsupported POEditor locale %q; add storage.config.localeMap override", trimmed)
}

func (a *Adapter) configLocaleOverride(locale string) (string, bool) {
	if len(a.cfg.LocaleMap) == 0 {
		return "", false
	}
	for key, value := range a.cfg.LocaleMap {
		if strings.EqualFold(strings.TrimSpace(key), strings.TrimSpace(locale)) {
			return strings.TrimSpace(value), true
		}
	}
	return "", false
}

func (a *Adapter) supportedLanguages(ctx context.Context) (map[string]string, error) {
	a.supportedMu.RLock()
	if a.supportedSet != nil {
		supported := a.supportedSet
		a.supportedMu.RUnlock()
		return supported, nil
	}
	a.supportedMu.RUnlock()

	a.supportedMu.Lock()
	defer a.supportedMu.Unlock()
	if a.supportedSet != nil {
		return a.supportedSet, nil
	}

	codes, err := a.client.AvailableLanguages(ctx, a.cfg.APIToken)
	if err != nil {
		return nil, err
	}
	supported := make(map[string]string, len(codes))
	for _, code := range codes {
		trimmed := strings.TrimSpace(code)
		if trimmed == "" {
			continue
		}
		supported[strings.ToLower(trimmed)] = trimmed
	}
	a.supportedSet = supported
	return a.supportedSet, nil
}

type localeLookup struct {
	remoteToLocal map[string]string
}

func (l localeLookup) localForRemote(remote string) string {
	if local, ok := l.remoteToLocal[strings.ToLower(strings.TrimSpace(remote))]; ok {
		return local
	}
	return remote
}

func localeCandidates(locale string) []string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(locale, "_", "-"))
	if trimmed == "" {
		return nil
	}
	candidates := make([]string, 0, 8)
	addCandidate := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		for _, existing := range candidates {
			if strings.EqualFold(existing, value) {
				return
			}
		}
		candidates = append(candidates, value)
	}

	addCandidate(trimmed)
	addCandidate(strings.ToLower(trimmed))
	if base, err := language.Parse(trimmed); err == nil {
		addCandidate(base.String())
		baseTag, _ := base.Base()
		if baseTag.String() != "" && baseTag.String() != "und" {
			addCandidate(baseTag.String())
		}
	}
	if idx := strings.Index(trimmed, "-"); idx > 0 {
		addCandidate(trimmed[:idx])
	}
	return candidates
}
