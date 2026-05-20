package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
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
	template string
	entries  []genericXMLEntry
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
	return doc.render(values), nil
}

func (d genericXMLDocument) render(values map[string]string) []byte {
	if len(d.entries) == 0 {
		return []byte(d.template)
	}

	entries := append([]genericXMLEntry(nil), d.entries...)
	sort.Slice(entries, func(i, j int) bool { return entries[i].valueStart < entries[j].valueStart })

	var b strings.Builder
	cursor := 0
	for _, entry := range entries {
		if entry.valueStart < cursor || entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			continue
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			if translated == entry.sourceValue {
				b.WriteString(entry.valueRaw)
			} else {
				b.WriteString(escapeXMLText(translated))
			}
		} else {
			b.WriteString(entry.valueRaw)
		}
		cursor = entry.valueEnd
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
		case xml.Comment, xml.Directive, xml.ProcInst:
			if len(stack) > 0 && strings.TrimSpace(text[tokenStart:tokenEnd]) != "" {
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
		if frame.ownKey == "" && isGenericXMLValueElement(frame.name) {
			return strings.Join(frame.keyPath, ".")
		}
		return strings.Join(frame.keyPath, ".")
	}
	return strings.Join(frame.path, ".")
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
	case "value", "text", "message", "string", "label":
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
