package editor_export

import (
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
