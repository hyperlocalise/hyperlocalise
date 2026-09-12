package lokalise

import (
	"sort"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

// keysPerUpsertRequest is the Lokalise API limit for keys per create/bulk-update request.
var keysPerUpsertRequest = 500

func upsertChunkSize() int {
	if keysPerUpsertRequest <= 0 {
		return 500
	}
	return keysPerUpsertRequest
}

func normalizeLocaleCode(locale string) string {
	locale = strings.TrimSpace(locale)
	return strings.ToLower(strings.ReplaceAll(locale, "-", "_"))
}

func toLokaliseLanguageISO(locale string) string {
	return strings.ReplaceAll(strings.TrimSpace(locale), "-", "_")
}

// matchRequestedLocale returns the requested locale string that matches languageISO, or "".
func matchRequestedLocale(languageISO string, requested []string) string {
	remoteNorm := normalizeLocaleCode(languageISO)
	if remoteNorm == "" {
		return ""
	}
	var fallback string
	for _, req := range requested {
		trimmed := strings.TrimSpace(req)
		if trimmed == "" {
			continue
		}
		if trimmed == languageISO {
			return trimmed
		}
		if normalizeLocaleCode(trimmed) == remoteNorm && fallback == "" {
			fallback = trimmed
		}
	}
	return fallback
}

func resolvePullLocales(req storage.PullRequest, targetLanguages []string) []string {
	if len(req.Locales) > 0 {
		return append([]string(nil), req.Locales...)
	}
	if len(req.EntryIDs) > 0 {
		seen := make(map[string]struct{})
		locales := make([]string, 0, len(req.EntryIDs))
		for _, id := range req.EntryIDs {
			locale := strings.TrimSpace(id.Locale)
			if locale == "" {
				continue
			}
			if _, ok := seen[locale]; ok {
				continue
			}
			seen[locale] = struct{}{}
			locales = append(locales, locale)
		}
		if len(locales) > 0 {
			sort.Strings(locales)
			return locales
		}
	}
	if len(targetLanguages) > 0 {
		return append([]string(nil), targetLanguages...)
	}
	return nil
}

func chunkSlice[T any](items []T, size int) [][]T {
	if len(items) == 0 || size <= 0 {
		return nil
	}
	chunks := make([][]T, 0, (len(items)+size-1)/size)
	for i := 0; i < len(items); i += size {
		end := i + size
		if end > len(items) {
			end = len(items)
		}
		chunks = append(chunks, items[i:end])
	}
	return chunks
}
