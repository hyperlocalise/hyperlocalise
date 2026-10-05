package translationfileparser

import (
	"fmt"
	"html"
	"strconv"
	"strings"
	"unicode/utf8"
)

// SVGParser extracts translatable character data from SVG text elements.
type SVGParser struct{}

type svgEntry struct {
	key         string
	sourceValue string
	valueStart  int
	valueEnd    int
}

type svgDocument struct {
	template string
	entries  []svgEntry
}

var svgTextElements = map[string]bool{
	"text":     true,
	"tspan":    true,
	"textpath": true,
	"title":    true,
	"desc":     true,
}

var svgSkipElements = map[string]bool{
	"style":    true,
	"script":   true,
	"metadata": true,
}

func (p SVGParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p SVGParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseSVGDocument(content)
	if err != nil {
		return nil, nil, err
	}
	values := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		values[entry.key] = entry.sourceValue
	}
	return values, nil, nil
}

// MarshalSVG replaces extracted text spans and ignores unknown keys so markup
// structure stays aligned with the template.
func MarshalSVG(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseSVGDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func parseSVGDocument(content []byte) (svgDocument, error) {
	if !utf8.Valid(content) {
		return svgDocument{}, fmt.Errorf("svg: content must be valid UTF-8")
	}
	text := string(content)
	doc := svgDocument{
		template: text,
		entries:  make([]svgEntry, 0, 8),
	}
	if strings.TrimSpace(text) == "" {
		return doc, nil
	}

	var (
		stack     []string
		skipDepth int
		index     int
	)
	for pos := 0; pos < len(text); {
		lt := strings.IndexByte(text[pos:], '<')
		if lt < 0 {
			break
		}
		lt += pos
		if skipDepth == 0 && len(stack) > 0 && svgTextElements[stack[len(stack)-1]] {
			if entry, ok := svgTextEntry(text[pos:lt], pos, index+1); ok {
				index++
				doc.entries = append(doc.entries, entry)
			}
		}

		if strings.HasPrefix(text[lt:], "<!--") {
			end := strings.Index(text[lt+4:], "-->")
			if end < 0 {
				return svgDocument{}, fmt.Errorf("svg: unterminated comment")
			}
			pos = lt + 4 + end + 3
			continue
		}
		if strings.HasPrefix(text[lt:], "<![CDATA[") {
			end := strings.Index(text[lt+9:], "]]>")
			if end < 0 {
				return svgDocument{}, fmt.Errorf("svg: unterminated CDATA")
			}
			cdataEnd := lt + 9 + end
			if skipDepth == 0 && len(stack) > 0 && svgTextElements[stack[len(stack)-1]] {
				if entry, ok := svgTextEntry(text[lt+9:cdataEnd], lt+9, index+1); ok {
					index++
					doc.entries = append(doc.entries, entry)
				}
			}
			pos = cdataEnd + 3
			continue
		}
		if strings.HasPrefix(text[lt:], "<?") {
			end := strings.Index(text[lt+2:], "?>")
			if end < 0 {
				return svgDocument{}, fmt.Errorf("svg: unterminated processing instruction")
			}
			pos = lt + 2 + end + 2
			continue
		}
		if strings.HasPrefix(text[lt:], "<!") {
			end := strings.IndexByte(text[lt+2:], '>')
			if end < 0 {
				return svgDocument{}, fmt.Errorf("svg: unterminated declaration")
			}
			pos = lt + 2 + end + 1
			continue
		}

		name, end, selfClosing, isEnd, err := parseSVGTag(text, lt)
		if err != nil {
			return svgDocument{}, err
		}
		if isEnd {
			if len(stack) == 0 || stack[len(stack)-1] != name {
				return svgDocument{}, fmt.Errorf("svg: unexpected closing </%s>", name)
			}
			if svgSkipElements[name] && skipDepth > 0 {
				skipDepth--
			}
			stack = stack[:len(stack)-1]
		} else {
			stack = append(stack, name)
			if svgSkipElements[name] {
				skipDepth++
			}
			if selfClosing {
				if svgSkipElements[name] && skipDepth > 0 {
					skipDepth--
				}
				stack = stack[:len(stack)-1]
			}
		}
		pos = end
	}
	return doc, nil
}

func (d svgDocument) render(values map[string]string) []byte {
	var b strings.Builder
	b.Grow(len(d.template))
	cursor := 0
	for _, entry := range d.entries {
		if entry.valueStart < cursor || entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			continue
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			b.WriteString(html.EscapeString(translated))
		} else {
			b.WriteString(d.template[entry.valueStart:entry.valueEnd])
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String())
}

func svgTextEntry(raw string, start, index int) (svgEntry, bool) {
	if strings.TrimSpace(raw) == "" {
		return svgEntry{}, false
	}
	return svgEntry{
		key:         svgCueKey(index),
		sourceValue: html.UnescapeString(raw),
		valueStart:  start,
		valueEnd:    start + len(raw),
	}, true
}

func svgCueKey(index int) string {
	if index < 10 {
		return "svg.000" + strconv.Itoa(index)
	}
	if index < 100 {
		return "svg.00" + strconv.Itoa(index)
	}
	if index < 1000 {
		return "svg.0" + strconv.Itoa(index)
	}
	return "svg." + strconv.Itoa(index)
}

func parseSVGTag(text string, start int) (name string, end int, selfClosing, isEnd bool, err error) {
	if start >= len(text) || text[start] != '<' {
		return "", start, false, false, fmt.Errorf("svg: expected tag")
	}
	i := start + 1
	if i < len(text) && text[i] == '/' {
		isEnd = true
		i++
	}
	nameStart := i
	for i < len(text) && isSVGNameChar(text[i]) {
		i++
	}
	if i == nameStart {
		return "", start, false, false, fmt.Errorf("svg: missing tag name")
	}
	rawName := text[nameStart:i]
	if colon := strings.IndexByte(rawName, ':'); colon >= 0 {
		rawName = rawName[colon+1:]
	}
	name = strings.ToLower(rawName)

	inQuote := byte(0)
	for i < len(text) {
		ch := text[i]
		if inQuote != 0 {
			if ch == inQuote {
				inQuote = 0
			}
			i++
			continue
		}
		if ch == '"' || ch == '\'' {
			inQuote = ch
			i++
			continue
		}
		if ch == '>' {
			selfClosing = i > start && text[i-1] == '/'
			return name, i + 1, selfClosing, isEnd, nil
		}
		i++
	}
	return "", start, false, false, fmt.Errorf("svg: unterminated <%s> tag", name)
}

func isSVGNameChar(ch byte) bool {
	return ch == ':' || ch == '-' || ch == '_' || ch == '.' ||
		(ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
}
