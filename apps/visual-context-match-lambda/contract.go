package main

import (
	"encoding/json"
	"errors"

	"github.com/google/uuid"
)

// visualContextMatchMessage matches the go-svc producer in
// apps/go-svc/visual-context-match-publisher.go. The process row is the source
// of truth; the message only carries its ID.
type visualContextMatchMessage struct {
	SchemaVersion int    `json:"schemaVersion"`
	ProcessID     string `json:"processId"`
}

func decodeVisualContextMatchMessage(body string) (visualContextMatchMessage, error) {
	var message visualContextMatchMessage
	if err := json.Unmarshal([]byte(body), &message); err != nil {
		return message, errors.New("invalid visual context match message")
	}
	if message.SchemaVersion != 1 {
		return message, errors.New("unsupported visual context match message")
	}
	if _, err := uuid.Parse(message.ProcessID); err != nil {
		return message, errors.New("invalid visual context match process id")
	}
	return message, nil
}
