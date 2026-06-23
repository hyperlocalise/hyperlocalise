package translationfileparser

import (
	"encoding/xml"
	"errors"
	"io"
	"strings"
	"unicode"
	"unicode/utf8"
)

var (
	xmlTextEscaper = strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
	)
	xmlAttrEscaper = strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
)

func escapeXMLText(s string) string {
	return xmlTextEscaper.Replace(s)
}

func escapeXMLAttr(s string) string {
	return xmlAttrEscaper.Replace(s)
}

func containsXMLTextEntityReference(s string) bool {
	for searchFrom := 0; searchFrom < len(s); {
		ampOffset := strings.IndexByte(s[searchFrom:], '&')
		if ampOffset < 0 {
			return false
		}
		entityStart := searchFrom + ampOffset + 1
		semiOffset := strings.IndexByte(s[entityStart:], ';')
		if semiOffset < 0 {
			return false
		}
		entity := s[entityStart : entityStart+semiOffset]
		if isXMLTextEntityReference(entity) {
			return true
		}
		searchFrom = entityStart
	}
	return false
}

func isXMLTextEntityReference(entity string) bool {
	switch entity {
	case "amp", "lt", "gt", "apos", "quot":
		return true
	}
	if strings.HasPrefix(entity, "#x") || strings.HasPrefix(entity, "#X") {
		return isXMLHexCharacterReference(entity[2:])
	}
	if strings.HasPrefix(entity, "#") {
		return isXMLDecimalCharacterReference(entity[1:])
	}
	return false
}

func isXMLDecimalCharacterReference(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func isAllXMLWhitespace(data []byte) bool {
	for i := 0; i < len(data); {
		b := data[i]
		if b < 0x80 {
			if b != ' ' && b != '\t' && b != '\n' && b != '\r' {
				return false
			}
			i++
			continue
		}
		r, size := utf8.DecodeRune(data[i:])
		if !unicode.IsSpace(r) {
			return false
		}
		i += size
	}
	return true
}

func isXMLWhitespace(ch byte) bool {
	switch ch {
	case ' ', '\t', '\n', '\r':
		return true
	default:
		return false
	}
}

func isEOFError(err error) bool {
	return errors.Is(err, io.EOF)
}

func attrValue(attrs []xml.Attr, name string) string {
	for _, attr := range attrs {
		if attr.Name.Local == name {
			return strings.TrimSpace(attr.Value)
		}
	}
	return ""
}

func isXMLHexCharacterReference(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if (s[i] < '0' || s[i] > '9') && (s[i] < 'a' || s[i] > 'f') && (s[i] < 'A' || s[i] > 'F') {
			return false
		}
	}
	return true
}
