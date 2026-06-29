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
	locale := strings.TrimSpace(targetLocale)
	if locale != "" {
		hasColumn, err := translationfileparser.CSVHasLocaleColumn(template, locale)
		if err != nil {
			return nil, err
		}
		if hasColumn {
			return translationfileparser.MarshalCSV(template, values, translationfileparser.CSVParser{ValueColumn: locale})
		}
	}
	return translationfileparser.MarshalCSV(template, values, translationfileparser.CSVParser{})
}
