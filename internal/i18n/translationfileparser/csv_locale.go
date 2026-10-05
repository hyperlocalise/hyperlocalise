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
	return parseDelimitedLocale(content, locale, 0)
}

// ParseTSVLocale extracts entries from a tab-separated catalog, including
// locale-column layouts.
func ParseTSVLocale(content []byte, locale string) (map[string]string, error) {
	return parseDelimitedLocale(content, locale, '\t')
}

func parseDelimitedLocale(content []byte, locale string, delimiter rune) (map[string]string, error) {
	locale = strings.TrimSpace(locale)
	parser := CSVParser{Delimiter: delimiter}
	if locale != "" {
		hasColumn, err := delimitedHasLocaleColumn(content, locale, delimiter)
		if err != nil {
			return nil, err
		}
		if hasColumn {
			parser.ValueColumn = locale
			return parser.Parse(content)
		}
	}
	return parser.Parse(content)
}

// CSVHasLocaleColumn reports whether the CSV header row contains a column
// matching locale (case-insensitive, BOM-safe).
func CSVHasLocaleColumn(content []byte, column string) (bool, error) {
	return delimitedHasLocaleColumn(content, column, 0)
}

// TSVHasLocaleColumn reports whether the TSV header row contains a column
// matching locale (case-insensitive, BOM-safe).
func TSVHasLocaleColumn(content []byte, column string) (bool, error) {
	return delimitedHasLocaleColumn(content, column, '\t')
}

func delimitedHasLocaleColumn(content []byte, column string, delimiter rune) (bool, error) {
	normalizedColumn := strings.ToLower(strings.TrimSpace(column))
	if normalizedColumn == "" {
		return false, nil
	}

	reader := csv.NewReader(bytes.NewReader(content))
	if delimiter != 0 {
		reader.Comma = delimiter
	}
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
