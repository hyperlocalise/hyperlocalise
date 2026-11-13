package editor_export

import (
	"encoding/xml"
	"io"
	"regexp"
	"strings"
	"unicode/utf8"
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

const (
	// XMLDocumentOverheadBytes covers the XML declaration, format wrappers,
	// and closing tags in TMX and XLIFF documents.
	XMLDocumentOverheadBytes = 300

	// XMLTranslationUnitBytes covers one unit's tags plus typical key,
	// locale, source, and target text.
	XMLTranslationUnitBytes = 250
)

var internalSegmentPlaceholderPattern = regexp.MustCompile("\x1eHL[A-Z]+PH_[A-Z0-9_]+_\\d+\x1f")

var xmlReplacer = strings.NewReplacer(
	"&", "&amp;",
	"<", "&lt;",
	">", "&gt;",
	"\"", "&quot;",
	"'", "&apos;",
)

func isInvalidXMLCharacter(r rune) bool {
	if r == 0x9 || r == 0xA || r == 0xD {
		return false
	}
	if r >= 0x20 && r != 0xFFFE && r != 0xFFFF {
		return false
	}
	return true
}

func sanitizeInvalidXMLCharacters(value string) string {
	if value == "" {
		return value
	}
	hasInvalid := false
	for _, r := range value {
		if isInvalidXMLCharacter(r) {
			hasInvalid = true
			break
		}
	}
	if !hasInvalid && utf8.ValidString(value) {
		return value
	}

	var builder strings.Builder
	builder.Grow(len(value))
	for _, r := range value {
		if isInvalidXMLCharacter(r) {
			continue
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

func stripInternalSegmentPlaceholders(value string) string {
	if value == "" || !strings.Contains(value, "\x1eHL") {
		return value
	}
	return internalSegmentPlaceholderPattern.ReplaceAllString(value, "")
}

func stripBOM(body []byte) []byte {
	if len(body) >= 3 && body[0] == utf8BOM[0] && body[1] == utf8BOM[1] && body[2] == utf8BOM[2] {
		return body[3:]
	}
	return body
}

func xmlLocalName(name xml.Name) string {
	return strings.ToLower(name.Local)
}

func xmlAttr(start xml.StartElement, local string) string {
	want := strings.ToLower(local)
	for _, attr := range start.Attr {
		if strings.ToLower(attr.Name.Local) == want {
			return attr.Value
		}
	}
	return ""
}

func writeXMLAttributes(builder *strings.Builder, start xml.StartElement) {
	for _, attr := range start.Attr {
		builder.WriteByte(' ')
		if attr.Name.Space == "xmlns" {
			builder.WriteString("xmlns:")
			builder.WriteString(attr.Name.Local)
		} else if attr.Name.Local == "xmlns" && attr.Name.Space == "" {
			builder.WriteString("xmlns")
		} else if attr.Name.Space == "xml" || attr.Name.Space == "http://www.w3.org/XML/1998/namespace" {
			builder.WriteString("xml:")
			builder.WriteString(attr.Name.Local)
		} else {
			builder.WriteString(attr.Name.Local)
		}
		builder.WriteString(`="`)
		builder.WriteString(escapeXML(attr.Value))
		builder.WriteString(`"`)
	}
}

func writeXMLStart(builder *strings.Builder, start xml.StartElement, selfClosing bool) {
	builder.WriteByte('<')
	builder.WriteString(start.Name.Local)
	writeXMLAttributes(builder, start)
	if selfClosing {
		builder.WriteString("/>")
		return
	}
	builder.WriteByte('>')
}

type xmlStartFrame struct {
	start   xml.StartElement
	written bool
}

func flushXMLOpenStarts(builder *strings.Builder, stack []xmlStartFrame) {
	for i := range stack {
		if stack[i].written {
			continue
		}
		writeXMLStart(builder, stack[i].start, false)
		stack[i].written = true
	}
}

// readXMLElementInner consumes tokens until the current element's end tag and
// returns mixed content as CAT plain text: character data stays unescaped, and
// nested inline tags are serialized so repaired <ph>/<g> markup round-trips.
func readXMLElementInner(decoder *xml.Decoder) (string, error) {
	var builder strings.Builder
	var stack []xmlStartFrame
	depth := 1
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				return builder.String(), io.ErrUnexpectedEOF
			}
			return "", err
		}
		switch t := token.(type) {
		case xml.StartElement:
			depth++
			stack = append(stack, xmlStartFrame{start: t})
		case xml.EndElement:
			depth--
			if depth == 0 {
				continue
			}
			if len(stack) == 0 {
				continue
			}
			frame := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			flushXMLOpenStarts(&builder, stack)
			if !frame.written {
				writeXMLStart(&builder, frame.start, true)
				continue
			}
			builder.WriteString("</")
			builder.WriteString(t.Name.Local)
			builder.WriteByte('>')
		case xml.CharData:
			if len(t) == 0 {
				continue
			}
			flushXMLOpenStarts(&builder, stack)
			builder.Write(t)
		}
	}
	return builder.String(), nil
}

func escapeXML(value string) string {
	safe := stripInternalSegmentPlaceholders(value)
	safe = sanitizeInvalidXMLCharacters(safe)
	// Performance optimization: xmlReplacer is pre-constructed at package level
	// to avoid rebuilding the replacer trie on every invocation.
	return xmlReplacer.Replace(safe)
}
