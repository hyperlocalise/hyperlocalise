package main

import (
	"encoding/json"
	"testing"
)

func BenchmarkSanitizeConversationMessage(b *testing.B) {
	message := agentMessage("Hello\ninternal\nWorld", `[
		{"type":"text","text":"Hello"},
		{"type":"tool-translate","input":{"secret":"x"}},
		{"type":"reasoning","text":"internal"},
		{"type":"source-url","url":"https://example.com","title":"Doc"},
		{"type":"file","url":"blob:1"},
		{"type":"text","text":"World"}
	]`)
	b.ReportAllocs()
	for b.Loop() {
		got := sanitizeConversationMessage(message, false)
		if got.Text == "" {
			b.Fatal("empty sanitized text")
		}
	}
}

func BenchmarkSanitizeConversationMessages(b *testing.B) {
	messages := make([]conversationMessage, 20)
	for i := range messages {
		if i%2 == 0 {
			messages[i] = agentMessage("raw", `[{"type":"reasoning","text":"hidden"},{"type":"text","text":"shown"}]`)
			continue
		}
		messages[i] = conversationMessage{SenderType: "user", Text: "hello", Parts: json.RawMessage(`[{"type":"tool-x"}]`)}
	}
	b.ReportAllocs()
	for b.Loop() {
		clone := append([]conversationMessage(nil), messages...)
		if len(sanitizeConversationMessages(clone, false)) != len(messages) {
			b.Fatal("unexpected message count")
		}
	}
}
