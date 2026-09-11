package localstore

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/internal/pathguard"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

type JSONStore struct {
	cfg           *config.I18NConfig
	root          string
	localePattern string
	namespace     string
}

func NewJSONStore(cfg *config.I18NConfig) (*JSONStore, error) {
	return NewJSONStoreInRoot(cfg, "")
}

func NewJSONStoreInRoot(cfg *config.I18NConfig, root string) (*JSONStore, error) {
	if cfg == nil {
		return nil, fmt.Errorf("new json store: config is nil")
	}

	localePattern, namespace, err := resolveLocalePattern(cfg.Buckets)
	if err != nil {
		return nil, err
	}

	return &JSONStore{
		cfg:           cfg,
		root:          strings.TrimSpace(root),
		localePattern: localePattern,
		namespace:     namespace,
	}, nil
}

func (s *JSONStore) ReadSnapshot(ctx context.Context, req syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	return s.readSnapshot(ctx, req)
}

func (s *JSONStore) BuildPushSnapshot(ctx context.Context, req syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	return s.readSnapshot(ctx, req)
}

func (s *JSONStore) readSnapshot(_ context.Context, req syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	locales := req.Locales
	if len(locales) == 0 {
		locales = append([]string(nil), s.cfg.Locales.Targets...)
	}

	var entries []storage.Entry
	for _, locale := range locales {
		path, err := s.localePath(locale)
		if err != nil {
			return storage.CatalogSnapshot{}, fmt.Errorf("resolve locale path for %q: %w", locale, err)
		}
		valueMap, err := readLocaleValues(path)
		if err != nil {
			return storage.CatalogSnapshot{}, fmt.Errorf("read locale file %q: %w", path, err)
		}

		metaMap, err := readLocaleMeta(metaPathFor(path))
		if err != nil {
			return storage.CatalogSnapshot{}, fmt.Errorf("read locale metadata %q: %w", metaPathFor(path), err)
		}

		for key, value := range valueMap {
			if !matchesKeyPrefix(key, req.KeyPrefixes) {
				continue
			}
			entry := storage.Entry{
				Key:       key,
				Locale:    locale,
				Value:     value,
				Namespace: s.namespace,
			}
			if meta, ok := metaMap[entryMetaID(key, "")]; ok {
				entry.Provenance = meta.Provenance
				entry.Remote = meta.Remote
			}
			if strings.TrimSpace(entry.Provenance.Origin) == "" {
				entry.Provenance.Origin = storage.OriginUnknown
			}
			entries = append(entries, entry)
		}
	}

	return storage.CatalogSnapshot{Entries: entries}, nil
}

func matchesKeyPrefix(key string, prefixes []string) bool {
	if len(prefixes) == 0 {
		return true
	}
	for _, prefix := range prefixes {
		trimmed := strings.TrimSpace(prefix)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(key, trimmed) {
			return true
		}
	}
	return false
}

func (s *JSONStore) ApplyPull(_ context.Context, plan syncsvc.ApplyPullPlan) (syncsvc.ApplyResult, error) {
	byLocale := make(map[string][]storage.Entry)
	for _, entry := range plan.Creates {
		if err := s.validateWritableLocale(entry.Locale); err != nil {
			return syncsvc.ApplyResult{}, err
		}
		byLocale[entry.Locale] = append(byLocale[entry.Locale], entry)
	}
	for _, entry := range plan.Updates {
		if err := s.validateWritableLocale(entry.Locale); err != nil {
			return syncsvc.ApplyResult{}, err
		}
		byLocale[entry.Locale] = append(byLocale[entry.Locale], entry)
	}

	applied := make([]storage.EntryID, 0)

	for locale, entries := range byLocale {
		path, err := s.localePath(locale)
		if err != nil {
			return syncsvc.ApplyResult{}, fmt.Errorf("resolve locale path for %q: %w", locale, err)
		}
		values, err := readLocaleValues(path)
		if err != nil {
			return syncsvc.ApplyResult{}, fmt.Errorf("read locale file %q before apply: %w", path, err)
		}
		metaPath := metaPathFor(path)
		metaMap, err := readLocaleMeta(metaPath)
		if err != nil {
			return syncsvc.ApplyResult{}, fmt.Errorf("read locale metadata %q before apply: %w", metaPath, err)
		}

		for _, entry := range entries {
			values[entry.Key] = entry.Value
			metaMap[entryMetaID(entry.Key, entry.Context)] = entryMeta{
				Provenance: entry.Provenance,
				Remote:     entry.Remote,
			}
			applied = append(applied, entry.ID())
		}

		if err := writeJSONAtomic(path, values); err != nil {
			return syncsvc.ApplyResult{}, fmt.Errorf("write locale file %q: %w", path, err)
		}
		if err := writeJSONAtomic(metaPath, metaMap); err != nil {
			return syncsvc.ApplyResult{}, fmt.Errorf("write locale metadata %q: %w", metaPath, err)
		}
	}

	return syncsvc.ApplyResult{Applied: applied}, nil
}

func (s *JSONStore) localePath(locale string) (string, error) {
	resolved := pathresolver.ResolveTargetPath(s.localePattern, s.cfg.Locales.Source, locale)
	trimmed := strings.TrimSpace(resolved)
	if trimmed == "" {
		return "", fmt.Errorf("locale path is empty")
	}
	candidate := trimmed
	if !filepath.IsAbs(candidate) {
		if s.root == "" {
			return "", fmt.Errorf("config root is required for relative path %q", trimmed)
		}
		candidate = filepath.Join(s.root, candidate)
	}
	if s.root != "" {
		if err := pathguard.EnsureUnderRoot(s.root, candidate); err != nil {
			return "", err
		}
	}
	return candidate, nil
}

func (s *JSONStore) validateWritableLocale(locale string) error {
	if locale == s.cfg.Locales.Source {
		return nil
	}
	for _, target := range s.cfg.Locales.Targets {
		if locale == target {
			return nil
		}
	}
	return fmt.Errorf("apply pull: remote locale %q is not configured", locale)
}

func resolveLocalePattern(buckets map[string]config.BucketConfig) (string, string, error) {
	if len(buckets) == 0 {
		return "", "", fmt.Errorf("new json store: buckets is required")
	}

	names := make([]string, 0, len(buckets))
	for name := range buckets {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		bucket := buckets[name]
		for _, file := range bucket.Files {
			if strings.TrimSpace(file.To) != "" {
				return file.To, file.From, nil
			}
		}
	}

	return "", "", fmt.Errorf("new json store: buckets.*.files[].to is required")
}

type entryMeta struct {
	Provenance storage.EntryProvenance `json:"provenance,omitempty"`
	Remote     storage.RemoteMeta      `json:"remote,omitempty"`
}

func readLocaleValues(path string) (map[string]string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, err
	}

	var values map[string]string
	if err := json.Unmarshal(content, &values); err != nil {
		return nil, err
	}
	if values == nil {
		values = map[string]string{}
	}
	return values, nil
}

func readLocaleMeta(path string) (map[string]entryMeta, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]entryMeta{}, nil
		}
		return nil, err
	}

	var meta map[string]entryMeta
	if err := json.Unmarshal(content, &meta); err != nil {
		return nil, err
	}
	if meta == nil {
		meta = map[string]entryMeta{}
	}
	return meta, nil
}

func metaPathFor(localePath string) string {
	ext := filepath.Ext(localePath)
	if ext == "" {
		return localePath + ".meta.json"
	}
	base := strings.TrimSuffix(localePath, ext)
	return base + ".meta" + ext
}

func entryMetaID(key, context string) string {
	return key + "\x1f" + context
}

func writeJSONAtomic(path string, v any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	content, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')

	tmp := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, content, 0o644); err != nil {
		return err
	}

	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}

	return nil
}
