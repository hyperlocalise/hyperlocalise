package translationfileparser

import (
	"regexp"
	"strings"
)

// Multilingual workbook headers follow the column auto-detection rules of
// Smartcat's MultilingualExcel_v2 parser: only the first row is scanned,
// matching is case-insensitive, and every run of characters outside a-z and
// 0-9 collapses into a single "-" unless the header is a known language name.
// The web app mirrors these rules in src/lib/translation/xlsx/xlsx-columns.ts;
// keep both in sync.

type xlsxColumnRole int

const (
	xlsxColumnNone xlsxColumnRole = iota
	xlsxColumnKey
	xlsxColumnComment
	xlsxColumnMaxLength
)

var (
	xlsxHeaderSeparatorPattern = regexp.MustCompile(`[^a-z0-9]+`)
	xlsxLocaleSlugPattern      = regexp.MustCompile(`^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$`)
)

var xlsxRoleHeaders = map[string]xlsxColumnRole{
	"key":              xlsxColumnKey,
	"id":               xlsxColumnKey,
	"context":          xlsxColumnKey,
	"string-id":        xlsxColumnKey,
	"string-key":       xlsxColumnKey,
	"comment":          xlsxColumnComment,
	"comments":         xlsxColumnComment,
	"note":             xlsxColumnComment,
	"notes":            xlsxColumnComment,
	"description":      xlsxColumnComment,
	"length-limit":     xlsxColumnMaxLength,
	"string-length":    xlsxColumnMaxLength,
	"length":           xlsxColumnMaxLength,
	"limit":            xlsxColumnMaxLength,
	"max-length":       xlsxColumnMaxLength,
	"maxlength":        xlsxColumnMaxLength,
	"character-limit":  xlsxColumnMaxLength,
	"char-limit":       xlsxColumnMaxLength,
	"max-length-chars": xlsxColumnMaxLength,
}

// xlsxLanguageNames maps slugged English language names to locale slugs.
var xlsxLanguageNames = map[string]string{
	"afrikaans":                  "af",
	"albanian":                   "sq",
	"amharic":                    "am",
	"arabic":                     "ar",
	"armenian":                   "hy",
	"azerbaijani":                "az",
	"basque":                     "eu",
	"belarusian":                 "be",
	"bengali":                    "bn",
	"bosnian":                    "bs",
	"bulgarian":                  "bg",
	"catalan":                    "ca",
	"chinese":                    "zh",
	"chinese-simplified":         "zh-hans",
	"simplified-chinese":         "zh-hans",
	"chinese-traditional":        "zh-hant",
	"traditional-chinese":        "zh-hant",
	"croatian":                   "hr",
	"czech":                      "cs",
	"danish":                     "da",
	"dutch":                      "nl",
	"english":                    "en",
	"english-us":                 "en-us",
	"english-united-states":      "en-us",
	"american-english":           "en-us",
	"english-uk":                 "en-gb",
	"english-united-kingdom":     "en-gb",
	"british-english":            "en-gb",
	"estonian":                   "et",
	"filipino":                   "fil",
	"finnish":                    "fi",
	"french":                     "fr",
	"french-france":              "fr-fr",
	"french-canada":              "fr-ca",
	"canadian-french":            "fr-ca",
	"galician":                   "gl",
	"georgian":                   "ka",
	"german":                     "de",
	"greek":                      "el",
	"gujarati":                   "gu",
	"hebrew":                     "he",
	"hindi":                      "hi",
	"hungarian":                  "hu",
	"icelandic":                  "is",
	"indonesian":                 "id",
	"irish":                      "ga",
	"italian":                    "it",
	"japanese":                   "ja",
	"kannada":                    "kn",
	"kazakh":                     "kk",
	"khmer":                      "km",
	"korean":                     "ko",
	"lao":                        "lo",
	"latvian":                    "lv",
	"lithuanian":                 "lt",
	"macedonian":                 "mk",
	"malay":                      "ms",
	"malayalam":                  "ml",
	"maltese":                    "mt",
	"marathi":                    "mr",
	"mongolian":                  "mn",
	"burmese":                    "my",
	"nepali":                     "ne",
	"norwegian":                  "no",
	"norwegian-bokmal":           "nb",
	"norwegian-bokm-l":           "nb",
	"norwegian-nynorsk":          "nn",
	"persian":                    "fa",
	"farsi":                      "fa",
	"polish":                     "pl",
	"portuguese":                 "pt",
	"portuguese-brazil":          "pt-br",
	"brazilian-portuguese":       "pt-br",
	"portuguese-portugal":        "pt-pt",
	"punjabi":                    "pa",
	"romanian":                   "ro",
	"russian":                    "ru",
	"serbian":                    "sr",
	"sinhala":                    "si",
	"slovak":                     "sk",
	"slovenian":                  "sl",
	"spanish":                    "es",
	"spanish-spain":              "es-es",
	"spanish-mexico":             "es-mx",
	"spanish-latin-america":      "es-419",
	"latin-american-spanish":     "es-419",
	"swahili":                    "sw",
	"swedish":                    "sv",
	"tagalog":                    "tl",
	"tamil":                      "ta",
	"telugu":                     "te",
	"thai":                       "th",
	"turkish":                    "tr",
	"ukrainian":                  "uk",
	"urdu":                       "ur",
	"uzbek":                      "uz",
	"vietnamese":                 "vi",
	"welsh":                      "cy",
	"zulu":                       "zu",
	"chinese-simplified-china":   "zh-hans",
	"chinese-traditional-taiwan": "zh-hant",
}

// xlsxLocaleAliases folds region-based Chinese tags onto their script tags so
// "zh-CN" matches a "Chinese (Simplified)" column.
var xlsxLocaleAliases = map[string]string{
	"zh-cn": "zh-hans",
	"zh-sg": "zh-hans",
	"zh-tw": "zh-hant",
	"zh-hk": "zh-hant",
	"zh-mo": "zh-hant",
}

func xlsxHeaderSlug(header string) string {
	clean := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(header, "\ufeff")))
	clean = xlsxHeaderSeparatorPattern.ReplaceAllString(clean, "-")
	return strings.Trim(clean, "-")
}

func xlsxHeaderRole(header string) xlsxColumnRole {
	return xlsxRoleHeaders[xlsxHeaderSlug(header)]
}

func xlsxCanonicalLocale(slug string) string {
	if alias, ok := xlsxLocaleAliases[slug]; ok {
		return alias
	}
	return slug
}

// xlsxHeaderLocale returns the locale slug a header names, or "" when the
// header is not a language column.
func xlsxHeaderLocale(header string) string {
	slug := xlsxHeaderSlug(header)
	if slug == "" {
		return ""
	}
	if tag, ok := xlsxLanguageNames[slug]; ok {
		return tag
	}
	if xlsxLocaleSlugPattern.MatchString(slug) {
		return xlsxCanonicalLocale(slug)
	}
	return ""
}

func xlsxLocaleBase(slug string) string {
	base, _, _ := strings.Cut(slug, "-")
	return base
}

// xlsxLocaleMatchScore ranks how well a header locale names the wanted
// locale: 3 for the same tag, 2 when the header names only the language, and
// 1 when the header is more specific than the wanted tag.
func xlsxLocaleMatchScore(headerLocale, wantLocale string) int {
	if headerLocale == "" || wantLocale == "" {
		return 0
	}
	switch {
	case headerLocale == wantLocale:
		return 3
	case headerLocale == xlsxLocaleBase(wantLocale):
		return 2
	case xlsxLocaleBase(headerLocale) == wantLocale:
		return 1
	default:
		return 0
	}
}

type xlsxHeaderColumns struct {
	key       int
	comment   int
	maxLength int
	headers   []string
}

// resolveXLSXHeaderColumns reads role columns from the first row. Column
// indexes are zero-based; -1 means the column is absent.
func resolveXLSXHeaderColumns(headers []string) xlsxHeaderColumns {
	columns := xlsxHeaderColumns{key: -1, comment: -1, maxLength: -1, headers: headers}
	for index, header := range headers {
		switch xlsxHeaderRole(header) {
		case xlsxColumnKey:
			if columns.key < 0 {
				columns.key = index
			}
		case xlsxColumnComment:
			if columns.comment < 0 {
				columns.comment = index
			}
		case xlsxColumnMaxLength:
			if columns.maxLength < 0 {
				columns.maxLength = index
			}
		}
	}
	return columns
}

// localeColumn returns the best header column for locale, skipping role
// columns and any excluded column. It returns -1 when no column matches.
func (c xlsxHeaderColumns) localeColumn(locale string, exclude ...int) int {
	want := xlsxCanonicalLocale(xlsxHeaderSlug(locale))
	if want == "" {
		return -1
	}
	best, bestScore := -1, 0
	for index, header := range c.headers {
		if xlsxHeaderRole(header) != xlsxColumnNone || containsInt(exclude, index) {
			continue
		}
		score := xlsxLocaleMatchScore(xlsxHeaderLocale(header), want)
		if score > bestScore {
			best, bestScore = index, score
		}
	}
	return best
}

func containsInt(values []int, needle int) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
