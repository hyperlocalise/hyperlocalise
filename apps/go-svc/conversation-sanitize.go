package main

import (
	"bytes"
	"encoding/json"
	"strings"
)

type conversationMessage struct {
	ID            string          `json:"id"`
	InteractionID string          `json:"interactionId"`
	SenderType    string          `json:"senderType"`
	SenderEmail   *string         `json:"senderEmail"`
	Text          string          `json:"text"`
	Parts         json.RawMessage `json:"parts"`
	Attachments   json.RawMessage `json:"attachments"`
	CreatedAt     string          `json:"createdAt"`
}

type conversationLastMessage struct {
	Text       string `json:"text"`
	SenderType string `json:"senderType"`
	CreatedAt  string `json:"createdAt"`
}

func isJSONNull(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null"))
}

func skipJSONSpace(raw []byte, i int) int {
	for i < len(raw) && (raw[i] == ' ' || raw[i] == '\t' || raw[i] == '\n' || raw[i] == '\r') {
		i++
	}
	return i
}

func endOfJSONString(raw []byte, i int) int {
	for j := i + 1; j < len(raw); j++ {
		switch raw[j] {
		case '\\':
			j++
		case '"':
			return j + 1
		}
	}
	return -1
}

func endOfJSONValue(raw []byte, i int) int {
	if i >= len(raw) {
		return -1
	}
	switch raw[i] {
	case '"':
		return endOfJSONString(raw, i)
	case '{', '[':
		depth := 0
		for j := i; j < len(raw); j++ {
			switch raw[j] {
			case '"':
				end := endOfJSONString(raw, j)
				if end < 0 {
					return -1
				}
				j = end - 1
			case '{', '[':
				depth++
			case '}', ']':
				depth--
				if depth == 0 {
					return j + 1
				}
			}
		}
		return -1
	default:
		j := i
		for j < len(raw) && raw[j] != ',' && raw[j] != '}' && raw[j] != ']' && raw[j] != ' ' && raw[j] != '\t' && raw[j] != '\n' && raw[j] != '\r' {
			j++
		}
		if j == i {
			return -1
		}
		return j
	}
}

// conversationPartFields returns the raw values of the top-level "type" and "text" keys of an
// already-validated JSON object. Keys must match exactly: struct decoding is avoided because
// encoding/json matches field names case-insensitively, so a hidden part could pass the filter
// with a "Type":"text" key.
func conversationPartFields(object []byte) (partType, text json.RawMessage, ok bool) {
	i := skipJSONSpace(object, 0)
	if i >= len(object) || object[i] != '{' {
		return nil, nil, false
	}
	i++
	for {
		i = skipJSONSpace(object, i)
		if i >= len(object) {
			return nil, nil, false
		}
		switch object[i] {
		case '}':
			return partType, text, true
		case ',':
			i++
			continue
		case '"':
		default:
			return nil, nil, false
		}
		keyEnd := endOfJSONString(object, i)
		if keyEnd < 0 {
			return nil, nil, false
		}
		key := object[i:keyEnd]
		i = skipJSONSpace(object, keyEnd)
		if i >= len(object) || object[i] != ':' {
			return nil, nil, false
		}
		i = skipJSONSpace(object, i+1)
		valueEnd := endOfJSONValue(object, i)
		if valueEnd < 0 {
			return nil, nil, false
		}
		switch name, _ := parseJSONStringLiteral(key); name {
		case "type":
			partType = object[i:valueEnd]
		case "text":
			text = object[i:valueEnd]
		}
		i = valueEnd
	}
}

// parseJSONStringLiteral decodes a JSON string literal. For unescaped string literals,
// it extracts the string directly from the byte slice to avoid heap allocations in json.Unmarshal.
func parseJSONStringLiteral(raw json.RawMessage) (string, bool) {
	if len(raw) >= 2 && raw[0] == '"' && raw[len(raw)-1] == '"' {
		inner := raw[1 : len(raw)-1]
		if bytes.IndexByte(inner, '\\') < 0 {
			return string(inner), true
		}
	}
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return "", false
	}
	return s, true
}

// formatRawJSONArray joins raw JSON items into a valid JSON array without json.Marshal reflection overhead.
func formatRawJSONArray(items []json.RawMessage) json.RawMessage {
	if len(items) == 0 {
		return json.RawMessage("[]")
	}
	totalLen := 2 + (len(items) - 1)
	for _, item := range items {
		totalLen += len(item)
	}
	var buf bytes.Buffer
	buf.Grow(totalLen)
	buf.WriteByte('[')
	for i, item := range items {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.Write(item)
	}
	buf.WriteByte(']')
	return json.RawMessage(buf.Bytes())
}

func readableAgentParts(parts json.RawMessage) (json.RawMessage, string) {
	var items []json.RawMessage
	if err := json.Unmarshal(parts, &items); err != nil {
		return json.RawMessage("[]"), ""
	}
	kept := make([]json.RawMessage, 0, len(items))
	var texts []string
	for _, item := range items {
		rawType, rawText, ok := conversationPartFields(item)
		if !ok || len(rawType) == 0 {
			continue
		}
		partType, ok := parseJSONStringLiteral(rawType)
		if !ok || (partType != "text" && !strings.HasPrefix(partType, "source-")) {
			continue
		}
		kept = append(kept, item)
		if partType == "text" && !isJSONNull(rawText) {
			if text, ok := parseJSONStringLiteral(rawText); ok {
				texts = append(texts, text)
			}
		}
	}
	return formatRawJSONArray(kept), strings.Join(texts, "\n")
}

func sanitizeConversationMessage(message conversationMessage, canRunAIActions bool) conversationMessage {
	if message.SenderType != "agent" || canRunAIActions || isJSONNull(message.Parts) {
		return message
	}
	message.Parts, message.Text = readableAgentParts(message.Parts)
	return message
}

func sanitizeConversationMessages(messages []conversationMessage, canRunAIActions bool) []conversationMessage {
	for i := range messages {
		messages[i] = sanitizeConversationMessage(messages[i], canRunAIActions)
	}
	return messages
}

func sanitizeConversationLastMessage(message *conversationMessage, canRunAIActions bool) *conversationLastMessage {
	if message == nil {
		return nil
	}
	sanitized := sanitizeConversationMessage(*message, canRunAIActions)
	return &conversationLastMessage{Text: sanitized.Text, SenderType: sanitized.SenderType, CreatedAt: sanitized.CreatedAt}
}
