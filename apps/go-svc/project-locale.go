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

func canonicalizeTargetLocales(raw []string) ([]string, bool) {
	if len(raw) == 0 || len(raw) > maxProjectTargetLocales {
		return nil, false
	}
	normalized := make([]string, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, r := range raw {
		canonical, ok := parseCanonicalLocale(r)
		if !ok {
			return nil, false
		}
		key := strings.ToLower(canonical)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, canonical)
		if len(normalized) > maxProjectTargetLocales {
			return nil, false
		}
	}
	if len(normalized) == 0 {
		return nil, false
	}
	return normalized, true
}

func normalizeProjectTargetLocales(raw []string) ([]string, error) {
	normalized, ok := canonicalizeTargetLocales(raw)
	if !ok {
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

func invalidSourceLocale() error {
	return projectFailure(400, "invalid_source_locale", "Invalid source locale")
}

func invalidTargetLocales() error {
	return projectFailure(400, "invalid_target_locales", "Invalid target locales")
}

func sourceLocaleInTargetsError() error {
	return projectFailure(400, "source_in_targets", "The source locale cannot also be a target locale")
}

type projectLocalePatch struct {
	sourceLocale  *string
	targetLocales *[]string
}

func normalizeProjectLocalePatch(
	existingSourceLocale string,
	existingTargetLocales []string,
	rawSourceLocale *string,
	rawTargetLocales *[]string,
) (projectLocalePatch, error) {
	patchingSource := rawSourceLocale != nil
	patchingTargets := rawTargetLocales != nil

	if patchingSource && patchingTargets {
		sourceLocale, ok := parseCanonicalLocale(*rawSourceLocale)
		if !ok {
			return projectLocalePatch{}, invalidSourceLocale()
		}
		targetLocales, ok := canonicalizeTargetLocales(*rawTargetLocales)
		if !ok {
			return projectLocalePatch{}, invalidTargetLocales()
		}
		if sourceLocaleInTargets(sourceLocale, targetLocales) {
			return projectLocalePatch{}, sourceLocaleInTargetsError()
		}
		return projectLocalePatch{sourceLocale: &sourceLocale, targetLocales: &targetLocales}, nil
	}

	resolvedSource := existingSourceLocale
	resolvedTargets := existingTargetLocales
	var patch projectLocalePatch

	if patchingSource {
		canonical, ok := parseCanonicalLocale(*rawSourceLocale)
		if !ok {
			return projectLocalePatch{}, invalidSourceLocale()
		}
		resolvedSource = canonical
		patch.sourceLocale = &canonical
	}

	if patchingTargets {
		normalized, ok := canonicalizeTargetLocales(*rawTargetLocales)
		if !ok {
			return projectLocalePatch{}, invalidTargetLocales()
		}
		resolvedTargets = normalized
		patch.targetLocales = &normalized
	}

	if resolvedSource != "" && len(resolvedTargets) > 0 && sourceLocaleInTargets(resolvedSource, resolvedTargets) {
		return projectLocalePatch{}, sourceLocaleInTargetsError()
	}

	return patch, nil
}
