package main

import (
	"context"
	"encoding/json"
	"log/slog"
)

func (api *memberAPI) enqueueMemberActivity(ctx context.Context, actor memberActor, eventType, targetKind, targetID string, payload map[string]any) {
	if payload == nil {
		payload = map[string]any{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		slog.ErrorContext(ctx, "member_activity_encode_failed", "event_type", eventType)
		return
	}
	_, err = api.pool.Exec(ctx, `
        insert into organization_activity_events (
            organization_id, actor_kind, actor_user_id, event_type, target_kind, target_id, payload
        ) values ($1,'user',$2,$3,$4,$5,$6::jsonb)`,
		actor.organizationID, actor.userID, eventType, targetKind, targetID, encoded,
	)
	if err != nil {
		slog.ErrorContext(ctx, "member_activity_insert_failed", "event_type", eventType)
	}
}
