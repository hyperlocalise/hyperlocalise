package cmd

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func flattenExtractMessages(messages []extractMessage) error {
	for i := range messages {
		flattened, err := flattenExtractICUMessage(messages[i].DefaultMessage)
		if err != nil {
			return fmt.Errorf("message %q: %w", messages[i].ID, err)
		}
		messages[i].DefaultMessage = flattened
	}

	return nil
}

func flattenExtractICUMessage(message string) (string, error) {
	elements, err := icuparser.Parse(message, nil)
	if err != nil {
		return "", err
	}
	if !extractICUHasSelector(elements) {
		return message, nil
	}
	if extractICUHasUnsupportedFormatter(message) {
		return message, nil
	}

	return renderExtractICUElements(flattenExtractICUElements(elements), false), nil
}

func flattenExtractICUElements(elements []icuparser.Element) []icuparser.Element {
	for index, element := range elements {
		switch typed := element.(type) {
		case icuparser.SelectElement:
			return []icuparser.Element{flattenExtractICUSelect(typed, elements[:index], elements[index+1:])}
		case icuparser.PluralElement:
			return []icuparser.Element{flattenExtractICUPlural(typed, elements[:index], elements[index+1:])}
		}
	}

	out := make([]icuparser.Element, 0, len(elements))
	for _, element := range elements {
		out = append(out, flattenExtractICUElement(element))
	}

	return out
}

func flattenExtractICUElement(element icuparser.Element) icuparser.Element {
	switch typed := element.(type) {
	case icuparser.TagElement:
		typed.Children = flattenExtractICUElements(typed.Children)
		return typed
	default:
		return element
	}
}

func flattenExtractICUSelect(
	element icuparser.SelectElement,
	prefix []icuparser.Element,
	suffix []icuparser.Element,
) icuparser.SelectElement {
	options := make([]icuparser.SelectOption, 0, len(element.Options))
	for _, option := range element.Options {
		value := appendExtractICUElements(prefix, option.Value, suffix)
		options = append(options, icuparser.SelectOption{
			Selector: option.Selector,
			Value:    flattenExtractICUElements(value),
		})
	}
	element.Options = options

	return element
}

func flattenExtractICUPlural(
	element icuparser.PluralElement,
	prefix []icuparser.Element,
	suffix []icuparser.Element,
) icuparser.PluralElement {
	options := make([]icuparser.PluralOption, 0, len(element.Options))
	for _, option := range element.Options {
		value := appendExtractICUElements(prefix, option.Value, suffix)
		options = append(options, icuparser.PluralOption{
			Selector: option.Selector,
			Value:    flattenExtractICUElements(value),
		})
	}
	element.Options = options

	return element
}

func appendExtractICUElements(parts ...[]icuparser.Element) []icuparser.Element {
	total := 0
	for _, part := range parts {
		total += len(part)
	}
	out := make([]icuparser.Element, 0, total)
	for _, part := range parts {
		out = append(out, part...)
	}

	return out
}

func extractICUHasSelector(elements []icuparser.Element) bool {
	for _, element := range elements {
		switch typed := element.(type) {
		case icuparser.SelectElement:
			return true
		case icuparser.PluralElement:
			return true
		case icuparser.TagElement:
			if extractICUHasSelector(typed.Children) {
				return true
			}
		}
	}

	return false
}

func renderExtractICUElements(elements []icuparser.Element, inPlural bool) string {
	var b strings.Builder
	for _, element := range elements {
		renderExtractICUElement(&b, element, inPlural)
	}

	return b.String()
}

func renderExtractICUElement(b *strings.Builder, element icuparser.Element, inPlural bool) {
	switch typed := element.(type) {
	case icuparser.LiteralElement:
		writeExtractICULiteral(b, typed.Value, inPlural)
	case icuparser.ArgumentElement:
		writeExtractICUArgument(b, typed.Value)
	case icuparser.NumberElement:
		writeExtractICUTypedArgument(b, typed.Value, "number", typed.Style)
	case icuparser.DateElement:
		writeExtractICUTypedArgument(b, typed.Value, "date", typed.Style)
	case icuparser.TimeElement:
		writeExtractICUTypedArgument(b, typed.Value, "time", typed.Style)
	case icuparser.PoundElement:
		b.WriteByte('#')
	case icuparser.SelectElement:
		writeExtractICUSelect(b, typed)
	case icuparser.PluralElement:
		writeExtractICUPlural(b, typed)
	case icuparser.TagElement:
		writeExtractICUTag(b, typed, inPlural)
	}
}

func writeExtractICULiteral(b *strings.Builder, value string, inPlural bool) {
	for _, r := range value {
		switch r {
		case '\'':
			b.WriteString("''")
		case '{':
			b.WriteString("'{'")
		case '}':
			b.WriteString("'}'")
		case '#':
			if inPlural {
				b.WriteString("'#'")
				continue
			}
			b.WriteRune(r)
		default:
			b.WriteRune(r)
		}
	}
}

func writeExtractICUArgument(b *strings.Builder, value string) {
	b.WriteByte('{')
	b.WriteString(value)
	b.WriteByte('}')
}

func writeExtractICUTypedArgument(b *strings.Builder, value, kind, style string) {
	b.WriteByte('{')
	b.WriteString(value)
	b.WriteByte(',')
	b.WriteString(kind)
	if style != "" {
		b.WriteByte(',')
		b.WriteString(style)
	}
	b.WriteByte('}')
}

func writeExtractICUSelect(b *strings.Builder, element icuparser.SelectElement) {
	b.WriteByte('{')
	b.WriteString(element.Value)
	b.WriteString(",select,")
	for _, option := range element.Options {
		b.WriteString(option.Selector)
		b.WriteByte('{')
		b.WriteString(renderExtractICUElements(option.Value, false))
		b.WriteByte('}')
	}
	b.WriteByte('}')
}

func writeExtractICUPlural(b *strings.Builder, element icuparser.PluralElement) {
	b.WriteByte('{')
	b.WriteString(element.Value)
	if element.Type() == icuparser.TypeSelectOrdinal {
		b.WriteString(",selectordinal,")
	} else {
		b.WriteString(",plural,")
	}
	if element.Offset != 0 {
		b.WriteString("offset:")
		b.WriteString(strconv.Itoa(element.Offset))
		if len(element.Options) > 0 {
			b.WriteByte(' ')
		}
	}
	for _, option := range element.Options {
		b.WriteString(option.Selector)
		b.WriteByte('{')
		b.WriteString(renderExtractICUElements(option.Value, true))
		b.WriteByte('}')
	}
	b.WriteByte('}')
}

func writeExtractICUTag(b *strings.Builder, element icuparser.TagElement, inPlural bool) {
	b.WriteByte('<')
	b.WriteString(element.Value)
	if element.SelfClosing {
		b.WriteString("/>")
		return
	}
	b.WriteByte('>')
	b.WriteString(renderExtractICUElements(element.Children, inPlural))
	b.WriteString("</")
	b.WriteString(element.Value)
	b.WriteByte('>')
}

func extractICUHasUnsupportedFormatter(message string) bool {
	for i := 0; i < len(message); {
		switch message[i] {
		case '\'':
			i = skipExtractICUQuoted(message, i)
		case '{':
			kind, _, ok := readExtractICUArgumentKind(message, i)
			if ok && kind != "" && !isSupportedExtractICUArgumentKind(kind) {
				return true
			}
			i++
		default:
			i++
		}
	}

	return false
}

func skipExtractICUQuoted(message string, index int) int {
	if index+1 < len(message) && message[index+1] == '\'' {
		return index + 2
	}
	for i := index + 1; i < len(message); i++ {
		if message[i] == '\'' {
			return i + 1
		}
	}

	return len(message)
}

func readExtractICUArgumentKind(message string, open int) (string, int, bool) {
	i := open + 1
	for i < len(message) && unicodeSpace(message[i]) {
		i++
	}
	for i < len(message) && isIdentifierPart(message[i]) {
		i++
	}
	for i < len(message) && unicodeSpace(message[i]) {
		i++
	}
	if i >= len(message) || message[i] == '}' {
		return "", findExtractICUArgumentEnd(message, open), true
	}
	if message[i] != ',' {
		return "", i, false
	}
	i++
	for i < len(message) && unicodeSpace(message[i]) {
		i++
	}
	start := i
	for i < len(message) && isIdentifierPart(message[i]) {
		i++
	}
	if start == i {
		return "", i, false
	}

	return strings.ToLower(message[start:i]), findExtractICUArgumentEnd(message, open), true
}

func findExtractICUArgumentEnd(message string, open int) int {
	depth := 0
	for i := open; i < len(message); i++ {
		switch message[i] {
		case '\'':
			i = skipExtractICUQuoted(message, i) - 1
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i + 1
			}
		}
	}

	return len(message)
}

func isSupportedExtractICUArgumentKind(kind string) bool {
	switch kind {
	case "date", "number", "plural", "select", "selectordinal", "time":
		return true
	default:
		return false
	}
}

func unicodeSpace(ch byte) bool {
	switch ch {
	case ' ', '\t', '\n', '\r', '\f':
		return true
	default:
		return false
	}
}
