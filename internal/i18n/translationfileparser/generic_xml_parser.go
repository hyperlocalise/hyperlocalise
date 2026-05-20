package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// GenericXMLParser parses non-Android XML locale files whose translatable
// values are text-only leaf elements.
type GenericXMLParser struct{}

type genericXMLEntry struct {
	key         string
	sourceValue string
	valueRaw    string
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
	path              []string
	keyPath           []string
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

	out := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		out[entry.key] = entry.sourceValue
	}
	return out, nil
}

func MarshalGenericXML(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseGenericXMLDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values, "", ""), nil
}

func MarshalGenericXMLWithTargetLocale(template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	doc, err := parseGenericXMLDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values, sourceLocale, targetLocale), nil
}

func (d genericXMLDocument) render(values map[string]string, sourceLocale, targetLocale string) []byte {
	replacements := make([]genericXMLReplacement, 0, len(d.entries)+len(d.rootLocaleAttrs))
	for _, entry := range d.entries {
		value := entry.valueRaw
		if translated, ok := values[entry.key]; ok {
			if translated != entry.sourceValue {
				value = escapeXMLText(translated)
			}
		}
		replacements = append(replacements, genericXMLReplacement{
			start: entry.valueStart,
			end:   entry.valueEnd,
			value: value,
		})
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
		return []byte(d.template)
	}

	sort.Slice(replacements, func(i, j int) bool { return replacements[i].start < replacements[j].start })

	var b strings.Builder
	cursor := 0
	for _, replacement := range replacements {
		if replacement.start < cursor || replacement.start > len(d.template) || replacement.end > len(d.template) {
			continue
		}
		b.WriteString(d.template[cursor:replacement.start])
		b.WriteString(replacement.value)
		cursor = replacement.end
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String())
}

func parseGenericXMLDocument(content []byte) (genericXMLDocument, error) {
	text := string(content)
	doc := genericXMLDocument{template: text}

	decoder := xml.NewDecoder(bytes.NewReader(content))
	stack := []*genericXMLFrame{}
	seenKeys := map[string]struct{}{}
	rootName := ""

	for {
		tokenStart := int(decoder.InputOffset())
		tok, err := decoder.Token()
		tokenEnd := int(decoder.InputOffset())
		if err != nil {
			if isEOFError(err) {
				break
			}
			return genericXMLDocument{}, fmt.Errorf("xml decode: %w", err)
		}

		switch token := tok.(type) {
		case xml.StartElement:
			name := strings.TrimSpace(token.Name.Local)
			if name == "" {
				return genericXMLDocument{}, fmt.Errorf("generic XML parser: element with empty local name is not supported")
			}
			if rootName == "" {
				rootName = name
				if isGenericXMLSpecializedRoot(rootName) {
					return genericXMLDocument{}, fmt.Errorf("generic XML parser: <%s> files require a specialized parser and are not supported as generic XML", rootName)
				}
				doc.rootLocaleAttrs = genericXMLRootLocaleAttrs(text[tokenStart:tokenEnd], tokenStart)
			}
			if len(stack) > 0 {
				stack[len(stack)-1].hasElementChild = true
			}

			parentPath := []string{}
			parentKeyPath := []string{}
			parentMetadata := false
			if len(stack) > 0 {
				parent := stack[len(stack)-1]
				parentPath = append(parentPath, parent.path...)
				parentKeyPath = append(parentKeyPath, parent.keyPath...)
				parentMetadata = parent.inMetadata
			}

			path := parentPath
			if len(stack) > 0 {
				path = append(path, name)
			}
			ownKey := ""
			if len(stack) > 0 {
				ownKey = genericXMLKeyAttr(token.Attr)
			}
			keyPath := parentKeyPath
			if ownKey != "" {
				keyPath = append(keyPath, ownKey)
			}

			stack = append(stack, &genericXMLFrame{
				name:         name,
				path:         path,
				keyPath:      keyPath,
				ownKey:       ownKey,
				inMetadata:   parentMetadata || isGenericXMLMetadataElement(name),
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

			value := frame.value.String()
			if !isTranslatableChunk(value) {
				stack = stack[:len(stack)-1]
				continue
			}
			key := genericXMLResolvedKey(frame)
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
				valueRaw:    text[frame.contentStart:tokenStart],
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
			if strings.TrimSpace(string(token)) != "" {
				current.hasNonWhitespace = true
			}
			current.value.Write(token)
		case xml.Comment:
			if len(stack) > 0 && strings.TrimSpace(string(token)) != "" {
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

func genericXMLResolvedKey(frame *genericXMLFrame) string {
	if len(frame.keyPath) > 0 {
		if frame.ownKey == "" && !isGenericXMLValueElement(frame.name) {
			parts := append([]string{}, frame.keyPath...)
			parts = append(parts, frame.name)
			return strings.Join(parts, ".")
		}
		return strings.Join(frame.keyPath, ".")
	}
	return strings.Join(frame.path, ".")
}

var genericXMLRootLocaleAttrPattern = regexp.MustCompile(`(?i)(?:^|[\s<])(?:xml:lang|lang|locale|language|code)\s*=\s*(?:"([^"]*)"|'([^']*)')`)

func genericXMLRootLocaleAttrs(rawStartTag string, absoluteStart int) []genericXMLLocaleAttr {
	matches := genericXMLRootLocaleAttrPattern.FindAllStringSubmatchIndex(rawStartTag, -1)
	if len(matches) == 0 {
		return nil
	}

	attrs := make([]genericXMLLocaleAttr, 0, len(matches))
	for _, match := range matches {
		valueStart, valueEnd := match[2], match[3]
		if valueStart < 0 || valueEnd < 0 {
			valueStart, valueEnd = match[4], match[5]
		}
		if valueStart < 0 || valueEnd < 0 {
			continue
		}
		attrs = append(attrs, genericXMLLocaleAttr{
			valueStart: absoluteStart + valueStart,
			valueEnd:   absoluteStart + valueEnd,
			value:      rawStartTag[valueStart:valueEnd],
		})
	}
	return attrs
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
	return false
}

func genericXMLTargetLocaleForAttr(attrValue, targetLocale string) string {
	target := strings.TrimSpace(targetLocale)
	attr := strings.TrimSpace(attrValue)
	if attr != "" && !strings.Contains(attr, "-") && !strings.Contains(attr, "_") {
		if idx := strings.IndexAny(target, "-_"); idx >= 0 {
			return target[:idx]
		}
	}
	return target
}

func genericXMLKeyAttr(attrs []xml.Attr) string {
	for _, wanted := range []string{"key", "id", "name"} {
		for _, attr := range attrs {
			if strings.EqualFold(attr.Name.Local, wanted) {
				return strings.TrimSpace(attr.Value)
			}
		}
	}
	return ""
}

func isGenericXMLMetadataElement(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "meta", "metadata", "comment", "comments", "description", "descriptions", "note", "notes", "context", "extracomment", "developercomment", "resheader", "assembly":
		return true
	default:
		return false
	}
}

func isGenericXMLValueElement(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "value":
		return true
	default:
		return false
	}
}

func isGenericXMLSpecializedRoot(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "resources", "xliff", "plist":
		return true
	default:
		return false
	}
}

func escapeXMLAttr(s string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(s)
}
