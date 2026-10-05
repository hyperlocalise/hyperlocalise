package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"regexp"
	"strconv"
	"strings"
)

const (
	qtLinguistNumerusKeyInfix = "::numerus."
	qtLinguistUnknownContext  = "unknown"
)

var (
	qtLinguistTSRootPattern  = regexp.MustCompile(`(?is)^\s*(?:<\?xml\b[^>]*\?>\s*)?(?:<!--.*?-->\s*)*(?:<!DOCTYPE\s+TS\b[^>]*>\s*)?(?:<!--.*?-->\s*)*<TS\b`)
	qtLinguistByteTagPattern = regexp.MustCompile(`(?i)<byte\b[^>]*(?:/>|>\s*</byte\s*>)`)
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// QtLinguistParser parses Qt Linguist TS catalogs.
type QtLinguistParser struct{}

// TSFileParser routes .ts files to Qt Linguist or JavaScript/TypeScript locale modules.
type TSFileParser struct{}

func (p TSFileParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p TSFileParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	if LooksLikeQtLinguistTS(content) {
		return QtLinguistParser{}.ParseWithContext(content)
	}
	return JSTSLocaleModuleParser{}.ParseWithContext(content)
}

func (p QtLinguistParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p QtLinguistParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	if !LooksLikeQtLinguistTS(content) {
		return nil, nil, fmt.Errorf("qt linguist: missing <TS> root")
	}
	content = bytes.TrimPrefix(content, utf8BOM)

	capacity := len(content) / 256
	if capacity < 4 {
		capacity = 4
	}
	out := make(map[string]string, capacity)
	contextByKey := make(map[string]string, capacity)

	decoder := xml.NewDecoder(bytes.NewReader(content))
	var (
		contextName   string
		msg           qtLinguistMessage
		inContext     bool
		inMessage     bool
		captureName   string
		captureStart  int
		captureDepth  int
		locationAttrs []xml.Attr
	)

	for {
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return nil, nil, fmt.Errorf("qt linguist xml decode: %w", err)
		}
		offset := int(decoder.InputOffset())

		switch token := tok.(type) {
		case xml.StartElement:
			if captureName != "" {
				captureDepth++
				continue
			}
			switch token.Name.Local {
			case "context":
				inContext = true
				contextName = ""
			case "message":
				msg = newQtLinguistMessage(token.Attr)
				inMessage = true
			case "name":
				if inContext && !inMessage {
					captureName = "context-name"
					captureStart = offset
					captureDepth = 0
				}
			case "source", "comment", "extracomment", "translation", "numerusform":
				if inMessage {
					if token.Name.Local == "translation" {
						msg.translationType = qtLinguistAttr(token.Attr, "type")
						if msg.numerus {
							continue
						}
					}
					captureName = token.Name.Local
					captureStart = offset
					captureDepth = 0
				}
			case "location":
				if inMessage {
					locationAttrs = token.Attr
				}
			}
		case xml.EndElement:
			if captureName != "" {
				if captureDepth > 0 {
					captureDepth--
					continue
				}
				if token.Name.Local == captureName || (captureName == "context-name" && token.Name.Local == "name") {
					inner := qtLinguistInnerXML(content, captureStart, offset)
					switch captureName {
					case "context-name":
						contextName = strings.TrimSpace(qtLinguistPlainText(inner))
					case "source":
						msg.source = qtLinguistDecodedValue(inner)
					case "comment":
						msg.comment = strings.TrimSpace(qtLinguistPlainText(inner))
					case "extracomment":
						msg.extracomment = strings.TrimSpace(qtLinguistPlainText(inner))
					case "translation":
						if !msg.numerus {
							msg.translation = qtLinguistTranslationValue(inner)
						}
					case "numerusform":
						msg.numerusForms = append(msg.numerusForms, qtLinguistTranslationValue(inner))
					}
					captureName = ""
				}
				continue
			}
			switch token.Name.Local {
			case "location":
				if inMessage {
					msg.locations = append(msg.locations, qtLinguistLocation(locationAttrs))
					locationAttrs = nil
				}
			case "message":
				if inMessage {
					finalizeQtLinguistMessage(out, contextByKey, contextName, msg)
					inMessage = false
				}
			case "context":
				inContext = false
				contextName = ""
			}
		}
	}

	return out, contextByKey, nil
}

// LooksLikeQtLinguistTS reports whether content is a Qt Linguist TS catalog.
func LooksLikeQtLinguistTS(content []byte) bool {
	content = bytes.TrimPrefix(bytes.TrimSpace(content), utf8BOM)
	if len(content) == 0 {
		return false
	}
	return qtLinguistTSRootPattern.Match(content)
}

// MarshalQtLinguist rewrites message translations and TS locale attributes.
// Every key in values is treated as staged.
func MarshalQtLinguist(template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	return MarshalQtLinguistStaged(template, values, nil, sourceLocale, targetLocale)
}

// MarshalQtLinguistStaged rewrites message translations and TS locale attributes.
// Messages absent from staged whose value is only the source fallback keep their
// existing <translation>, including type="unfinished". A nil staged map treats
// every key in values as staged.
func MarshalQtLinguistStaged(template []byte, values, staged map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	if !LooksLikeQtLinguistTS(template) {
		return nil, fmt.Errorf("qt linguist: missing <TS> root")
	}

	var out bytes.Buffer
	if bytes.HasPrefix(template, utf8BOM) {
		template = template[len(utf8BOM):]
		out.Write(utf8BOM)
	}
	decoder := xml.NewDecoder(bytes.NewReader(template))
	encoder := xml.NewEncoder(&out)
	contextName := ""

	for {
		tok, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("qt linguist xml decode: %w", err)
		}

		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "TS":
				t = rewriteQtLinguistTSAttrs(t, sourceLocale, targetLocale)
				if err := encoder.EncodeToken(t); err != nil {
					return nil, fmt.Errorf("qt linguist xml encode start: %w", err)
				}
			case "message":
				if err := marshalQtLinguistMessage(encoder, decoder, template, t, contextName, values, staged); err != nil {
					return nil, err
				}
			case "context":
				contextName = ""
				if err := encoder.EncodeToken(t); err != nil {
					return nil, fmt.Errorf("qt linguist xml encode start: %w", err)
				}
			case "name":
				if err := encoder.EncodeToken(t); err != nil {
					return nil, fmt.Errorf("qt linguist xml encode start: %w", err)
				}
				inner, err := readQtLinguistSimpleElement(decoder, template, "name")
				if err != nil {
					return nil, err
				}
				contextName = strings.TrimSpace(qtLinguistPlainText(inner))
				if inner != "" {
					if err := encodeQtLinguistFragment(encoder, inner); err != nil {
						return nil, err
					}
				}
				if err := encoder.EncodeToken(xml.EndElement{Name: t.Name}); err != nil {
					return nil, fmt.Errorf("qt linguist xml encode end: %w", err)
				}
			default:
				if err := encoder.EncodeToken(t); err != nil {
					return nil, fmt.Errorf("qt linguist xml encode start: %w", err)
				}
			}
		case xml.EndElement:
			if t.Name.Local == "context" {
				contextName = ""
			}
			if err := encoder.EncodeToken(t); err != nil {
				return nil, fmt.Errorf("qt linguist xml encode token: %w", err)
			}
		case xml.CharData, xml.Comment, xml.Directive, xml.ProcInst:
			if err := encoder.EncodeToken(t); err != nil {
				return nil, fmt.Errorf("qt linguist xml encode token: %w", err)
			}
		}
	}

	if err := encoder.Flush(); err != nil {
		return nil, fmt.Errorf("qt linguist xml encode flush: %w", err)
	}
	return out.Bytes(), nil
}

type qtLinguistMessage struct {
	id              string
	comment         string
	extracomment    string
	source          string
	translation     string
	translationType string
	numerus         bool
	numerusForms    []string
	// blankPrimaryVariant is set when a kept <lengthvariant> subtree has a blank first variant.
	blankPrimaryVariant bool
	locations           []string
	start               xml.StartElement
	children            []xml.Token
}

func newQtLinguistMessage(attrs []xml.Attr) qtLinguistMessage {
	return qtLinguistMessage{
		id:      qtLinguistAttr(attrs, "id"),
		numerus: strings.EqualFold(qtLinguistAttr(attrs, "numerus"), "yes"),
	}
}

func finalizeQtLinguistMessage(out map[string]string, contextByKey map[string]string, contextName string, msg qtLinguistMessage) {
	if qtLinguistTranslationSkipped(msg.translationType) {
		return
	}
	if !qtLinguistMessageKeyed(msg) {
		return
	}

	key := qtLinguistMessageKey(contextName, msg.source, msg.comment, msg.id)
	entryContext := qtLinguistEntryContext(msg.extracomment, msg.comment, msg.locations)

	if msg.numerus {
		if len(msg.numerusForms) == 0 {
			value := strings.TrimSpace(msg.translation)
			if value == "" {
				value = msg.source
			}
			if value == "" {
				return
			}
			out[key+qtLinguistNumerusKeyInfix+"0"] = value
			if entryContext != "" {
				contextByKey[key+qtLinguistNumerusKeyInfix+"0"] = entryContext
			}
			return
		}
		if strings.TrimSpace(msg.source) == "" && qtLinguistAllBlank(msg.numerusForms) {
			return
		}
		for i, form := range msg.numerusForms {
			value := form
			if strings.TrimSpace(value) == "" {
				value = msg.source
			}
			formKey := key + qtLinguistNumerusKeyInfix + strconv.Itoa(i)
			out[formKey] = value
			if entryContext != "" {
				contextByKey[formKey] = entryContext
			}
		}
		return
	}

	value := msg.translation
	if strings.TrimSpace(value) == "" {
		value = msg.source
	}
	if value == "" {
		return
	}
	out[key] = value
	if entryContext != "" {
		contextByKey[key] = entryContext
	}
}

// qtLinguistMessageKeyed reports whether a message has a source or an explicit id to key it by.
func qtLinguistMessageKeyed(msg qtLinguistMessage) bool {
	return strings.TrimSpace(msg.source) != "" || strings.TrimSpace(msg.id) != ""
}

func qtLinguistAllBlank(values []string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func qtLinguistMessageKey(contextName, source, comment, id string) string {
	if trimmedID := strings.TrimSpace(id); trimmedID != "" {
		return trimmedID
	}
	contextName = strings.TrimSpace(contextName)
	if contextName == "" {
		contextName = qtLinguistUnknownContext
	}
	key := contextName + "|" + source
	if trimmedComment := strings.TrimSpace(comment); trimmedComment != "" {
		key += "|" + trimmedComment
	}
	return key
}

func qtLinguistEntryContext(extracomment, comment string, locations []string) string {
	parts := make([]string, 0, 3)
	if extracomment = strings.TrimSpace(extracomment); extracomment != "" {
		parts = append(parts, extracomment)
	}
	if comment = strings.TrimSpace(comment); comment != "" {
		parts = append(parts, comment)
	}
	filtered := make([]string, 0, len(locations))
	for _, location := range locations {
		if location = strings.TrimSpace(location); location != "" {
			filtered = append(filtered, location)
		}
	}
	if len(filtered) > 0 {
		parts = append(parts, strings.Join(filtered, ", "))
	}
	return strings.Join(parts, "\n")
}

func qtLinguistLocation(attrs []xml.Attr) string {
	filename := qtLinguistAttr(attrs, "filename")
	line := qtLinguistAttr(attrs, "line")
	switch {
	case filename != "" && line != "":
		return filename + ":" + line
	case filename != "":
		return filename
	default:
		return ""
	}
}

func qtLinguistTranslationSkipped(translationType string) bool {
	switch strings.ToLower(strings.TrimSpace(translationType)) {
	case "obsolete", "vanished":
		return true
	default:
		return false
	}
}

func qtLinguistAttr(attrs []xml.Attr, name string) string {
	for _, attr := range attrs {
		if attr.Name.Local == name {
			return strings.TrimSpace(attr.Value)
		}
	}
	return ""
}

func qtLinguistInnerXML(content []byte, captureStart, offset int) string {
	if captureStart < 0 || offset > len(content) || captureStart > offset {
		return ""
	}
	inner := content[captureStart:offset]
	closeStart := bytes.LastIndex(inner, []byte("</"))
	if closeStart < 0 {
		return ""
	}
	return string(inner[:closeStart])
}

func qtLinguistPlainText(inner string) string {
	if strings.ContainsAny(inner, "<>") {
		return strings.TrimSpace(inner)
	}
	return html.UnescapeString(inner)
}

func qtLinguistCanonicalByteTag(raw string) string {
	start, ok := qtLinguistParseByteElement(raw)
	if !ok {
		return raw
	}
	var b strings.Builder
	b.WriteString("<byte")
	for _, attr := range start.Attr {
		b.WriteByte(' ')
		if attr.Name.Space != "" {
			b.WriteString(attr.Name.Space)
			b.WriteByte(':')
		}
		b.WriteString(attr.Name.Local)
		b.WriteString(`="`)
		b.WriteString(html.EscapeString(attr.Value))
		b.WriteByte('"')
	}
	b.WriteString("/>")
	return b.String()
}

func qtLinguistDecodedValue(inner string) string {
	if !strings.Contains(inner, "<") {
		return html.UnescapeString(inner)
	}
	locs := qtLinguistByteTagPattern.FindAllStringIndex(inner, -1)
	if len(locs) == 0 {
		return html.UnescapeString(inner)
	}
	var b strings.Builder
	last := 0
	for _, loc := range locs {
		if loc[0] > last {
			b.WriteString(html.UnescapeString(inner[last:loc[0]]))
		}
		b.WriteString(qtLinguistCanonicalByteTag(inner[loc[0]:loc[1]]))
		last = loc[1]
	}
	if last < len(inner) {
		b.WriteString(html.UnescapeString(inner[last:]))
	}
	return b.String()
}

// qtLinguistTranslationValue returns the primary (longest) length variant when
// the translation holds <lengthvariant> children. Blank leading variants are
// skipped so a later filled variant is not treated as untranslated.
func qtLinguistTranslationValue(inner string) string {
	value, _ := qtLinguistTranslationValueWithBlankPrimary(inner)
	return value
}

// qtLinguistTranslationValueWithBlankPrimary also reports whether the first
// <lengthvariant> is blank, so writeback can keep type="unfinished".
func qtLinguistTranslationValueWithBlankPrimary(inner string) (string, bool) {
	if !strings.Contains(inner, "<lengthvariant") {
		return qtLinguistDecodedValue(inner), false
	}
	variant, ok, blankPrimary := qtLinguistPrimaryLengthVariant(inner)
	if ok {
		return variant, blankPrimary
	}
	return qtLinguistDecodedValue(inner), blankPrimary
}

func qtLinguistPrimaryLengthVariant(inner string) (string, bool, bool) {
	wrapped := []byte("<x>" + inner + "</x>")
	decoder := xml.NewDecoder(bytes.NewReader(wrapped))
	depth := 0
	captureStart := -1
	foundAny := false
	blankPrimary := false
	for {
		tok, err := decoder.Token()
		if err != nil {
			return "", foundAny, blankPrimary
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if depth == 2 && t.Name.Local == "lengthvariant" && captureStart < 0 {
				captureStart = int(decoder.InputOffset())
			}
		case xml.EndElement:
			if depth == 2 && captureStart >= 0 {
				variant := qtLinguistDecodedValue(qtLinguistInnerXML(wrapped, captureStart, int(decoder.InputOffset())))
				blank := strings.TrimSpace(variant) == ""
				if !foundAny {
					blankPrimary = blank
				}
				foundAny = true
				if !blank {
					return variant, true, blankPrimary
				}
				captureStart = -1
			}
			depth--
			if depth == 0 {
				return "", foundAny, blankPrimary
			}
		}
	}
}

func qtLinguistLocale(locale string) string {
	return strings.ReplaceAll(strings.TrimSpace(locale), "-", "_")
}

func rewriteQtLinguistTSAttrs(start xml.StartElement, sourceLocale, targetLocale string) xml.StartElement {
	sourceLocale = qtLinguistLocale(sourceLocale)
	targetLocale = qtLinguistLocale(targetLocale)
	cloned := xml.CopyToken(start).(xml.StartElement)
	cloned.Attr = append([]xml.Attr(nil), start.Attr...)

	setAttr := func(name, value string) {
		if value == "" {
			return
		}
		for i := range cloned.Attr {
			if cloned.Attr[i].Name.Local == name {
				cloned.Attr[i].Value = value
				return
			}
		}
		cloned.Attr = append(cloned.Attr, xml.Attr{Name: xml.Name{Local: name}, Value: value})
	}
	setAttr("language", targetLocale)
	setAttr("sourcelanguage", sourceLocale)
	return cloned
}

func readQtLinguistSimpleElement(decoder *xml.Decoder, template []byte, name string) (string, error) {
	captureStart := int(decoder.InputOffset())
	depth := 1
	for depth > 0 {
		tok, err := decoder.Token()
		if err != nil {
			return "", fmt.Errorf("qt linguist xml decode %s: %w", name, err)
		}
		switch tok.(type) {
		case xml.StartElement:
			depth++
		case xml.EndElement:
			depth--
		}
	}
	return qtLinguistInnerXML(template, captureStart, int(decoder.InputOffset())), nil
}

func marshalQtLinguistMessage(encoder *xml.Encoder, decoder *xml.Decoder, template []byte, start xml.StartElement, contextName string, values, staged map[string]string) error {
	msg, err := readQtLinguistMessage(decoder, template, start)
	if err != nil {
		return err
	}
	return writeQtLinguistMessage(encoder, msg, contextName, values, staged)
}

func readQtLinguistMessage(decoder *xml.Decoder, template []byte, start xml.StartElement) (qtLinguistMessage, error) {
	msg := newQtLinguistMessage(start.Attr)
	msg.start = start
	depth := 1
	var (
		captureName  string
		captureStart int
		captureDepth int
	)

	for depth > 0 {
		tok, err := decoder.Token()
		if err != nil {
			return msg, fmt.Errorf("qt linguist xml decode message: %w", err)
		}
		offset := int(decoder.InputOffset())
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if captureName != "" {
				captureDepth++
				msg.children = append(msg.children, xml.CopyToken(t))
				continue
			}
			if t.Name.Local == "source" || t.Name.Local == "comment" || t.Name.Local == "translation" || t.Name.Local == "numerusform" {
				if t.Name.Local == "translation" {
					msg.translationType = qtLinguistAttr(t.Attr, "type")
					if msg.numerus {
						msg.children = append(msg.children, xml.CopyToken(t))
						continue
					}
				}
				captureName = t.Name.Local
				captureStart = offset
				captureDepth = 0
			}
			msg.children = append(msg.children, xml.CopyToken(t))
		case xml.EndElement:
			depth--
			if captureName != "" {
				if captureDepth > 0 {
					captureDepth--
					msg.children = append(msg.children, xml.CopyToken(t))
					continue
				}
				if t.Name.Local == captureName {
					inner := qtLinguistInnerXML(template, captureStart, offset)
					switch captureName {
					case "source":
						msg.source = qtLinguistDecodedValue(inner)
					case "comment":
						msg.comment = strings.TrimSpace(qtLinguistPlainText(inner))
					case "translation":
						if !msg.numerus {
							value, blankPrimary := qtLinguistTranslationValueWithBlankPrimary(inner)
							msg.translation = value
							msg.blankPrimaryVariant = msg.blankPrimaryVariant || blankPrimary
						}
					case "numerusform":
						value, blankPrimary := qtLinguistTranslationValueWithBlankPrimary(inner)
						msg.numerusForms = append(msg.numerusForms, value)
						msg.blankPrimaryVariant = msg.blankPrimaryVariant || blankPrimary
					}
					captureName = ""
				}
			}
			if depth > 0 {
				msg.children = append(msg.children, xml.CopyToken(t))
			}
		default:
			msg.children = append(msg.children, xml.CopyToken(t))
		}
	}
	return msg, nil
}

func writeQtLinguistMessage(encoder *xml.Encoder, msg qtLinguistMessage, contextName string, values, staged map[string]string) error {
	if err := encoder.EncodeToken(msg.start); err != nil {
		return fmt.Errorf("qt linguist xml encode start: %w", err)
	}
	if qtLinguistTranslationSkipped(msg.translationType) || !qtLinguistMessageKeyed(msg) {
		for _, child := range msg.children {
			if err := encoder.EncodeToken(child); err != nil {
				return fmt.Errorf("qt linguist xml encode token: %w", err)
			}
		}
		if err := encoder.EncodeToken(xml.EndElement{Name: msg.start.Name}); err != nil {
			return fmt.Errorf("qt linguist xml encode end: %w", err)
		}
		return nil
	}

	key := qtLinguistMessageKey(contextName, msg.source, msg.comment, msg.id)
	replacements := qtLinguistReplacements(key, msg, values)
	if replacements != nil && !qtLinguistMessageStaged(key, staged) && qtLinguistOnlySourceFallback(replacements, msg.source) {
		replacements = nil
	}
	unchanged := replacements != nil && qtLinguistReplacementsUnchanged(msg, replacements)
	skipTranslationDepth := 0
	wroteTranslation := false

	for _, child := range msg.children {
		switch t := child.(type) {
		case xml.StartElement:
			if skipTranslationDepth > 0 {
				skipTranslationDepth++
				continue
			}
			if t.Name.Local == "translation" && unchanged && !wroteTranslation {
				// Keep the original subtree so length variants and markup survive.
				if !msg.blankPrimaryVariant {
					t.Attr = qtLinguistTranslationAttrs(t.Attr, replacements)
				}
				if err := encoder.EncodeToken(t); err != nil {
					return fmt.Errorf("qt linguist xml encode start: %w", err)
				}
				wroteTranslation = true
				continue
			}
			if t.Name.Local == "translation" && replacements != nil && !unchanged {
				if err := writeQtLinguistTranslation(encoder, t, replacements, msg.numerus); err != nil {
					return err
				}
				skipTranslationDepth = 1
				wroteTranslation = true
				continue
			}
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("qt linguist xml encode start: %w", err)
			}
		case xml.EndElement:
			if skipTranslationDepth > 0 {
				skipTranslationDepth--
				continue
			}
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("qt linguist xml encode end: %w", err)
			}
		default:
			if skipTranslationDepth > 0 {
				continue
			}
			if err := encoder.EncodeToken(child); err != nil {
				return fmt.Errorf("qt linguist xml encode token: %w", err)
			}
		}
	}

	if !wroteTranslation && replacements != nil {
		if err := writeQtLinguistTranslation(encoder, xml.StartElement{Name: xml.Name{Local: "translation"}}, replacements, msg.numerus); err != nil {
			return err
		}
	}

	if err := encoder.EncodeToken(xml.EndElement{Name: msg.start.Name}); err != nil {
		return fmt.Errorf("qt linguist xml encode end: %w", err)
	}
	return nil
}

func qtLinguistReplacements(key string, msg qtLinguistMessage, values map[string]string) []string {
	if msg.numerus {
		maxIndex := len(msg.numerusForms) - 1
		for existingKey := range values {
			if !strings.HasPrefix(existingKey, key+qtLinguistNumerusKeyInfix) {
				continue
			}
			index, err := strconv.Atoi(strings.TrimPrefix(existingKey, key+qtLinguistNumerusKeyInfix))
			if err != nil || index < 0 {
				continue
			}
			if index > maxIndex {
				maxIndex = index
			}
		}
		if maxIndex < 0 {
			if value, ok := values[key]; ok {
				return []string{value}
			}
			return nil
		}
		forms := make([]string, maxIndex+1)
		missing := true
		for i := 0; i <= maxIndex; i++ {
			formKey := key + qtLinguistNumerusKeyInfix + strconv.Itoa(i)
			if value, ok := values[formKey]; ok {
				forms[i] = value
				missing = false
				continue
			}
			if i < len(msg.numerusForms) && strings.TrimSpace(msg.numerusForms[i]) != "" {
				forms[i] = msg.numerusForms[i]
				continue
			}
			if value, ok := values[key]; ok && i == 0 {
				forms[i] = value
				missing = false
			}
		}
		if missing {
			if value, ok := values[key]; ok {
				return []string{value}
			}
			return nil
		}
		return forms
	}
	if value, ok := values[key]; ok {
		return []string{value}
	}
	return nil
}

func qtLinguistMessageStaged(key string, staged map[string]string) bool {
	if staged == nil {
		return true
	}
	if _, ok := staged[key]; ok {
		return true
	}
	prefix := key + qtLinguistNumerusKeyInfix
	for stagedKey := range staged {
		if strings.HasPrefix(stagedKey, prefix) {
			return true
		}
	}
	return false
}

func qtLinguistOnlySourceFallback(replacements []string, source string) bool {
	for _, value := range replacements {
		if value != source && strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func qtLinguistReplacementsUnchanged(msg qtLinguistMessage, replacements []string) bool {
	if msg.numerus {
		if len(msg.numerusForms) != len(replacements) {
			return false
		}
		for i, form := range msg.numerusForms {
			if form != replacements[i] {
				return false
			}
		}
		return true
	}
	return len(replacements) == 1 && replacements[0] == msg.translation
}

// qtLinguistTranslationAttrs drops type="unfinished" only when every form has a translation.
func qtLinguistTranslationAttrs(attrs []xml.Attr, replacements []string) []xml.Attr {
	if len(replacements) == 0 || !qtLinguistAllFilled(replacements) {
		return attrs
	}
	return qtLinguistTranslationAttrsWithoutUnfinished(attrs)
}

func qtLinguistAllFilled(values []string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			return false
		}
	}
	return true
}

func writeQtLinguistTranslation(encoder *xml.Encoder, start xml.StartElement, replacements []string, numerus bool) error {
	start.Attr = qtLinguistTranslationAttrs(start.Attr, replacements)
	if !qtLinguistAllFilled(replacements) && qtLinguistAttr(start.Attr, "type") == "" {
		start.Attr = append(start.Attr, xml.Attr{Name: xml.Name{Local: "type"}, Value: "unfinished"})
	}
	start.Attr = qtLinguistAttrsWithout(start.Attr, "variants")
	if err := encoder.EncodeToken(start); err != nil {
		return fmt.Errorf("qt linguist xml encode start: %w", err)
	}
	if numerus || len(replacements) > 1 {
		for _, form := range replacements {
			if err := encoder.EncodeToken(xml.StartElement{Name: xml.Name{Local: "numerusform"}}); err != nil {
				return fmt.Errorf("qt linguist xml encode start: %w", err)
			}
			if strings.TrimSpace(form) != "" {
				if err := encodeQtLinguistFragment(encoder, form); err != nil {
					return err
				}
			}
			if err := encoder.EncodeToken(xml.EndElement{Name: xml.Name{Local: "numerusform"}}); err != nil {
				return fmt.Errorf("qt linguist xml encode end: %w", err)
			}
		}
	} else if len(replacements) == 1 && strings.TrimSpace(replacements[0]) != "" {
		if err := encodeQtLinguistFragment(encoder, replacements[0]); err != nil {
			return err
		}
	}
	if err := encoder.EncodeToken(xml.EndElement{Name: start.Name}); err != nil {
		return fmt.Errorf("qt linguist xml encode end: %w", err)
	}
	return nil
}

func qtLinguistAttrsWithout(attrs []xml.Attr, name string) []xml.Attr {
	out := attrs[:0:0]
	for _, attr := range attrs {
		if attr.Name.Local != name {
			out = append(out, attr)
		}
	}
	return out
}

func qtLinguistTranslationAttrsWithoutUnfinished(attrs []xml.Attr) []xml.Attr {
	if len(attrs) == 0 {
		return nil
	}
	out := make([]xml.Attr, 0, len(attrs))
	for _, attr := range attrs {
		if attr.Name.Local == "type" && strings.EqualFold(strings.TrimSpace(attr.Value), "unfinished") {
			continue
		}
		out = append(out, attr)
	}
	return out
}

func encodeQtLinguistCharData(encoder *xml.Encoder, value string) error {
	if value == "" {
		return nil
	}
	if err := encoder.EncodeToken(xml.CharData([]byte(value))); err != nil {
		return fmt.Errorf("qt linguist xml encode char data: %w", err)
	}
	return nil
}

func qtLinguistParseByteElement(raw string) (xml.StartElement, bool) {
	decoder := xml.NewDecoder(strings.NewReader(raw))
	tok, err := decoder.Token()
	if err != nil {
		return xml.StartElement{}, false
	}
	start, ok := tok.(xml.StartElement)
	if !ok || !strings.EqualFold(start.Name.Local, "byte") {
		return xml.StartElement{}, false
	}
	return start, true
}

func encodeQtLinguistFragment(encoder *xml.Encoder, value string) error {
	if !strings.Contains(value, "<") {
		return encodeQtLinguistCharData(encoder, value)
	}
	locs := qtLinguistByteTagPattern.FindAllStringIndex(value, -1)
	if len(locs) == 0 {
		return encodeQtLinguistCharData(encoder, value)
	}
	last := 0
	for _, loc := range locs {
		if loc[0] > last {
			if err := encodeQtLinguistCharData(encoder, value[last:loc[0]]); err != nil {
				return err
			}
		}
		raw := value[loc[0]:loc[1]]
		start, ok := qtLinguistParseByteElement(raw)
		if !ok {
			if err := encodeQtLinguistCharData(encoder, raw); err != nil {
				return err
			}
			last = loc[1]
			continue
		}
		if err := encoder.EncodeToken(start); err != nil {
			return fmt.Errorf("qt linguist xml encode start: %w", err)
		}
		if err := encoder.EncodeToken(xml.EndElement{Name: start.Name}); err != nil {
			return fmt.Errorf("qt linguist xml encode end: %w", err)
		}
		last = loc[1]
	}
	if last < len(value) {
		return encodeQtLinguistCharData(encoder, value[last:])
	}
	return nil
}
