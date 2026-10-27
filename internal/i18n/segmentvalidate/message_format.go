package segmentvalidate

import "strings"

// MessageFormat selects which placeholder syntaxes a file uses. It is a
// per-file setting; files without one use MessageFormatAuto.
type MessageFormat string

const (
	// MessageFormatAuto recognizes ICU and mustache/i18next interpolation.
	MessageFormatAuto MessageFormat = "auto"
	// MessageFormatICU treats {{name}} and $t(key) as literal text.
	MessageFormatICU MessageFormat = "icu"
	// MessageFormatI18next skips ICU parsing, so single braces are literal text.
	MessageFormatI18next MessageFormat = "i18next"
)

// ParseMessageFormat maps empty or unknown values to MessageFormatAuto.
func ParseMessageFormat(value string) MessageFormat {
	switch MessageFormat(strings.ToLower(strings.TrimSpace(value))) {
	case MessageFormatICU:
		return MessageFormatICU
	case MessageFormatI18next:
		return MessageFormatI18next
	default:
		return MessageFormatAuto
	}
}

func (f MessageFormat) parsesICU() bool {
	return f != MessageFormatI18next
}

func (f MessageFormat) parsesInterpolations() bool {
	return f != MessageFormatICU
}
