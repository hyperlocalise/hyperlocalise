package main

import "strings"

// Crowdin uses bare language IDs for several glossary languages while native
// glossaries store BCP-47 locales. These defaults are only used when the
// configured glossary contains the corresponding regional locale.
var crowdinDefaultLocales = map[string]string{
	"ar": "ar-SA",
	"de": "de-DE",
	"en": "en-US",
	"es": "es-ES",
	"fa": "fa-IR",
	"fr": "fr-FR",
	"he": "he-IL",
	"hi": "hi-IN",
	"id": "id-ID",
	"it": "it-IT",
	"ja": "ja-JP",
	"ko": "ko-KR",
	"nl": "nl-NL",
	"pl": "pl-PL",
	"pt": "pt-BR",
	"ro": "ro-RO",
	"ru": "ru-RU",
	"sv": "sv-SE",
	"th": "th-TH",
	"tr": "tr-TR",
	"uk": "uk-UA",
	"vi": "vi-VN",
	"zh": "zh-CN",
}

func normalizeGlossaryLocale(value string) string {
	return strings.ReplaceAll(strings.TrimSpace(value), "_", "-")
}

func localeKey(value string) string {
	return strings.ToLower(normalizeGlossaryLocale(value))
}

func localeLanguage(value string) string {
	value = localeKey(value)
	if index := strings.IndexByte(value, '-'); index >= 0 {
		return value[:index]
	}
	return value
}

func mappedImportLocale(rawLocale string, configuredLocales []string, explicitMapping map[string]string) (string, bool) {
	rawLocale = normalizeGlossaryLocale(rawLocale)
	if rawLocale == "" {
		return "", false
	}

	configured := make(map[string]string, len(configuredLocales))
	for _, locale := range configuredLocales {
		normalized := normalizeGlossaryLocale(locale)
		if normalized != "" {
			configured[localeKey(normalized)] = normalized
		}
	}

	for key, value := range explicitMapping {
		if localeKey(key) != localeKey(rawLocale) {
			continue
		}
		mapped := normalizeGlossaryLocale(value)
		if configuredLocale, ok := configured[localeKey(mapped)]; ok {
			return configuredLocale, true
		}
		return mapped, true
	}

	if configuredLocale, ok := configured[localeKey(rawLocale)]; ok {
		return configuredLocale, false
	}
	// Regional locale tags are explicit. Do not silently replace a configured
	// locale with another region; automatic fallback is for bare language IDs.
	if strings.Contains(rawLocale, "-") {
		return rawLocale, false
	}

	language := localeLanguage(rawLocale)
	candidates := make([]string, 0, len(configured))
	for _, locale := range configured {
		if localeLanguage(locale) == language {
			candidates = append(candidates, locale)
		}
	}
	if len(candidates) == 1 {
		return candidates[0], true
	}
	if len(candidates) > 1 {
		return rawLocale, false
	}
	if preferred, ok := crowdinDefaultLocales[language]; ok {
		return preferred, true
	}
	return rawLocale, false
}

func containsConfiguredLocale(locale string, configuredLocales []string) bool {
	key := localeKey(locale)
	for _, configured := range configuredLocales {
		if localeKey(configured) == key {
			return true
		}
	}
	return false
}
