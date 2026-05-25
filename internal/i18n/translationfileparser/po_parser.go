package translationfileparser

import (
	"fmt"
	"strconv"
	"strings"
)

// POFileParser parses GNU gettext .po translation files.
type POFileParser struct{}

func (p POFileParser) Parse(content []byte) (map[string]string, error) {
	out := map[string]string{}

	var currentMsgID strings.Builder
	var currentMsgStr strings.Builder
	activeField := ""
	seenMsgID := false
	seenMsgStr := false

	flush := func() {
		if !seenMsgID || !seenMsgStr {
			return
		}
		key := strings.TrimSpace(currentMsgID.String())
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
	currentMsgID, currentMsgStr *strings.Builder,
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
		return nil
	}
}

func handlePOMsgID(lineNumber int, line string, currentMsgID *strings.Builder, activeField *string, seenMsgID *bool, flush, reset func()) error {
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

func handlePOMsgStr(lineNumber int, raw string, currentMsgStr *strings.Builder, activeField *string, seenMsgStr *bool) error {
	v, err := parsePOQuoted(raw)
	if err != nil {
		return fmt.Errorf("line %d: parse msgstr: %w", lineNumber, err)
	}
	currentMsgStr.WriteString(v)
	*activeField = "msgstr"
	*seenMsgStr = true
	return nil
}

func handlePOIndexedMsgStr(lineNumber int, line string, currentMsgStr *strings.Builder, activeField *string, seenMsgStr *bool) error {
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

func handlePOContinuation(lineNumber int, line string, currentMsgID, currentMsgStr *strings.Builder, activeField string) error {
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
	if raw == "" {
		return "", fmt.Errorf("expected quoted string")
	}
	if !strings.HasPrefix(raw, "\"") {
		return "", fmt.Errorf("expected quoted string, got %q", raw)
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

		lineOutput := raw
		trimmed := strings.TrimSpace(raw)

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
				lineOutput = replacePOQuotedSuffix(raw, "msgstr", replacement)
			}
		case strings.HasPrefix(trimmed, "msgstr[0]"):
			activeField = "msgstr0"
			if replacement, ok := values[currentKey]; ok {
				lineOutput = replacePOQuotedSuffix(raw, "msgstr[0]", replacement)
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
					lineOutput = preserveIndent(raw) + `""`
				}
			}
		default:
			activeField = ""
		}

		out.WriteString(lineOutput)
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

func replacePOQuotedSuffix(raw, field, value string) string {
	indent := preserveIndent(raw)
	return indent + field + " " + strconv.Quote(value)
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
