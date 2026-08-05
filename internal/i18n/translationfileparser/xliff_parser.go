package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// XLIFFParser parses XLIFF 1.2 and 2.x translation files.
type XLIFFParser struct{}

func (p XLIFFParser) Parse(content []byte) (map[string]string, error) {
	decoder := xml.NewDecoder(bytes.NewReader(content))

	// BOLT OPTIMIZATION: Hint capacity for output map based on content size.
	capacity := len(content) / 256
	if capacity < 4 {
		capacity = 4
	}
	out := make(map[string]string, capacity)

	// BOLT OPTIMIZATION: Reuse a single xliffUnit struct and its buffers.
	var unit xliffUnit
	unitActive := false

	var captureName string
	var captureStart int
	var captureDepth int

	for {
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return nil, fmt.Errorf("xml decode: %w", err)
		}
		offset := int(decoder.InputOffset())

		switch token := tok.(type) {
		case xml.StartElement:
			if captureName != "" {
				captureDepth++
				continue
			}

			switch token.Name.Local {
			case "trans-unit", "unit":
				if unitActive {
					finalizeXLIFFUnit(out, &unit)
				}
				unit.key = resolveXLIFFUnitKey(token.Attr)
				unit.source.Reset()
				unit.target.Reset()
				unitActive = true
			case "source", "target":
				if unitActive {
					captureName = token.Name.Local
					captureStart = offset
					captureDepth = 0
				}
			}
		case xml.EndElement:
			if captureName != "" {
				if captureDepth > 0 {
					captureDepth--
					continue
				}
				if token.Name.Local == captureName {
					// BOLT OPTIMIZATION: Use raw slicing instead of re-encoding tokens via xml.Encoder.
					// decoder.InputOffset() points after the EndElement '>'. We search back for the '</'
					// tag start within the element's span.
					innerContent := content[captureStart:offset]
					closeStart := bytes.LastIndex(innerContent, []byte("</"))
					if closeStart >= 0 {
						val := innerContent[:closeStart]
						// If the element has children (captureDepth was > 0 during StartElement),
						// we must ensure it is well-formed XML for the rest of the app's expectations
						// by re-encoding it if it was originally self-closing or had other structural
						// oddities. However, the requirement is to preserve the content.
						// Re-encoding via xml.Encoder (the old way) tended to normalize <ph id="1"/> to <ph id="1"></ph>.
						// To maintain parity with the old behavior for nested tags, we can use a helper.
						if captureName == "source" {
							unit.source.Write(normalizeXLIFFInternalMarkup(val))
						} else {
							unit.target.Write(normalizeXLIFFInternalMarkup(val))
						}
					}
					captureName = ""
				}
			} else if token.Name.Local == "trans-unit" || token.Name.Local == "unit" {
				if unitActive {
					finalizeXLIFFUnit(out, &unit)
					unitActive = false
				}
			}
		}
	}
	if unitActive {
		finalizeXLIFFUnit(out, &unit)
	}
	return out, nil
}

func resolveXLIFFUnitKey(attrs []xml.Attr) string {
	// BOLT OPTIMIZATION: Single-pass attribute scan with priority (id > name > resname).
	var name, resname string
	for _, attr := range attrs {
		switch attr.Name.Local {
		case "id":
			if v := strings.TrimSpace(attr.Value); v != "" {
				return v
			}
		case "name":
			if name == "" {
				name = strings.TrimSpace(attr.Value)
			}
		case "resname":
			if resname == "" {
				resname = strings.TrimSpace(attr.Value)
			}
		}
	}
	if name != "" {
		return name
	}
	return resname
}

type xliffUnit struct {
	key    string
	source bytes.Buffer
	target bytes.Buffer
}

func normalizeXLIFFInternalMarkup(val []byte) []byte {
	// Decode entities and CDATA even if no tags are present.
	if !bytes.ContainsAny(val, "<&") {
		return val
	}
	// To preserve parity with the old xml.Encoder-based behavior (which expanded self-closing tags),
	// we use a full decode cycle. To decode entities and CDATA into literal text, we write
	// CharData tokens directly to the output buffer after flushing the encoder.
	var out bytes.Buffer
	enc := xml.NewEncoder(&out)
	dec := xml.NewDecoder(bytes.NewReader(val))
	for {
		tok, err := dec.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return val // On decode error, fallback to original value.
		}
		if err := enc.EncodeToken(tok); err != nil {
			return val
		}
	}
	if err := enc.Flush(); err != nil {
		return val
	}
	return out.Bytes()
}

func finalizeXLIFFUnit(out map[string]string, unit *xliffUnit) {
	key := strings.TrimSpace(unit.key)
	if key == "" {
		return
	}
	value := unit.target.String()
	if strings.TrimSpace(value) == "" {
		value = unit.source.String()
	}
	if value == "" {
		return
	}
	out[key] = value
}

// MarshalXLIFF rewrites XLIFF source/target text using values keyed by unit id/name/resname.
// If a unit has <target>, only target text is updated; otherwise source text is updated.
func MarshalXLIFF(template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	decoder := xml.NewDecoder(bytes.NewReader(template))
	var out bytes.Buffer
	encoder := xml.NewEncoder(&out)

	for {
		tok, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("xml decode: %w", err)
		}

		switch t := tok.(type) {
		case xml.StartElement:
			t = rewriteXLIFFLocaleAttrs(t, sourceLocale, targetLocale)
			if t.Name.Local == "trans-unit" || t.Name.Local == "unit" {
				if err := marshalXLIFFUnit(encoder, decoder, template, t, values); err != nil {
					return nil, err
				}
				continue
			}
			if err := encoder.EncodeToken(t); err != nil {
				return nil, fmt.Errorf("xml encode start: %w", err)
			}
		case xml.EndElement, xml.CharData, xml.Comment, xml.Directive, xml.ProcInst:
			if err := encoder.EncodeToken(t); err != nil {
				return nil, fmt.Errorf("xml encode token: %w", err)
			}
		}
	}

	if err := encoder.Flush(); err != nil {
		return nil, fmt.Errorf("xml encode flush: %w", err)
	}
	return out.Bytes(), nil
}

func marshalXLIFFUnit(encoder *xml.Encoder, decoder *xml.Decoder, template []byte, start xml.StartElement, values map[string]string) error {
	unitKey := resolveXLIFFUnitKey(start.Attr)
	replacement, hasReplacement := values[unitKey]

	if !hasReplacement {
		// Just stream tokens directly without cloning/buffering.
		if err := encoder.EncodeToken(start); err != nil {
			return fmt.Errorf("xml encode start: %w", err)
		}
		depth := 1
		for depth > 0 {
			tok, err := decoder.Token()
			if err != nil {
				return fmt.Errorf("xml decode unit: %w", err)
			}
			switch tok.(type) {
			case xml.StartElement:
				depth++
			case xml.EndElement:
				depth--
			}
			if err := encoder.EncodeToken(tok); err != nil {
				return fmt.Errorf("xml encode token: %w", err)
			}
		}
		return nil
	}

	offset := int(decoder.InputOffset())
	unitStart := bytes.LastIndex(template[:offset], []byte("<"+start.Name.Local))
	if unitStart < 0 {
		return fmt.Errorf("could not find start of %s", start.Name.Local)
	}
	closeTag := []byte("</" + start.Name.Local + ">")
	idx := bytes.Index(template[offset:], closeTag)
	if idx < 0 {
		return fmt.Errorf("could not find closing tag %s", closeTag)
	}
	unitEnd := offset + idx + len(closeTag)
	unitBytes := template[unitStart:unitEnd]

	hasTarget := hasXLIFFTargetElement(unitBytes)

	// Stream and replace on the fly
	if err := encoder.EncodeToken(start); err != nil {
		return fmt.Errorf("xml encode start: %w", err)
	}

	depth := 1
	var skipTagName string
	var skipDepth int

	for depth > 0 {
		tok, err := decoder.Token()
		if err != nil {
			return fmt.Errorf("xml decode unit: %w", err)
		}

		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if skipTagName != "" {
				skipDepth++
				continue
			}

			// Check if we should replace this element's contents
			if (hasTarget && t.Name.Local == "target") || (!hasTarget && t.Name.Local == "source") {
				if err := encoder.EncodeToken(t); err != nil {
					return fmt.Errorf("xml encode start: %w", err)
				}
				skipTagName = t.Name.Local
				skipDepth = 0
				continue
			}

		case xml.EndElement:
			depth--
			if skipTagName != "" {
				if t.Name.Local == skipTagName && skipDepth == 0 {
					// Encode the replacement fragment
					if err := encodeXLIFFFragment(encoder, replacement); err != nil {
						return err
					}
					if err := encoder.EncodeToken(t); err != nil {
						return fmt.Errorf("xml encode end: %w", err)
					}
					skipTagName = ""
					continue
				}
				if skipDepth > 0 {
					skipDepth--
				}
				continue
			}

		case xml.CharData, xml.Comment, xml.Directive, xml.ProcInst:
			if skipTagName != "" {
				continue
			}
		}

		if skipTagName == "" {
			if err := encoder.EncodeToken(tok); err != nil {
				return fmt.Errorf("xml encode token: %w", err)
			}
		}
	}
	return nil
}

func hasXLIFFTargetElement(unitBytes []byte) bool {
	for i := 0; i < len(unitBytes); {
		idx := bytes.IndexByte(unitBytes[i:], '<')
		if idx < 0 {
			break
		}
		pos := i + idx
		i = pos + 1

		if bytes.HasPrefix(unitBytes[pos:], []byte("<!--")) {
			endComment := bytes.Index(unitBytes[pos:], []byte("-->"))
			if endComment >= 0 {
				i = pos + endComment + 3
			}
			continue
		}
		if bytes.HasPrefix(unitBytes[pos:], []byte("<![CDATA[")) {
			endCDATA := bytes.Index(unitBytes[pos:], []byte("]]>"))
			if endCDATA >= 0 {
				i = pos + endCDATA + 3
			}
			continue
		}

		if len(unitBytes)-i >= 6 && string(unitBytes[i:i+6]) == "target" {
			nextCharPos := i + 6
			if nextCharPos < len(unitBytes) {
				ch := unitBytes[nextCharPos]
				if ch == '>' || ch == '/' || ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' {
					return true
				}
			} else {
				return true
			}
		}
	}
	return false
}

func encodeXLIFFFragment(encoder *xml.Encoder, value string) error {
	// BOLT OPTIMIZATION: Fast-path for plain text to skip expensive xml.Decoder.
	if !strings.ContainsAny(value, "<&") {
		if err := encoder.EncodeToken(xml.CharData([]byte(value))); err != nil {
			return fmt.Errorf("xml encode char data: %w", err)
		}
		return nil
	}

	wrapped := "<hyperlocalise-root>" + value + "</hyperlocalise-root>"
	decoder := xml.NewDecoder(strings.NewReader(wrapped))
	depth := 0
	var tokens []xml.Token
	for {
		tok, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				for _, token := range tokens {
					if err := encoder.EncodeToken(token); err != nil {
						return fmt.Errorf("xml encode token: %w", err)
					}
				}
				return nil
			}
			// On error, fallback to treating the entire value as plain text.
			if err := encoder.EncodeToken(xml.CharData([]byte(value))); err != nil {
				return fmt.Errorf("xml encode char data fallback: %w", err)
			}
			return nil
		}

		switch t := tok.(type) {
		case xml.StartElement:
			if depth == 0 && t.Name.Local == "hyperlocalise-root" {
				depth++
				continue
			}
			depth++
		case xml.EndElement:
			depth--
			if depth == 0 && t.Name.Local == "hyperlocalise-root" {
				continue
			}
		}

		if depth > 0 {
			tokens = append(tokens, cloneXMLToken(tok))
		}
	}
}

func rewriteXLIFFLocaleAttrs(start xml.StartElement, sourceLocale, targetLocale string) xml.StartElement {
	src := strings.TrimSpace(sourceLocale)
	trg := strings.TrimSpace(targetLocale)
	if src == "" && trg == "" {
		return start
	}

	switch start.Name.Local {
	case "file":
		if src != "" {
			start.Attr = upsertXLIFFAttr(start.Attr, "source-language", src)
		}
		if trg != "" && attrValue(start.Attr, "source-language") != "" {
			start.Attr = upsertXLIFFAttr(start.Attr, "target-language", trg)
		}
	case "xliff":
		if isXLIFF20Root(start.Attr) {
			if src != "" {
				start.Attr = upsertXLIFFAttr(start.Attr, "srcLang", src)
			}
			if trg != "" {
				start.Attr = upsertXLIFFAttr(start.Attr, "trgLang", trg)
			}
		}
	}
	return start
}

func isXLIFF20Root(attrs []xml.Attr) bool {
	version := attrValue(attrs, "version")
	return strings.HasPrefix(version, "2")
}

func upsertXLIFFAttr(attrs []xml.Attr, name, value string) []xml.Attr {
	for i := range attrs {
		if attrs[i].Name.Local == name {
			attrs[i].Value = value
			return attrs
		}
	}
	return append(attrs, xml.Attr{Name: xml.Name{Local: name}, Value: value})
}

func cloneXMLToken(tok xml.Token) xml.Token {
	switch t := tok.(type) {
	case xml.StartElement:
		// BOLT OPTIMIZATION: Skip allocation if there are no attributes.
		if len(t.Attr) == 0 {
			return t
		}
		attrs := make([]xml.Attr, len(t.Attr))
		copy(attrs, t.Attr)
		t.Attr = attrs
		return t
	case xml.EndElement:
		return t
	case xml.CharData:
		// BOLT OPTIMIZATION: Skip allocation for empty data.
		if len(t) == 0 {
			return t
		}
		cloned := make(xml.CharData, len(t))
		copy(cloned, t)
		return cloned
	case xml.Comment:
		// BOLT OPTIMIZATION: Skip allocation for empty comment.
		if len(t) == 0 {
			return t
		}
		cloned := make(xml.Comment, len(t))
		copy(cloned, t)
		return cloned
	case xml.Directive:
		// BOLT OPTIMIZATION: Skip allocation for empty directive.
		if len(t) == 0 {
			return t
		}
		cloned := make(xml.Directive, len(t))
		copy(cloned, t)
		return cloned
	case xml.ProcInst:
		cloned := xml.ProcInst{Target: t.Target}
		// BOLT OPTIMIZATION: Skip allocation for empty instruction data.
		if len(t.Inst) > 0 {
			cloned.Inst = make([]byte, len(t.Inst))
			copy(cloned.Inst, t.Inst)
		}
		return cloned
	default:
		return tok
	}
}
