package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
)

// activityEvent is one workspace activity-log event. The actor is always the token, as the web
// app's publicApiActivityActor records it.
type activityEvent struct {
	EventType  string
	TargetID   string
	TargetKind string
	Payload    map[string]any
}

var errNoActivityTarget = errors.New("activity target is empty")

// insertActivity records the event in organization_activity_events through db, so an event
// written inside a transaction commits or rolls back with the change it describes. The memory
// interchange lambda records its events the same way.
func insertActivity(ctx context.Context, db activitylog.Executor, actor principal, event activityEvent) error {
	payload, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("marshal activity payload: %w", err)
	}
	tokenID, userID := actor.TokenID, actor.UserID
	record := activitylog.Event{
		ActorCredentialID: &tokenID,
		ActorKind:         "api_key",
		ActorUserID:       &userID,
		CreatedAt:         time.Now().UTC().Format(time.RFC3339Nano),
		EventType:         event.EventType,
		ID:                uuid.NewString(),
		OrganizationID:    actor.OrganizationID,
		Payload:           payload,
		TargetID:          event.TargetID,
		TargetKind:        event.TargetKind,
	}
	message := activitylog.Message{Event: record, MessageType: activitylog.MessageType, SchemaVersion: activitylog.SchemaVersion}
	if err := activitylog.ValidateMessage(message); err != nil {
		return fmt.Errorf("validate %s activity: %w", event.EventType, err)
	}
	if err := activitylog.NewStore(db).Insert(ctx, record); err != nil {
		return fmt.Errorf("record %s activity: %w", event.EventType, err)
	}
	return nil
}

// fileActivityEvent follows the web app's filePayload, normalizeSourcePath, and
// fileActivityTargetId.
func fileActivityEvent(eventType, projectID, sourcePath string, extra map[string]any) (activityEvent, error) {
	sourcePath = strings.ReplaceAll(sourcePath, `\`, "/")
	for strings.HasPrefix(sourcePath, "./") {
		sourcePath = sourcePath[2:]
	}
	for strings.Contains(sourcePath, "//") {
		sourcePath = strings.ReplaceAll(sourcePath, "//", "/")
	}
	if sourcePath == "" {
		return activityEvent{}, errNoActivityTarget
	}
	fileName := sourcePath
	parts := strings.Split(sourcePath, "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] != "" {
			fileName = parts[i]
			break
		}
	}
	payload := map[string]any{"fileName": fileName, "name": fileName, "projectId": projectID, "sourcePath": sourcePath}
	for key, value := range extra {
		payload[key] = value
	}
	return activityEvent{EventType: eventType, TargetID: projectID + ":" + sourcePath, TargetKind: "file", Payload: payload}, nil
}
