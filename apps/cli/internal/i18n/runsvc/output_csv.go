package runsvc

// CSV helpers handle locale-column detection and marshal/parser selection.

import (
	"bytes"
	"encoding/csv"
	"errors"
	"io"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func parseCSVForTargetLocale(content []byte, targetLocale string) (map[string]string, error) {
	locale := strings.TrimSpace(targetLocale)
	if locale != "" {
		hasColumn, err := csvHasColumn(content, locale)
		if err != nil {
			return nil, err
		}
		if hasColumn {
			return (translationfileparser.CSVParser{ValueColumn: locale}).Parse(content)
		}
	}
	return (translationfileparser.CSVParser{}).Parse(content)
}

func marshalCSVTarget(template []byte, values map[string]string, targetLocale string) ([]byte, error) {
	locale := strings.TrimSpace(targetLocale)
	if locale != "" {
		hasColumn, err := csvHasColumn(template, locale)
		if err != nil {
			return nil, err
		}
		if hasColumn {
			return translationfileparser.MarshalCSV(template, values, translationfileparser.CSVParser{ValueColumn: locale})
		}
	}
	return translationfileparser.MarshalCSV(template, values, translationfileparser.CSVParser{})
}

func csvHasColumn(content []byte, column string) (bool, error) {
	normalizedColumn := strings.ToLower(strings.TrimSpace(column))
	if normalizedColumn == "" {
		return false, nil
	}

	reader := csv.NewReader(bytes.NewReader(content))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	headers, err := reader.Read()
	if err != nil {
		if errors.Is(err, io.EOF) {
			return false, nil
		}
		return false, err
	}
	for _, header := range headers {
		normalizedHeader := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(header), "\ufeff"))
		if normalizedHeader == normalizedColumn {
			return true, nil
		}
	}
	return false, nil
}
