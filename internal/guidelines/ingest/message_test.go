package ingest

import (
	"testing"

	"github.com/stretchr/testify/require"
)

const (
	orgID = "6f1d3a52-6c1b-4f53-9a4c-1b6f2b0f6a11"
	docID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9"
	revID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
)

func TestMessageRoundTripAndValidation(t *testing.T) {
	valid := []Message{
		{SchemaVersion: 1, Operation: OperationExtractIndex, OrganizationID: orgID, DocumentID: docID, RevisionID: revID},
		{SchemaVersion: 1, Operation: OperationDelete, OrganizationID: orgID, DocumentID: docID, Version: 2},
		{SchemaVersion: 1, Operation: OperationSync, OrganizationID: orgID, ProjectID: "project_1"},
	}
	for _, message := range valid {
		body, err := Encode(message)
		require.NoError(t, err)
		decoded, err := Decode(string(body))
		require.NoError(t, err)
		require.Equal(t, message, decoded)
	}

	invalid := []Message{
		{SchemaVersion: 2, Operation: OperationSync, OrganizationID: orgID},
		{SchemaVersion: 1, Operation: "reindex", OrganizationID: orgID},
		{SchemaVersion: 1, Operation: OperationSync, OrganizationID: "org"},
		{SchemaVersion: 1, Operation: OperationSync, OrganizationID: orgID, DocumentID: docID},
		{SchemaVersion: 1, Operation: OperationExtractIndex, OrganizationID: orgID, DocumentID: docID},
		{SchemaVersion: 1, Operation: OperationDelete, OrganizationID: orgID, DocumentID: docID},
		{SchemaVersion: 1, Operation: OperationDelete, OrganizationID: orgID, DocumentID: " " + docID, Version: 1},
	}
	for _, message := range invalid {
		_, err := Encode(message)
		require.ErrorIs(t, err, ErrInvalidMessage, message)
	}

	_, err := Decode("{")
	require.ErrorIs(t, err, ErrInvalidMessage)
}
