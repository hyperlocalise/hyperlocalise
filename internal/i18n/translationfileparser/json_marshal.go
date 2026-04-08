package translationfileparser

import (
	"encoding/json"
	"fmt"
)

// MarshalJSON rewrites a JSON translation file using the provided flattened values.
func MarshalJSON(template []byte, values map[string]string) ([]byte, error) {
	var payload map[string]any
	if err := json.Unmarshal(template, &payload); err != nil {
		return nil, fmt.Errorf("json decode: %w", err)
	}
	if payload == nil {
		payload = map[string]any{}
	}

	formatJS, err := isStrictFormatJSRoot(payload)
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

	body, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("json encode: %w", err)
	}
	return append(body, '\n'), nil
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
		fullKey := fmt.Sprintf("%s[%d]", prefix, idx)
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
