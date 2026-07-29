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
	return isValidXMLCharacterReferenceDigits(s, 10)
}

// isXMLCharacterRange reports whether r is in the XML 1.0 Char production,
// matching encoding/xml's isInCharacterRange.
func isXMLCharacterRange(r rune) bool {
	return r == 0x09 ||
		r == 0x0A ||
		r == 0x0D ||
		(r >= 0x20 && r <= 0xD7FF) ||
		(r >= 0xE000 && r <= 0xFFFD) ||
		(r >= 0x10000 && r <= 0x10FFFF)
}

func isValidXMLCharacterReferenceDigits(s string, base int) bool {
	if s == "" {
		return false
	}
	var n uint64
	for i := 0; i < len(s); i++ {
		c := s[i]
		var v uint64
		switch {
		case c >= '0' && c <= '9':
			v = uint64(c - '0')
		case base == 16 && c >= 'a' && c <= 'f':
			v = uint64(c-'a') + 10
		case base == 16 && c >= 'A' && c <= 'F':
			v = uint64(c-'A') + 10
		default:
			return false
		}
		if v >= uint64(base) {
			return false
		}
		if n > (uint64(unicode.MaxRune)-v)/uint64(base) {
			return false
		}
		n = n*uint64(base) + v
	}
	if n > uint64(unicode.MaxRune) {
		return false
	}
	r := rune(n)
	// encoding/xml converts via string(rune(n)); invalid runes (e.g. surrogates)
	// become U+FFFD, which is in the XML character range.
	if !utf8.ValidRune(r) {
		r = utf8.RuneError
	}
	return isXMLCharacterRange(r)
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
	return isValidXMLCharacterReferenceDigits(s, 16)
}
