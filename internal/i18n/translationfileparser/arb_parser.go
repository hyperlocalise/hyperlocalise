package translationfileparser

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"strings"
)

// ARBParser parses Flutter .arb translation files.
type ARBParser struct{}

func (p ARBParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p ARBParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, nil, fmt.Errorf("arb decode: %w", err)
	}
	if payload == nil {
		return map[string]string{}, nil, nil
	}

	// ARB payloads commonly pair message keys with metadata keys, so this keeps
	// the capacity hint closer to the expected message count.
	out := make(map[string]string, len(payload)/2+1)
	var descriptions map[string]string

	// Single-pass parsing avoids O(N log N) sorting of all keys and extra allocations.
	for key, val := range payload {
		if isARBMetadataKey(key) {
			continue
		}

		value, ok := val.(string)
		if !ok {
			return nil, nil, fmt.Errorf("arb key %q must be string, got %T", key, val)
		}
		out[key] = value

		// Inline description extraction avoids redundant prefix checks and key concatenation.
		if metaRaw, ok := payload["@"+key]; ok {
			if meta, ok := metaRaw.(map[string]any); ok {
				if descRaw, ok := meta["description"]; ok {
					if description, ok := descRaw.(string); ok {
						if trimmed := strings.TrimSpace(description); trimmed != "" {
							if descriptions == nil {
								descriptions = make(map[string]string)
							}
							descriptions[key] = trimmed
						}
					}
				}
			}
		}
	}

	if len(descriptions) == 0 {
		return out, nil, nil
	}
	return out, descriptions, nil
}

// MarshalARB preserves target-template metadata and ordering while carrying
// source-template message metadata for newly appended keys. When @@locale is
// present, or targetLocale is provided without one in the template, the output
// is normalized to the requested target locale.
func MarshalARB(template []byte, sourceTemplate []byte, values map[string]string, targetLocale string) ([]byte, error) {
	fields, err := parseARBObjectFields(template)
	if err != nil {
		return nil, fmt.Errorf("arb decode: %w", err)
	}
	normalizedTargetLocale := strings.TrimSpace(targetLocale)

	templateMessageKeys := make(map[string]struct{}, len(fields)/2+1)
	hasLocaleField := false
	metaIndices := make([]int, 0, len(fields)/2+1)

	for i, field := range fields {
		if field.Key == "@@locale" {
			hasLocaleField = true
		}
		if isARBMetadataKey(field.Key) {
			if len(field.Key) > 1 && field.Key[1] != '@' {
				metaIndices = append(metaIndices, i)
			}
			continue
		}
		templateMessageKeys[field.Key] = struct{}{}
	}

	var sourceMessageMetadata map[string]json.RawMessage
	if bytes.Equal(template, sourceTemplate) {
		// BOLT OPTIMIZATION: Resolve metadata in a single pass after collecting
		// all message keys to avoid redundant passes over the fields slice.
		sourceMessageMetadata = make(map[string]json.RawMessage, len(metaIndices))
		for _, i := range metaIndices {
			field := fields[i]
			messageKey := field.Key[1:]
			if _, ok := templateMessageKeys[messageKey]; ok {
				sourceMessageMetadata[messageKey] = field.RawValue
			}
		}
	} else {
		var err error
		sourceMessageMetadata, err = arbMessageMetadataFields(sourceTemplate)
		if err != nil {
			return nil, fmt.Errorf("arb decode: %w", err)
		}
	}

	writtenFields := make(map[string]struct{}, len(values)*2)
	var out bytes.Buffer
	// Heuristic pre-allocation: template + values overhead.
	out.Grow(len(template) + len(values)*32)
	out.WriteString("{\n")

	first := true
	writeField := func(key string, value []byte) error {
		if !first {
			out.WriteString(",\n")
		}
		first = false

		out.WriteString("  ")
		if isSimpleJSONString(key) {
			out.WriteByte('"')
			out.WriteString(key)
			out.WriteByte('"')
		} else {
			encodedKey, err := json.Marshal(key)
			if err != nil {
				return err
			}
			out.Write(encodedKey)
		}
		out.WriteString(": ")

		// Fast-path: if value is a simple JSON string (starts with "), skip json.Indent
		// as it's a heavy operation. Metadata objects still use json.Indent.
		if len(value) > 0 && value[0] == '"' {
			out.Write(value)
		} else {
			if err := json.Indent(&out, value, "  ", "  "); err != nil {
				return err
			}
		}
		return nil
	}

	if !hasLocaleField && normalizedTargetLocale != "" {
		if err := writeField("@@locale", marshalJSONString(normalizedTargetLocale)); err != nil {
			return nil, fmt.Errorf("arb encode: %w", err)
		}
		writtenFields["@@locale"] = struct{}{}
	}

	for _, field := range fields {
		if isARBMetadataKey(field.Key) {
			if field.Key == "@@locale" && normalizedTargetLocale != "" {
				if err := writeField(field.Key, marshalJSONString(normalizedTargetLocale)); err != nil {
					return nil, fmt.Errorf("arb encode: %w", err)
				}
				writtenFields[field.Key] = struct{}{}
				continue
			}
			if messageKey, isMessageMeta := arbMessageMetadataKey(field.Key, templateMessageKeys); isMessageMeta {
				if _, ok := values[messageKey]; !ok {
					continue
				}
			}
			if err := writeField(field.Key, field.RawValue); err != nil {
				return nil, fmt.Errorf("arb encode: %w", err)
			}
			writtenFields[field.Key] = struct{}{}
			continue
		}

		value, ok := values[field.Key]
		if !ok {
			continue
		}
		if err := writeField(field.Key, marshalJSONString(value)); err != nil {
			return nil, fmt.Errorf("arb encode: %w", err)
		}
		writtenFields[field.Key] = struct{}{}
	}

	var newKeys []string
	for key := range values {
		if _, ok := writtenFields[key]; !ok {
			newKeys = append(newKeys, key)
		}
	}
	slices.Sort(newKeys)

	for _, key := range newKeys {
		if err := writeField(key, marshalJSONString(values[key])); err != nil {
			return nil, fmt.Errorf("arb encode: %w", err)
		}
		writtenFields[key] = struct{}{}

		metaKey := "@" + key
		if _, alreadyWritten := writtenFields[metaKey]; alreadyWritten {
			continue
		}
		if rawMeta, ok := sourceMessageMetadata[key]; ok {
			if err := writeField(metaKey, rawMeta); err != nil {
				return nil, fmt.Errorf("arb encode: %w", err)
			}
			writtenFields[metaKey] = struct{}{}
		}
	}

	out.WriteString("\n}\n")
	return out.Bytes(), nil
}

type arbObjectField struct {
	Key      string
	RawValue json.RawMessage
}

func parseARBObjectFields(content []byte) ([]arbObjectField, error) {
	dec := json.NewDecoder(bytes.NewReader(content))

	open, err := dec.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := open.(json.Delim)
	if !ok || delim != '{' {
		return nil, fmt.Errorf("expected object")
	}

	// Heuristic pre-allocation: approx 1 field per 64 bytes of content.
	fields := make([]arbObjectField, 0, len(content)/64)
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		key, ok := tok.(string)
		if !ok {
			return nil, fmt.Errorf("expected string key")
		}

		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return nil, err
		}
		fields = append(fields, arbObjectField{Key: key, RawValue: raw})
	}

	closeToken, err := dec.Token()
	if err != nil {
		return nil, err
	}
	delim, ok = closeToken.(json.Delim)
	if !ok || delim != '}' {
		return nil, fmt.Errorf("expected object end")
	}

	// Confirm no tokens remain after the closing '}'.
	if _, err := dec.Token(); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("unexpected trailing json tokens")
		}
		return nil, err
	}

	return fields, nil
}

func arbMessageMetadataKey(metaKey string, templateMessageKeys map[string]struct{}) (string, bool) {
	// ARB metadata keys for messages start with a single '@'.
	// Keys starting with '@@' are global ARB metadata (like @@locale).
	if !isARBMetadataKey(metaKey) || (len(metaKey) > 1 && metaKey[1] == '@') {
		return "", false
	}

	// BOLT OPTIMIZATION: Use slicing instead of strings.TrimPrefix to avoid
	// redundant string operations and potential allocations.
	messageKey := metaKey[1:]
	if _, ok := templateMessageKeys[messageKey]; ok {
		return messageKey, true
	}
	return "", false
}

func arbMessageMetadataFields(content []byte) (map[string]json.RawMessage, error) {
	fields, err := parseARBObjectFields(content)
	if err != nil {
		return nil, err
	}

	// BOLT OPTIMIZATION: Collect message keys and record metadata indices in a
	// single pass to reduce iteration overhead.
	messageKeys := make(map[string]struct{}, len(fields)/2+1)
	metaIndices := make([]int, 0, len(fields)/2+1)

	for i, field := range fields {
		if isARBMetadataKey(field.Key) {
			if len(field.Key) > 1 && field.Key[1] != '@' {
				metaIndices = append(metaIndices, i)
			}
			continue
		}
		messageKeys[field.Key] = struct{}{}
	}

	metadataByKey := make(map[string]json.RawMessage, len(metaIndices))
	for _, i := range metaIndices {
		field := fields[i]
		messageKey := field.Key[1:]
		if _, ok := messageKeys[messageKey]; ok {
			metadataByKey[messageKey] = field.RawValue
		}
	}
	return metadataByKey, nil
}

func isARBMetadataKey(key string) bool {
	// Direct byte access is enough for ARB metadata keys.
	return len(key) > 0 && key[0] == '@'
}

// isSimpleJSONString reports whether s contains only characters that do not
// require escaping in a JSON string. To maintain parity with Go's default
// json.Marshal, we also exclude HTML-sensitive characters.
func isSimpleJSONString(s string) bool {
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch < 0x20 || ch == '"' || ch == '\\' || ch == '<' || ch == '>' || ch == '&' || ch > 0x7E {
			return false
		}
	}
	return true
}

func marshalJSONString(s string) []byte {
	if isSimpleJSONString(s) {
		b := make([]byte, 0, len(s)+2)
		b = append(b, '"')
		b = append(b, s...)
		b = append(b, '"')
		return b
	}
	encoded, err := json.Marshal(s)
	if err != nil {
		return []byte(`""`)
	}
	return encoded
}
