package editor_export

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
)

var csvHeader = []string{
	"key",
	"source_locale",
	"target_locale",
	"source_text",
	"target_text",
	"source_path",
}

func escapeCSVCell(value string) string {
	if strings.ContainsAny(value, "\",\n\r") {
		return "\"" + strings.ReplaceAll(value, "\"", "\"\"") + "\""
	}
	return value
}

// SerializeCSV writes a UTF-8 CSV export matching the web CAT filtered export.
func SerializeCSV(rows []Row) []byte {
	var b strings.Builder
	b.WriteString(strings.Join(csvHeader, ","))
	b.WriteByte('\n')
	for _, row := range rows {
		cells := []string{
			row.Key,
			row.SourceLocale,
			row.TargetLocale,
			row.SourceText,
			row.TargetText,
			row.SourcePath,
		}
		for i, cell := range cells {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(escapeCSVCell(cell))
		}
		b.WriteByte('\n')
	}
	return []byte(b.String())
}

func csvColumnIndex(header []string) map[string]int {
	index := make(map[string]int, len(header))
	for i, name := range header {
		normalized := strings.ToLower(strings.TrimSpace(name))
		if normalized == "" {
			continue
		}
		if _, exists := index[normalized]; !exists {
			index[normalized] = i
		}
	}
	return index
}

func csvCell(record []string, index map[string]int, names ...string) string {
	for _, name := range names {
		column, ok := index[name]
		if !ok || column < 0 || column >= len(record) {
			continue
		}
		return record[column]
	}
	return ""
}

// ParseCSV reads a UTF-8 CSV bilingual export.
func ParseCSV(body []byte) ([]Row, error) {
	reader := csv.NewReader(bytes.NewReader(body))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parse csv: %w", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	index := csvColumnIndex(records[0])
	if _, ok := index["key"]; !ok {
		return nil, fmt.Errorf("parse csv: missing key column")
	}
	rows := make([]Row, 0, len(records)-1)
	for _, record := range records[1:] {
		key := strings.TrimSpace(csvCell(record, index, "key"))
		if key == "" {
			continue
		}
		rows = append(rows, Row{
			Key:          key,
			SourceLocale: strings.TrimSpace(csvCell(record, index, "source_locale")),
			TargetLocale: strings.TrimSpace(csvCell(record, index, "target_locale")),
			SourceText:   csvCell(record, index, "source_text"),
			TargetText:   csvCell(record, index, "target_text"),
			SourcePath:   strings.TrimSpace(csvCell(record, index, "source_path")),
		})
	}
	return rows, nil
}
