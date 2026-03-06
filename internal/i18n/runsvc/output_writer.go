package runsvc

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/translationfileparser"
)

func (s *Service) flushOutputs(staged map[string]stagedOutput, pruneTargets map[string]map[string]struct{}) ([]string, error) {
	targetPaths := make([]string, 0, len(staged)+len(pruneTargets))
	for path := range staged {
		targetPaths = append(targetPaths, path)
	}
	for path := range pruneTargets {
		targetPaths = append(targetPaths, path)
	}
	slices.Sort(targetPaths)
	targetPaths = slices.Compact(targetPaths)

	var warnings []string
	for _, targetPath := range targetPaths {
		targetWarnings, err := s.flushOutputForTarget(targetPath, staged[targetPath], pruneTargets[targetPath])
		if err != nil {
			return nil, err
		}
		warnings = append(warnings, targetWarnings...)
	}
	return warnings, nil
}

func (s *Service) flushOutputForTarget(targetPath string, output stagedOutput, keep map[string]struct{}) ([]string, error) {
	values, err := s.loadExistingTarget(targetPath)
	if err != nil {
		return nil, err
	}
	if keep != nil {
		for key := range values {
			if _, ok := keep[key]; !ok {
				delete(values, key)
			}
		}
	}
	maps.Copy(values, output.entries)

	content, warnings, err := s.marshalTargetFile(targetPath, output.sourcePath, output.targetLocale, values, output.entries, keep)
	if err != nil {
		return nil, err
	}
	if err := s.writeFile(targetPath, content); err != nil {
		return nil, fmt.Errorf("flush outputs: write %q: %w", targetPath, err)
	}
	return warnings, nil
}

func buildPlannedTargetKeySet(planned []Task) map[string]map[string]struct{} {
	keep := map[string]map[string]struct{}{}
	for _, task := range planned {
		bucket := keep[task.TargetPath]
		if bucket == nil {
			bucket = map[string]struct{}{}
			keep[task.TargetPath] = bucket
		}
		bucket[task.EntryKey] = struct{}{}
	}
	return keep
}

func (s *Service) planPruneCandidates(pruneTargets map[string]map[string]struct{}) ([]PruneCandidate, error) {
	candidates := make([]PruneCandidate, 0)
	targetPaths := make([]string, 0, len(pruneTargets))
	for path := range pruneTargets {
		targetPaths = append(targetPaths, path)
	}
	slices.Sort(targetPaths)

	for _, targetPath := range targetPaths {
		existing, err := s.loadExistingTarget(targetPath)
		if err != nil {
			return nil, err
		}
		for _, key := range sortedEntryKeys(existing) {
			if _, ok := pruneTargets[targetPath][key]; !ok {
				candidates = append(candidates, PruneCandidate{TargetPath: targetPath, EntryKey: key})
			}
		}
	}
	return candidates, nil
}

func validatePruneLimit(in Input, candidates int) error {
	if !in.Prune || in.DryRun || in.PruneForce {
		return nil
	}
	limit := in.PruneLimit
	if limit <= 0 {
		limit = defaultPruneLimit
	}
	if candidates <= limit {
		return nil
	}
	return fmt.Errorf("prune safety limit exceeded: %d keys scheduled for deletion (limit %d). rerun with --prune-max-deletions %d or --prune-force", candidates, limit, candidates)
}

func (s *Service) loadExistingTarget(path string) (map[string]string, error) {
	content, err := s.readFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}
	entries, err := s.newParser().Parse(path, content)
	if err != nil {
		if strings.EqualFold(filepath.Ext(path), ".json") {
			// JSON targets may include non-translatable metadata fields (numbers, bools, arrays).
			// Recover string entries instead of failing the whole run.
			recovered, recoverErr := parseJSONEntriesLenient(content)
			if recoverErr == nil {
				return recovered, nil
			}
			// If JSON is malformed, continue with source-template fallback during marshal.
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("flush outputs: parse target file %q: %w", path, err)
	}
	return entries, nil
}

func (s *Service) marshalTargetFile(path, sourcePath, targetLocale string, values map[string]string, stagedEntries map[string]string, pruneKeys map[string]struct{}) ([]byte, []string, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".xlf", ".xlif", ".xliff", ".po", ".md", ".mdx", ".strings", ".stringsdict", ".csv", ".arb":
		return s.marshalTemplateBasedTarget(ext, path, sourcePath, targetLocale, values, stagedEntries)
	case ".json":
		content, err := s.marshalJSONTargetWithFallback(path, sourcePath, values, pruneKeys)
		return content, nil, err
	default:
		return nil, nil, fmt.Errorf("flush outputs: unsupported target file extension %q for %q", ext, path)
	}
}

func (s *Service) marshalTemplateBasedTarget(ext, path, sourcePath, targetLocale string, values map[string]string, stagedEntries map[string]string) ([]byte, []string, error) {
	if ext == ".md" || ext == ".mdx" {
		return s.marshalMarkdownTarget(path, sourcePath, stagedEntries)
	}
	if ext == ".xlf" || ext == ".xlif" || ext == ".xliff" || ext == ".po" || ext == ".strings" || ext == ".stringsdict" || ext == ".arb" {
		content, err := s.marshalSourceTemplateTarget(ext, path, sourcePath, targetLocale, values)
		return content, nil, err
	}

	template, err := s.loadTemplateFallback(path, sourcePath)
	if err != nil {
		return nil, nil, err
	}

	switch ext {
	case ".csv":
		content, err := translationfileparser.MarshalCSV(template, values, translationfileparser.CSVParser{})
		if err != nil {
			return nil, nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil, nil
	default:
		return nil, nil, fmt.Errorf("flush outputs: unsupported target file extension %q for %q", ext, path)
	}
}

func (s *Service) marshalSourceTemplateTarget(ext, path, sourcePath, targetLocale string, values map[string]string) ([]byte, error) {
	sourceTemplate, err := s.readFile(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, err)
	}

	template := sourceTemplate
	targetTemplate, err := s.readFile(path)
	if err == nil {
		targetEntries, parseErr := s.newParser().Parse(path, targetTemplate)
		if parseErr == nil && hasExactKeySet(targetEntries, values) {
			template = targetTemplate
		}
	}

	switch ext {
	case ".xlf", ".xlif", ".xliff":
		content, err := translationfileparser.MarshalXLIFF(template, values, targetLocale)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".po":
		content, err := translationfileparser.MarshalPOFile(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".strings":
		content, err := translationfileparser.MarshalAppleStrings(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".stringsdict":
		content, err := translationfileparser.MarshalAppleStringsdict(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".arb":
		content, err := translationfileparser.MarshalARB(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	default:
		return nil, fmt.Errorf("flush outputs: unsupported target file extension %q for %q", ext, path)
	}
}

func hasExactKeySet(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for key := range a {
		if _, ok := b[key]; !ok {
			return false
		}
	}
	return true
}

func (s *Service) marshalMarkdownTarget(path, sourcePath string, stagedEntries map[string]string) ([]byte, []string, error) {
	sourceTemplate, err := s.readFile(sourcePath)
	if err != nil {
		return nil, nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, err)
	}

	targetTemplate, err := s.readFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			content, diags := translationfileparser.MarshalMarkdownWithDiagnostics(sourceTemplate, stagedEntries)
			return content, markdownRenderWarnings(path, diags), nil
		}
		return nil, nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	content, diags := translationfileparser.MarshalMarkdownWithTargetFallbackDiagnostics(sourceTemplate, targetTemplate, stagedEntries)
	return content, markdownRenderWarnings(path, diags), nil
}

func markdownRenderWarnings(path string, diags translationfileparser.MarkdownRenderDiagnostics) []string {
	if len(diags.SourceFallbackKeys) == 0 {
		return nil
	}
	keys := slices.Clone(diags.SourceFallbackKeys)
	slices.Sort(keys)
	keys = slices.Compact(keys)
	if len(keys) > 3 {
		return []string{fmt.Sprintf("markdown render fell back to source for %d segments in %q due to unrecoverable placeholder corruption (first keys: %s)", len(keys), path, strings.Join(keys[:3], ", "))}
	}
	return []string{fmt.Sprintf("markdown render fell back to source for %d segments in %q due to unrecoverable placeholder corruption (keys: %s)", len(keys), path, strings.Join(keys, ", "))}
}

func marshalJSONTarget(path string, template []byte, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	var payload map[string]any
	if err := json.Unmarshal(template, &payload); err != nil {
		return nil, fmt.Errorf("flush outputs: decode template %q: %w", path, err)
	}
	if payload == nil {
		payload = map[string]any{}
	}

	if isStrictFormatJSTemplate(payload) {
		applyFormatJSTranslations(payload, values)
	} else {
		if pruneKeys != nil {
			pruneNestedJSONStringFields(payload, "", values)
		}
		applyNestedJSONTranslations(payload, values)
	}

	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
	}
	return append(content, '\n'), nil
}

func (s *Service) marshalJSONTargetWithFallback(path, sourcePath string, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	targetTemplate, err := s.readFile(path)
	if err == nil {
		content, marshalErr := marshalJSONTarget(path, targetTemplate, values, pruneKeys)
		if marshalErr == nil {
			return content, nil
		}

		sourceTemplate, srcErr := s.readFile(sourcePath)
		if srcErr != nil {
			return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
		}
		fallbackContent, fallbackErr := marshalJSONTarget(path, sourceTemplate, values, pruneKeys)
		if fallbackErr == nil {
			return fallbackContent, nil
		}
		return nil, marshalErr
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	sourceTemplate, srcErr := s.readFile(sourcePath)
	if srcErr != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
	}
	return marshalJSONTarget(path, sourceTemplate, values, pruneKeys)
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

func applyFormatJSTranslations(payload map[string]any, values map[string]string) {
	for key, raw := range payload {
		if _, keep := values[key]; keep {
			continue
		}
		message, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if _, ok := message["defaultMessage"]; ok {
			delete(payload, key)
		}
	}

	for _, key := range sortedEntryKeys(values) {
		raw, ok := payload[key]
		if !ok {
			payload[key] = map[string]any{"defaultMessage": values[key]}
			continue
		}
		message, ok := raw.(map[string]any)
		if !ok {
			payload[key] = map[string]any{"defaultMessage": values[key]}
			continue
		}
		message["defaultMessage"] = values[key]
	}
}

func applyNestedJSONTranslations(payload map[string]any, values map[string]string) {
	for _, key := range sortedEntryKeys(values) {
		setNestedValue(payload, key, values[key])
	}
}

func pruneNestedJSONStringFields(payload map[string]any, prefix string, allowed map[string]string) {
	for _, key := range sortedEntryKeysMapAny(payload) {
		value := payload[key]
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}
		switch typed := value.(type) {
		case string:
			if _, ok := allowed[fullKey]; !ok {
				delete(payload, key)
			}
		case map[string]any:
			pruneNestedJSONStringFields(typed, fullKey, allowed)
			if len(typed) == 0 {
				delete(payload, key)
			}
		}
	}
}

func parseJSONEntriesLenient(content []byte) (map[string]string, error) {
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		return map[string]string{}, nil
	}

	out := map[string]string{}
	if isStrictFormatJSTemplate(payload) {
		for _, key := range sortedEntryKeysMapAny(payload) {
			message := payload[key].(map[string]any)
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

func collectNestedJSONStrings(out map[string]string, prefix string, payload map[string]any) {
	for _, key := range sortedEntryKeysMapAny(payload) {
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

func sortedEntryKeysMapAny(entries map[string]any) []string {
	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func (s *Service) loadTemplateFallback(targetPath, sourcePath string) ([]byte, error) {
	content, err := s.readFile(targetPath)
	if err == nil {
		return content, nil
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("flush outputs: read target file %q: %w", targetPath, err)
	}
	template, srcErr := s.readFile(sourcePath)
	if srcErr != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
	}
	return template, nil
}

func setNestedValue(payload map[string]any, dottedKey, value string) {
	parts := strings.Split(dottedKey, ".")
	current := payload
	for i, part := range parts {
		if i == len(parts)-1 {
			current[part] = value
			return
		}
		next, ok := current[part]
		if !ok {
			nested := map[string]any{}
			current[part] = nested
			current = nested
			continue
		}
		nested, ok := next.(map[string]any)
		if !ok {
			nested = map[string]any{}
			current[part] = nested
		}
		current = nested
	}
}

func writeBytesAtomic(path string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
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
