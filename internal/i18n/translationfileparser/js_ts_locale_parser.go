package translationfileparser

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

// JSTSLocaleModuleParser parses JavaScript and TypeScript locale modules.
//
// Supported module shapes are intentionally conservative:
//   - export default { ... }
//   - export const messages = { ... }
//   - module.exports = { ... }
//   - const messages = { ... }; export default messages
//
// Values must be static string literals or nested object/array literals containing
// static string literals. Dynamic values, computed keys, spreads, and interpolated
// template literals return clear errors instead of being skipped silently.
type JSTSLocaleModuleParser struct{}

// JSTSLocaleModuleExts are the file extensions supported by JSTSLocaleModuleParser.
var JSTSLocaleModuleExts = []string{".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"}

type jstsLocaleDocument struct {
	template string
	entries  []jstsLocaleEntry
	context  map[string]string
}

type jstsLocaleEntry struct {
	key          string
	sourceValue  string
	valueLiteral string
	valueStart   int
	valueEnd     int
	quote        byte
}

type jstsExportObject struct {
	start int
	end   int
}

type jstsObjectProperty struct {
	key        string
	valueStart int
	valueEnd   int
}

type jstsFormatJSProperty struct {
	prop       jstsObjectProperty
	childProps []jstsObjectProperty
}

type jstsStringLiteral struct {
	decoded string
	raw     string
	start   int
	end     int
	quote   byte
}

func (p JSTSLocaleModuleParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p JSTSLocaleModuleParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseJSTSLocaleDocument(content)
	if err != nil {
		return nil, nil, err
	}
	out := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		out[entry.key] = entry.sourceValue
	}
	if len(doc.context) == 0 {
		return out, nil, nil
	}
	return out, doc.context, nil
}

// MarshalJSTSLocaleModule replaces static locale string literal values in the
// original module while preserving comments, export syntax, ordering, and other
// unrelated module text.
func MarshalJSTSLocaleModule(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseJSTSLocaleDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values)
}

func (d jstsLocaleDocument) render(values map[string]string) ([]byte, error) {
	if len(d.entries) == 0 {
		return []byte(d.template), nil
	}

	entries := append([]jstsLocaleEntry(nil), d.entries...)
	sort.Slice(entries, func(i, j int) bool { return entries[i].valueStart < entries[j].valueStart })

	var b strings.Builder
	cursor := 0
	for _, entry := range entries {
		if entry.valueStart < cursor {
			return nil, fmt.Errorf("js/ts locale module render: overlapping replacement for key %q", entry.key)
		}
		if entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			return nil, fmt.Errorf("js/ts locale module render: invalid replacement span for key %q", entry.key)
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			b.WriteString(encodeJSTSStringLiteral(translated, entry.quote))
		} else {
			b.WriteString(entry.valueLiteral)
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String()), nil
}

func parseJSTSLocaleDocument(content []byte) (jstsLocaleDocument, error) {
	text := string(content)
	doc := jstsLocaleDocument{template: text}

	exportObject, err := findJSTSLocaleExportObject(text)
	if err != nil {
		return doc, err
	}

	entries, context, err := parseJSTSLocaleEntries(text, exportObject.start, exportObject.end)
	if err != nil {
		return doc, err
	}
	doc.entries = entries
	doc.context = context
	return doc, nil
}

func findJSTSLocaleExportObject(src string) (jstsExportObject, error) {
	var exported []jstsExportObject
	var defaultIdentifier string
	localObjects := map[string]jstsExportObject{}

	depth := 0
	for i := 0; i < len(src); {
		if next, ok := skipJSTSIgnoredToken(src, i); ok {
			i = next
			continue
		}

		ch := src[i]
		if ch == '{' || ch == '[' || ch == '(' {
			depth++
			i++
			continue
		}
		if ch == '}' || ch == ']' || ch == ')' {
			if depth > 0 {
				depth--
			}
			i++
			continue
		}
		if depth != 0 {
			i++
			continue
		}

		if hasJSTSKeywordAt(src, i, "export") {
			next, found, err := parseJSTSExport(src, i, &exported, &defaultIdentifier)
			if err != nil {
				return jstsExportObject{}, err
			}
			if found {
				i = next
				continue
			}
		}

		if hasJSTSKeywordAt(src, i, "module") {
			next, found, err := parseJSTSModuleExports(src, i, &exported)
			if err != nil {
				return jstsExportObject{}, err
			}
			if found {
				i = next
				continue
			}
		}

		if hasJSTSKeywordAt(src, i, "exports") {
			next, found, err := parseJSTSExportsDefault(src, i, &exported)
			if err != nil {
				return jstsExportObject{}, err
			}
			if found {
				i = next
				continue
			}
		}

		if hasJSTSVariableKeywordAt(src, i) {
			next, found, name, object, err := parseJSTSVariableObject(src, i)
			if err != nil {
				return jstsExportObject{}, err
			}
			if found {
				localObjects[name] = object
				i = next
				continue
			}
			if next > i {
				i = next
				continue
			}
		}

		i++
	}

	if defaultIdentifier != "" {
		object, ok := localObjects[defaultIdentifier]
		if !ok {
			return jstsExportObject{}, fmt.Errorf("js/ts locale module: export default %s references unsupported or missing object literal", defaultIdentifier)
		}
		exported = append(exported, object)
	}

	if len(exported) == 0 {
		return jstsExportObject{}, fmt.Errorf("js/ts locale module: expected export default object, exported object literal, or module.exports object")
	}
	if len(exported) > 1 {
		return jstsExportObject{}, fmt.Errorf("js/ts locale module: multiple exported locale objects are unsupported")
	}
	return exported[0], nil
}

func parseJSTSExport(src string, start int, exported *[]jstsExportObject, defaultIdentifier *string) (int, bool, error) {
	i := skipJSTSWhitespaceAndComments(src, start+len("export"))
	if hasJSTSKeywordAt(src, i, "default") {
		i = skipJSTSWhitespaceAndComments(src, i+len("default"))
		if i < len(src) && src[i] == '{' {
			object, err := jstsObjectSpan(src, i)
			if err != nil {
				return start, true, err
			}
			*exported = append(*exported, object)
			return object.end + 1, true, nil
		}
		if name, next, ok := readJSTSIdentifier(src, i); ok {
			*defaultIdentifier = name
			return next, true, nil
		}
		return start, true, fmt.Errorf("js/ts locale module: unsupported export default at line %d; expected object literal or identifier", lineNumberAt(src, start))
	}

	if hasJSTSVariableKeywordAt(src, i) {
		next, found, _, object, err := parseJSTSVariableObject(src, i)
		if err != nil {
			return start, true, err
		}
		if found {
			*exported = append(*exported, object)
		}
		return next, true, nil
	}

	return start + len("export"), false, nil
}

func parseJSTSModuleExports(src string, start int, exported *[]jstsExportObject) (int, bool, error) {
	i := start + len("module")
	i = skipJSTSWhitespaceAndComments(src, i)
	if i >= len(src) || src[i] != '.' {
		return start, false, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+1)
	if !hasJSTSKeywordAt(src, i, "exports") {
		return start, false, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+len("exports"))
	if i >= len(src) || src[i] != '=' {
		return start, false, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+1)
	if i >= len(src) || src[i] != '{' {
		return start, true, fmt.Errorf("js/ts locale module: module.exports must be assigned an object literal at line %d", lineNumberAt(src, start))
	}
	object, err := jstsObjectSpan(src, i)
	if err != nil {
		return start, true, err
	}
	*exported = append(*exported, object)
	return object.end + 1, true, nil
}

func parseJSTSExportsDefault(src string, start int, exported *[]jstsExportObject) (int, bool, error) {
	i := start + len("exports")
	i = skipJSTSWhitespaceAndComments(src, i)
	if i >= len(src) || src[i] != '.' {
		return start, false, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+1)
	if !hasJSTSKeywordAt(src, i, "default") {
		return start, false, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+len("default"))
	if i >= len(src) || src[i] != '=' {
		return start, false, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+1)
	if i >= len(src) || src[i] != '{' {
		return start, true, fmt.Errorf("js/ts locale module: exports.default must be assigned an object literal at line %d", lineNumberAt(src, start))
	}
	object, err := jstsObjectSpan(src, i)
	if err != nil {
		return start, true, err
	}
	*exported = append(*exported, object)
	return object.end + 1, true, nil
}

func parseJSTSVariableObject(src string, start int) (next int, found bool, name string, object jstsExportObject, err error) {
	i := start
	if hasJSTSKeywordAt(src, i, "const") {
		i += len("const")
	} else if hasJSTSKeywordAt(src, i, "let") {
		i += len("let")
	} else if hasJSTSKeywordAt(src, i, "var") {
		i += len("var")
	} else {
		return start, false, "", jstsExportObject{}, nil
	}

	i = skipJSTSWhitespaceAndComments(src, i)
	identifier, next, ok := readJSTSIdentifier(src, i)
	if !ok {
		return start + 1, false, "", jstsExportObject{}, nil
	}

	i = skipJSTSWhitespaceAndComments(src, next)
	for i < len(src) && src[i] != '=' {
		if nextIgnored, ok := skipJSTSIgnoredToken(src, i); ok {
			i = nextIgnored
			continue
		}
		if src[i] == ',' || src[i] == ';' {
			return i, false, "", jstsExportObject{}, nil
		}
		if src[i] == '{' {
			if typeEnd, ok := findJSTSMatchingDelimiter(src, i, '{', '}'); ok {
				i = typeEnd + 1
				continue
			}
		}
		if src[i] == '[' {
			if typeEnd, ok := findJSTSMatchingDelimiter(src, i, '[', ']'); ok {
				i = typeEnd + 1
				continue
			}
		}
		if src[i] == '(' {
			if typeEnd, ok := findJSTSMatchingDelimiter(src, i, '(', ')'); ok {
				i = typeEnd + 1
				continue
			}
		}
		if src[i] == '<' {
			if typeEnd, ok := findJSTSMatchingDelimiter(src, i, '<', '>'); ok {
				i = typeEnd + 1
				continue
			}
		}
		i++
	}

	i = skipJSTSWhitespaceAndComments(src, i)
	if i >= len(src) || src[i] != '=' {
		return i, false, "", jstsExportObject{}, nil
	}
	i = skipJSTSWhitespaceAndComments(src, i+1)
	if i >= len(src) || src[i] != '{' {
		return skipJSTSValueExpression(src, i, len(src)), false, "", jstsExportObject{}, nil
	}
	object, err = jstsObjectSpan(src, i)
	if err != nil {
		return start, true, identifier, jstsExportObject{}, err
	}
	return object.end + 1, true, identifier, object, nil
}

func parseJSTSLocaleEntries(src string, objectStart, objectEnd int) ([]jstsLocaleEntry, map[string]string, error) {
	props, err := parseJSTSObjectProperties(src, objectStart, objectEnd)
	if err != nil {
		return nil, nil, err
	}

	if formatJSProps, ok, err := parseJSTSStrictFormatJSObject(src, props); err != nil {
		return nil, nil, err
	} else if ok {
		return parseJSTSFormatJSEntries(src, formatJSProps)
	}

	var entries []jstsLocaleEntry
	if err := flattenJSTSLocaleValue(src, "", objectStart, objectEnd, &entries); err != nil {
		return nil, nil, err
	}
	return entries, nil, nil
}

func parseJSTSStrictFormatJSObject(src string, props []jstsObjectProperty) ([]jstsFormatJSProperty, bool, error) {
	if len(props) == 0 {
		return nil, false, nil
	}
	formatJSProps := make([]jstsFormatJSProperty, 0, len(props))
	for _, prop := range props {
		i := skipJSTSWhitespaceAndComments(src, prop.valueStart)
		if i >= len(src) || src[i] != '{' {
			return nil, false, nil
		}
		childProps, err := parseJSTSObjectProperties(src, i, prop.valueEnd)
		if err != nil {
			return nil, false, err
		}
		hasDefaultMessage := false
		for _, child := range childProps {
			if child.key != "defaultMessage" {
				continue
			}
			lit, err := parseJSTSStringLiteral(src, skipJSTSWhitespaceAndComments(src, child.valueStart))
			if err != nil {
				return nil, false, nil
			}
			if lit.end != child.valueEnd {
				return nil, false, nil
			}
			hasDefaultMessage = true
		}
		if !hasDefaultMessage {
			return nil, false, nil
		}
		formatJSProps = append(formatJSProps, jstsFormatJSProperty{prop: prop, childProps: childProps})
	}
	return formatJSProps, true, nil
}

func parseJSTSFormatJSEntries(src string, props []jstsFormatJSProperty) ([]jstsLocaleEntry, map[string]string, error) {
	entries := make([]jstsLocaleEntry, 0, len(props))
	context := map[string]string{}
	for _, formatProp := range props {
		prop := formatProp.prop
		var entry *jstsLocaleEntry
		for _, child := range formatProp.childProps {
			if child.key == "defaultMessage" {
				lit, err := parseJSTSStringLiteral(src, skipJSTSWhitespaceAndComments(src, child.valueStart))
				if err != nil {
					return nil, nil, fmt.Errorf("js/ts locale module key %q field %s: %w", prop.key, child.key, err)
				}
				if lit.end != child.valueEnd {
					return nil, nil, fmt.Errorf("js/ts locale module key %q field %s must be a static string literal", prop.key, child.key)
				}
				current := jstsLocaleEntry{
					key:          prop.key,
					sourceValue:  lit.decoded,
					valueLiteral: lit.raw,
					valueStart:   lit.start,
					valueEnd:     lit.end,
					quote:        lit.quote,
				}
				entry = &current
				continue
			}
			if child.key != "description" {
				continue
			}
			lit, err := parseJSTSStringLiteral(src, skipJSTSWhitespaceAndComments(src, child.valueStart))
			if err != nil || lit.end != child.valueEnd {
				continue
			}
			if strings.TrimSpace(lit.decoded) != "" {
				context[prop.key] = strings.TrimSpace(lit.decoded)
			}
		}
		if entry == nil {
			return nil, nil, fmt.Errorf("js/ts locale module key %q is missing defaultMessage", prop.key)
		}
		entries = append(entries, *entry)
	}
	if len(context) == 0 {
		context = nil
	}
	return entries, context, nil
}

func flattenJSTSLocaleValue(src, prefix string, valueStart, valueEnd int, entries *[]jstsLocaleEntry) error {
	i := skipJSTSWhitespaceAndComments(src, valueStart)
	if i >= valueEnd {
		return fmt.Errorf("js/ts locale module key %q has empty value", prefix)
	}

	switch src[i] {
	case '\'', '"', '`':
		if prefix == "" {
			return fmt.Errorf("js/ts locale module root must be an object")
		}
		lit, err := parseJSTSStringLiteral(src, i)
		if err != nil {
			return fmt.Errorf("js/ts locale module key %q: %w", prefix, err)
		}
		if lit.end != valueEnd {
			return fmt.Errorf("js/ts locale module key %q must be a static string literal", prefix)
		}
		*entries = append(*entries, jstsLocaleEntry{
			key:          prefix,
			sourceValue:  lit.decoded,
			valueLiteral: lit.raw,
			valueStart:   lit.start,
			valueEnd:     lit.end,
			quote:        lit.quote,
		})
		return nil
	case '{':
		props, err := parseJSTSObjectProperties(src, i, valueEnd)
		if err != nil {
			return err
		}
		for _, prop := range props {
			key := prop.key
			if prefix != "" {
				key = prefix + "." + prop.key
			}
			if err := flattenJSTSLocaleValue(src, key, prop.valueStart, prop.valueEnd, entries); err != nil {
				return err
			}
		}
		return nil
	case '[':
		items, err := parseJSTSArrayItems(src, i, valueEnd)
		if err != nil {
			return err
		}
		for idx, item := range items {
			key := prefix + "[" + strconv.Itoa(idx) + "]"
			if err := flattenJSTSLocaleValue(src, key, item.start, item.end, entries); err != nil {
				return err
			}
		}
		return nil
	default:
		if prefix == "" {
			return fmt.Errorf("js/ts locale module root must contain static locale strings")
		}
		return fmt.Errorf("js/ts locale module key %q has unsupported value at line %d; expected string, object, or array literal", prefix, lineNumberAt(src, i))
	}
}

func parseJSTSObjectProperties(src string, objectStart, objectEnd int) ([]jstsObjectProperty, error) {
	if objectStart >= len(src) || src[objectStart] != '{' || objectEnd >= len(src) || src[objectEnd] != '}' {
		return nil, fmt.Errorf("js/ts locale module: expected object literal at line %d", lineNumberAt(src, objectStart))
	}

	var props []jstsObjectProperty
	for i := objectStart + 1; i < objectEnd; {
		i = skipJSTSWhitespaceAndComments(src, i)
		if i >= objectEnd {
			break
		}
		if src[i] == ',' {
			i++
			continue
		}
		if strings.HasPrefix(src[i:], "...") {
			return nil, fmt.Errorf("js/ts locale module: spread properties are unsupported at line %d", lineNumberAt(src, i))
		}
		if src[i] == '[' {
			return nil, fmt.Errorf("js/ts locale module: computed property keys are unsupported at line %d", lineNumberAt(src, i))
		}

		key, next, err := parseJSTSPropertyKey(src, i)
		if err != nil {
			return nil, err
		}
		i = skipJSTSWhitespaceAndComments(src, next)
		if i >= objectEnd || src[i] != ':' {
			return nil, fmt.Errorf("js/ts locale module key %q at line %d must use key: value syntax", key, lineNumberAt(src, next))
		}

		valueStart := skipJSTSWhitespaceAndComments(src, i+1)
		valueEnd, err := jstsLiteralValueEnd(src, valueStart, objectEnd)
		if err != nil {
			return nil, err
		}
		props = append(props, jstsObjectProperty{
			key:        key,
			valueStart: valueStart,
			valueEnd:   valueEnd,
		})
		i = skipJSTSValueExpression(src, valueStart, objectEnd)
	}
	return props, nil
}

func parseJSTSArrayItems(src string, arrayStart, arrayEnd int) ([]struct{ start, end int }, error) {
	if arrayStart >= len(src) || src[arrayStart] != '[' || arrayEnd >= len(src) || src[arrayEnd] != ']' {
		return nil, fmt.Errorf("js/ts locale module: expected array literal at line %d", lineNumberAt(src, arrayStart))
	}

	var items []struct{ start, end int }
	expectValue := true
	for i := arrayStart + 1; i < arrayEnd; {
		i = skipJSTSWhitespaceAndComments(src, i)
		if i >= arrayEnd {
			break
		}
		if src[i] == ',' {
			if expectValue {
				return nil, fmt.Errorf("js/ts locale module: sparse arrays are unsupported at line %d", lineNumberAt(src, i))
			}
			expectValue = true
			i++
			continue
		}
		if strings.HasPrefix(src[i:], "...") {
			return nil, fmt.Errorf("js/ts locale module: array spreads are unsupported at line %d", lineNumberAt(src, i))
		}
		valueEnd, err := jstsLiteralValueEnd(src, i, arrayEnd)
		if err != nil {
			return nil, err
		}
		items = append(items, struct{ start, end int }{start: i, end: valueEnd})
		expectValue = false
		i = skipJSTSValueExpression(src, i, arrayEnd)
	}
	return items, nil
}

func parseJSTSPropertyKey(src string, index int) (string, int, error) {
	if index >= len(src) {
		return "", index, fmt.Errorf("js/ts locale module: expected property key")
	}
	if isJSTSStringQuote(src[index]) {
		lit, err := parseJSTSStringLiteral(src, index)
		if err != nil {
			return "", index, fmt.Errorf("js/ts locale module property key: %w", err)
		}
		return lit.decoded, lit.end, nil
	}
	key, next, ok := readJSTSIdentifier(src, index)
	if !ok {
		return "", index, fmt.Errorf("js/ts locale module: unsupported property key at line %d", lineNumberAt(src, index))
	}
	return key, next, nil
}

func jstsLiteralValueEnd(src string, valueStart, containerEnd int) (int, error) {
	i := skipJSTSWhitespaceAndComments(src, valueStart)
	if i >= containerEnd {
		return i, fmt.Errorf("js/ts locale module: expected value at line %d", lineNumberAt(src, valueStart))
	}

	switch src[i] {
	case '\'', '"', '`':
		lit, err := parseJSTSStringLiteral(src, i)
		if err != nil {
			return i, err
		}
		return lit.end, nil
	case '{':
		object, err := jstsObjectSpan(src, i)
		if err != nil {
			return i, err
		}
		return object.end, nil
	case '[':
		end, ok := findJSTSMatchingDelimiter(src, i, '[', ']')
		if !ok {
			return i, fmt.Errorf("js/ts locale module: unterminated array at line %d", lineNumberAt(src, i))
		}
		return end, nil
	default:
		return skipJSTSValueExpression(src, i, containerEnd), nil
	}
}

func jstsObjectSpan(src string, start int) (jstsExportObject, error) {
	end, ok := findJSTSMatchingDelimiter(src, start, '{', '}')
	if !ok {
		return jstsExportObject{}, fmt.Errorf("js/ts locale module: unterminated object literal at line %d", lineNumberAt(src, start))
	}
	return jstsExportObject{start: start, end: end}, nil
}

func parseJSTSStringLiteral(src string, start int) (jstsStringLiteral, error) {
	if start >= len(src) || !isJSTSStringQuote(src[start]) {
		return jstsStringLiteral{}, fmt.Errorf("expected string literal at line %d", lineNumberAt(src, start))
	}

	quote := src[start]
	var decoded strings.Builder
	for i := start + 1; i < len(src); i++ {
		ch := src[i]
		if ch == quote {
			return jstsStringLiteral{
				decoded: decoded.String(),
				raw:     src[start : i+1],
				start:   start,
				end:     i + 1,
				quote:   quote,
			}, nil
		}
		if quote == '`' && ch == '$' && i+1 < len(src) && src[i+1] == '{' {
			return jstsStringLiteral{}, fmt.Errorf("interpolated template literals are unsupported at line %d", lineNumberAt(src, start))
		}
		if quote != '`' && (ch == '\n' || ch == '\r') {
			return jstsStringLiteral{}, fmt.Errorf("unterminated string literal at line %d", lineNumberAt(src, start))
		}
		if ch != '\\' {
			decoded.WriteByte(ch)
			continue
		}
		if i+1 >= len(src) {
			return jstsStringLiteral{}, fmt.Errorf("dangling escape in string literal at line %d", lineNumberAt(src, start))
		}
		i++
		next, err := writeJSTSEscape(&decoded, src, i)
		if err != nil {
			return jstsStringLiteral{}, fmt.Errorf("%w at line %d", err, lineNumberAt(src, start))
		}
		i = next
	}

	return jstsStringLiteral{}, fmt.Errorf("unterminated string literal at line %d", lineNumberAt(src, start))
}

func writeJSTSEscape(b *strings.Builder, raw string, index int) (int, error) {
	switch raw[index] {
	case '\n':
		return index, nil
	case '\r':
		if index+1 < len(raw) && raw[index+1] == '\n' {
			return index + 1, nil
		}
		return index, nil
	case '"', '\'', '\\', '`':
		b.WriteByte(raw[index])
	case 'b':
		b.WriteByte('\b')
	case 'f':
		b.WriteByte('\f')
	case 'n':
		b.WriteByte('\n')
	case 'r':
		b.WriteByte('\r')
	case 't':
		b.WriteByte('\t')
	case 'v':
		b.WriteByte('\v')
	case '0':
		if index+1 < len(raw) && raw[index+1] >= '0' && raw[index+1] <= '9' {
			return index, fmt.Errorf("octal escapes are unsupported")
		}
		b.WriteByte(0)
	case 'x':
		if index+2 >= len(raw) {
			return index, fmt.Errorf("invalid \\x escape")
		}
		value, err := strconv.ParseUint(raw[index+1:index+3], 16, 8)
		if err != nil {
			return index, fmt.Errorf("invalid \\x escape")
		}
		b.WriteByte(byte(value))
		return index + 2, nil
	case 'u':
		next, err := writeJSTSUnicodeEscape(b, raw, index)
		if err != nil {
			return index, err
		}
		return next, nil
	default:
		b.WriteByte(raw[index])
	}
	return index, nil
}

func writeJSTSUnicodeEscape(b *strings.Builder, raw string, index int) (int, error) {
	if index+1 < len(raw) && raw[index+1] == '{' {
		end := strings.IndexByte(raw[index+2:], '}')
		if end < 0 {
			return index, fmt.Errorf("invalid \\u escape")
		}
		hex := raw[index+2 : index+2+end]
		value, err := strconv.ParseInt(hex, 16, 32)
		if err != nil || !utf8.ValidRune(rune(value)) {
			return index, fmt.Errorf("invalid \\u escape")
		}
		b.WriteRune(rune(value))
		return index + 2 + end, nil
	}
	if index+4 >= len(raw) {
		return index, fmt.Errorf("invalid \\u escape")
	}
	value, err := parseJSTSFixedUnicodeEscape(raw, index)
	if err != nil {
		return index, fmt.Errorf("invalid \\u escape")
	}
	if isJSTSHighSurrogate(value) {
		lowIndex := index + 5
		if lowIndex+5 >= len(raw) || raw[lowIndex] != '\\' || raw[lowIndex+1] != 'u' {
			return index, fmt.Errorf("invalid surrogate pair in \\u escape")
		}
		low, err := parseJSTSFixedUnicodeEscape(raw, lowIndex+1)
		if err != nil || !isJSTSLowSurrogate(low) {
			return index, fmt.Errorf("invalid surrogate pair in \\u escape")
		}
		b.WriteRune(utf16.DecodeRune(value, low))
		return lowIndex + 5, nil
	}
	if isJSTSLowSurrogate(value) {
		return index, fmt.Errorf("invalid surrogate pair in \\u escape")
	}
	b.WriteRune(value)
	return index + 4, nil
}

func parseJSTSFixedUnicodeEscape(raw string, index int) (rune, error) {
	if index+4 >= len(raw) {
		return 0, fmt.Errorf("invalid \\u escape")
	}
	value, err := strconv.ParseUint(raw[index+1:index+5], 16, 16)
	if err != nil {
		return 0, err
	}
	return rune(value), nil
}

func isJSTSHighSurrogate(r rune) bool {
	return r >= 0xD800 && r <= 0xDBFF
}

func isJSTSLowSurrogate(r rune) bool {
	return r >= 0xDC00 && r <= 0xDFFF
}

func encodeJSTSStringLiteral(value string, quote byte) string {
	if !isJSTSStringQuote(quote) {
		quote = '"'
	}

	var b strings.Builder
	b.WriteByte(quote)
	for i := 0; i < len(value); {
		r, size := utf8.DecodeRuneInString(value[i:])
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\v':
			b.WriteString(`\v`)
		case rune(quote):
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\u2028':
			b.WriteString(`\u2028`)
		case '\u2029':
			b.WriteString(`\u2029`)
		case '$':
			if quote == '`' && i+1 < len(value) && value[i+1] == '{' {
				b.WriteString(`\$`)
			} else {
				b.WriteRune(r)
			}
		default:
			if r < 0x20 || r == 0x7F {
				fmt.Fprintf(&b, `\u%04X`, r)
				i += size
				continue
			}
			b.WriteRune(r)
		}
		i += size
	}
	b.WriteByte(quote)
	return b.String()
}

func skipJSTSValueExpression(src string, index, end int) int {
	depth := 0
	for i := index; i < end; {
		if next, ok := skipJSTSIgnoredToken(src, i); ok {
			i = next
			continue
		}

		switch src[i] {
		case '{', '[', '(':
			depth++
		case '}', ']', ')':
			if depth == 0 {
				return i
			}
			depth--
		case ',', ';':
			if depth == 0 {
				return i
			}
		}
		i++
	}
	return end
}

func findJSTSMatchingDelimiter(src string, open int, openCh, closeCh byte) (int, bool) {
	if open >= len(src) || src[open] != openCh {
		return 0, false
	}
	depth := 0
	for i := open; i < len(src); {
		if next, ok := skipJSTSIgnoredToken(src, i); ok {
			i = next
			continue
		}
		switch src[i] {
		case openCh:
			depth++
		case closeCh:
			depth--
			if depth == 0 {
				return i, true
			}
		}
		i++
	}
	return 0, false
}

func skipJSTSIgnoredToken(src string, index int) (int, bool) {
	if index >= len(src) {
		return index, false
	}
	switch src[index] {
	case '\'', '"', '`':
		return skipJSTSStringLiteral(src, index), true
	case '/':
		if next, ok := skipJSTSComment(src, index); ok {
			return next, true
		}
		return skipJSTSRegexLiteral(src, index)
	default:
		return index, false
	}
}

func skipJSTSStringLiteral(src string, index int) int {
	quote := src[index]
	for i := index + 1; i < len(src); i++ {
		if src[i] == '\\' {
			i++
			continue
		}
		if quote == '`' && src[i] == '$' && i+1 < len(src) && src[i+1] == '{' {
			end, ok := findJSTSMatchingDelimiter(src, i+1, '{', '}')
			if !ok {
				return len(src)
			}
			i = end
			continue
		}
		if src[i] == quote {
			return i + 1
		}
	}
	return len(src)
}

func skipJSTSComment(src string, index int) (int, bool) {
	if index+1 >= len(src) || src[index] != '/' {
		return index, false
	}
	switch src[index+1] {
	case '/':
		end := strings.IndexByte(src[index+2:], '\n')
		if end < 0 {
			return len(src), true
		}
		return index + 2 + end + 1, true
	case '*':
		end := strings.Index(src[index+2:], "*/")
		if end < 0 {
			return len(src), true
		}
		return index + 2 + end + 2, true
	default:
		return index, false
	}
}

func skipJSTSRegexLiteral(src string, index int) (int, bool) {
	if index+1 >= len(src) || src[index] != '/' {
		return index, false
	}

	inClass := false
	for i := index + 1; i < len(src); {
		if _, ok := skipJSTSComment(src, i); ok {
			return index, false
		}
		if isJSTSStringQuote(src[i]) {
			i = skipJSTSStringLiteral(src, i)
			continue
		}
		switch src[i] {
		case '\\':
			i += 2
			continue
		case '\n', '\r':
			return index, false
		case '[':
			inClass = true
		case ']':
			inClass = false
		case '/':
			if inClass {
				i++
				continue
			}
			i++
			for i < len(src) && isJSTSRegexFlag(src[i]) {
				i++
			}
			return i, true
		}
		i++
	}
	return index, false
}

func isJSTSRegexFlag(ch byte) bool {
	return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
}

func skipJSTSWhitespaceAndComments(src string, index int) int {
	for i := index; i < len(src); {
		for i < len(src) {
			r, size := utf8.DecodeRuneInString(src[i:])
			if !unicode.IsSpace(r) {
				break
			}
			i += size
		}
		next, ok := skipJSTSComment(src, i)
		if !ok {
			return i
		}
		i = next
	}
	return len(src)
}

func hasJSTSVariableKeywordAt(src string, index int) bool {
	return hasJSTSKeywordAt(src, index, "const") ||
		hasJSTSKeywordAt(src, index, "let") ||
		hasJSTSKeywordAt(src, index, "var")
}

func hasJSTSKeywordAt(src string, index int, keyword string) bool {
	if index < 0 || index+len(keyword) > len(src) || src[index:index+len(keyword)] != keyword {
		return false
	}
	beforeOK := index == 0
	if !beforeOK {
		r, _ := utf8.DecodeLastRuneInString(src[:index])
		beforeOK = !isJSTSIdentifierRunePart(r)
	}
	after := index + len(keyword)
	afterOK := after >= len(src)
	if !afterOK {
		r, _ := utf8.DecodeRuneInString(src[after:])
		afterOK = !isJSTSIdentifierRunePart(r)
	}
	return beforeOK && afterOK
}

func readJSTSIdentifier(src string, index int) (string, int, bool) {
	if index >= len(src) {
		return "", index, false
	}
	r, size := utf8.DecodeRuneInString(src[index:])
	if !isJSTSIdentifierStartRune(r) {
		return "", index, false
	}
	i := index + size
	for i < len(src) {
		r, size := utf8.DecodeRuneInString(src[i:])
		if !isJSTSIdentifierRunePart(r) {
			break
		}
		i += size
	}
	return src[index:i], i, true
}

func isJSTSIdentifierStartRune(r rune) bool {
	return r == '_' || r == '$' || unicode.IsLetter(r)
}

func isJSTSIdentifierRunePart(r rune) bool {
	return r == '_' || r == '$' || unicode.IsLetter(r) || unicode.IsDigit(r)
}

func isJSTSStringQuote(ch byte) bool {
	return ch == '\'' || ch == '"' || ch == '`'
}
