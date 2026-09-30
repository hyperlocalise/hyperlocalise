package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type notificationPreferencesBody struct {
	EmailEnabled *bool   `json:"emailEnabled"`
	EmailFormat  *string `json:"emailFormat"`
}

func invalidNotificationPreferencesPayload() error {
	return notificationsFailure(400, "invalid_notification_preferences_payload", "Invalid notification preferences payload")
}

func readNotificationPreferencesBody(r *http.Request, dest *notificationPreferencesBody) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		return invalidNotificationPreferencesPayload()
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return invalidNotificationPreferencesPayload()
	}
	return nil
}

func defaultNotificationPreferences() map[string]any {
	return map[string]any{"emailEnabled": false, "emailFormat": "digest"}
}

func (api *notificationsAPI) getPreferencesHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	var emailEnabled bool
	var emailFormat string
	err := api.pool.QueryRow(r.Context(), `
        select email_enabled, email_format from user_notification_preferences where user_id = $1`,
		actor.userID,
	).Scan(&emailEnabled, &emailFormat)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{"preferences": defaultNotificationPreferences()}, 200, nil
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"preferences": map[string]any{
		"emailEnabled": emailEnabled,
		"emailFormat":  emailFormat,
	}}, 200, nil
}

func (api *notificationsAPI) putPreferencesHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	var body notificationPreferencesBody
	if err := readNotificationPreferencesBody(r, &body); err != nil {
		return nil, 0, err
	}
	if body.EmailEnabled == nil || body.EmailFormat == nil {
		return nil, 0, invalidNotificationPreferencesPayload()
	}
	switch *body.EmailFormat {
	case "digest", "immediate":
	default:
		return nil, 0, invalidNotificationPreferencesPayload()
	}

	if _, err := api.pool.Exec(r.Context(), `
        insert into user_notification_preferences (user_id, email_enabled, email_format, updated_at)
        values ($1, $2, $3, now())
        on conflict (user_id) do update set
            email_enabled = excluded.email_enabled,
            email_format = excluded.email_format,
            updated_at = excluded.updated_at`,
		actor.userID, *body.EmailEnabled, *body.EmailFormat,
	); err != nil {
		return nil, 0, err
	}
	return map[string]any{"preferences": map[string]any{
		"emailEnabled": *body.EmailEnabled,
		"emailFormat":  *body.EmailFormat,
	}}, 200, nil
}
