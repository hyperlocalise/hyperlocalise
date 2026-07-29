package translationfileparser

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

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

func (p POFileParser) Parse(content []byte) (map[string]string, error) {
	out := map[string]string{}

	var currentMsgID poValue
	var currentMsgStr poValue
	activeField := ""
	seenMsgID := false
	seenMsgStr := false

	flush := func() {
		if !seenMsgID || !seenMsgStr {
			return
		}
		key := currentMsgID.String()
		if key == "" {
			return // skip header entry (msgid "")
		}
		out[key] = currentMsgStr.String()
	}

	reset := func() {
		currentMsgID.Reset()
		currentMsgStr.Reset()
		activeField = ""
		seenMsgID = false
		seenMsgStr = false
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

		err := consumePOLine(lineNumber, line, &currentMsgID, &currentMsgStr, &activeField, &seenMsgID, &seenMsgStr, flush, reset)
		if err != nil {
			return nil, err
		}

		if idx < 0 {
			break
		}
		s = s[idx+1:]
		lineNumber++
	}

	flush()
	return out, nil
}

func consumePOLine(
	lineNumber int,
	line string,
	currentMsgID, currentMsgStr *poValue,
	activeField *string,
	seenMsgID, seenMsgStr *bool,
	flush, reset func(),
) error {
	if line == "" {
		flush()
		reset()
		return nil
	}
	if strings.HasPrefix(line, "#") {
		*activeField = ""
		return nil
	}

	switch {
	case strings.HasPrefix(line, "msgid "):
		return handlePOMsgID(lineNumber, line, currentMsgID, activeField, seenMsgID, flush, reset)
	case strings.HasPrefix(line, "msgstr "):
		return handlePOMsgStr(lineNumber, strings.TrimPrefix(line, "msgstr "), currentMsgStr, activeField, seenMsgStr)
	case strings.HasPrefix(line, "msgstr["):
		return handlePOIndexedMsgStr(lineNumber, line, currentMsgStr, activeField, seenMsgStr)
	case strings.HasPrefix(line, "msgid_plural "):
		*activeField = ""
		return nil
	case strings.HasPrefix(line, "msgctxt "):
		// Context is currently ignored by the map[string]string strategy output.
		*activeField = ""
		return nil
	case strings.HasPrefix(line, "\""):
		return handlePOContinuation(lineNumber, line, currentMsgID, currentMsgStr, *activeField)
	default:
		*activeField = ""
		return nil
	}
}

func handlePOMsgID(lineNumber int, line string, currentMsgID *poValue, activeField *string, seenMsgID *bool, flush, reset func()) error {
	flush()
	reset()
	v, err := parsePOQuoted(strings.TrimPrefix(line, "msgid "))
	if err != nil {
		return fmt.Errorf("line %d: parse msgid: %w", lineNumber, err)
	}
	currentMsgID.WriteString(v)
	*activeField = "msgid"
	*seenMsgID = true
	return nil
}

func handlePOMsgStr(lineNumber int, raw string, currentMsgStr *poValue, activeField *string, seenMsgStr *bool) error {
	v, err := parsePOQuoted(raw)
	if err != nil {
		return fmt.Errorf("line %d: parse msgstr: %w", lineNumber, err)
	}
	currentMsgStr.WriteString(v)
	*activeField = "msgstr"
	*seenMsgStr = true
	return nil
}

func handlePOIndexedMsgStr(lineNumber int, line string, currentMsgStr *poValue, activeField *string, seenMsgStr *bool) error {
	if !strings.HasPrefix(line, "msgstr[0]") {
		*activeField = ""
		return nil
	}
	idx := strings.Index(line, "]")
	if idx < 0 || idx+1 >= len(line) {
		return fmt.Errorf("line %d: invalid msgstr[0] format", lineNumber)
	}
	rest := strings.TrimSpace(line[idx+1:])
	v, err := parsePOQuoted(rest)
	if err != nil {
		return fmt.Errorf("line %d: parse msgstr[0]: %w", lineNumber, err)
	}
	currentMsgStr.WriteString(v)
	*activeField = "msgstr"
	*seenMsgStr = true
	return nil
}

func handlePOContinuation(lineNumber int, line string, currentMsgID, currentMsgStr *poValue, activeField string) error {
	v, err := parsePOQuoted(line)
	if err != nil {
		return fmt.Errorf("line %d: parse continued string: %w", lineNumber, err)
	}
	switch activeField {
	case "msgid":
		currentMsgID.WriteString(v)
	case "msgstr":
		currentMsgStr.WriteString(v)
	}
	return nil
}

func parsePOQuoted(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
		return "", fmt.Errorf("expected quoted string, got %q", raw)
	}

	// BOLT OPTIMIZATION: Fast-path for simple quoted strings to avoid strconv.Unquote allocations.
	inner := raw[1 : len(raw)-1]
	if !strings.ContainsAny(inner, "\\\"") {
		return inner, nil
	}

	unquoted, err := strconv.Unquote(raw)
	if err != nil {
		return "", err
	}
	return unquoted, nil
}

// MarshalPOFile preserves .po structure while replacing msgstr/msgstr[0] values by msgid key.
func MarshalPOFile(template []byte, values map[string]string) ([]byte, error) {
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
			v, err := parsePOQuoted(strings.TrimPrefix(trimmed, "msgid "))
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
