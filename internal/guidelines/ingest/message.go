// Package ingest defines the queue contract between go-svc and the guideline
// ingest worker.
package ingest

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
)

// SchemaVersion is the only accepted message version.
const SchemaVersion = 1

// Operation names one unit of worker work.
type Operation string

const (
	// OperationExtractIndex extracts a processing document, then indexes the
	// row's current revision. A ready document is only re-indexed.
	OperationExtractIndex Operation = "extract_index"
	// OperationSync re-indexes the typed notes and scope-wide documents.
	OperationSync Operation = "sync"
	// OperationDelete removes a document's passages through Version.
	OperationDelete Operation = "delete"
)

// ErrInvalidMessage identifies a message that can never be processed.
var ErrInvalidMessage = errors.New("invalid guideline ingest message")

// Message carries identifiers only; the worker reloads canonical content.
type Message struct {
	SchemaVersion  int       `json:"schemaVersion"`
	Operation      Operation `json:"operation"`
	OrganizationID string    `json:"organizationId"`
	ProjectID      string    `json:"projectId,omitempty"`
	DocumentID     string    `json:"documentId,omitempty"`
	RevisionID     string    `json:"revisionId,omitempty"`
	Version        int64     `json:"version,omitempty"`
}

// Validate checks the identifiers each operation requires.
func (m Message) Validate() error {
	if m.SchemaVersion != SchemaVersion || !isUUID(m.OrganizationID) || len(m.ProjectID) > 255 {
		return ErrInvalidMessage
	}
	switch m.Operation {
	case OperationExtractIndex:
		if !isUUID(m.DocumentID) || !isUUID(m.RevisionID) {
			return ErrInvalidMessage
		}
	case OperationDelete:
		if !isUUID(m.DocumentID) || m.Version < 1 {
			return ErrInvalidMessage
		}
	case OperationSync:
		if m.DocumentID != "" {
			return ErrInvalidMessage
		}
	default:
		return ErrInvalidMessage
	}
	return nil
}

// Encode validates and serializes a message.
func Encode(m Message) ([]byte, error) {
	if err := m.Validate(); err != nil {
		return nil, err
	}
	return json.Marshal(m)
}

// Decode parses and validates a queue body.
func Decode(body string) (Message, error) {
	var m Message
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		return Message{}, ErrInvalidMessage
	}
	if err := m.Validate(); err != nil {
		return Message{}, err
	}
	return m, nil
}

func isUUID(value string) bool {
	_, err := uuid.Parse(strings.TrimSpace(value))
	return err == nil && strings.TrimSpace(value) == value
}
