package localstore

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/config"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/pathresolver"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/syncsvc"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/tidwall/jsonc"
)

type JSONStore struct {
	cfg                *config.I18NConfig
	mappings           []fileMapping
	mappingByNamespace map[string]fileMapping
}

type fileMapping struct {
	SourcePattern string
	SourcePath    string
	TargetPattern string
	Namespace     string
	SourceEntries map[string]string
	EntryContext  map[string]string
}

func NewJSONStore(cfg *config.I18NConfig) (*JSONStore, error) {
	if cfg == nil {
		return nil, fmt.Errorf("new json store: config is nil")
	}

	mappings, err := buildFileMappings(cfg)
	if err != nil {
		return nil, err
	}

	mappingByNamespace := make(map[string]fileMapping, len(mappings))
	for _, mapping := range mappings {
		mappingByNamespace[mapping.Namespace] = mapping
	}

	return &JSONStore{
		cfg:                cfg,
		mappings:           mappings,
		mappingByNamespace: mappingByNamespace,
	}, nil
}

func (s *JSONStore) ReadSnapshot(ctx context.Context, req syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	return s.readSnapshot(ctx, req)
}

func (s *JSONStore) BuildPushSnapshot(ctx context.Context, req syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	snapshot, err := s.readSnapshot(ctx, req)
	if err != nil {
		return storage.CatalogSnapshot{}, err
	}
	if s.cfg.Storage == nil || !strings.EqualFold(strings.TrimSpace(s.cfg.Storage.Adapter), "poeditor") {
		return snapshot, nil
	}
	if !containsLocale(req.Locales, s.cfg.Locales.Source) {
		return snapshot, nil
	}

	selectedMappings, err := s.selectedMappings(req.SourcePaths)
	if err != nil {
		return storage.CatalogSnapshot{}, err
	}
	for _, mapping := range selectedMappings {
		for key, value := range mapping.SourceEntries {
			snapshot.Entries = append(snapshot.Entries, storage.Entry{
				Key:       key,
				Context:   mapping.EntryContext[key],
				Locale:    s.cfg.Locales.Source,
				Value:     value,
				Namespace: mapping.Namespace,
				Provenance: storage.EntryProvenance{
					Origin: storage.OriginHuman,
					State:  storage.StateCurated,
				},
			})
		}
	}
	return snapshot, nil
}

func containsLocale(locales []string, want string) bool {
	want = strings.TrimSpace(want)
	for _, locale := range locales {
		if strings.TrimSpace(locale) == want {
			return true
		}
	}
	return false
}

func (s *JSONStore) ResolveScope(req syncsvc.LocalReadRequest) (syncsvc.Scope, error) {
	selectedMappings, err := s.selectedMappings(req.SourcePaths)
	if err != nil {
		return syncsvc.Scope{}, err
	}
	locales := s.selectedLocales(req.Locales)
	scope := syncsvc.Scope{
		Entries: make(map[storage.EntryID]syncsvc.ScopedEntry),
	}

	for _, mapping := range selectedMappings {
		for key, context := range mapping.EntryContext {
			for _, locale := range locales {
				scope.Entries[storage.EntryID{
					Key:     key,
					Context: context,
					Locale:  locale,
				}] = syncsvc.ScopedEntry{Namespace: mapping.Namespace}
			}
		}
	}

	return scope, nil
}

func (s *JSONStore) readSnapshot(_ context.Context, req syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	locales := s.selectedLocales(req.Locales)
	selectedMappings, err := s.selectedMappings(req.SourcePaths)
	if err != nil {
		return storage.CatalogSnapshot{}, err
	}

	var entries []storage.Entry
	for _, mapping := range selectedMappings {
		for _, locale := range locales {
			path, err := mapping.targetPath(s.cfg.Locales.Source, locale)
			if err != nil {
				return storage.CatalogSnapshot{}, err
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
				context := mapping.EntryContext[key]
				entry := storage.Entry{
					Key:       key,
					Context:   context,
					Locale:    locale,
					Value:     value,
					Namespace: mapping.Namespace,
				}
				if meta, ok := metaMap[entryMetaID(key, context)]; ok {
					entry.Provenance = meta.Provenance
					entry.Remote = meta.Remote
				}
				if strings.TrimSpace(entry.Provenance.Origin) == "" {
					entry.Provenance.Origin = storage.OriginUnknown
				}
				entries = append(entries, entry)
			}
		}
	}

	return storage.CatalogSnapshot{Entries: entries}, nil
}

func (s *JSONStore) ApplyPull(_ context.Context, plan syncsvc.ApplyPullPlan) (syncsvc.ApplyResult, error) {
	byLocale := make(map[string][]storage.Entry)
	for _, entry := range plan.Creates {
		byLocale[entry.Locale] = append(byLocale[entry.Locale], entry)
	}
	for _, entry := range plan.Updates {
		byLocale[entry.Locale] = append(byLocale[entry.Locale], entry)
	}

	applied := make([]storage.EntryID, 0)

	byTargetPath := make(map[string][]storage.Entry)
	for locale, localeEntries := range byLocale {
		for _, entry := range localeEntries {
			path, err := s.targetPathForEntry(locale, entry)
			if err != nil {
				return syncsvc.ApplyResult{}, err
			}
			byTargetPath[path] = append(byTargetPath[path], entry)
		}
	}

	for path, entries := range byTargetPath {
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

func (s *JSONStore) selectedLocales(locales []string) []string {
	if len(locales) == 0 {
		return append([]string(nil), s.cfg.Locales.Targets...)
	}
	return append([]string(nil), locales...)
}

func (s *JSONStore) selectedMappings(sourcePaths []string) ([]fileMapping, error) {
	if len(sourcePaths) == 0 {
		return append([]fileMapping(nil), s.mappings...), nil
	}

	requested := make(map[string]struct{}, len(sourcePaths))
	for _, path := range sourcePaths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			return nil, fmt.Errorf("sync file value must not be empty")
		}
		requested[filepath.Clean(trimmed)] = struct{}{}
	}

	selected := make([]fileMapping, 0, len(requested))
	for _, mapping := range s.mappings {
		if _, ok := requested[filepath.Clean(mapping.SourcePath)]; ok {
			selected = append(selected, mapping)
			delete(requested, filepath.Clean(mapping.SourcePath))
		}
	}
	if len(requested) > 0 {
		unmatched := make([]string, 0, len(requested))
		for path := range requested {
			unmatched = append(unmatched, path)
		}
		sort.Strings(unmatched)
		if len(unmatched) == 1 {
			return nil, fmt.Errorf("unknown sync source file %q", unmatched[0])
		}
		return nil, fmt.Errorf("unknown sync source files: %s", strings.Join(unmatched, ", "))
	}

	return selected, nil
}

func (s *JSONStore) targetPathForEntry(locale string, entry storage.Entry) (string, error) {
	namespace := strings.TrimSpace(entry.Namespace)
	if namespace == "" {
		if len(s.mappings) == 1 {
			return s.mappings[0].targetPath(s.cfg.Locales.Source, locale)
		}
		return "", fmt.Errorf("apply pull entry %s has no namespace", entry.ID())
	}
	mapping, ok := s.mappingByNamespace[namespace]
	if !ok {
		return "", fmt.Errorf("apply pull entry %s references unknown namespace %q", entry.ID(), namespace)
	}
	return mapping.targetPath(s.cfg.Locales.Source, locale)
}

func (m fileMapping) targetPath(sourceLocale, locale string) (string, error) {
	resolvedPattern := pathresolver.ResolveTargetPath(m.TargetPattern, sourceLocale, locale)
	return resolveTargetPath(m.SourcePattern, resolvedPattern, m.SourcePath)
}

func buildFileMappings(cfg *config.I18NConfig) ([]fileMapping, error) {
	parser := translationfileparser.NewDefaultStrategy()
	mappings := make([]fileMapping, 0)

	bucketNames := make([]string, 0, len(cfg.Buckets))
	for name := range cfg.Buckets {
		bucketNames = append(bucketNames, name)
	}
	sort.Strings(bucketNames)

	for _, bucketName := range bucketNames {
		bucket := cfg.Buckets[bucketName]
		for _, file := range bucket.Files {
			sourcePattern := pathresolver.ResolveSourcePath(file.From, cfg.Locales.Source)
			sourcePaths, err := resolveSourcePaths(sourcePattern)
			if err != nil {
				return nil, fmt.Errorf("new json store: resolve source paths for %q: %w", sourcePattern, err)
			}
			if len(sourcePaths) == 0 {
				return nil, fmt.Errorf("new json store: source pattern %q matched no files", sourcePattern)
			}
			for _, sourcePath := range sourcePaths {
				sourceEntries, entryContext, err := readSourceEntries(parser, sourcePath)
				if err != nil {
					return nil, err
				}
				mappings = append(mappings, fileMapping{
					SourcePattern: sourcePattern,
					SourcePath:    filepath.Clean(sourcePath),
					TargetPattern: file.To,
					Namespace:     filepath.Clean(sourcePath),
					SourceEntries: sourceEntries,
					EntryContext:  entryContext,
				})
			}
		}
	}

	return mappings, nil
}

func readSourceEntries(parser *translationfileparser.Strategy, sourcePath string) (map[string]string, map[string]string, error) {
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return nil, nil, fmt.Errorf("new json store: read source file %q: %w", sourcePath, err)
	}
	entries, entryContext, err := parser.ParseWithContext(sourcePath, content)
	if err != nil {
		return nil, nil, fmt.Errorf("new json store: parse source file %q: %w", sourcePath, err)
	}
	if entries == nil {
		entries = map[string]string{}
	}
	if entryContext == nil {
		entryContext = map[string]string{}
	}
	return entries, entryContext, nil
}

func resolveSourcePaths(sourcePattern string) ([]string, error) {
	if !strings.ContainsAny(sourcePattern, "*?[") {
		return []string{sourcePattern}, nil
	}
	if !strings.Contains(sourcePattern, "**") {
		matches, err := filepath.Glob(sourcePattern)
		if err != nil {
			return nil, err
		}
		sort.Strings(matches)
		return matches, nil
	}

	normalizedPattern := filepath.ToSlash(sourcePattern)
	re, err := globToRegex(normalizedPattern)
	if err != nil {
		return nil, err
	}

	baseDir := baseDirForDoublestar(sourcePattern)
	matches := make([]string, 0)
	err = filepath.WalkDir(baseDir, func(candidate string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if re.MatchString(filepath.ToSlash(candidate)) {
			matches = append(matches, candidate)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Strings(matches)
	return matches, nil
}

func resolveTargetPath(sourcePattern, targetPattern, sourcePath string) (string, error) {
	if !strings.ContainsAny(sourcePattern, "*?[") {
		return targetPattern, nil
	}
	if !strings.ContainsAny(targetPattern, "*?[") {
		return "", fmt.Errorf("target pattern %q must include glob tokens when source pattern %q includes globs", targetPattern, sourcePattern)
	}
	sourceBase := globBaseDir(sourcePattern)
	targetBase := globBaseDir(targetPattern)
	relative, err := filepath.Rel(sourceBase, sourcePath)
	if err != nil {
		return "", err
	}
	parentPrefix := ".." + string(filepath.Separator)
	if relative == ".." || strings.HasPrefix(relative, parentPrefix) {
		return "", fmt.Errorf("source path %q escapes source base %q", sourcePath, sourceBase)
	}
	return filepath.Join(targetBase, relative), nil
}

func baseDirForDoublestar(pattern string) string {
	normalized := filepath.ToSlash(pattern)
	idx := strings.Index(normalized, "**")
	if idx == -1 {
		return filepath.Dir(pattern)
	}
	prefix := strings.TrimSuffix(normalized[:idx], "/")
	if prefix == "" {
		return "."
	}
	return filepath.FromSlash(prefix)
}

func globBaseDir(pattern string) string {
	idx := strings.IndexAny(filepath.ToSlash(pattern), "*?[")
	if idx == -1 {
		return filepath.Dir(pattern)
	}
	prefix := filepath.ToSlash(pattern)[:idx]
	prefix = strings.TrimSuffix(prefix, "/")
	if prefix == "" {
		return "."
	}
	return filepath.FromSlash(prefix)
}

func globToRegex(pattern string) (*regexp.Regexp, error) {
	var b strings.Builder
	b.WriteString("^")
	for i := 0; i < len(pattern); {
		switch pattern[i] {
		case '*':
			if i+1 < len(pattern) && pattern[i+1] == '*' {
				if i+2 < len(pattern) && pattern[i+2] == '/' {
					b.WriteString("(?:.*/)?")
					i += 3
					continue
				}
				b.WriteString(".*")
				i += 2
				continue
			}
			b.WriteString("[^/]*")
		case '?':
			b.WriteString("[^/]")
		default:
			b.WriteString(regexp.QuoteMeta(pattern[i : i+1]))
		}
		i++
	}
	b.WriteString("$")
	return regexp.Compile(b.String())
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

	parser := translationfileparser.NewDefaultStrategy()
	values, err := parser.Parse(path, content)
	if err != nil {
		if ext := strings.ToLower(filepath.Ext(path)); ext == ".json" || ext == ".jsonc" {
			recovered, recoverErr := parseJSONEntriesLenient(path, content)
			if recoverErr == nil {
				return recovered, nil
			}
		}
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

func parseJSONEntriesLenient(path string, content []byte) (map[string]string, error) {
	decoded := content
	if strings.EqualFold(filepath.Ext(path), ".jsonc") {
		decoded = jsonc.ToJSON(content)
	}

	var payload map[string]any
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		return map[string]string{}, nil
	}

	out := map[string]string{}
	if isStrictFormatJSTemplate(payload) {
		for _, key := range sortedMapKeysAny(payload) {
			message, ok := payload[key].(map[string]any)
			if !ok {
				continue
			}
			raw, ok := message["defaultMessage"].(string)
			if ok {
				out[key] = raw
			}
		}
		return out, nil
	}
	collectNestedJSONStrings(out, "", payload)
	return out, nil
}

func isStrictFormatJSTemplate(payload map[string]any) bool {
	if len(payload) == 0 {
		return false
	}
	for _, raw := range payload {
		message, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		defaultMessage, ok := message["defaultMessage"]
		if !ok {
			return false
		}
		if _, ok := defaultMessage.(string); !ok {
			return false
		}
	}
	return true
}

func collectNestedJSONStrings(out map[string]string, prefix string, payload map[string]any) {
	for _, key := range sortedMapKeysAny(payload) {
		value := payload[key]
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}
		switch typed := value.(type) {
		case string:
			out[fullKey] = typed
		case map[string]any:
			collectNestedJSONStrings(out, fullKey, typed)
		}
	}
}

func sortedMapKeysAny(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
