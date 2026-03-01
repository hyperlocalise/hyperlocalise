package translationfileparser

import (
	"fmt"
	"strconv"
	"strings"
)

// POFileParser parses GNU gettext .po translation files.
type POFileParser struct{}

func (p POFileParser) Parse(content []byte) (map[string]string, error) {
	lines := strings.Split(string(content), "\n")
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

	for i, raw := range lines {
		line := strings.TrimSpace(raw)

		err := consumePOLine(i+1, line, &currentMsgID, &currentMsgStr, &activeField, &seenMsgID, &seenMsgStr, flush, reset)
		if err != nil {
			return nil, err
		}
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
