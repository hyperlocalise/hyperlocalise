package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

// XLIFFParser parses XLIFF 1.2 and 2.x translation files.
type XLIFFParser struct{}

func (p XLIFFParser) Parse(content []byte) (map[string]string, error) {
	decoder := xml.NewDecoder(bytes.NewReader(content))

	out := make(map[string]string)
	var current *xliffUnit
	var captureSource bool
	var captureTarget bool

	for {
		tok, err := decoder.Token()
		if err != nil {
			if isEOFError(err) {
				break
			}
			return nil, fmt.Errorf("xml decode: %w", err)
		}

		if err := consumeXLIFFToken(tok, out, &current, &captureSource, &captureTarget); err != nil {
			return nil, err
		}
	}

	if current != nil {
		finalizeXLIFFUnit(out, *current)
	}

	return out, nil
}

func isEOFError(err error) bool {
	return err != nil && err.Error() == "EOF"
}

func consumeXLIFFToken(tok xml.Token, out map[string]string, current **xliffUnit, captureSource, captureTarget *bool) error {
	switch token := tok.(type) {
	case xml.StartElement:
		handleXLIFFStart(token, out, current, captureSource, captureTarget)
	case xml.EndElement:
		handleXLIFFEnd(token, out, current, captureSource, captureTarget)
	case xml.CharData:
		appendXLIFFText(token, *current, *captureSource, *captureTarget)
	}
	return nil
}

func handleXLIFFStart(token xml.StartElement, out map[string]string, current **xliffUnit, captureSource, captureTarget *bool) {
	switch token.Name.Local {
	case "trans-unit", "unit":
		if *current != nil {
			finalizeXLIFFUnit(out, **current)
		}
		*current = &xliffUnit{key: resolveXLIFFUnitKey(token.Attr)}
	case "source":
		if *current != nil {
			*captureSource = true
		}
	case "target":
		if *current != nil {
			*captureTarget = true
		}
	}
}

func handleXLIFFEnd(token xml.EndElement, out map[string]string, current **xliffUnit, captureSource, captureTarget *bool) {
	switch token.Name.Local {
	case "source":
		*captureSource = false
	case "target":
		*captureTarget = false
	case "trans-unit", "unit":
		if *current != nil {
			finalizeXLIFFUnit(out, **current)
			*current = nil
		}
	}
}

func appendXLIFFText(token xml.CharData, current *xliffUnit, captureSource, captureTarget bool) {
	if current == nil {
		return
	}
	if captureTarget {
		current.target.Write(token)
		return
	}
	if captureSource {
		current.source.Write(token)
	}
}

func resolveXLIFFUnitKey(attrs []xml.Attr) string {
	for _, name := range []string{"id", "name", "resname"} {
		if value := attrValue(attrs, name); value != "" {
			return value
		}
	}
	return ""
}

type xliffUnit struct {
	key    string
	source strings.Builder
	target strings.Builder
}

func finalizeXLIFFUnit(out map[string]string, unit xliffUnit) {
	key := strings.TrimSpace(unit.key)
	if key == "" {
		return
	}

	value := strings.TrimSpace(unit.target.String())
	if value == "" {
		value = strings.TrimSpace(unit.source.String())
	}
	if value == "" {
		return
	}

	out[key] = value
}

func attrValue(attrs []xml.Attr, name string) string {
	for _, attr := range attrs {
		if attr.Name.Local == name {
			return strings.TrimSpace(attr.Value)
		}
	}
	return ""
}
