package runsvc

// CSV helpers handle locale-column detection and marshal/parser selection.

import (
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func parseCSVForTargetLocale(content []byte, targetLocale string) (map[string]string, error) {
	return translationfileparser.ParseCSVLocale(content, targetLocale)
}

func marshalCSVTarget(template []byte, values map[string]string, targetLocale string) ([]byte, error) {
	return marshalDelimitedTarget(template, values, targetLocale, 0)
}

func marshalTSVTarget(template []byte, values map[string]string, targetLocale string) ([]byte, error) {
	return marshalDelimitedTarget(template, values, targetLocale, '\t')
}

func marshalDelimitedTarget(template []byte, values map[string]string, targetLocale string, delimiter rune) ([]byte, error) {
	locale := strings.TrimSpace(targetLocale)
	parser := translationfileparser.CSVParser{Delimiter: delimiter}
	if locale != "" {
		hasColumn, err := delimitedHasLocaleColumn(template, locale, delimiter)
		if err != nil {
			return nil, err
		}
		if hasColumn {
			parser.ValueColumn = locale
			return translationfileparser.MarshalCSV(template, values, parser)
		}
	}
	return translationfileparser.MarshalCSV(template, values, parser)
}

func delimitedHasLocaleColumn(template []byte, locale string, delimiter rune) (bool, error) {
	if delimiter == '\t' {
		return translationfileparser.TSVHasLocaleColumn(template, locale)
	}
	return translationfileparser.CSVHasLocaleColumn(template, locale)
}
