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

type conversationPartMeta struct {
	Type json.RawMessage `json:"type"`
	Text json.RawMessage `json:"text"`
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
		trimmed := bytes.TrimSpace(item)
		if len(trimmed) == 0 || trimmed[0] != '{' {
			continue
		}
		// Decode only the type and text fields into a typed struct instead of allocating a map[string]json.RawMessage
		var meta conversationPartMeta
		if json.Unmarshal(trimmed, &meta) != nil || len(meta.Type) == 0 {
			continue
		}
		partType, ok := parseJSONStringLiteral(meta.Type)
		if !ok || (partType != "text" && !strings.HasPrefix(partType, "source-")) {
			continue
		}
		kept = append(kept, item)
		if partType == "text" && !isJSONNull(meta.Text) {
			if text, ok := parseJSONStringLiteral(meta.Text); ok {
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
