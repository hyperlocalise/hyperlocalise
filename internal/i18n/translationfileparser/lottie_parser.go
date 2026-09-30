package translationfileparser

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

const (
	lottieTextLayerType = 5
	lottieTextFieldKey  = "t"
)

var lottieLayersMarker = []byte(`"layers"`)

type lottieTextEntry struct {
	key     string
	value   string
	context string
}

// IsLottieJSON reports whether content is a Lottie (Bodymovin) animation document.
func IsLottieJSON(content []byte) bool {
	if !bytes.Contains(content, lottieLayersMarker) {
		return false
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return false
	}
	return IsLottiePayload(payload)
}

// IsLottiePayload reports whether a decoded JSON object has the Lottie root shape:
// a version string, frame rate, in/out points, and a layers array.
func IsLottiePayload(payload map[string]any) bool {
	if payload == nil {
		return false
	}
	if version, ok := payload["v"].(string); !ok || strings.TrimSpace(version) == "" {
		return false
	}
	if _, ok := payload["layers"].([]any); !ok {
		return false
	}
	for _, field := range []string{"fr", "ip", "op"} {
		if _, ok := payload[field].(float64); !ok {
			return false
		}
	}
	return true
}

// ParseLottie extracts editable text layer content from a Lottie animation.
func ParseLottie(content []byte) (map[string]string, map[string]string, error) {
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, nil, fmt.Errorf("json decode: %w", err)
	}
	if !IsLottiePayload(payload) {
		return nil, nil, errors.New("lottie: document is missing required root fields (v, fr, ip, op, layers)")
	}
	values, entryContext := parseLottiePayload(payload)
	return values, entryContext, nil
}

func parseLottiePayload(payload map[string]any) (map[string]string, map[string]string) {
	entries := collectLottieTextEntries(payload)
	values := make(map[string]string, len(entries))
	entryContext := make(map[string]string, len(entries))
	for _, entry := range entries {
		values[entry.key] = entry.value
		entryContext[entry.key] = entry.context
	}
	return values, entryContext
}

func collectLottieTextEntries(payload map[string]any) []lottieTextEntry {
	var entries []lottieTextEntry
	if layers, ok := payload["layers"].([]any); ok {
		entries = appendLottieLayerTexts(entries, "layers", "", layers)
	}
	assets, _ := payload["assets"].([]any)
	for assetIdx, rawAsset := range assets {
		asset, ok := rawAsset.(map[string]any)
		if !ok {
			continue
		}
		layers, ok := asset["layers"].([]any)
		if !ok {
			continue
		}
		assetID, _ := asset["id"].(string)
		prefix := "assets[" + strconv.Itoa(assetIdx) + "].layers"
		entries = appendLottieLayerTexts(entries, prefix, assetID, layers)
	}
	return entries
}

func appendLottieLayerTexts(entries []lottieTextEntry, prefix, precompID string, layers []any) []lottieTextEntry {
	for layerIdx, rawLayer := range layers {
		layer, ok := rawLayer.(map[string]any)
		if !ok {
			continue
		}
		if layerType, ok := layer["ty"].(float64); !ok || int(layerType) != lottieTextLayerType {
			continue
		}
		textData, _ := layer["t"].(map[string]any)
		document, _ := textData["d"].(map[string]any)
		keyframes, _ := document["k"].([]any)
		layerName, _ := layer["nm"].(string)
		layerKey := prefix + "[" + strconv.Itoa(layerIdx) + "]"

		for keyframeIdx, rawKeyframe := range keyframes {
			keyframe, ok := rawKeyframe.(map[string]any)
			if !ok {
				continue
			}
			textDocument, _ := keyframe["s"].(map[string]any)
			text, ok := textDocument["t"].(string)
			if !ok || strings.TrimSpace(text) == "" {
				continue
			}
			entries = append(entries, lottieTextEntry{
				key:     layerKey + ".t.d.k[" + strconv.Itoa(keyframeIdx) + "].s.t",
				value:   text,
				context: lottieEntryContext(layerName, precompID, keyframe, len(keyframes), text),
			})
		}
	}
	return entries
}

func lottieEntryContext(layerName, precompID string, keyframe map[string]any, keyframeCount int, text string) string {
	var parts []string
	if layerName != "" {
		parts = append(parts, fmt.Sprintf("Lottie text layer %q", layerName))
	} else {
		parts = append(parts, "Lottie text layer")
	}
	if precompID != "" {
		parts = append(parts, fmt.Sprintf("in precomposition %q", precompID))
	}
	if keyframeCount > 1 {
		if frame, ok := keyframe["t"].(float64); ok {
			parts = append(parts, "text keyframe at frame "+strconv.FormatFloat(frame, 'f', -1, 64))
		}
	}
	context := strings.Join(parts, " ")
	if strings.Contains(text, "\r") {
		context += `. Line breaks are encoded as "\r"; keep them as "\r".`
	}
	return context
}

type lottieJSONFrame struct {
	isArray   bool
	index     int
	key       string
	expectKey bool
}

type lottieReplacement struct {
	start int
	end   int
	value string
}

// MarshalLottie writes translated text layer values into a Lottie animation template.
// Only the text string literals are rewritten, so the rest of the document (layout,
// number formatting, key order) is preserved byte-for-byte.
func MarshalLottie(template []byte, values map[string]string) ([]byte, error) {
	var payload map[string]any
	if err := json.Unmarshal(template, &payload); err != nil {
		return nil, fmt.Errorf("json decode: %w", err)
	}
	if !IsLottiePayload(payload) {
		return nil, errors.New("lottie: document is missing required root fields (v, fr, ip, op, layers)")
	}

	entries := collectLottieTextEntries(payload)
	pending := make(map[string]string, len(entries))
	for _, entry := range entries {
		if replacement, ok := values[entry.key]; ok && replacement != entry.value {
			pending[entry.key] = replacement
		}
	}
	if len(pending) == 0 {
		return template, nil
	}

	replacements, err := findLottieTextSpans(template, pending)
	if err != nil {
		return nil, err
	}

	var out bytes.Buffer
	out.Grow(len(template))
	cursor := 0
	for _, replacement := range replacements {
		encoded, err := encodeLottieJSONString(replacement.value)
		if err != nil {
			return nil, err
		}
		out.Write(template[cursor:replacement.start])
		out.Write(encoded)
		cursor = replacement.end
	}
	out.Write(template[cursor:])
	return out.Bytes(), nil
}

func findLottieTextSpans(template []byte, pending map[string]string) ([]lottieReplacement, error) {
	decoder := json.NewDecoder(bytes.NewReader(template))
	decoder.UseNumber()

	var (
		stack        []lottieJSONFrame
		replacements []lottieReplacement
		prevEnd      int
	)

	beginValue := func() {
		if len(stack) > 0 && stack[len(stack)-1].isArray {
			stack[len(stack)-1].index++
		}
	}
	endValue := func() {
		if len(stack) > 0 && !stack[len(stack)-1].isArray {
			stack[len(stack)-1].expectKey = true
		}
	}

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("json decode: %w", err)
		}
		end := int(decoder.InputOffset())

		switch typed := token.(type) {
		case json.Delim:
			switch typed {
			case '{':
				beginValue()
				stack = append(stack, lottieJSONFrame{expectKey: true})
			case '[':
				beginValue()
				stack = append(stack, lottieJSONFrame{isArray: true, index: -1})
			case '}', ']':
				stack = stack[:len(stack)-1]
				endValue()
			}
		case string:
			if len(stack) > 0 && !stack[len(stack)-1].isArray && stack[len(stack)-1].expectKey {
				stack[len(stack)-1].key = typed
				stack[len(stack)-1].expectKey = false
				break
			}
			beginValue()
			if len(stack) > 0 && !stack[len(stack)-1].isArray && stack[len(stack)-1].key == lottieTextFieldKey {
				if replacement, ok := pending[lottieJSONPath(stack)]; ok {
					start := lottieStringLiteralStart(template, prevEnd)
					if start < 0 || start >= end {
						return nil, fmt.Errorf("lottie: locate text literal at %s", lottieJSONPath(stack))
					}
					replacements = append(replacements, lottieReplacement{start: start, end: end, value: replacement})
				}
			}
			endValue()
		default:
			beginValue()
			endValue()
		}
		prevEnd = end
	}

	return replacements, nil
}

func lottieJSONPath(stack []lottieJSONFrame) string {
	var path strings.Builder
	for _, frame := range stack {
		if frame.isArray {
			path.WriteByte('[')
			path.WriteString(strconv.Itoa(frame.index))
			path.WriteByte(']')
			continue
		}
		if path.Len() > 0 {
			path.WriteByte('.')
		}
		path.WriteString(frame.key)
	}
	return path.String()
}

// lottieStringLiteralStart returns the offset of the opening quote of the next string
// literal after offset. Only whitespace and JSON separators may appear in between.
func lottieStringLiteralStart(content []byte, offset int) int {
	for idx := offset; idx < len(content); idx++ {
		switch content[idx] {
		case ' ', '\t', '\n', '\r', ':', ',':
			continue
		case '"':
			return idx
		default:
			return -1
		}
	}
	return -1
}

func encodeLottieJSONString(value string) ([]byte, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, fmt.Errorf("json encode: %w", err)
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}
