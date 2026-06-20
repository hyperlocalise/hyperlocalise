package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"regexp"
	"strings"
)

// AppleStringsdictParser parses Apple .stringsdict pluralization files.
type AppleStringsdictParser struct{}

type stringsdictEntry struct {
	key         string
	sourceValue string
	valueRaw    string
	valueStart  int
	valueEnd    int
}

type stringsdictDocument struct {
	template string
	entries  []stringsdictEntry
}

func (p AppleStringsdictParser) Parse(content []byte) (map[string]string, error) {
	doc, err := parseStringsdictDocument(content)
	if err != nil {
		return nil, err
	}

	out := map[string]string{}
	for _, entry := range doc.entries {
		if isStringsdictMetadataKey(entry.key) {
			continue
		}
		out[entry.key] = entry.sourceValue
	}
	return out, nil
}

func MarshalAppleStringsdict(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseStringsdictDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func (d stringsdictDocument) render(values map[string]string) []byte {
	if len(d.entries) == 0 {
		return []byte(d.template)
	}

	// BOLT OPTIMIZATION: Removed redundant clones and slices.SortFunc.
	// Entries are naturally collected in document order during parsing.
	entries := d.entries

	var b strings.Builder
	b.Grow(len(d.template))
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

func parseStringsdictDocument(content []byte) (stringsdictDocument, error) {
	text := string(content)
	// BOLT OPTIMIZATION: Hint entries capacity based on content size.
	doc := stringsdictDocument{template: text, entries: make([]stringsdictEntry, 0, len(content)/128)}

	decoder := xml.NewDecoder(bytes.NewReader(content))
	type dictFrame struct {
		pathPrefix string
		pendingKey string
	}
	// BOLT OPTIMIZATION: Hint dictStack capacity.
	dictStack := make([]dictFrame, 0, 8)

	captureKey := false
	var keyBuilder strings.Builder

	inValueString := false
	valuePath := ""
	valueStart := -1
	valueEnd := -1
	var valueBuilder strings.Builder

	for {
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return stringsdictDocument{}, fmt.Errorf("xml decode: %w", err)
		}

		switch token := tok.(type) {
		case xml.StartElement:
			switch token.Name.Local {
			case "key":
				captureKey = true
				keyBuilder.Reset()
			case "dict":
				frame := dictFrame{}
				if len(dictStack) > 0 {
					parent := &dictStack[len(dictStack)-1]
					frame.pathPrefix = parent.pathPrefix
					if parent.pendingKey != "" {
						if frame.pathPrefix != "" {
							frame.pathPrefix += "."
						}
						frame.pathPrefix += parent.pendingKey
						parent.pendingKey = ""
					}
				}
				dictStack = append(dictStack, frame)
			case "string":
				if len(dictStack) == 0 {
					continue
				}
				frame := &dictStack[len(dictStack)-1]
				if frame.pendingKey == "" {
					continue
				}

				// BOLT OPTIMIZATION: Use string concatenation instead of []string and strings.Join
				// to build the entry key. This avoids O(N^2) path construction overhead.
				path := frame.pathPrefix
				if path != "" {
					path += "."
				}
				valuePath = path + frame.pendingKey
				frame.pendingKey = ""

				inValueString = true
				valueBuilder.Reset()
				valueStart = -1
				valueEnd = -1
			}
		case xml.EndElement:
			switch token.Name.Local {
			case "key":
				captureKey = false
				if len(dictStack) > 0 {
					dictStack[len(dictStack)-1].pendingKey = strings.TrimSpace(keyBuilder.String())
				}
			case "dict":
				if len(dictStack) > 0 {
					dictStack = dictStack[:len(dictStack)-1]
				}
			case "string":
				if inValueString {
					if valueStart >= 0 && valueEnd >= valueStart {
						doc.entries = append(doc.entries, stringsdictEntry{
							key:         valuePath,
							sourceValue: valueBuilder.String(),
							valueRaw:    text[valueStart:valueEnd],
							valueStart:  valueStart,
							valueEnd:    valueEnd,
						})
					}
					inValueString = false
					valuePath = ""
				}
			}
		case xml.CharData:
			if captureKey {
				keyBuilder.Write(token)
			}
			if inValueString {
				valueBuilder.Write(token)
				tokenEnd := int(decoder.InputOffset())
				tokenStart := tokenEnd - len(token)
				if valueStart == -1 || tokenStart < valueStart {
					valueStart = tokenStart
				}
				if tokenEnd > valueEnd {
					valueEnd = tokenEnd
				}
			}
		}
	}

	if err := validateStringsdictFormatKeys(doc.entries); err != nil {
		return stringsdictDocument{}, err
	}

	return doc, nil
}

var stringsdictFormatTokenPattern = regexp.MustCompile(`%#@([^@]+)@`)

func validateStringsdictFormatKeys(entries []stringsdictEntry) error {
	// BOLT OPTIMIZATION: Hint childKeysByPrefix map capacity.
	childKeysByPrefix := make(map[string]map[string]struct{}, len(entries)/4)
	for _, entry := range entries {
		// BOLT OPTIMIZATION: Use LastIndexByte to extract prefix and child key.
		// A stringsdict key is at least prefix.substitutionKey.category (3 segments).
		// This is much more efficient than strings.Split and strings.Join for deep keys.
		lastDot := strings.LastIndexByte(entry.key, '.')
		if lastDot < 0 {
			continue
		}
		secondToLastDot := strings.LastIndexByte(entry.key[:lastDot], '.')
		if secondToLastDot < 0 {
			continue
		}

		if isStringsdictMetadataKey(entry.key) {
			continue
		}

		prefix := entry.key[:secondToLastDot]
		childKey := entry.key[secondToLastDot+1 : lastDot]
		if childKey == "" {
			continue
		}

		if _, ok := childKeysByPrefix[prefix]; !ok {
			childKeysByPrefix[prefix] = map[string]struct{}{}
		}
		childKeysByPrefix[prefix][childKey] = struct{}{}
	}

	for _, entry := range entries {
		if !strings.HasSuffix(entry.key, ".NSStringLocalizedFormatKey") {
			continue
		}
		prefix := strings.TrimSuffix(entry.key, ".NSStringLocalizedFormatKey")
		candidates := childKeysByPrefix[prefix]
		if len(candidates) == 0 {
			continue
		}

		matches := stringsdictFormatTokenPattern.FindAllStringSubmatch(entry.sourceValue, -1)
		if len(matches) == 0 {
			return fmt.Errorf("stringsdict key %q has invalid NSStringLocalizedFormatKey %q", entry.key, entry.sourceValue)
		}
		for _, match := range matches {
			token := strings.TrimSpace(match[1])
			if _, ok := candidates[token]; !ok {
				return fmt.Errorf("stringsdict key %q references missing substitution key %q", entry.key, token)
			}
		}
	}

	return nil
}

func isStringsdictMetadataKey(path string) bool {
	// BOLT OPTIMIZATION: Use LastIndexByte for faster character discovery.
	lastDot := strings.LastIndexByte(path, '.')
	segment := path
	if lastDot >= 0 {
		segment = path[lastDot+1:]
	}
	return strings.HasPrefix(segment, "NSString")
}
