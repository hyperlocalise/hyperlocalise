package editor_export

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
)

type xliffFileGroup struct {
	original     string
	sourceLocale string
	targetLocale string
	rows         []Row
}

func xliffFileOriginal(path string) string {
	if path == "" {
		return "cat-export"
	}
	return path
}

func groupXLIFFRows(rows []Row) []xliffFileGroup {
	if len(rows) == 0 {
		return []xliffFileGroup{{
			original:     "cat-export",
			sourceLocale: "en",
			targetLocale: "und",
		}}
	}

	groups := make([]xliffFileGroup, 0, 1)
	index := make(map[string]int, 1)
	for _, row := range rows {
		original := xliffFileOriginal(row.SourcePath)
		if i, ok := index[original]; ok {
			groups[i].rows = append(groups[i].rows, row)
			continue
		}
		sourceLocale := row.SourceLocale
		if sourceLocale == "" {
			sourceLocale = "en"
		}
		targetLocale := row.TargetLocale
		if targetLocale == "" {
			targetLocale = "und"
		}
		index[original] = len(groups)
		groups = append(groups, xliffFileGroup{
			original:     original,
			sourceLocale: sourceLocale,
			targetLocale: targetLocale,
			rows:         []Row{row},
		})
	}
	return groups
}

func writeXLIFFTransUnits(doc *strings.Builder, rows []Row, startIndex int) {
	for i, row := range rows {
		id := row.Key
		if id == "" {
			id = "unit-" + strconv.Itoa(startIndex+i+1)
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
}

// SerializeXLIFF writes an XLIFF 1.2 document for the given rows.
// Rows from different source files are grouped into separate <file> elements
// so all-files exports can round-trip.
func SerializeXLIFF(rows []Row) []byte {
	groups := groupXLIFFRows(rows)

	var doc strings.Builder
	doc.Grow(XMLDocumentOverheadBytes + len(rows)*XMLTranslationUnitBytes)

	doc.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	doc.WriteString("<xliff version=\"1.2\" xmlns=\"urn:oasis:names:tc:xliff:document:1.2\">\n")
	unitIndex := 0
	for _, group := range groups {
		doc.WriteString("  <file original=\"")
		doc.WriteString(escapeXML(group.original))
		doc.WriteString("\" source-language=\"")
		doc.WriteString(escapeXML(group.sourceLocale))
		doc.WriteString("\" target-language=\"")
		doc.WriteString(escapeXML(group.targetLocale))
		doc.WriteString("\" datatype=\"plaintext\">\n")
		doc.WriteString("    <body>\n")
		writeXLIFFTransUnits(&doc, group.rows, unitIndex)
		unitIndex += len(group.rows)
		doc.WriteString("    </body>\n")
		doc.WriteString("  </file>\n")
	}
	doc.WriteString("</xliff>\n")
	return []byte(doc.String())
}

type xliffParseState struct {
	original     string
	sourceLocale string
	targetLocale string
	current      Row
	hasUnit      bool
}

func (state *xliffParseState) flush(rows *[]Row) {
	if !state.hasUnit || strings.TrimSpace(state.current.Key) == "" {
		state.hasUnit = false
		state.current = Row{}
		return
	}
	if state.current.SourcePath == "" {
		state.current.SourcePath = state.original
	}
	if state.current.SourceLocale == "" {
		state.current.SourceLocale = state.sourceLocale
	}
	if state.current.TargetLocale == "" {
		state.current.TargetLocale = state.targetLocale
	}
	*rows = append(*rows, state.current)
	state.hasUnit = false
	state.current = Row{}
}

func (state *xliffParseState) startUnit(id string) {
	state.hasUnit = true
	state.current = Row{
		Key:          id,
		SourcePath:   state.original,
		SourceLocale: state.sourceLocale,
		TargetLocale: state.targetLocale,
	}
}

// ParseXLIFF reads an XLIFF 1.2 bilingual export.
func ParseXLIFF(body []byte) ([]Row, error) {
	decoder := xml.NewDecoder(bytes.NewReader(body))
	var rows []Row
	var state xliffParseState
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse xliff: %w", err)
		}
		switch t := token.(type) {
		case xml.StartElement:
			switch xmlLocalName(t.Name) {
			case "file":
				state.flush(&rows)
				original := strings.TrimSpace(xmlAttr(t, "original"))
				if original == "cat-export" {
					original = ""
				}
				state.original = original
				state.sourceLocale = xmlAttr(t, "source-language")
				state.targetLocale = xmlAttr(t, "target-language")
			case "trans-unit", "unit":
				state.flush(&rows)
				state.startUnit(xmlAttr(t, "id"))
			case "source":
				if lang := xmlAttr(t, "lang"); lang != "" && state.hasUnit {
					state.current.SourceLocale = lang
				}
				inner, innerErr := readXMLElementInner(decoder)
				if innerErr != nil {
					return nil, fmt.Errorf("parse xliff: %w", innerErr)
				}
				if state.hasUnit {
					state.current.SourceText = inner
				}
			case "target":
				if lang := xmlAttr(t, "lang"); lang != "" && state.hasUnit {
					state.current.TargetLocale = lang
				}
				inner, innerErr := readXMLElementInner(decoder)
				if innerErr != nil {
					return nil, fmt.Errorf("parse xliff: %w", innerErr)
				}
				if state.hasUnit {
					state.current.TargetText = inner
				}
			}
		case xml.EndElement:
			name := xmlLocalName(t.Name)
			if name == "trans-unit" || name == "unit" || name == "file" {
				state.flush(&rows)
			}
		}
	}
	state.flush(&rows)
	return rows, nil
}
