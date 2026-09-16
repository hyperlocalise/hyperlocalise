package editor_export

import (
	"strings"
)

// SerializeXLIFF writes an XLIFF 1.2 document for the given rows.
func SerializeXLIFF(rows []Row) []byte {
	sourceLocale := "en"
	targetLocale := "und"
	original := "cat-export"
	if len(rows) > 0 {
		if rows[0].SourceLocale != "" {
			sourceLocale = rows[0].SourceLocale
		}
		if rows[0].TargetLocale != "" {
			targetLocale = rows[0].TargetLocale
		}
		if rows[0].SourcePath != "" {
			original = rows[0].SourcePath
		}
	}

	var units strings.Builder
	for i, row := range rows {
		id := row.Key
		if id == "" {
			id = "unit-" + itoa(i+1)
		}
		units.WriteString("    <trans-unit id=\"")
		units.WriteString(escapeXML(id))
		units.WriteString("\">\n")
		units.WriteString("      <source xml:lang=\"")
		units.WriteString(escapeXML(row.SourceLocale))
		units.WriteString("\">")
		units.WriteString(escapeXML(row.SourceText))
		units.WriteString("</source>\n")
		units.WriteString("      <target xml:lang=\"")
		units.WriteString(escapeXML(row.TargetLocale))
		units.WriteString("\">")
		units.WriteString(escapeXML(row.TargetText))
		units.WriteString("</target>\n")
		units.WriteString("    </trans-unit>\n")
	}

	var doc strings.Builder
	doc.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	doc.WriteString("<xliff version=\"1.2\" xmlns=\"urn:oasis:names:tc:xliff:document:1.2\">\n")
	doc.WriteString("  <file original=\"")
	doc.WriteString(escapeXML(original))
	doc.WriteString("\" source-language=\"")
	doc.WriteString(escapeXML(sourceLocale))
	doc.WriteString("\" target-language=\"")
	doc.WriteString(escapeXML(targetLocale))
	doc.WriteString("\" datatype=\"plaintext\">\n")
	doc.WriteString("    <body>\n")
	doc.WriteString(units.String())
	doc.WriteString("    </body>\n")
	doc.WriteString("  </file>\n")
	doc.WriteString("</xliff>\n")
	return []byte(doc.String())
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
