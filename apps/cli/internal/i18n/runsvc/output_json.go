package runsvc

// JSON helpers support nested-key translation updates, pruning, and lenient recovery.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"

	jsoncparser "github.com/tidwall/jsonc"
)

type jsonPathSegment struct {
	key   string
	index *int
}

func unmarshalJSONForPath(path string, content []byte, out any) error {
	firstErr := json.Unmarshal(content, out)
	if firstErr == nil {
		return nil
	}
	if strings.EqualFold(filepath.Ext(path), ".jsonc") {
		resetUnmarshalTarget(out)
		return json.Unmarshal(jsoncparser.ToJSON(content), out)
	}
	return firstErr
}

func resetUnmarshalTarget(out any) {
	v := reflect.ValueOf(out)
	if !v.IsValid() || v.Kind() != reflect.Pointer || v.IsNil() {
		return
	}
	v.Elem().Set(reflect.Zero(v.Elem().Type()))
}

func marshalJSONTarget(path string, template []byte, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	var payload map[string]any
	if err := unmarshalJSONForPath(path, template, &payload); err != nil {
		return nil, fmt.Errorf("flush outputs: decode template %q: %w", path, err)
	}
	if payload == nil {
		payload = map[string]any{}
	}

	allowedValues := values
	if pruneKeys != nil {
		allowedValues = make(map[string]string, len(values))
		for key, value := range values {
			if _, ok := pruneKeys[key]; ok {
				allowedValues[key] = value
			}
		}
	}

	if isStrictFormatJSTemplate(payload) {
		if pruneKeys != nil {
			pruneFormatJSEntries(payload, pruneKeys)
		}
		applyFormatJSUpdates(payload, allowedValues)
	} else {
		if pruneKeys != nil {
			pruneNestedJSONStringFields(payload, "", pruneKeys)
		}
		applyNestedJSONTranslations(payload, allowedValues)
	}

	// Note: JSONC comments/trailing commas are not preserved on write-back.
	// We always emit canonical JSON syntax (while allowing .jsonc extension).
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
	}
	return append(content, '\n'), nil
}

func (s *Service) marshalJSONTargetWithFallback(path, sourcePath string, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	targetTemplate, err := s.readProjectFile(path)
	if err == nil {
		content, marshalErr := marshalJSONTarget(path, targetTemplate, values, pruneKeys)
		if marshalErr == nil {
			return content, nil
		}

		sourceTemplate, srcErr := s.readProjectFile(sourcePath)
		if srcErr != nil {
			return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
		}
		fallbackContent, fallbackErr := marshalJSONTarget(path, sourceTemplate, values, pruneKeys)
		if fallbackErr == nil {
			return fallbackContent, nil
		}
		return nil, errors.Join(
			marshalErr,
			fmt.Errorf("flush outputs: fallback template %q: %w", sourcePath, fallbackErr),
		)
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	sourceTemplate, srcErr := s.readProjectFile(sourcePath)
	if srcErr != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
	}
	return marshalJSONTarget(path, sourceTemplate, values, pruneKeys)
}

func isStrictFormatJSTemplate(payload map[string]any) bool {
	if len(payload) == 0 {
		return false
	}

	for _, raw := range payload {
		message, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		defaultMessage, ok := message["defaultMessage"]
		if !ok {
			return false
		}
		if _, ok := defaultMessage.(string); !ok {
			return false
		}
	}
	return true
}

func pruneFormatJSEntries(payload map[string]any, keep map[string]struct{}) {
	for key, raw := range payload {
		if _, ok := keep[key]; ok {
			continue
		}
		message, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if _, ok := message["defaultMessage"]; ok {
			delete(payload, key)
		}
	}
}

func applyFormatJSUpdates(payload map[string]any, values map[string]string) {
	for _, key := range sortedEntryKeys(values) {
		raw, ok := payload[key]
		if !ok {
			payload[key] = map[string]any{"defaultMessage": values[key]}
			continue
		}
		message, ok := raw.(map[string]any)
		if !ok {
			payload[key] = map[string]any{"defaultMessage": values[key]}
			continue
		}
		message["defaultMessage"] = values[key]
	}
}

func applyNestedJSONTranslations(payload map[string]any, values map[string]string) {
	for _, key := range sortedEntryKeys(values) {
		setNestedValue(payload, key, values[key])
	}
}

func pruneNestedJSONStringFields(payload map[string]any, prefix string, allowed map[string]struct{}) {
	for _, key := range sortedEntryKeysMapAny(payload) {
		value := payload[key]
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}
		switch typed := value.(type) {
		case string:
			if _, ok := allowed[fullKey]; !ok {
				delete(payload, key)
			}
		case []any:
			pruneJSONArrayStringFields(typed, fullKey, allowed)
		case map[string]any:
			pruneNestedJSONStringFields(typed, fullKey, allowed)
			if len(typed) == 0 {
				delete(payload, key)
			}
		}
	}
}

func pruneJSONArrayStringFields(payload []any, prefix string, allowed map[string]struct{}) {
	for idx, value := range payload {
		fullKey := prefix + "[" + strconv.Itoa(idx) + "]"
		switch typed := value.(type) {
		case string:
			if _, ok := allowed[fullKey]; !ok {
				payload[idx] = nil
			}
		case []any:
			pruneJSONArrayStringFields(typed, fullKey, allowed)
		case map[string]any:
			pruneNestedJSONStringFields(typed, fullKey, allowed)
		}
	}
}

func parseJSONEntriesLenient(path string, content []byte) (map[string]string, error) {
	var payload map[string]any
	if err := unmarshalJSONForPath(path, content, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		return map[string]string{}, nil
	}

	out := map[string]string{}
	if isStrictFormatJSTemplate(payload) {
		for _, key := range sortedEntryKeysMapAny(payload) {
			message := payload[key].(map[string]any)
			raw, ok := message["defaultMessage"].(string)
			if ok {
				out[key] = raw
			}
		}
		return out, nil
	}
	collectNestedJSONStrings(out, "", payload)
	return out, nil
}

func collectNestedJSONStrings(out map[string]string, prefix string, payload map[string]any) {
	for _, key := range sortedEntryKeysMapAny(payload) {
		value := payload[key]
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}
		switch typed := value.(type) {
		case string:
			out[fullKey] = typed
		case []any:
			collectJSONArrayStrings(out, fullKey, typed)
		case map[string]any:
			collectNestedJSONStrings(out, fullKey, typed)
		}
	}
}

func collectJSONArrayStrings(out map[string]string, prefix string, payload []any) {
	for idx, value := range payload {
		fullKey := prefix + "[" + strconv.Itoa(idx) + "]"
		switch typed := value.(type) {
		case string:
			out[fullKey] = typed
		case []any:
			collectJSONArrayStrings(out, fullKey, typed)
		case map[string]any:
			collectNestedJSONStrings(out, fullKey, typed)
		}
	}
}

func sortedEntryKeysMapAny(entries map[string]any) []string {
	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func parseJSONPath(key string) ([]jsonPathSegment, error) {
	if key == "" {
		return nil, fmt.Errorf("json path cannot be empty")
	}

	parts := strings.Split(key, ".")
	segments := make([]jsonPathSegment, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			return nil, fmt.Errorf("invalid json path %q", key)
		}

		partSegments, err := parseJSONPathPart(part)
		if err != nil {
			return nil, err
		}
		segments = append(segments, partSegments...)
	}

	return segments, nil
}

func parseJSONPathPart(part string) ([]jsonPathSegment, error) {
	bracket := strings.Index(part, "[")
	if bracket < 0 {
		return []jsonPathSegment{{key: part}}, nil
	}

	name := part[:bracket]
	if name == "" {
		return nil, fmt.Errorf("invalid json path segment %q", part)
	}

	remainder := part[bracket:]
	segments := make([]jsonPathSegment, 0, 4)
	for remainder != "" {
		if remainder[0] != '[' {
			return nil, fmt.Errorf("invalid json path segment %q", part)
		}
		closeBracket := strings.Index(remainder, "]")
		if closeBracket < 0 {
			return nil, fmt.Errorf("invalid json path segment %q", part)
		}
		idx, err := strconv.Atoi(remainder[1:closeBracket])
		if err != nil || idx < 0 {
			return nil, fmt.Errorf("invalid json array index in %q", part)
		}
		index := idx
		if len(segments) == 0 {
			segments = append(segments, jsonPathSegment{key: name, index: &index})
		} else {
			segments = append(segments, jsonPathSegment{index: &index})
		}
		remainder = remainder[closeBracket+1:]
	}

	return segments, nil
}

type jsonPathCursor struct {
	node      any
	parentArr []any
	parentIdx int
	hasParent bool
}

func setNestedValue(payload map[string]any, dottedKey, value string) {
	segments, err := parseJSONPath(dottedKey)
	if err != nil {
		return
	}

	cursor := jsonPathCursor{node: payload}
	for i := 0; i < len(segments)-1; i++ {
		var nextSegment *jsonPathSegment
		if i+1 < len(segments) {
			nextSegment = &segments[i+1]
		}
		if !cursor.descend(segments[i], nextSegment, true) {
			return
		}
	}
	cursor.setValue(segments[len(segments)-1], value)
}

func (c *jsonPathCursor) writeBackArray(arr []any) {
	if c.hasParent {
		c.parentArr[c.parentIdx] = arr
	}
}

func extendJSONArray(arr []any, index int, create bool) ([]any, bool) {
	if len(arr) <= index {
		if !create {
			return nil, false
		}
		for len(arr) <= index {
			arr = append(arr, nil)
		}
	}
	return arr, true
}

func (c *jsonPathCursor) descend(segment jsonPathSegment, nextSegment *jsonPathSegment, create bool) bool {
	if segment.key != "" {
		currentMap, ok := c.node.(map[string]any)
		if !ok {
			return false
		}
		if segment.index == nil {
			next, ok := currentMap[segment.key]
			if !ok {
				if !create {
					return false
				}
				next = map[string]any{}
				currentMap[segment.key] = next
			}
			nested, ok := next.(map[string]any)
			if !ok {
				if !create {
					return false
				}
				nested = map[string]any{}
				currentMap[segment.key] = nested
			}
			c.node = nested
			c.hasParent = false
			return true
		}

		next, ok := currentMap[segment.key]
		if !ok {
			if !create {
				return false
			}
			next = []any{}
			currentMap[segment.key] = next
		}
		arr, ok := next.([]any)
		if !ok {
			return false
		}
		arr, ok = extendJSONArray(arr, *segment.index, create)
		if !ok {
			return false
		}
		currentMap[segment.key] = arr
		elem := arr[*segment.index]
		if elem == nil && create {
			elem = newJSONPathChild(nextSegment)
			arr[*segment.index] = elem
			currentMap[segment.key] = arr
		}
		if elem == nil {
			return create
		}
		c.node = elem
		c.parentArr = arr
		c.parentIdx = *segment.index
		c.hasParent = true
		return true
	}

	arr, ok := c.node.([]any)
	if !ok {
		return false
	}
	arr, ok = extendJSONArray(arr, *segment.index, create)
	if !ok {
		return false
	}
	c.writeBackArray(arr)
	elem := arr[*segment.index]
	if elem == nil && create {
		elem = newJSONPathChild(nextSegment)
		arr[*segment.index] = elem
		c.writeBackArray(arr)
	}
	if elem == nil {
		return create
	}
	c.node = elem
	c.parentArr = arr
	c.parentIdx = *segment.index
	c.hasParent = true
	return true
}

func (c *jsonPathCursor) setValue(segment jsonPathSegment, value string) {
	if segment.key != "" {
		currentMap, ok := c.node.(map[string]any)
		if !ok {
			return
		}
		if segment.index == nil {
			currentMap[segment.key] = value
			return
		}
		arr, ok := currentMap[segment.key].([]any)
		if !ok {
			arr = make([]any, *segment.index+1)
		}
		arr, ok = extendJSONArray(arr, *segment.index, true)
		if !ok {
			return
		}
		arr[*segment.index] = value
		currentMap[segment.key] = arr
		return
	}

	arr, ok := c.node.([]any)
	if !ok {
		return
	}
	arr, ok = extendJSONArray(arr, *segment.index, true)
	if !ok {
		return
	}
	c.writeBackArray(arr)
	arr[*segment.index] = value
	c.writeBackArray(arr)
}

func newJSONPathChild(nextSegment *jsonPathSegment) any {
	if nextSegment != nil && nextSegment.key == "" && nextSegment.index != nil {
		return []any{}
	}
	return map[string]any{}
}
