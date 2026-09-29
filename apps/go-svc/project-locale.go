package main

import (
	"strings"

	"golang.org/x/text/language"
)

const maxProjectTargetLocales = 50

func parseCanonicalLocale(raw string) (string, bool) {
	locale := strings.ReplaceAll(trimDictionaryInput(raw), "_", "-")
	if locale == "" || utf16Length(locale) > 50 {
		return "", false
	}
	tag, err := language.Parse(locale)
	if err != nil {
		return "", false
	}
	return tag.String(), true
}

func normalizeProjectTargetLocales(raw []string) ([]string, error) {
	if len(raw) == 0 || len(raw) > maxProjectTargetLocales {
		return nil, invalidProjectPayload()
	}
	normalized := make([]string, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, r := range raw {
		canonical, ok := parseCanonicalLocale(r)
		if !ok {
			return nil, invalidProjectPayload()
		}
		key := strings.ToLower(canonical)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, canonical)
		if len(normalized) > maxProjectTargetLocales {
			return nil, invalidProjectPayload()
		}
	}
	if len(normalized) == 0 {
		return nil, invalidProjectPayload()
	}
	return normalized, nil
}

func sourceLocaleInTargets(sourceLocale string, targetLocales []string) bool {
	source := strings.ToLower(sourceLocale)
	for _, t := range targetLocales {
		if strings.ToLower(t) == source {
			return true
		}
	}
	return false
}
