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

func readableAgentParts(parts json.RawMessage) (json.RawMessage, string) {
	var items []json.RawMessage
	if err := json.Unmarshal(parts, &items); err != nil {
		return json.RawMessage("[]"), ""
	}
	kept := make([]json.RawMessage, 0, len(items))
	var texts []string
	for _, item := range items {
		var fields map[string]json.RawMessage
		if json.Unmarshal(item, &fields) != nil || fields == nil {
			continue
		}
		var partType string
		if json.Unmarshal(fields["type"], &partType) != nil {
			continue
		}
		if partType != "text" && !strings.HasPrefix(partType, "source-") {
			continue
		}
		kept = append(kept, item)
		var text string
		if partType == "text" && json.Unmarshal(fields["text"], &text) == nil && !isJSONNull(fields["text"]) {
			texts = append(texts, text)
		}
	}
	encoded, err := json.Marshal(kept)
	if err != nil {
		return json.RawMessage("[]"), ""
	}
	return encoded, strings.Join(texts, "\n")
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
