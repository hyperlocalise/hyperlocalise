package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
)

// AndroidXMLResourcesParser parses Android string resource XML files.
type AndroidXMLResourcesParser struct{}

var androidXMLFragmentPool = sync.Pool{
	New: func() any {
		return &bytes.Buffer{}
	},
}

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
	return doc.render(values)
}

func (d androidResourceDocument) render(values map[string]string) ([]byte, error) {
	if len(d.entries) == 0 {
		return []byte(d.template), nil
	}

	// BOLT OPTIMIZATION: Removed redundant slices.Clone and slices.SortFunc.
	// Entries are naturally collected in document order during parsing.
	entries := d.entries

	var b strings.Builder
	b.Grow(len(d.template))
	cursor := 0
	for _, entry := range entries {
		if entry.valueStart < cursor {
			return nil, fmt.Errorf("android resources render: overlapping or out-of-order replacement for key %q", entry.key)
		}
		if entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			return nil, fmt.Errorf("android resources render: invalid replacement span for key %q", entry.key)
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
	return []byte(b.String()), nil
}

func parseAndroidResourceDocument(content []byte) (androidResourceDocument, error) {
	text := string(content)
	// BOLT OPTIMIZATION: Hint capacity for entries based on content size.
	// Typically an Android resource entry is at least 60-80 bytes.
	capacity := len(content) / 80
	if capacity < 4 {
		capacity = 4
	}
	doc := androidResourceDocument{template: text, entries: make([]androidResourceEntry, 0, capacity)}

	decoder := xml.NewDecoder(bytes.NewReader(content))
	depth := 0
	rootSeen := false
	var plural *androidPluralState
	var capture *androidValueCapture
	seenKeys := make(map[string]struct{}, capacity)

	currentLine := 1
	lastOffset := 0

	for {
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return androidResourceDocument{}, fmt.Errorf("xml decode: %w", err)
		}

		offset := int(decoder.InputOffset())
		currentLine += strings.Count(text[lastOffset:offset], "\n")
		lastOffset = offset

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
				nextCapture, nextPlural, err := handleAndroidTopLevelStart(text, decoder, token, seenKeys, currentLine)
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
				nextCapture, err := handleAndroidPluralChildStart(text, decoder, token, plural, seenKeys, currentLine)
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

func handleAndroidTopLevelStart(text string, decoder *xml.Decoder, token xml.StartElement, seenKeys map[string]struct{}, currentLine int) (*androidValueCapture, *androidPluralState, error) {
	var name string
	translatable := true
	for _, attr := range token.Attr {
		switch attr.Name.Local {
		case "name":
			name = attr.Value
		case "translatable":
			if strings.EqualFold(strings.TrimSpace(attr.Value), "false") {
				translatable = false
			}
		}
	}

	if !translatable {
		return nil, nil, nil
	}
	if name == "" {
		return nil, nil, fmt.Errorf("android resources: <%s> is missing required \"name\" attribute at line %d", token.Name.Local, currentLine)
	}

	switch token.Name.Local {
	case "string":
		capture, err := startAndroidValueCapture(text, decoder, token, name, seenKeys)
		return capture, nil, err
	case "plurals":
		return nil, &androidPluralState{name: name, startLine: currentLine}, nil
	default:
		return nil, nil, fmt.Errorf("android resources: unsupported <%s> resource at line %d; supported top-level resources are <string> and <plurals>", token.Name.Local, currentLine)
	}
}

func handleAndroidPluralChildStart(text string, decoder *xml.Decoder, token xml.StartElement, plural *androidPluralState, seenKeys map[string]struct{}, currentLine int) (*androidValueCapture, error) {
	if token.Name.Local != "item" {
		return nil, fmt.Errorf("android resources: unsupported <%s> inside <plurals name=%q> at line %d; only <item> is supported", token.Name.Local, plural.name, currentLine)
	}

	var quantity string
	for _, attr := range token.Attr {
		if attr.Name.Local == "quantity" {
			quantity = attr.Value
			break
		}
	}
	if quantity == "" {
		return nil, fmt.Errorf("android resources: <item> inside <plurals name=%q> at line %d is missing required \"quantity\" attribute", plural.name, currentLine)
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

func androidValidPluralQuantity(quantity string) bool {
	switch quantity {
	case "zero", "one", "two", "few", "many", "other":
		return true
	default:
		return false
	}
}

func isSelfClosingXMLStart(text string, endOffset int) bool {
	if endOffset < 2 || endOffset > len(text) {
		return false
	}

	// Manual backward scan for "/>" suffix within the element tag.
	// We scan from endOffset - 1 backwards.
	idx := endOffset - 1
	for idx >= 0 && isXMLWhitespace(text[idx]) {
		idx--
	}
	if idx < 1 || text[idx] != '>' || text[idx-1] != '/' {
		return false
	}
	return true
}

type tagSpan struct {
	start int
	end   int
}

func isAlphaNumDashColonDot(c byte) bool {
	return (c >= 'a' && c <= 'z') ||
		(c >= 'A' && c <= 'Z') ||
		(c >= '0' && c <= '9') ||
		c == '_' || c == '-' || c == ':' || c == '.'
}

func isNamespaceDeclared(prefix, namespaceAttrs string) bool {
	if prefix == "" {
		return true
	}
	search := "xmlns:" + prefix + "="
	return strings.Contains(namespaceAttrs, search)
}

func fastIsXMLFragmentWellFormed(value, namespaceAttrs string) bool {
	var stack [8]tagSpan
	depth := 0

	i := 0
	for i < len(value) {
		if value[i] == '<' {
			if i+1 >= len(value) {
				return false
			}

			if value[i+1] == '/' {
				// Closing tag
				nameStart := i + 2
				nameEnd := nameStart
				for nameEnd < len(value) && isAlphaNumDashColonDot(value[nameEnd]) {
					nameEnd++
				}
				if nameEnd == nameStart {
					return false
				}

				idx := nameEnd
				for idx < len(value) && isXMLWhitespace(value[idx]) {
					idx++
				}
				if idx >= len(value) || value[idx] != '>' {
					return false
				}

				tagName := value[nameStart:nameEnd]
				if depth == 0 {
					return false
				}
				depth--
				expected := stack[depth]
				if value[expected.start:expected.end] != tagName {
					return false
				}
				i = idx + 1
				continue
			}

			// Opening or self-closing tag
			nameStart := i + 1
			nameEnd := nameStart
			for nameEnd < len(value) && isAlphaNumDashColonDot(value[nameEnd]) {
				nameEnd++
			}
			if nameEnd == nameStart {
				return false
			}

			tagName := value[nameStart:nameEnd]
			colonIdx := strings.IndexByte(tagName, ':')
			if colonIdx >= 0 {
				prefix := tagName[:colonIdx]
				if !isNamespaceDeclared(prefix, namespaceAttrs) {
					return false
				}
			}

			idx := nameEnd
			selfClosing := false
			for {
				// Skip whitespace
				for idx < len(value) && isXMLWhitespace(value[idx]) {
					idx++
				}
				if idx >= len(value) {
					return false
				}

				if value[idx] == '>' {
					idx++
					break
				}

				if value[idx] == '/' {
					idx++
					for idx < len(value) && isXMLWhitespace(value[idx]) {
						idx++
					}
					if idx < len(value) && value[idx] == '>' {
						selfClosing = true
						idx++
						break
					}
					return false
				}

				// Attribute name
				attrStart := idx
				for idx < len(value) && isAlphaNumDashColonDot(value[idx]) {
					idx++
				}
				if idx == attrStart {
					return false
				}
				attrName := value[attrStart:idx]
				attrColon := strings.IndexByte(attrName, ':')
				if attrColon >= 0 {
					prefix := attrName[:attrColon]
					if !isNamespaceDeclared(prefix, namespaceAttrs) {
						return false
					}
				}

				// Skip whitespace before '='
				for idx < len(value) && isXMLWhitespace(value[idx]) {
					idx++
				}
				if idx >= len(value) || value[idx] != '=' {
					return false
				}
				idx++ // Skip '='

				// Skip whitespace after '='
				for idx < len(value) && isXMLWhitespace(value[idx]) {
					idx++
				}
				if idx >= len(value) {
					return false
				}

				quote := value[idx]
				if quote != '"' && quote != '\'' {
					return false
				}
				idx++ // Skip quote

				valStart := idx
				for idx < len(value) && value[idx] != quote {
					if value[idx] == '<' {
						return false
					}
					idx++
				}
				if idx >= len(value) {
					return false
				}
				valEnd := idx
				idx++ // Skip closing quote

				if strings.ContainsAny(value[valStart:valEnd], "&") {
					return false
				}
			}

			if !selfClosing {
				if depth >= len(stack) {
					return false
				}
				stack[depth] = tagSpan{start: nameStart, end: nameEnd}
				depth++
			}
			i = idx
			continue
		} else if value[i] == '&' {
			semiOffset := strings.IndexByte(value[i+1:], ';')
			if semiOffset < 0 {
				return false
			}
			entity := value[i+1 : i+1+semiOffset]
			if !isXMLTextEntityReference(entity) {
				return false
			}
			i += 1 + semiOffset + 1
			continue
		} else {
			i++
		}
	}

	return depth == 0
}

func encodeAndroidResourceValue(value, namespaceAttrs string) string {
	// BOLT OPTIMIZATION: Fast-path for strings without '<', '&', or '>' to skip expensive XML well-formedness checks.
	if !strings.ContainsAny(value, "<&>") {
		return value
	}

	// BOLT OPTIMIZATION: Zero-allocation fast-path to check XML fragment well-formedness
	// without creating a bytes.Buffer or instantiating an xml.Decoder.
	if fastIsXMLFragmentWellFormed(value, namespaceAttrs) {
		return value
	}

	if androidXMLFragmentWellFormed(value, namespaceAttrs) {
		return value
	}
	return escapeXMLText(value)
}

func androidXMLFragmentWellFormed(value, namespaceAttrs string) bool {
	b := androidXMLFragmentPool.Get().(*bytes.Buffer)
	b.Reset()
	defer androidXMLFragmentPool.Put(b)

	b.WriteString("<resources")
	b.WriteString(namespaceAttrs)
	b.WriteString(">")
	b.WriteString(value)
	b.WriteString("</resources>")

	decoder := xml.NewDecoder(b)
	for {
		if _, err := decoder.Token(); err != nil {
			return isEOFError(err)
		}
	}
}

func androidNamespaceAttrs(attrs []xml.Attr) string {
	// BOLT OPTIMIZATION: Avoid double iteration and builder allocation until needed.
	var b strings.Builder
	initialized := false
	for _, attr := range attrs {
		isNamespace := false
		switch {
		case attr.Name.Space == "xmlns":
			isNamespace = true
		case attr.Name.Space == "" && attr.Name.Local == "xmlns":
			isNamespace = true
		}

		if isNamespace {
			if !initialized {
				b.Grow(128) // Typical namespace string size
				initialized = true
			}

			if attr.Name.Space == "xmlns" {
				b.WriteString(" xmlns:")
				b.WriteString(attr.Name.Local)
			} else {
				b.WriteString(" xmlns")
			}
			b.WriteString("=\"")
			b.WriteString(escapeXMLAttr(attr.Value))
			b.WriteString("\"")
		}
	}

	if !initialized {
		return ""
	}
	return b.String()
}

func isAndroidStringResourcePath(path string) bool {
	path = strings.TrimSpace(path)
	// BOLT OPTIMIZATION: Fast-path suffix check to skip expensive filepath/string ops.
	if len(path) < 11 { // "strings.xml" is 11 chars
		return false
	}
	// Case-insensitive check for "strings.xml" at the end without full string lowering or cleaning.
	if !strings.EqualFold(path[len(path)-11:], "strings.xml") {
		return false
	}

	normalized := filepath.ToSlash(filepath.Clean(path))
	// BOLT OPTIMIZATION: Avoid strings.Split while remaining case-insensitive.
	// Android string resources are always in a "strings.xml" file.
	lower := strings.ToLower(normalized)
	if lower == "strings.xml" {
		// Just the filename is acceptable as a relative path.
		return true
	}
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
