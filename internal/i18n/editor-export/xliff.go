package editor_export

import (
	"strconv"
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

	var doc strings.Builder
	doc.Grow(300 + len(rows)*250)

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

	for i, row := range rows {
		id := row.Key
		if id == "" {
			id = "unit-" + strconv.Itoa(i+1)
		}
		doc.WriteString("    <trans-unit id=\"")
		doc.WriteString(escapeXML(id))
		doc.WriteString("\">\n")
		doc.WriteString("      <source xml:lang=\"")
		doc.WriteString(escapeXML(row.SourceLocale))
		doc.WriteString("\">")
		doc.WriteString(escapeXML(row.SourceText))
		doc.WriteString("</source>\n")
		doc.WriteString("      <target xml:lang=\"")
		doc.WriteString(escapeXML(row.TargetLocale))
		doc.WriteString("\">")
		doc.WriteString(escapeXML(row.TargetText))
		doc.WriteString("</target>\n")
		doc.WriteString("    </trans-unit>\n")
	}

	doc.WriteString("    </body>\n")
	doc.WriteString("  </file>\n")
	doc.WriteString("</xliff>\n")
	return []byte(doc.String())
}
