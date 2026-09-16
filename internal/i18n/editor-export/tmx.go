package editor_export

import (
	"strings"
)

// SerializeTMX writes a TMX 1.4 document for the given rows.
func SerializeTMX(rows []Row) []byte {
	sourceLocale := "en"
	if len(rows) > 0 && rows[0].SourceLocale != "" {
		sourceLocale = rows[0].SourceLocale
	}

	var body strings.Builder
	for _, row := range rows {
		tuid := escapeXML(row.Key)
		body.WriteString("  <tu tuid=\"")
		body.WriteString(tuid)
		body.WriteString("\">\n")
		body.WriteString("    <tuv xml:lang=\"")
		body.WriteString(escapeXML(row.SourceLocale))
		body.WriteString("\"><seg>")
		body.WriteString(escapeXML(row.SourceText))
		body.WriteString("</seg></tuv>\n")
		body.WriteString("    <tuv xml:lang=\"")
		body.WriteString(escapeXML(row.TargetLocale))
		body.WriteString("\"><seg>")
		body.WriteString(escapeXML(row.TargetText))
		body.WriteString("</seg></tuv>\n")
		body.WriteString("  </tu>\n")
	}

	var doc strings.Builder
	doc.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	doc.WriteString("<tmx version=\"1.4\">\n")
	doc.WriteString("  <header creationtool=\"Hyperlocalise\" creationtoolversion=\"1\" segtype=\"sentence\" o-tmf=\"Hyperlocalise\" adminlang=\"en\" srclang=\"")
	doc.WriteString(escapeXML(sourceLocale))
	doc.WriteString("\" datatype=\"plaintext\"/>\n")
	doc.WriteString("  <body>\n")
	doc.WriteString(body.String())
	doc.WriteString("  </body>\n")
	doc.WriteString("</tmx>\n")
	return []byte(doc.String())
}
