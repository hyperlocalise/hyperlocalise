package translationfileparser

import (
	"bytes"
	"encoding/csv"
	"errors"
	"io"
	"strings"
)

// ParseCSVLocale extracts entries from a multi-column CSV when the header row
// contains a column matching the requested locale.
func ParseCSVLocale(content []byte, locale string) (map[string]string, error) {
	locale = strings.TrimSpace(locale)
	if locale != "" {
		hasColumn, err := CSVHasLocaleColumn(content, locale)
		if err != nil {
			return nil, err
		}
		if hasColumn {
			return (CSVParser{ValueColumn: locale}).Parse(content)
		}
	}
	return (CSVParser{}).Parse(content)
}

// CSVHasLocaleColumn reports whether the CSV header row contains a column
// matching locale (case-insensitive, BOM-safe).
func CSVHasLocaleColumn(content []byte, column string) (bool, error) {
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
