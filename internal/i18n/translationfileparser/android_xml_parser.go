package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

// AndroidXMLResourcesParser parses Android string resource XML files.
type AndroidXMLResourcesParser struct{}

type androidResourceEntry struct {
	key         string
	sourceValue string
	valueRaw    string
	valueStart  int
	valueEnd    int
}

type androidResourceDocument struct {
	template       string
	entries        []androidResourceEntry
	namespaceAttrs string
}

type androidPluralState struct {
	name      string
	itemCount int
	hasOther  bool
	startLine int
}

type androidValueCapture struct {
	key        string
	name       string
	innerStart int
	depth      int
}

func (p AndroidXMLResourcesParser) Parse(content []byte) (map[string]string, error) {
	doc, err := parseAndroidResourceDocument(content)
	if err != nil {
		return nil, err
	}

	out := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		out[entry.key] = entry.sourceValue
	}
	return out, nil
}

func (p AndroidXMLResourcesParser) parseWithPath(path string, content []byte) (map[string]string, map[string]string, error) {
	if !isAndroidStringResourcePath(path) {
		return nil, nil, fmt.Errorf("android resources: unsupported .xml file %q; only Android string resource files matching **/res/values*/strings.xml are supported", path)
	}

	values, err := p.Parse(content)
	if err != nil {
		return nil, nil, err
	}
	return values, nil, nil
}

// MarshalAndroidXMLResources preserves an Android resource XML template while
// replacing supported string and plural item values.
func MarshalAndroidXMLResources(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseAndroidResourceDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func (d androidResourceDocument) render(values map[string]string) []byte {
	if len(d.entries) == 0 {
		return []byte(d.template)
	}

	// BOLT OPTIMIZATION: Use slices.Clone and slices.SortFunc instead of sort.Slice to avoid reflection.
	entries := slices.Clone(d.entries)
	slices.SortFunc(entries, func(a, b androidResourceEntry) int {
		return a.valueStart - b.valueStart
	})

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
				b.WriteString(encodeAndroidResourceValue(translated, d.namespaceAttrs))
			}
		} else {
			b.WriteString(entry.valueRaw)
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String())
}

func parseAndroidResourceDocument(content []byte) (androidResourceDocument, error) {
	text := string(content)
	doc := androidResourceDocument{template: text, entries: []androidResourceEntry{}}

	decoder := xml.NewDecoder(bytes.NewReader(content))
	depth := 0
	rootSeen := false
	var plural *androidPluralState
	var capture *androidValueCapture
	seenKeys := map[string]struct{}{}

	for {
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return androidResourceDocument{}, fmt.Errorf("xml decode: %w", err)
		}

		switch token := tok.(type) {
		case xml.StartElement:
			if capture != nil {
				capture.depth++
				depth++
				continue
			}

			if depth == 0 {
				if rootSeen {
					return androidResourceDocument{}, fmt.Errorf("android resources: multiple root elements")
				}
				if token.Name.Local != "resources" {
					return androidResourceDocument{}, fmt.Errorf("android resources: expected <resources> root, got <%s>", token.Name.Local)
				}
				rootSeen = true
				doc.namespaceAttrs = androidNamespaceAttrs(token.Attr)
				depth++
				continue
			}

			switch {
			case depth == 1:
				nextCapture, nextPlural, err := handleAndroidTopLevelStart(text, decoder, token, seenKeys)
				if err != nil {
					return androidResourceDocument{}, err
				}
				if nextCapture != nil {
					capture = nextCapture
				}
				if nextPlural != nil {
					plural = nextPlural
				}
			case depth == 2 && plural != nil:
				nextCapture, err := handleAndroidPluralChildStart(text, decoder, token, plural, seenKeys)
				if err != nil {
					return androidResourceDocument{}, err
				}
				if nextCapture != nil {
					capture = nextCapture
				}
			}
			depth++
		case xml.EndElement:
			if capture != nil {
				if capture.depth == 0 && token.Name.Local == capture.name {
					entry, err := finishAndroidValueCapture(text, decoder, capture)
					if err != nil {
						return androidResourceDocument{}, err
					}
					doc.entries = append(doc.entries, entry)
					capture = nil
				} else if capture.depth > 0 {
					capture.depth--
				}
			}

			if capture == nil && depth == 2 && plural != nil && token.Name.Local == "plurals" {
				if plural.itemCount == 0 {
					return androidResourceDocument{}, fmt.Errorf("android resources: <plurals name=%q> at line %d must contain at least one <item>", plural.name, plural.startLine)
				}
				if !plural.hasOther {
					return androidResourceDocument{}, fmt.Errorf("android resources: <plurals name=%q> at line %d must include an item with quantity=\"other\"", plural.name, plural.startLine)
				}
				plural = nil
			}
			if depth > 0 {
				depth--
			}
		}
	}

	if !rootSeen {
		return androidResourceDocument{}, fmt.Errorf("android resources: expected <resources> root")
	}
	if capture != nil {
		return androidResourceDocument{}, fmt.Errorf("android resources: unterminated <%s> value for key %q", capture.name, capture.key)
	}
	if plural != nil {
		return androidResourceDocument{}, fmt.Errorf("android resources: unterminated <plurals name=%q>", plural.name)
	}

	return doc, nil
}

func handleAndroidTopLevelStart(text string, decoder *xml.Decoder, token xml.StartElement, seenKeys map[string]struct{}) (*androidValueCapture, *androidPluralState, error) {
	if !androidResourceTranslatable(token.Attr) {
		return nil, nil, nil
	}

	switch token.Name.Local {
	case "string":
		key, err := androidRequiredAttr(token, "name")
		if err != nil {
			return nil, nil, err
		}
		capture, err := startAndroidValueCapture(text, decoder, token, key, seenKeys)
		return capture, nil, err
	case "plurals":
		name, err := androidRequiredAttr(token, "name")
		if err != nil {
			return nil, nil, err
		}
		return nil, &androidPluralState{name: name, startLine: lineNumberAt(text, int(decoder.InputOffset()))}, nil
	default:
		return nil, nil, fmt.Errorf("android resources: unsupported <%s> resource at line %d; supported top-level resources are <string> and <plurals>", token.Name.Local, lineNumberAt(text, int(decoder.InputOffset())))
	}
}

func handleAndroidPluralChildStart(text string, decoder *xml.Decoder, token xml.StartElement, plural *androidPluralState, seenKeys map[string]struct{}) (*androidValueCapture, error) {
	if token.Name.Local != "item" {
		return nil, fmt.Errorf("android resources: unsupported <%s> inside <plurals name=%q> at line %d; only <item> is supported", token.Name.Local, plural.name, lineNumberAt(text, int(decoder.InputOffset())))
	}
	quantity, err := androidRequiredAttr(token, "quantity")
	if err != nil {
		return nil, err
	}
	if !androidValidPluralQuantity(quantity) {
		return nil, fmt.Errorf("android resources: <plurals name=%q> has unsupported quantity %q", plural.name, quantity)
	}
	plural.itemCount++
	if quantity == "other" {
		plural.hasOther = true
	}
	key := plural.name + "." + quantity
	return startAndroidValueCapture(text, decoder, token, key, seenKeys)
}

func startAndroidValueCapture(text string, decoder *xml.Decoder, token xml.StartElement, key string, seenKeys map[string]struct{}) (*androidValueCapture, error) {
	if _, ok := seenKeys[key]; ok {
		return nil, fmt.Errorf("android resources: duplicate resource key %q", key)
	}
	seenKeys[key] = struct{}{}
	offset := int(decoder.InputOffset())
	if isSelfClosingXMLStart(text, offset) {
		return nil, fmt.Errorf("android resources: self-closing <%s> resource for key %q is not supported; use an explicit open and close tag", token.Name.Local, key)
	}
	return &androidValueCapture{key: key, name: token.Name.Local, innerStart: offset}, nil
}

func finishAndroidValueCapture(text string, decoder *xml.Decoder, capture *androidValueCapture) (androidResourceEntry, error) {
	endOffset := int(decoder.InputOffset())
	closeStart := strings.LastIndex(text[:endOffset], "</")
	if closeStart < capture.innerStart {
		return androidResourceEntry{}, fmt.Errorf("android resources: could not locate closing </%s> for key %q", capture.name, capture.key)
	}
	raw := text[capture.innerStart:closeStart]
	return androidResourceEntry{
		key:         capture.key,
		sourceValue: raw,
		valueRaw:    raw,
		valueStart:  capture.innerStart,
		valueEnd:    closeStart,
	}, nil
}

func androidRequiredAttr(token xml.StartElement, name string) (string, error) {
	value := attrValue(token.Attr, name)
	if value == "" {
		return "", fmt.Errorf("android resources: <%s> is missing required %q attribute", token.Name.Local, name)
	}
	return value, nil
}

func androidResourceTranslatable(attrs []xml.Attr) bool {
	return !strings.EqualFold(strings.TrimSpace(attrValue(attrs, "translatable")), "false")
}

func androidValidPluralQuantity(quantity string) bool {
	switch quantity {
	case "zero", "one", "two", "few", "many", "other":
		return true
	default:
		return false
	}
}

func isSelfClosingXMLStart(text string, endOffset int) bool {
	if endOffset <= 0 || endOffset > len(text) {
		return false
	}
	start := strings.LastIndex(text[:endOffset], "<")
	if start < 0 {
		return false
	}
	return strings.HasSuffix(strings.TrimSpace(text[start:endOffset]), "/>")
}

func encodeAndroidResourceValue(value, namespaceAttrs string) string {
	// BOLT OPTIMIZATION: Fast-path for strings without '<' or '&' to skip expensive XML well-formedness checks.
	if !strings.ContainsAny(value, "<&") {
		return value
	}

	if androidXMLFragmentWellFormed(value, namespaceAttrs) {
		return value
	}
	return escapeXMLText(value)
}

func androidXMLFragmentWellFormed(value, namespaceAttrs string) bool {
	wrapped := "<resources" + namespaceAttrs + ">" + value + "</resources>"
	decoder := xml.NewDecoder(strings.NewReader(wrapped))
	for {
		if _, err := decoder.Token(); err != nil {
			return isEOFError(err)
		}
	}
}

func androidNamespaceAttrs(attrs []xml.Attr) string {
	var b strings.Builder
	for _, attr := range attrs {
		switch {
		case attr.Name.Space == "xmlns":
			b.WriteString(" xmlns:")
			b.WriteString(attr.Name.Local)
			b.WriteString("=\"")
			b.WriteString(escapeXMLAttr(attr.Value))
			b.WriteString("\"")
		case attr.Name.Space == "" && attr.Name.Local == "xmlns":
			b.WriteString(" xmlns=\"")
			b.WriteString(escapeXMLAttr(attr.Value))
			b.WriteString("\"")
		}
	}
	return b.String()
}

func isAndroidStringResourcePath(path string) bool {
	normalized := filepath.ToSlash(filepath.Clean(strings.TrimSpace(path)))
	// BOLT OPTIMIZATION: Avoid strings.Split while remaining case-insensitive.
	// Android string resources are always in a "strings.xml" file.
	lower := strings.ToLower(normalized)
	if !strings.HasSuffix(lower, "/strings.xml") {
		return false
	}

	// We need to find /res/values*/strings.xml
	// Iterate through path segments backwards to find "values*" then "res"
	idx := len(lower) - len("/strings.xml")
	for idx > 0 {
		prevSlash := strings.LastIndexByte(lower[:idx], '/')
		segment := lower[prevSlash+1 : idx]

		if segment == "values" || strings.HasPrefix(segment, "values-") {
			if prevSlash > 0 {
				prevPrevSlash := strings.LastIndexByte(lower[:prevSlash], '/')
				parent := lower[prevPrevSlash+1 : prevSlash]
				if parent == "res" {
					return true
				}
			}
		}
		idx = prevSlash
	}
	return false
}

// IsAndroidStringResourcePath reports whether path matches the supported Android
// string resource file layout.
func IsAndroidStringResourcePath(path string) bool {
	return isAndroidStringResourcePath(path)
}
