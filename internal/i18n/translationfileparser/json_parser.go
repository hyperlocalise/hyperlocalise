package translationfileparser

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// JSONParser parses translation JSON files.
type JSONParser struct{}

func (p JSONParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p JSONParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	entries, err := p.ParseIngestEntries(content, JSONImportOptions{})
	if err != nil {
		return nil, nil, err
	}
	values := make(map[string]string, len(entries))
	var entryContext map[string]string
	for key, entry := range entries {
		values[key] = entry.Text
		if context := strings.TrimSpace(entry.Context); context != "" {
			if entryContext == nil {
				entryContext = map[string]string{}
			}
			entryContext[key] = context
		}
	}
	return values, entryContext, nil
}

// ParseIngestEntries flattens JSON and applies optional key-path, sibling-field,
// and HTML/ICU sub-filters.
func (p JSONParser) ParseIngestEntries(content []byte, opts JSONImportOptions) (map[string]IngestEntry, error) {
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("json decode: %w", err)
	}

	if payload == nil {
		return map[string]IngestEntry{}, nil
	}

	if IsLottiePayload(payload) {
		values, entryContext := parseLottiePayload(payload)
		return applyContextByKey(IngestEntriesFromStringMap(values), entryContext), nil
	}

	if out, descriptions, isFormatJS, err := parseFormatJS(payload); err != nil {
		return nil, err
	} else if isFormatJS {
		entries := applyContextByKey(IngestEntriesFromStringMap(out), descriptions)
		return filterJSONIngestEntries(entries, opts), nil
	}

	collected := jsonCollectState{
		values:               make(map[string]string, len(payload)),
		contextByKey:         map[string]string{},
		maxLengthByKey:       map[string]int{},
		contextFields:        normalizeFieldNameSet(opts.ContextFields),
		characterLimitFields: normalizeFieldNameSet(opts.CharacterLimitFields),
	}
	if err := flattenJSONWithOptions(&collected, "", payload); err != nil {
		return nil, err
	}

	entries := applyMaxLengthByKey(
		applyContextByKey(IngestEntriesFromStringMap(collected.values), collected.contextByKey),
		collected.maxLengthByKey,
	)
	return filterJSONIngestEntries(entries, opts), nil
}

type jsonCollectState struct {
	values               map[string]string
	contextByKey         map[string]string
	maxLengthByKey       map[string]int
	contextFields        map[string]struct{}
	characterLimitFields map[string]struct{}
}

func parseFormatJS(payload map[string]any) (map[string]string, map[string]string, bool, error) {
	if len(payload) == 0 {
		return nil, nil, false, nil
	}

	var out map[string]string
	var descriptions map[string]string

	for key, value := range payload {
		defaultMsg, description, ok, err := parseFormatJSMessage(key, value)
		if err != nil {
			return nil, nil, false, err
		}
		if !ok {
			return nil, nil, false, nil
		}

		if out == nil {
			out = make(map[string]string, len(payload))
		}
		out[key] = defaultMsg

		if description != "" {
			if descriptions == nil {
				descriptions = make(map[string]string, len(payload))
			}
			descriptions[key] = description
		}
	}

	return out, descriptions, true, nil
}

func parseFormatJSMessage(key string, value any) (string, string, bool, error) {
	message, ok := value.(map[string]any)
	if !ok {
		return "", "", false, nil
	}
	rawMsg, ok := message["defaultMessage"]
	if !ok {
		return "", "", false, nil
	}
	defaultMsg, ok := rawMsg.(string)
	if !ok {
		return "", "", false, fmt.Errorf("json key %q field %q must be string, got %T", key, "defaultMessage", rawMsg)
	}

	var description string
	if rawDesc, ok := message["description"]; ok {
		if desc, ok := rawDesc.(string); ok {
			description = strings.TrimSpace(desc)
		}
	}

	return defaultMsg, description, true, nil
}

// IsStrictFormatJSRoot reports whether payload is a FormatJS message catalog.
func IsStrictFormatJSRoot(payload map[string]any) (bool, error) {
	if len(payload) == 0 {
		return false, nil
	}

	for key, value := range payload {
		if _, _, ok, err := parseFormatJSMessage(key, value); err != nil {
			return false, err
		} else if !ok {
			return false, nil
		}
	}

	return true, nil
}

// FlattenJSON flattens nested JSON objects into dotted string keys.
func FlattenJSON(out map[string]string, prefix string, input map[string]any) error {
	return flattenJSON(out, prefix, input)
}

func flattenJSON(out map[string]string, prefix string, input map[string]any) error {
	state := jsonCollectState{
		values:         out,
		contextByKey:   map[string]string{},
		maxLengthByKey: map[string]int{},
	}
	return flattenJSONWithOptions(&state, prefix, input)
}

func flattenJSONWithOptions(state *jsonCollectState, prefix string, input map[string]any) error {
	siblingContext, siblingLimit := siblingJSONMetadata(input, state.contextFields, state.characterLimitFields)

	for key, value := range input {
		if fieldNameInSet(key, state.contextFields) || fieldNameInSet(key, state.characterLimitFields) {
			continue
		}

		nextKey := key
		if prefix != "" {
			nextKey = prefix + "." + key
		}

		switch typed := value.(type) {
		case string:
			state.values[nextKey] = typed
			if siblingContext != "" {
				state.contextByKey[nextKey] = siblingContext
			}
			if siblingLimit > 0 {
				state.maxLengthByKey[nextKey] = siblingLimit
			}
		case []any:
			if err := flattenJSONArrayWithOptions(state, nextKey, typed); err != nil {
				return err
			}
		case map[string]any:
			if err := flattenJSONWithOptions(state, nextKey, typed); err != nil {
				return err
			}
		default:
			return fmt.Errorf("json key %q must be string, string array, or object, got %T", nextKey, value)
		}
	}

	return nil
}

func flattenJSONArrayWithOptions(state *jsonCollectState, prefix string, input []any) error {
	for idx, item := range input {
		itemKey := prefix + "[" + strconv.Itoa(idx) + "]"
		switch typed := item.(type) {
		case string:
			state.values[itemKey] = typed
		case map[string]any:
			if err := flattenJSONWithOptions(state, itemKey, typed); err != nil {
				return err
			}
		case []any:
			if err := flattenJSONArrayWithOptions(state, itemKey, typed); err != nil {
				return err
			}
		default:
			return fmt.Errorf("json key %q must be string, array, or object, got %T", itemKey, item)
		}
	}

	return nil
}

func siblingJSONMetadata(
	input map[string]any,
	contextFields map[string]struct{},
	characterLimitFields map[string]struct{},
) (string, int) {
	var parts []string
	limit := 0
	for key, value := range input {
		if fieldNameInSet(key, contextFields) {
			if text, ok := value.(string); ok {
				if trimmed := strings.TrimSpace(text); trimmed != "" {
					parts = append(parts, trimmed)
				}
			}
			continue
		}
		if fieldNameInSet(key, characterLimitFields) && limit <= 0 {
			if parsed, ok := positiveIntFromJSONValue(value); ok {
				limit = parsed
				continue
			}
			if text, ok := value.(string); ok {
				if parsed, ok := positiveIntFromJSONValue(json.Number(strings.TrimSpace(text))); ok {
					limit = parsed
				}
			}
		}
	}
	return joinParserContext(parts...), limit
}
