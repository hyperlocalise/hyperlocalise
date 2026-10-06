package editor_export

import (
	"regexp"
	"strings"
)

var internalSegmentPlaceholderPattern = regexp.MustCompile("\x1eHL[A-Z]+PH_[A-Z0-9_]+_\\d+\x1f")

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

func stripInternalSegmentPlaceholders(value string) string {
	if value == "" || !strings.Contains(value, "\x1eHL") {
		return value
	}
	return internalSegmentPlaceholderPattern.ReplaceAllString(value, "")
}

func escapeXML(value string) string {
	safe := stripInternalSegmentPlaceholders(value)
	safe = sanitizeInvalidXMLCharacters(safe)
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(safe)
}
