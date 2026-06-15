package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"errors"
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

func isEOFError(err error) bool {
	return errors.Is(err, io.EOF)
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
	if !bytes.Contains(val, []byte("<")) {
		return val
	}
	// To preserve parity with the old xml.Encoder-based behavior (which expanded self-closing tags),
	// we use a full decode/encode cycle ONLY if tags are present.
	// This is still faster than doing it for every single source/target since many are plain text.
	var out bytes.Buffer
	enc := xml.NewEncoder(&out)
	dec := xml.NewDecoder(bytes.NewReader(val))
	for {
		tok, err := dec.Token()
		if err != nil {
			break
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
	// BOLT OPTIMIZATION: Eliminate the redundant collectXLIFFUnitTargets pass by
	// buffering unit tokens and processing each unit atomically.
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
				if err := marshalXLIFFUnit(encoder, decoder, t, values); err != nil {
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

func marshalXLIFFUnit(encoder *xml.Encoder, decoder *xml.Decoder, start xml.StartElement, values map[string]string) error {
	unitKey := resolveXLIFFUnitKey(start.Attr)
	replacement, hasReplacement := values[unitKey]

	// Buffer all tokens in the unit to determine if it contains a <target> element.
	// BOLT OPTIMIZATION: Pre-allocate tokens slice. Units typically have 8-16 tokens.
	tokens := make([]xml.Token, 0, 16)
	tokens = append(tokens, cloneXMLToken(start))
	hasTarget := false
	depth := 1
	for depth > 0 {
		tok, err := decoder.Token()
		if err != nil {
			return fmt.Errorf("xml decode unit: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if t.Name.Local == "target" {
				hasTarget = true
			}
		case xml.EndElement:
			depth--
		}
		tokens = append(tokens, cloneXMLToken(tok))
	}

	// Re-emit buffered tokens, replacing source or target content as needed.
	// BOLT OPTIMIZATION: Use individual variables to avoid heap allocation for a state pointer.
	var stateName string
	var stateReplace bool
	var stateWroteValue bool
	var stateDepth int

	for _, tok := range tokens {
		switch t := tok.(type) {
		case xml.StartElement:
			if stateName != "" {
				stateDepth++
				if stateReplace {
					continue
				}
				if err := encoder.EncodeToken(t); err != nil {
					return fmt.Errorf("xml encode start: %w", err)
				}
				continue
			}
			switch t.Name.Local {
			case "target":
				if unitKey != "" && hasReplacement {
					stateName = "target"
					stateReplace = true
					stateWroteValue = false
					stateDepth = 0
					if strings.TrimSpace(replacement) == "" {
						stateWroteValue = true
					}
				}
			case "source":
				if unitKey != "" && hasReplacement && !hasTarget {
					stateName = "source"
					stateReplace = true
					stateWroteValue = false
					stateDepth = 0
					if strings.TrimSpace(replacement) == "" {
						stateWroteValue = true
					}
				}
			}
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("xml encode start: %w", err)
			}
		case xml.EndElement:
			if stateName != "" {
				if t.Name.Local == stateName && stateDepth == 0 {
					if stateReplace && !stateWroteValue {
						if err := encodeXLIFFFragment(encoder, replacement); err != nil {
							return err
						}
					}
					stateName = ""
				} else {
					if stateReplace {
						if stateDepth > 0 {
							stateDepth--
						}
						continue
					}
					if err := encoder.EncodeToken(t); err != nil {
						return fmt.Errorf("xml encode end: %w", err)
					}
					if stateDepth > 0 {
						stateDepth--
					}
					continue
				}
			}
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("xml encode end: %w", err)
			}
		case xml.CharData:
			if stateName != "" && stateReplace {
				if !stateWroteValue {
					if err := encodeXLIFFFragment(encoder, replacement); err != nil {
						return err
					}
					stateWroteValue = true
				}
				continue
			}
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("xml encode char data: %w", err)
			}
		case xml.Comment, xml.Directive, xml.ProcInst:
			if stateName != "" && stateReplace {
				continue
			}
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("xml encode token: %w", err)
			}
		default:
			if err := encoder.EncodeToken(t); err != nil {
				return fmt.Errorf("xml encode token: %w", err)
			}
		}
	}
	return nil
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
