package translationfileparser

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	poParseMapMinCapacity = 4
	poParseMapMaxCapacity = 1 << 16
)

var poMsgIDFieldPrefix = []byte("msgid ")

// POFileParser parses GNU gettext .po translation files.
type POFileParser struct{}

type poValue struct {
	first    string
	builder  *strings.Builder
	hasValue bool
}

func (v *poValue) WriteString(s string) {
	if !v.hasValue {
		v.first = s
		v.hasValue = true
		return
	}
	if v.builder == nil {
		v.builder = &strings.Builder{}
		v.builder.WriteString(v.first)
	} else if v.builder.Len() == 0 {
		v.builder.WriteString(v.first)
	}
	v.builder.WriteString(s)
}

func (v *poValue) String() string {
	if v.builder != nil && v.builder.Len() > 0 {
		return v.builder.String()
	}
	return v.first
}

func (v *poValue) Reset() {
	v.first = ""
	v.hasValue = false
	if v.builder != nil {
		v.builder.Reset()
	}
}

func poOutputMapCapacity(content []byte) int {
	// Count msgid field markers instead of using raw byte length. Comment-heavy
	// or long-msgstr files can be huge while containing only a few map entries.
	n := bytes.Count(content, poMsgIDFieldPrefix)
	switch {
	case n < poParseMapMinCapacity:
		return poParseMapMinCapacity
	case n > poParseMapMaxCapacity:
		return poParseMapMaxCapacity
	default:
		return n
	}
}

func (p POFileParser) Parse(content []byte) (map[string]string, error) {
	out, err := parsePOFileRaw(content)
	if err != nil {
		return nil, err
	}
	for key, value := range out {
		out[key] = protectUnrealRichTextValue(value)
	}
	return out, nil
}

type poParserState struct {
	out           map[string]string
	currentMsgID  poValue
	currentMsgStr poValue
	activeField   string
	seenMsgID     bool
	seenMsgStr    bool
}

func (state *poParserState) flush() {
	if !state.seenMsgID || !state.seenMsgStr {
		return
	}
	key := state.currentMsgID.String()
	if key == "" {
		return // skip header entry (msgid "")
	}
	state.out[key] = state.currentMsgStr.String()
}

func (state *poParserState) reset() {
	state.currentMsgID.Reset()
	state.currentMsgStr.Reset()
	state.activeField = ""
	state.seenMsgID = false
	state.seenMsgStr = false
}

func parsePOFileRaw(content []byte) (map[string]string, error) {
	state := poParserState{
		out: make(map[string]string, poOutputMapCapacity(content)),
	}

	// BOLT OPTIMIZATION: Avoid strings.Split(string(content), "\n") to reduce allocations for large files.
	s := string(content)
	lineNumber := 1
	for {
		var raw string
		idx := strings.IndexByte(s, '\n')
		if idx < 0 {
			raw = s
		} else {
			raw = s[:idx]
		}
		line := strings.TrimSpace(raw)

		err := state.consumePOLine(lineNumber, line)
		if err != nil {
			return nil, err
		}

		if idx < 0 {
			break
		}
		s = s[idx+1:]
		lineNumber++
	}

	state.flush()
	return state.out, nil
}

func (state *poParserState) consumePOLine(lineNumber int, line string) error {
	if line == "" {
		state.flush()
		state.reset()
		return nil
	}
	// BOLT OPTIMIZATION: Fast byte-level dispatch for comments, continuation strings,
	// and gettext field directives.
	switch line[0] {
	case '#':
		state.activeField = ""
		return nil
	case '"':
		return state.handlePOContinuation(lineNumber, line)
	case 'm':
		switch {
		case strings.HasPrefix(line, "msgid "):
			return state.handlePOMsgID(lineNumber, line[6:])
		case strings.HasPrefix(line, "msgstr "):
			return state.handlePOMsgStr(lineNumber, line[7:])
		case strings.HasPrefix(line, "msgstr["):
			return state.handlePOIndexedMsgStr(lineNumber, line)
		case strings.HasPrefix(line, "msgid_plural "):
			state.activeField = ""
			return nil
		case strings.HasPrefix(line, "msgctxt "):
			// Context is currently ignored by the map[string]string strategy output.
			state.activeField = ""
			return nil
		default:
			state.activeField = ""
			return nil
		}
	default:
		state.activeField = ""
		return nil
	}
}

func (state *poParserState) handlePOMsgID(lineNumber int, raw string) error {
	state.flush()
	state.reset()
	v, err := parsePOQuoted(raw)
	if err != nil {
		return fmt.Errorf("line %d: parse msgid: %w", lineNumber, err)
	}
	state.currentMsgID.WriteString(v)
	state.activeField = "msgid"
	state.seenMsgID = true
	return nil
}

func (state *poParserState) handlePOMsgStr(lineNumber int, raw string) error {
	v, err := parsePOQuoted(raw)
	if err != nil {
		return fmt.Errorf("line %d: parse msgstr: %w", lineNumber, err)
	}
	state.currentMsgStr.WriteString(v)
	state.activeField = "msgstr"
	state.seenMsgStr = true
	return nil
}

func (state *poParserState) handlePOIndexedMsgStr(lineNumber int, line string) error {
	if !strings.HasPrefix(line, "msgstr[0]") {
		state.activeField = ""
		return nil
	}
	// BOLT OPTIMIZATION: Use strings.IndexByte for fast byte scanning.
	idx := strings.IndexByte(line, ']')
	if idx < 0 || idx+1 >= len(line) {
		return fmt.Errorf("line %d: invalid msgstr[0] format", lineNumber)
	}
	rest := strings.TrimSpace(line[idx+1:])
	v, err := parsePOQuoted(rest)
	if err != nil {
		return fmt.Errorf("line %d: parse msgstr[0]: %w", lineNumber, err)
	}
	state.currentMsgStr.WriteString(v)
	state.activeField = "msgstr"
	state.seenMsgStr = true
	return nil
}

func (state *poParserState) handlePOContinuation(lineNumber int, line string) error {
	v, err := parsePOQuoted(line)
	if err != nil {
		return fmt.Errorf("line %d: parse continued string: %w", lineNumber, err)
	}
	switch state.activeField {
	case "msgid":
		state.currentMsgID.WriteString(v)
	case "msgstr":
		state.currentMsgStr.WriteString(v)
	}
	return nil
}

func parsePOQuoted(raw string) (string, error) {
	// BOLT OPTIMIZATION: Use strings.IndexByte checks instead of strings.ContainsAny
	// to avoid table lookups and leverage SIMD assembly instructions in assembly runtime.
	if len(raw) >= 2 && raw[0] == '"' && raw[len(raw)-1] == '"' {
		inner := raw[1 : len(raw)-1]
		if strings.IndexByte(inner, '\\') < 0 && strings.IndexByte(inner, '"') < 0 {
			return inner, nil
		}
	} else {
		raw = strings.TrimSpace(raw)
		if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
			return "", fmt.Errorf("expected quoted string, got %q", raw)
		}
		inner := raw[1 : len(raw)-1]
		if strings.IndexByte(inner, '\\') < 0 && strings.IndexByte(inner, '"') < 0 {
			return inner, nil
		}
	}

	unquoted, err := strconv.Unquote(raw)
	if err != nil {
		return "", err
	}
	return unquoted, nil
}

// MarshalPOFile preserves .po structure while replacing msgstr/msgstr[0] values by msgid key.
func MarshalPOFile(template []byte, values map[string]string) ([]byte, error) {
	values = expandPOUnrealRichTextValues(values)

	// BOLT OPTIMIZATION: Avoid strings.Split(string(template), "\n") to reduce allocations for large files.
	// We use a builder to reconstruct the file line by line.
	var out strings.Builder
	out.Grow(len(template))

	s := string(template)
	currentKey := ""
	activeField := ""
	lineNumber := 1
	for {
		var raw string
		idx := strings.IndexByte(s, '\n')
		if idx < 0 {
			raw = s
		} else {
			raw = s[:idx]
		}

		trimmed := strings.TrimSpace(raw)
		var processed bool

		switch {
		case trimmed == "":
			activeField = ""
		case strings.HasPrefix(trimmed, "#"):
			// skip
		case strings.HasPrefix(trimmed, "msgid "):
			v, err := parsePOQuoted(trimmed[6:])
			if err != nil {
				return nil, fmt.Errorf("line %d: parse msgid: %w", lineNumber, err)
			}
			currentKey = v
			activeField = "msgid"
		case strings.HasPrefix(trimmed, "msgstr "):
			activeField = "msgstr"
			if replacement, ok := values[currentKey]; ok {
				writePOQuotedSuffix(&out, raw, "msgstr", replacement)
				processed = true
			}
		case strings.HasPrefix(trimmed, "msgstr[0]"):
			activeField = "msgstr0"
			if replacement, ok := values[currentKey]; ok {
				writePOQuotedSuffix(&out, raw, "msgstr[0]", replacement)
				processed = true
			}
		case strings.HasPrefix(trimmed, "msgstr["):
			activeField = "msgstrN"
		case strings.HasPrefix(trimmed, "\""):
			switch activeField {
			case "msgid":
				v, err := parsePOQuoted(trimmed)
				if err != nil {
					return nil, fmt.Errorf("line %d: parse continued msgid: %w", lineNumber, err)
				}
				currentKey += v
			case "msgstr", "msgstr0":
				if _, ok := values[currentKey]; ok {
					out.WriteString(preserveIndent(raw))
					out.WriteString(`""`)
					processed = true
				}
			}
		default:
			activeField = ""
		}

		if !processed {
			out.WriteString(raw)
		}

		if idx >= 0 {
			out.WriteByte('\n')
		}

		if idx < 0 {
			break
		}
		s = s[idx+1:]
		lineNumber++
	}

	return []byte(out.String()), nil
}

func writePOQuotedSuffix(w *strings.Builder, raw, field, value string) {
	w.WriteString(preserveIndent(raw))
	w.WriteString(field)
	w.WriteByte(' ')
	if canWriteSimplePOQuoted(value) {
		w.WriteByte('"')
		w.WriteString(value)
		w.WriteByte('"')
	} else {
		w.WriteString(strconv.Quote(value))
	}
}

func canWriteSimplePOQuoted(value string) bool {
	// BOLT OPTIMIZATION: Single-pass ASCII byte scanner bypasses utf8 decoding
	// and strconv.IsPrint unicode lookups for standard printable text.
	asciiOnly := true
	for i := 0; i < len(value); i++ {
		b := value[i]
		if b < 0x20 || b == 0x7f || b == '\\' || b == '"' {
			return false
		}
		if b >= 0x80 {
			asciiOnly = false
		}
	}
	if asciiOnly {
		return true
	}
	if !utf8.ValidString(value) {
		return false
	}
	for _, r := range value {
		if r == '\\' || r == '"' || !strconv.IsPrint(r) {
			return false
		}
	}
	return true
}

func preserveIndent(raw string) string {
	idx := 0
	for idx < len(raw) {
		if raw[idx] != ' ' && raw[idx] != '\t' {
			break
		}
		idx++
	}
	return raw[:idx]
}
