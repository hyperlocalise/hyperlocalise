package main

import (
	"context"
	"encoding/json"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/jackc/pgx/v5"
)

func insertTranslationMemoryImportedActivity(
	ctx context.Context,
	tx pgx.Tx,
	organizationID, userID, memoryID, attemptID string,
	itemCount int,
) error {
	if itemCount <= 0 {
		return nil
	}
	payload, err := json.Marshal(map[string]any{
		"batchId":    attemptID,
		"itemCount":  itemCount,
		"resourceId": memoryID,
	})
	if err != nil {
		return err
	}
	event := activitylog.Event{
		ActorKind:      "user",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		EventType:      "translation_memory_imported",
		ID:             uuid.NewString(),
		OrganizationID: organizationID,
		Payload:        payload,
		TargetID:       memoryID,
		TargetKind:     "translation_memory",
	}
	if userID != "" {
		event.ActorUserID = aws.String(userID)
	}
	message := activitylog.Message{
		Event:         event,
		MessageType:   activitylog.MessageType,
		SchemaVersion: activitylog.SchemaVersion,
	}
	if err := activitylog.ValidateMessage(message); err != nil {
		return err
	}
	return activitylog.NewStore(tx).Insert(ctx, event)
}
