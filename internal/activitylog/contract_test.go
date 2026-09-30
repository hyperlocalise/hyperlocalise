package activitylog

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func validMessage() Message {
	return Message{
		Event: Event{
			ActorKind:      "system",
			CreatedAt:      "2026-09-25T00:00:00.000Z",
			EventType:      "project_created",
			ID:             "55555555-5555-4555-8555-555555555555",
			OrganizationID: "66666666-6666-4666-8666-666666666666",
			Payload:        json.RawMessage(`{"name":"Project","resourceId":"project-1"}`),
			TargetID:       "project-1",
			TargetKind:     "project",
		},
		MessageType:   MessageType,
		SchemaVersion: SchemaVersion,
	}
}

func TestDecodeMessage(t *testing.T) {
	body, err := json.Marshal(validMessage())
	require.NoError(t, err)

	decoded, err := DecodeMessage(body)
	require.NoError(t, err)
	require.Equal(t, validMessage(), decoded)
}

func TestValidateMessageRejectsUnsafePayload(t *testing.T) {
	message := validMessage()
	message.Event.Payload = json.RawMessage(`{"nested":[{"sourceText":"private"}]}`)

	err := ValidateMessage(message)
	require.EqualError(t, err, "activity_log_payload_contains_forbidden_field")
}

func TestValidateMessageRejectsMismatchedTarget(t *testing.T) {
	message := validMessage()
	message.Event.TargetKind = "glossary"

	err := ValidateMessage(message)
	require.EqualError(t, err, "invalid_activity_log_event_type")
}

func TestIsImplementedEventType(t *testing.T) {
	require.True(t, IsImplementedEventType("project_created"))
	require.False(t, IsImplementedEventType("organization_api_key_created"))
}
