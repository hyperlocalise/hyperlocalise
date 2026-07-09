package translationfileparser

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
)

// MarshalJSONIndent encodes v as indented JSON with a trailing newline.
// HTML-sensitive characters (<, >, &) are not escaped so locale files with
// ICU rich-text tags remain readable in version control.
func MarshalJSONIndent(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// MarshalJSON rewrites a JSON translation file using the provided flattened values.
func MarshalJSON(template []byte, values map[string]string) ([]byte, error) {
	var payload map[string]any
	if err := json.Unmarshal(template, &payload); err != nil {
		return nil, fmt.Errorf("json decode: %w", err)
	}
	if payload == nil {
		payload = map[string]any{}
	}

	formatJS, err := IsStrictFormatJSRoot(payload)
	if err != nil {
		return nil, err
	}
	if formatJS {
		for key, value := range values {
			message, ok := payload[key].(map[string]any)
			if !ok {
				continue
			}
			message["defaultMessage"] = value
		}
	} else {
		rewriteJSONObject(payload, "", values)
	}

	body, err := MarshalJSONIndent(payload)
	if err != nil {
		return nil, fmt.Errorf("json encode: %w", err)
	}
	return body, nil
}

func rewriteJSONObject(payload map[string]any, prefix string, values map[string]string) {
	for key, raw := range payload {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}
		switch typed := raw.(type) {
		case string:
			if replacement, ok := values[fullKey]; ok {
				payload[key] = replacement
			}
		case []any:
			rewriteJSONArray(typed, fullKey, values)
		case map[string]any:
			rewriteJSONObject(typed, fullKey, values)
		}
	}
}

func rewriteJSONArray(payload []any, prefix string, values map[string]string) {
	for idx, raw := range payload {
		// BOLT OPTIMIZATION: Use string concatenation and strconv.Itoa instead of fmt.Sprintf
		// to reduce allocation and formatting overhead in recursive JSON rewriting.
		fullKey := prefix + "[" + strconv.Itoa(idx) + "]"
		switch typed := raw.(type) {
		case string:
			if replacement, ok := values[fullKey]; ok {
				payload[idx] = replacement
			}
		case []any:
			rewriteJSONArray(typed, fullKey, values)
		case map[string]any:
			rewriteJSONObject(typed, fullKey, values)
		}
	}
}
