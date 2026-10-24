package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const sessionAccountRequestTimeout = 30 * time.Second

type sessionAccountAPI struct {
	pool dictionaryPool
}

type sessionAccount struct {
	ID                      string         `json:"id"`
	Email                   string         `json:"email"`
	FirstName               *string        `json:"firstName"`
	LastName                *string        `json:"lastName"`
	NotificationPreferences map[string]any `json:"notificationPreferences"`
}

func (api *sessionAccountAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "GET /v1/me", http.HandlerFunc(api.get))
	registerAuthenticated(mux, verifier, "PATCH /v1/me/notification-preferences", http.HandlerFunc(api.patchPreferences))
	registerAuthenticated(mux, verifier, "DELETE /v1/me", http.HandlerFunc(api.delete))
}

func (api *sessionAccountAPI) get(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	account, ok := api.load(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (api *sessionAccountAPI) patchPreferences(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cross-origin request denied",
		})
		return
	}
	account, ok := api.load(w, r)
	if !ok {
		return
	}
	var body notificationPreferencesBody
	if err := readNotificationPreferencesBody(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_notification_preferences_payload",
			"message": "Invalid notification preferences payload",
		})
		return
	}
	if body.EmailEnabled == nil || body.EmailFormat == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_notification_preferences_payload",
			"message": "Invalid notification preferences payload",
		})
		return
	}
	switch *body.EmailFormat {
	case "digest", "immediate":
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_notification_preferences_payload",
			"message": "Invalid notification preferences payload",
		})
		return
	}
	if _, err := api.pool.Exec(r.Context(), `
        insert into user_notification_preferences (user_id, email_enabled, email_format, updated_at)
        values ($1, $2, $3, now())
        on conflict (user_id) do update set
            email_enabled = excluded.email_enabled,
            email_format = excluded.email_format,
            updated_at = excluded.updated_at`,
		account.ID, *body.EmailEnabled, *body.EmailFormat,
	); err != nil {
		logRequestFailure(r, "session_account_request_failed", "update_preferences", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "internal_error",
			"message": "An unexpected error occurred",
		})
		return
	}
	account.NotificationPreferences = map[string]any{
		"emailEnabled": *body.EmailEnabled,
		"emailFormat":  *body.EmailFormat,
	}
	writeJSON(w, http.StatusOK, account)
}

func (api *sessionAccountAPI) delete(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Cross-origin request denied",
		})
		return
	}
	if _, ok := api.claims(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusConflict, map[string]string{
		"error":   "account_deletion_not_supported",
		"message": "Delete your Hyperlocalise account from workspace settings. Iris cannot remove a WorkOS user or workspace.",
	})
}

func (api *sessionAccountAPI) load(w http.ResponseWriter, r *http.Request) (sessionAccount, bool) {
	claims, ok := api.claims(w, r)
	if !ok {
		return sessionAccount{}, false
	}
	if api.pool == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "account_unavailable",
			"message": "Account is unavailable",
		})
		return sessionAccount{}, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), sessionAccountRequestTimeout)
	defer cancel()
	account, err := loadSessionAccount(ctx, api.pool, claims.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"error":   "account_not_found",
			"message": "Account not found",
		})
		return sessionAccount{}, false
	}
	if err != nil {
		logRequestFailure(r, "session_account_request_failed", "load", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "internal_error",
			"message": "An unexpected error occurred",
		})
		return sessionAccount{}, false
	}
	return account, true
}

func (api *sessionAccountAPI) claims(w http.ResponseWriter, r *http.Request) (AuthClaims, bool) {
	claims, ok := r.Context().Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "unauthorized",
			"message": "Authentication required",
		})
		return AuthClaims{}, false
	}
	return claims, true
}

func loadSessionAccount(ctx context.Context, db dictionaryDB, workosUserID string) (sessionAccount, error) {
	var account sessionAccount
	err := db.QueryRow(ctx, `
        select id::text, email, first_name, last_name
        from users
        where workos_user_id=$1`, workosUserID).Scan(&account.ID, &account.Email, &account.FirstName, &account.LastName)
	if err != nil {
		return sessionAccount{}, err
	}
	var emailEnabled bool
	var emailFormat string
	err = db.QueryRow(ctx, `
        select email_enabled, email_format from user_notification_preferences where user_id = $1`,
		account.ID,
	).Scan(&emailEnabled, &emailFormat)
	if errors.Is(err, pgx.ErrNoRows) {
		account.NotificationPreferences = defaultNotificationPreferences()
		return account, nil
	}
	if err != nil {
		return sessionAccount{}, err
	}
	account.NotificationPreferences = map[string]any{
		"emailEnabled": emailEnabled,
		"emailFormat":  emailFormat,
	}
	return account, nil
}
