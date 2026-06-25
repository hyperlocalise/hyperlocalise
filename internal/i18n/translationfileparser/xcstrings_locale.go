package translationfileparser

import (
	"sort"
	"strings"

	"golang.org/x/text/language"
)

func normalizeXCStringsLocaleTag(tag string) string {
	tag = strings.TrimSpace(strings.ReplaceAll(tag, "_", "-"))
	if tag == "" {
		return ""
	}
	parsed, err := language.Parse(tag)
	if err != nil {
		return strings.ToLower(tag)
	}
	return strings.ToLower(parsed.String())
}

func xcstringsAppleScriptAlias(normalizedTag string) string {
	switch normalizedTag {
	case "zh-cn", "zh-sg":
		return "zh-hans"
	case "zh-tw", "zh-hk", "zh-mo":
		return "zh-hant"
	default:
		return ""
	}
}

func languageSubtag(normalizedTag string) string {
	if normalizedTag == "" {
		return ""
	}
	parsed, err := language.Parse(normalizedTag)
	if err != nil {
		parts := strings.SplitN(normalizedTag, "-", 2)
		return strings.ToLower(parts[0])
	}
	base, _ := parsed.Base()
	return strings.ToLower(base.String())
}

func resolveXCStringsLocalizationKey(requested string, available []string) (string, bool) {
	requested = strings.TrimSpace(requested)
	if requested == "" || len(available) == 0 {
		return "", false
	}

	uniq := make([]string, 0, len(available))
	seen := map[string]struct{}{}
	for _, key := range available {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		uniq = append(uniq, key)
	}
	if len(uniq) == 0 {
		return "", false
	}

	for _, key := range uniq {
		if key == requested {
			return key, true
		}
	}

	reqLower := strings.ToLower(requested)
	var caseInsensitive []string
	for _, key := range uniq {
		if strings.ToLower(key) == reqLower {
			caseInsensitive = append(caseInsensitive, key)
		}
	}
	if len(caseInsensitive) == 1 {
		return caseInsensitive[0], true
	}

	normReq := normalizeXCStringsLocaleTag(requested)
	var normMatches []string
	for _, key := range uniq {
		if normalizeXCStringsLocaleTag(key) == normReq {
			normMatches = append(normMatches, key)
		}
	}
	if len(normMatches) == 1 {
		return normMatches[0], true
	}
	if len(normMatches) > 1 {
		sort.Strings(normMatches)
		return normMatches[0], true
	}

	if alias := xcstringsAppleScriptAlias(normReq); alias != "" {
		for _, key := range uniq {
			if normalizeXCStringsLocaleTag(key) == alias {
				return key, true
			}
		}
	}

	reqLang := languageSubtag(normReq)
	if reqLang == "" {
		return "", false
	}
	var langMatches []string
	for _, key := range uniq {
		if languageSubtag(normalizeXCStringsLocaleTag(key)) == reqLang {
			langMatches = append(langMatches, key)
		}
	}
	if len(langMatches) == 1 {
		return langMatches[0], true
	}
	if len(langMatches) > 1 {
		for _, key := range langMatches {
			if normalizeXCStringsLocaleTag(key) == reqLang {
				return key, true
			}
		}
		sort.Strings(langMatches)
		return langMatches[0], true
	}

	return "", false
}

func collectXCStringsCatalogLocales(stringsNode map[string]any) []string {
	locales := map[string]struct{}{}
	for _, value := range stringsNode {
		entry, ok := value.(map[string]any)
		if !ok {
			continue
		}
		locs, ok, err := xcstringsOptionalObjectField(entry, "localizations")
		if err != nil || !ok {
			continue
		}
		for locName := range locs {
			locName = strings.TrimSpace(locName)
			if locName != "" {
				locales[locName] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(locales))
	for loc := range locales {
		out = append(out, loc)
	}
	return out
}
