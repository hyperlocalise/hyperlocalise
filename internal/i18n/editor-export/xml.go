package editor_export

import "strings"

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

func escapeXML(value string) string {
	safe := sanitizeInvalidXMLCharacters(value)
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(safe)
}
