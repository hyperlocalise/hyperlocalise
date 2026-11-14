package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const userAppearanceTimezoneMaxLength = 64

var supportedUserAppearanceLocales = map[string]struct{}{
	"en":     {},
	"zh-CN":  {},
	"da-DK":  {},
	"nl-NL":  {},
	"fil-PH": {},
	"fr-FR":  {},
	"de-DE":  {},
	"ja-JP":  {},
	"ko-KR":  {},
	"th-TH":  {},
	"vi-VN":  {},
}

type userAppearancePreferences struct {
	Theme     string `json:"theme"`
	Locale    string `json:"locale"`
	Timezone  string `json:"timezone"`
	HourCycle string `json:"hourCycle"`
}

func (api *sessionAccountAPI) registerAppearance(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "PATCH /v1/me/preferences", http.HandlerFunc(api.patchAppearancePreferences))
}

func (api *sessionAccountAPI) patchAppearancePreferences(w http.ResponseWriter, r *http.Request) {
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
	var body userAppearancePreferences
	if err := readUserAppearancePreferencesBody(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_user_preferences_payload",
			"message": "Invalid user preferences payload",
		})
		return
	}
	body.Timezone = strings.TrimSpace(body.Timezone)
	if err := validateUserAppearancePreferences(body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_user_preferences_payload",
			"message": "Invalid user preferences payload",
		})
		return
	}
	if _, err := api.pool.Exec(r.Context(), `
        insert into user_preferences (user_id, theme, locale, timezone, hour_cycle, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (user_id) do update set
            theme = excluded.theme,
            locale = excluded.locale,
            timezone = excluded.timezone,
            hour_cycle = excluded.hour_cycle,
            updated_at = excluded.updated_at`,
		account.ID, body.Theme, body.Locale, body.Timezone, body.HourCycle,
	); err != nil {
		logRequestFailure(r, "session_account_request_failed", "update_appearance_preferences", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "internal_error",
			"message": "An unexpected error occurred",
		})
		return
	}
	account.Preferences = &body
	writeJSON(w, http.StatusOK, account)
}

func readUserAppearancePreferencesBody(r *http.Request, dest *userAppearancePreferences) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errors.New("trailing json")
	}
	return nil
}

func validateUserAppearancePreferences(body userAppearancePreferences) error {
	switch body.Theme {
	case "light", "dark", "system":
	default:
		return errors.New("invalid theme")
	}
	if _, ok := supportedUserAppearanceLocales[body.Locale]; !ok {
		return errors.New("invalid locale")
	}
	switch body.HourCycle {
	case "h12", "h23":
	default:
		return errors.New("invalid hour cycle")
	}
	timezone := strings.TrimSpace(body.Timezone)
	if timezone == "" || utf8.RuneCountInString(timezone) > userAppearanceTimezoneMaxLength {
		return errors.New("invalid timezone")
	}
	if _, err := time.LoadLocation(timezone); err != nil {
		return err
	}
	return nil
}

func loadUserAppearancePreferences(ctx context.Context, db dictionaryDB, userID string) (*userAppearancePreferences, error) {
	var preferences userAppearancePreferences
	err := db.QueryRow(ctx, `
        select theme, locale, timezone, hour_cycle
        from user_preferences
        where user_id = $1`,
		userID,
	).Scan(&preferences.Theme, &preferences.Locale, &preferences.Timezone, &preferences.HourCycle)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &preferences, nil
}
