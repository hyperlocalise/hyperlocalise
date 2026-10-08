package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func agentMessage(text, parts string) conversationMessage {
	message := conversationMessage{ID: "m1", InteractionID: "i1", SenderType: "agent", Text: text, CreatedAt: "2026-10-09T00:00:00.000Z"}
	if parts != "" {
		message.Parts = json.RawMessage(parts)
	}
	return message
}

func TestSanitizeConversationMessage(t *testing.T) {
	mixedParts := `[
		{"type":"text","text":"Hello"},
		{"type":"tool-translate","input":{"secret":"x"}},
		{"type":"reasoning","text":"internal"},
		{"type":"source-url","url":"https://example.com","title":"Doc"},
		{"type":"file","url":"blob:1"},
		{"type":"text","text":"World"},
		{"type":"source-document","sourceId":"s1"},
		"loose-string",
		42,
		null,
		["nested"],
		{"text":"no type"},
		{"type":5,"text":"numeric type"},
		{"type":null,"text":"null type"},
		{"type":{"nested":true}},
		{"type":"text","text":7},
		{"type":"text","text":null},
		{"type":"text"}
	]`

	tests := []struct {
		name      string
		message   conversationMessage
		canRunAI  bool
		wantText  string
		wantParts string
	}{
		{
			name:      "restricted agent keeps text and source parts",
			message:   agentMessage("Hello\ninternal\nWorld", mixedParts),
			wantText:  "Hello\nWorld",
			wantParts: `[{"type":"text","text":"Hello"},{"type":"source-url","url":"https://example.com","title":"Doc"},{"type":"text","text":"World"},{"type":"source-document","sourceId":"s1"},{"type":"text","text":7},{"type":"text","text":null},{"type":"text"}]`,
		},
		{
			name:      "restricted agent drops malformed part type instead of failing",
			message:   agentMessage("raw", `[{"type":5,"text":"leak"},{"type":"text","text":"ok"}]`),
			wantText:  "ok",
			wantParts: `[{"type":"text","text":"ok"}]`,
		},
		{
			name:      "restricted agent with empty parts array clears text",
			message:   agentMessage("raw", `[]`),
			wantText:  "",
			wantParts: `[]`,
		},
		{
			name:      "restricted agent with object parts fails closed",
			message:   agentMessage("raw", `{"type":"reasoning","text":"secret"}`),
			wantText:  "",
			wantParts: `[]`,
		},
		{
			name:      "restricted agent with string parts fails closed",
			message:   agentMessage("raw", `"secret"`),
			wantText:  "",
			wantParts: `[]`,
		},
		{
			name:      "restricted agent with number parts fails closed",
			message:   agentMessage("raw", `42`),
			wantText:  "",
			wantParts: `[]`,
		},
		{
			name:      "restricted agent with SQL null parts is unchanged",
			message:   agentMessage("raw", ""),
			wantText:  "raw",
			wantParts: "",
		},
		{
			name:      "restricted agent with JSON null parts is unchanged",
			message:   agentMessage("raw", "null"),
			wantText:  "raw",
			wantParts: "null",
		},
		{
			name: "restricted user message is unchanged",
			message: conversationMessage{
				SenderType: "user", Text: "raw", Parts: json.RawMessage(`[{"type":"tool-x"}]`),
			},
			wantText:  "raw",
			wantParts: `[{"type":"tool-x"}]`,
		},
		{
			name:      "unrestricted agent is unchanged",
			message:   agentMessage("raw", `[{"type":"tool-x"}]`),
			canRunAI:  true,
			wantText:  "raw",
			wantParts: `[{"type":"tool-x"}]`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeConversationMessage(tt.message, tt.canRunAI)
			require.Equal(t, tt.wantText, got.Text)
			if tt.wantParts == "" {
				require.Nil(t, got.Parts)
				return
			}
			require.JSONEq(t, tt.wantParts, string(got.Parts))
		})
	}
}

func TestSanitizeConversationMessagePreservesKeptPartKeyOrder(t *testing.T) {
	got := sanitizeConversationMessage(agentMessage("", `[{"text":"b","type":"text","z":1,"a":2}]`), false)
	require.Equal(t, `[{"text":"b","type":"text","z":1,"a":2}]`, string(got.Parts))
}

func TestSanitizeConversationLastMessage(t *testing.T) {
	require.Nil(t, sanitizeConversationLastMessage(nil, false))

	message := agentMessage("raw", `[{"type":"reasoning","text":"hidden"},{"type":"text","text":"shown"}]`)
	require.Equal(t, &conversationLastMessage{Text: "shown", SenderType: "agent", CreatedAt: message.CreatedAt}, sanitizeConversationLastMessage(&message, false))
	require.Equal(t, &conversationLastMessage{Text: "raw", SenderType: "agent", CreatedAt: message.CreatedAt}, sanitizeConversationLastMessage(&message, true))

	encoded, err := json.Marshal(sanitizeConversationLastMessage(&message, true))
	require.NoError(t, err)
	require.JSONEq(t, `{"text":"raw","senderType":"agent","createdAt":"2026-10-09T00:00:00.000Z"}`, string(encoded))
}
