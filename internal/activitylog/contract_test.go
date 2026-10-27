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
	require.True(t, IsImplementedEventType("string_segment_translation_updated"))
	require.True(t, IsImplementedEventType("automation_created"))
	require.True(t, IsImplementedEventType("visual_workflow_published"))
	require.True(t, IsImplementedEventType("query_created"))
	require.True(t, IsImplementedEventType("organization_api_key_created"))
	require.True(t, IsImplementedEventType("organization_api_key_revoked"))
	require.True(t, IsImplementedEventType("dictionary_created"))
	require.True(t, IsImplementedEventType("linked_domain_verified"))
}

func TestValidateMessageAcceptsOrganizationAPIKeyCreated(t *testing.T) {
	message := validMessage()
	message.Event.EventType = "organization_api_key_created"
	message.Event.TargetKind = "organization_api_key"
	message.Event.Payload = json.RawMessage(`{"apiKeyId":"key-1","keyPrefix":"hl_AbCd","name":"CI deploy","permissions":["jobs:read"]}`)

	require.NoError(t, ValidateMessage(message))
}

func TestValidateMessageAcceptsDictionaryAndLinkedDomainEvents(t *testing.T) {
	cases := []struct {
		eventType  string
		targetKind string
		payload    string
	}{
		{"dictionary_created", "dictionary", `{"name":"Brand names","resourceId":"dict-1"}`},
		{"dictionary_imported", "dictionary", `{"itemCount":12,"locale":"en-US","resourceId":"dict-1"}`},
		{"dictionary_project_attached", "project", `{"projectId":"project-1","resourceId":"dict-1"}`},
		{"linked_domain_created", "linked_domain", `{"name":"example.com","resourceId":"domain-1","status":"pending_verification"}`},
		{"linked_domain_verified", "linked_domain", `{"name":"example.com","resourceId":"domain-1","status":"verified","verifiedMethod":"dns_txt"}`},
		{"linked_domain_cancelled", "linked_domain", `{"name":"example.com","resourceId":"domain-1","status":"cancelled"}`},
		{"linked_domain_markets_changed", "linked_domain", `{"name":"example.com","nextMarketIds":["germany-de"],"previousMarketIds":["france-fr"],"resourceId":"domain-1"}`},
	}
	for _, tc := range cases {
		t.Run(tc.eventType, func(t *testing.T) {
			message := validMessage()
			message.Event.EventType = tc.eventType
			message.Event.TargetKind = tc.targetKind
			message.Event.Payload = json.RawMessage(tc.payload)
			require.NoError(t, ValidateMessage(message))
		})
	}
}

func TestValidateMessageAcceptsQueryCreated(t *testing.T) {
	message := validMessage()
	message.Event.EventType = "query_created"
	message.Event.TargetKind = "query"
	message.Event.Payload = json.RawMessage(`{"identifier":"WEB-21","name":"WEB-21","projectId":"project-1","queryId":"query-1","source":"manual"}`)

	require.NoError(t, ValidateMessage(message))
}

func TestValidateMessageAcceptsTranslationUpdated(t *testing.T) {
	message := validMessage()
	message.Event.EventType = "string_segment_translation_updated"
	message.Event.TargetKind = "string_segment"
	message.Event.Payload = json.RawMessage(`{"fileName":"en.json","name":"en.json","projectId":"project-1","segmentId":"seg-1","sourcePath":"locales/en.json"}`)

	require.NoError(t, ValidateMessage(message))
}
