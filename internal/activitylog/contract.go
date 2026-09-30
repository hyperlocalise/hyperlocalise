package activitylog

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	SchemaVersion = 1
	MessageType   = "activity_log"
)

var implementedEventTypes = map[string]string{
	"member_invited":                      "invitation",
	"member_invite_resent":                "invitation",
	"member_role_changed":                 "membership",
	"member_removed":                      "membership",
	"workspace_updated":                   "organization",
	"personal_access_token_created":       "personal_access_token",
	"personal_access_token_revoked":       "personal_access_token",
	"integration_connected":               "integration",
	"integration_disconnected":            "integration",
	"project_created":                     "project",
	"project_deleted":                     "project",
	"project_settings_changed":            "project",
	"glossary_created":                    "glossary",
	"glossary_deleted":                    "glossary",
	"glossary_imported":                   "glossary",
	"glossary_exported":                   "glossary",
	"glossary_project_attached":           "project",
	"glossary_project_detached":           "project",
	"translation_memory_created":          "translation_memory",
	"translation_memory_deleted":          "translation_memory",
	"translation_memory_imported":         "translation_memory",
	"translation_memory_exported":         "translation_memory",
	"translation_memory_project_attached": "project",
	"translation_memory_project_detached": "project",
	"translation_memory_action_rejected":  "translation_memory",
	"job_created":                         "job",
	"job_cancelled":                       "job",
	"job_failed":                          "job",
	"automation_run_started":              "automation",
	"automation_enabled":                  "automation",
	"automation_disabled":                 "automation",
	"file_uploaded":                       "file",
	"file_translations_imported":          "file",
	"string_segment_approved":             "string_segment",
	"string_segment_status_changed":       "string_segment",
	"string_segment_hidden":               "string_segment",
	"string_segment_unhidden":             "string_segment",
	"string_segment_locked":               "string_segment",
	"string_segment_unlocked":             "string_segment",
	"string_segment_commented":            "string_segment",
}

var forbiddenPayloadKeys = map[string]struct{}{
	"authorization": {}, "body": {}, "ciphertext": {}, "email": {},
	"emailAddress": {}, "fileBody": {}, "fileContents": {}, "hash": {},
	"keyHash": {}, "key_hash": {}, "prompt": {}, "rawSecret": {},
	"rawToken": {}, "requestBody": {}, "request_body": {}, "secret": {},
	"sourceText": {}, "targetText": {}, "token": {}, "transcript": {},
	"x-api-key": {},
}

type Event struct {
	ActorCredentialID *string         `json:"actorCredentialId"`
	ActorKind         string          `json:"actorKind"`
	ActorUserID       *string         `json:"actorUserId"`
	CreatedAt         string          `json:"createdAt"`
	EventType         string          `json:"eventType"`
	ID                string          `json:"id"`
	OrganizationID    string          `json:"organizationId"`
	Payload           json.RawMessage `json:"payload"`
	TargetID          string          `json:"targetId"`
	TargetKind        string          `json:"targetKind"`
}

type Message struct {
	Event         Event  `json:"event"`
	MessageType   string `json:"messageType"`
	SchemaVersion int    `json:"schemaVersion"`
}

func (e Event) CreatedTime() (time.Time, error) {
	return time.Parse(time.RFC3339Nano, e.CreatedAt)
}

func ValidateMessage(message Message) error {
	if message.SchemaVersion != SchemaVersion || message.MessageType != MessageType {
		return errors.New("invalid_activity_log_message_version")
	}

	event := message.Event
	if uuid.Validate(event.ID) != nil || uuid.Validate(event.OrganizationID) != nil {
		return errors.New("invalid_activity_log_event_id")
	}
	if event.TargetID == "" || event.ActorKind == "" {
		return errors.New("invalid_activity_log_event_fields")
	}
	if event.ActorKind != "user" && event.ActorKind != "system" && event.ActorKind != "agent" && event.ActorKind != "api_key" {
		return errors.New("invalid_activity_log_actor_kind")
	}
	if event.ActorUserID != nil && uuid.Validate(*event.ActorUserID) != nil {
		return errors.New("invalid_activity_log_actor_user_id")
	}

	wantTargetKind, ok := implementedEventTypes[event.EventType]
	if !ok || wantTargetKind != event.TargetKind {
		return errors.New("invalid_activity_log_event_type")
	}
	if _, err := event.CreatedTime(); err != nil {
		return errors.New("invalid_activity_log_created_at")
	}

	var payload map[string]any
	if err := json.Unmarshal(event.Payload, &payload); err != nil || payload == nil {
		return errors.New("invalid_activity_log_payload")
	}
	if err := validatePayload(payload); err != nil {
		return err
	}
	return nil
}

func validatePayload(value any) error {
	switch value := value.(type) {
	case map[string]any:
		for key, nested := range value {
			if _, forbidden := forbiddenPayloadKeys[key]; forbidden {
				return errors.New("activity_log_payload_contains_forbidden_field")
			}
			if err := validatePayload(nested); err != nil {
				return err
			}
		}
	case []any:
		for _, nested := range value {
			if err := validatePayload(nested); err != nil {
				return err
			}
		}
	}
	return nil
}

func DecodeMessage(body []byte) (Message, error) {
	var message Message
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&message); err != nil {
		return Message{}, fmt.Errorf("invalid_activity_log_message: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return Message{}, errors.New("invalid_activity_log_message_trailing_data")
	}
	if err := ValidateMessage(message); err != nil {
		return Message{}, err
	}
	return message, nil
}

func IsImplementedEventType(eventType string) bool {
	_, ok := implementedEventTypes[strings.TrimSpace(eventType)]
	return ok
}
