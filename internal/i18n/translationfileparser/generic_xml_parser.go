package translationfileparser

import (
	"bytes"
	"cmp"
	"encoding/xml"
	"fmt"
	"slices"
	"strings"
)

// GenericXMLParser parses non-Android XML locale files whose translatable
// values are text-only leaf elements.
type GenericXMLParser struct{}

type genericXMLEntry struct {
	key         string
	sourceValue string
	valueStart  int
	valueEnd    int
}

type genericXMLDocument struct {
	template        string
	entries         []genericXMLEntry
	rootLocaleAttrs []genericXMLLocaleAttr
}

type genericXMLLocaleAttr struct {
	valueStart int
	valueEnd   int
	value      string
}

type genericXMLReplacement struct {
	start int
	end   int
	value string
}

type genericXMLFrame struct {
	name              string
	ownKey            string
	inMetadata        bool
	contentStart      int
	value             strings.Builder
	hasElementChild   bool
	hasText           bool
	hasNonWhitespace  bool
	hasNonTextContent bool
}

func (p GenericXMLParser) Parse(content []byte) (map[string]string, error) {
	doc, err := parseGenericXMLDocument(content)
	if err != nil {
		return nil, err
	}
	// BOLT OPTIMIZATION: Use capacity hint for the output map.
	out := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		out[entry.key] = entry.sourceValue
	}
	return out, nil
}

// MarshalGenericXML renders translated generic XML values into template.
// values must contain decoded plain text, not pre-escaped XML strings; XML
// escaping is applied while rendering.
func MarshalGenericXML(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseGenericXMLDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values, "", "")
}

// MarshalGenericXMLWithTargetLocale renders translated generic XML values into
// template and rewrites matching root locale attributes to targetLocale.
// values must contain decoded plain text, not pre-escaped XML strings; XML
// escaping is applied while rendering.
func MarshalGenericXMLWithTargetLocale(template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	doc, err := parseGenericXMLDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values, sourceLocale, targetLocale)
}

func parseGenericXMLDocument(content []byte) (genericXMLDocument, error) {
	text := string(content)
	doc := genericXMLDocument{template: text, entries: []genericXMLEntry{}}

	decoder := xml.NewDecoder(bytes.NewReader(content))
	stack := []*genericXMLFrame{}
	rootName := ""
	seenKeys := map[string]struct{}{}

	for {
		tokenStart := int(decoder.InputOffset())
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return genericXMLDocument{}, fmt.Errorf("generic XML parser: %w", err)
		}
		tokenEnd := int(decoder.InputOffset())

		switch token := tok.(type) {
		case xml.StartElement:
			name := token.Name.Local
			attrKey := genericXMLKeyAttr(token.Attr)
			metadataElement := isGenericXMLMetadataElement(name)
			if metadataElement && attrKey != "" && isGenericXMLKeyedMetadataConflict(name) {
				return genericXMLDocument{}, fmt.Errorf("generic XML parser: metadata element <%s> cannot have a key/id/name attribute; it would conflict with its role as a structural metadata container", name)
			}

			if rootName == "" {
				rootName = name
				if isGenericXMLSpecializedRoot(rootName) {
					return genericXMLDocument{}, fmt.Errorf("generic XML parser: element <%s> should be handled by a specialized parser, not generic XML (Android resources require a specialized parser)", rootName)
				}
				doc.rootLocaleAttrs = genericXMLRootLocaleAttrs(text[tokenStart:tokenEnd], tokenStart, token.Attr)
			}
			if len(stack) > 0 {
				stack[len(stack)-1].hasElementChild = true
			}

			parentMetadata := false
			if len(stack) > 0 {
				parentMetadata = stack[len(stack)-1].inMetadata
			}

			stack = append(stack, &genericXMLFrame{
				name:         name,
				ownKey:       attrKey,
				inMetadata:   parentMetadata || (metadataElement && (attrKey == "" || !isGenericXMLKeyedMetadataConflict(name))),
				contentStart: tokenEnd,
			})
		case xml.EndElement:
			if len(stack) == 0 {
				return genericXMLDocument{}, fmt.Errorf("generic XML parser: unexpected closing element </%s>", token.Name.Local)
			}
			frame := stack[len(stack)-1]
			if frame.name != token.Name.Local {
				return genericXMLDocument{}, fmt.Errorf("generic XML parser: mismatched closing element </%s> for <%s>", token.Name.Local, frame.name)
			}
			if frame.inMetadata {
				stack = stack[:len(stack)-1]
				continue
			}
			if frame.hasElementChild {
				if frame.hasNonWhitespace {
					return genericXMLDocument{}, fmt.Errorf("generic XML parser: mixed content in <%s> is unsupported; translate text-only leaf elements", frame.name)
				}
				stack = stack[:len(stack)-1]
				continue
			}
			if frame.hasNonTextContent {
				if frame.hasNonWhitespace {
					return genericXMLDocument{}, fmt.Errorf("generic XML parser: mixed content in <%s> is unsupported; translate text-only leaf elements", frame.name)
				}
				stack = stack[:len(stack)-1]
				continue
			}
			if !frame.hasText || !frame.hasNonWhitespace {
				stack = stack[:len(stack)-1]
				continue
			}

			// Preserve leaf text exactly as authored. Surrounding indentation inside
			// a text-only leaf is part of sourceValue and the replacement span.
			value := frame.value.String()
			if !isTranslatableChunk(value) {
				stack = stack[:len(stack)-1]
				continue
			}
			key := genericXMLResolvedKey(stack)
			if key == "" {
				return genericXMLDocument{}, fmt.Errorf("generic XML parser: text element <%s> has no stable key; add key/id/name or use a nested path", frame.name)
			}
			if _, exists := seenKeys[key]; exists {
				return genericXMLDocument{}, fmt.Errorf("generic XML parser: duplicate key %q", key)
			}
			seenKeys[key] = struct{}{}
			doc.entries = append(doc.entries, genericXMLEntry{
				key:         key,
				sourceValue: value,
				valueStart:  frame.contentStart,
				valueEnd:    tokenStart,
			})
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if len(stack) == 0 {
				continue
			}
			current := stack[len(stack)-1]
			current.hasText = true
			if !isAllXMLWhitespace(token) {
				current.hasNonWhitespace = true
			}
			current.value.Write(token)
		case xml.Comment:
			if len(stack) > 0 && !isAllXMLWhitespace(token) {
				stack[len(stack)-1].hasNonTextContent = true
			}
		case xml.Directive, xml.ProcInst:
			if len(stack) > 0 {
				stack[len(stack)-1].hasNonTextContent = true
			}
		}
	}

	if len(stack) != 0 {
		return genericXMLDocument{}, fmt.Errorf("generic XML parser: unclosed element <%s>", stack[len(stack)-1].name)
	}
	if rootName == "" {
		return genericXMLDocument{}, fmt.Errorf("generic XML parser: empty XML document")
	}
	if len(doc.entries) == 0 {
		return genericXMLDocument{}, fmt.Errorf("generic XML parser: no translatable XML text entries found; expected text-only leaf elements with key/id/name attributes or nested element paths")
	}

	return doc, nil
}

func genericXMLResolvedKey(stack []*genericXMLFrame) string {
	if len(stack) == 0 {
		return ""
	}

	// BOLT OPTIMIZATION: Reconstruct the key from the stack only when needed.
	// This avoids O(Depth^2) allocations during tree traversal.
	var hasAnyOwnKey bool
	for _, f := range stack {
		if f.ownKey != "" {
			hasAnyOwnKey = true
			break
		}
	}

	var b strings.Builder
	if hasAnyOwnKey {
		for _, f := range stack {
			if f.ownKey != "" {
				if b.Len() > 0 {
					b.WriteByte('.')
				}
				b.WriteString(f.ownKey)
			}
		}
		leaf := stack[len(stack)-1]
		if leaf.ownKey == "" && !isGenericXMLValueElement(leaf.name) {
			if b.Len() > 0 {
				b.WriteByte('.')
			}
			b.WriteString(leaf.name)
		}
	} else {
		// Element path, skipping the root element.
		for i := 1; i < len(stack); i++ {
			if b.Len() > 0 {
				b.WriteByte('.')
			}
			b.WriteString(stack[i].name)
		}
	}

	return b.String()
}

func (d genericXMLDocument) render(values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	replacements := make([]genericXMLReplacement, 0, len(d.entries)+len(d.rootLocaleAttrs))
	for _, entry := range d.entries {
		if translated, ok := values[entry.key]; ok {
			if translated != entry.sourceValue {
				if containsXMLTextEntityReference(translated) {
					return nil, fmt.Errorf("generic XML parser: translated value for key %q contains XML entity references; provide decoded plain text instead", entry.key)
				}
				replacements = append(replacements, genericXMLReplacement{
					start: entry.valueStart,
					end:   entry.valueEnd,
					value: escapeXMLText(translated),
				})
			}
		}
	}

	locale := strings.TrimSpace(targetLocale)
	if locale != "" {
		for _, attr := range d.rootLocaleAttrs {
			if !genericXMLLocaleAttrMatchesSource(attr.value, sourceLocale) {
				continue
			}
			replacements = append(replacements, genericXMLReplacement{
				start: attr.valueStart,
				end:   attr.valueEnd,
				value: escapeXMLAttr(genericXMLTargetLocaleForAttr(attr.value, locale)),
			})
		}
	}

	if len(replacements) == 0 {
		return []byte(d.template), nil
	}

	// BOLT OPTIMIZATION: Use slices.SortFunc instead of sort.Slice to avoid reflection.
	slices.SortFunc(replacements, func(a, b genericXMLReplacement) int {
		return cmp.Compare(a.start, b.start)
	})

	var b strings.Builder
	cursor := 0
	for _, replacement := range replacements {
		if replacement.start < cursor {
			return nil, fmt.Errorf("generic XML parser: overlapping replacement at byte %d", replacement.start)
		}
		if replacement.start > len(d.template) || replacement.end > len(d.template) {
			return nil, fmt.Errorf("generic XML parser: replacement range [%d,%d) is outside template length %d", replacement.start, replacement.end, len(d.template))
		}
		b.WriteString(d.template[cursor:replacement.start])
		b.WriteString(replacement.value)
		cursor = replacement.end
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String()), nil
}

func genericXMLRootLocaleAttrs(rawStartTag string, absoluteStart int, decodedAttrs []xml.Attr) []genericXMLLocaleAttr {
	localeAttrs := []genericXMLLocaleAttr{}
	searchFrom := 0
	for _, attr := range decodedAttrs {
		name := genericXMLLocaleRawAttrName(attr.Name)
		if !isGenericXMLLocaleAttrName(name) {
			continue
		}

		// encoding/xml preserves attribute order, so the raw lookup advances
		// monotonically and never retries from the beginning of the start tag.
		valueStart, valueEnd, ok := genericXMLAttrValueSpan(rawStartTag, name, searchFrom)
		if !ok {
			continue
		}
		localeAttrs = append(localeAttrs, genericXMLLocaleAttr{
			valueStart: absoluteStart + valueStart,
			valueEnd:   absoluteStart + valueEnd,
			value:      attr.Value,
		})
		searchFrom = valueEnd
	}
	return localeAttrs
}

func genericXMLLocaleRawAttrName(name xml.Name) string {
	if strings.EqualFold(name.Local, "lang") && (name.Space == "xml" || name.Space == "http://www.w3.org/XML/1998/namespace") {
		return "xml:lang"
	}
	if name.Space != "" {
		return ""
	}
	return name.Local
}

func genericXMLAttrValueSpan(rawStartTag, attrName string, from int) (int, int, bool) {
	if attrName == "" || from >= len(rawStartTag) {
		return 0, 0, false
	}
	for searchFrom := max(from, 0); searchFrom < len(rawStartTag); {
		offset := strings.Index(rawStartTag[searchFrom:], attrName)
		if offset < 0 {
			return 0, 0, false
		}
		nameStart := searchFrom + offset
		nameEnd := nameStart + len(attrName)
		if genericXMLInsideQuotedValue(rawStartTag, nameStart) || !genericXMLAttrNameBoundaryBefore(rawStartTag, nameStart) || !genericXMLAttrNameBoundaryAfter(rawStartTag, nameEnd) {
			searchFrom = nameEnd
			continue
		}

		i := nameEnd
		for i < len(rawStartTag) && isXMLWhitespace(rawStartTag[i]) {
			i++
		}
		if i >= len(rawStartTag) || rawStartTag[i] != '=' {
			searchFrom = nameEnd
			continue
		}
		i++
		for i < len(rawStartTag) && isXMLWhitespace(rawStartTag[i]) {
			i++
		}
		if i >= len(rawStartTag) || (rawStartTag[i] != '"' && rawStartTag[i] != '\'') {
			searchFrom = nameEnd
			continue
		}
		quote := rawStartTag[i]
		valueStart := i + 1
		valueLen := strings.IndexByte(rawStartTag[valueStart:], quote)
		if valueLen < 0 {
			return 0, 0, false
		}
		return valueStart, valueStart + valueLen, true
	}
	return 0, 0, false
}

func genericXMLInsideQuotedValue(s string, offset int) bool {
	var quote byte
	for i := 0; i < offset; i++ {
		if quote != 0 {
			if s[i] == quote {
				quote = 0
			}
			continue
		}
		if s[i] == '"' || s[i] == '\'' {
			quote = s[i]
		}
	}
	return quote != 0
}

func genericXMLAttrNameBoundaryBefore(s string, offset int) bool {
	return offset > 0 && isXMLWhitespace(s[offset-1])
}

func genericXMLAttrNameBoundaryAfter(s string, offset int) bool {
	return offset < len(s) && (s[offset] == '=' || isXMLWhitespace(s[offset]))
}

func isGenericXMLLocaleAttrName(name string) bool {
	// BOLT OPTIMIZATION: Fast-path for common lowercase, trimmed attribute names.
	switch name {
	case "xml:lang", "lang", "locale", "language", "code":
		return true
	}

	trimmed := strings.TrimSpace(name)
	switch {
	case strings.EqualFold(trimmed, "xml:lang"),
		strings.EqualFold(trimmed, "lang"),
		strings.EqualFold(trimmed, "locale"),
		strings.EqualFold(trimmed, "language"),
		strings.EqualFold(trimmed, "code"):
		return true
	default:
		return false
	}
}

func genericXMLLocaleAttrMatchesSource(attrValue, sourceLocale string) bool {
	attr := strings.TrimSpace(attrValue)
	source := strings.TrimSpace(sourceLocale)
	if attr == "" || source == "" {
		return false
	}
	if strings.EqualFold(attr, source) {
		return true
	}
	if !strings.Contains(attr, "-") && !strings.Contains(attr, "_") {
		base := source
		if idx := strings.IndexAny(base, "-_"); idx >= 0 {
			base = base[:idx]
		}
		return strings.EqualFold(attr, base)
	}
	attrNorm := strings.ReplaceAll(attr, "_", "-")
	sourceNorm := strings.ReplaceAll(source, "_", "-")
	return strings.EqualFold(attrNorm, sourceNorm)
}

func genericXMLTargetLocaleForAttr(attrValue, targetLocale string) string {
	target := strings.TrimSpace(targetLocale)
	attr := strings.TrimSpace(attrValue)
	if attr != "" && !strings.Contains(attr, "-") && !strings.Contains(attr, "_") {
		if idx := strings.IndexAny(target, "-_"); idx >= 0 {
			return target[:idx]
		}
	}
	if strings.Contains(attr, "_") && !strings.Contains(attr, "-") {
		return strings.ReplaceAll(target, "-", "_")
	}
	if strings.Contains(attr, "-") && !strings.Contains(attr, "_") {
		return strings.ReplaceAll(target, "_", "-")
	}
	return target
}

func genericXMLKeyAttr(attrs []xml.Attr) string {
	// BOLT OPTIMIZATION: Single-pass attribute scan with priority (key > id > name).
	var id, name string
	for _, attr := range attrs {
		if attr.Name.Space != "" {
			continue
		}
		local := attr.Name.Local
		if strings.EqualFold(local, "key") {
			if v := strings.TrimSpace(attr.Value); v != "" {
				return v
			}
		} else if id == "" && strings.EqualFold(local, "id") {
			if v := strings.TrimSpace(attr.Value); v != "" {
				id = v
			}
		} else if name == "" && strings.EqualFold(local, "name") {
			if v := strings.TrimSpace(attr.Value); v != "" {
				name = v
			}
		}
	}
	if id != "" {
		return id
	}
	return name
}

func isGenericXMLMetadataElement(name string) bool {
	// BOLT OPTIMIZATION: Fast-path for common lowercase, trimmed element names.
	switch name {
	case "meta", "metadata", "comment", "comments", "description", "descriptions", "note", "notes", "context", "extracomment", "developercomment", "resheader", "assembly":
		return true
	}

	trimmed := strings.TrimSpace(name)
	switch {
	case strings.EqualFold(trimmed, "meta"),
		strings.EqualFold(trimmed, "metadata"),
		strings.EqualFold(trimmed, "comment"),
		strings.EqualFold(trimmed, "comments"),
		strings.EqualFold(trimmed, "description"),
		strings.EqualFold(trimmed, "descriptions"),
		strings.EqualFold(trimmed, "note"),
		strings.EqualFold(trimmed, "notes"),
		strings.EqualFold(trimmed, "context"),
		strings.EqualFold(trimmed, "extracomment"),
		strings.EqualFold(trimmed, "developercomment"),
		strings.EqualFold(trimmed, "resheader"),
		strings.EqualFold(trimmed, "assembly"):
		return true
	default:
		return false
	}
}

func isGenericXMLKeyedMetadataConflict(name string) bool {
	// BOLT OPTIMIZATION: Fast-path for common lowercase, trimmed element names.
	switch name {
	case "comment", "comments", "description", "descriptions", "note", "notes", "context", "extracomment", "developercomment":
		return true
	}

	trimmed := strings.TrimSpace(name)
	switch {
	case strings.EqualFold(trimmed, "comment"),
		strings.EqualFold(trimmed, "comments"),
		strings.EqualFold(trimmed, "description"),
		strings.EqualFold(trimmed, "descriptions"),
		strings.EqualFold(trimmed, "note"),
		strings.EqualFold(trimmed, "notes"),
		strings.EqualFold(trimmed, "context"),
		strings.EqualFold(trimmed, "extracomment"),
		strings.EqualFold(trimmed, "developercomment"):
		return true
	default:
		return false
	}
}

func isGenericXMLValueElement(name string) bool {
	// BOLT OPTIMIZATION: Fast-path for common lowercase, trimmed element names.
	if name == "value" {
		return true
	}

	return strings.EqualFold(strings.TrimSpace(name), "value")
}

func isGenericXMLSpecializedRoot(name string) bool {
	// BOLT OPTIMIZATION: Fast-path for common lowercase, trimmed element names.
	switch name {
	case "resources", "xliff", "plist":
		return true
	}

	trimmed := strings.TrimSpace(name)
	switch {
	case strings.EqualFold(trimmed, "resources"),
		strings.EqualFold(trimmed, "xliff"),
		strings.EqualFold(trimmed, "plist"):
		return true
	default:
		return false
	}
}
