package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNotificationPreferencesDefaultWithoutRow(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notification-preferences"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Preferences struct {
			EmailEnabled bool   `json:"emailEnabled"`
			EmailFormat  string `json:"emailFormat"`
		} `json:"preferences"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.False(t, resp.Preferences.EmailEnabled)
	require.Equal(t, "digest", resp.Preferences.EmailFormat)

	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from user_notification_preferences where user_id=$1`, scope.UserID,
	).Scan(&count))
	require.Equal(t, 0, count, "GET must not lazily create a row")
}

func TestNotificationPreferencesPutUpsertIdempotent(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")

	req1 := issueSheetAuthedRequest(http.MethodPut, scope.OrgPath("/notification-preferences"), `{"emailEnabled":true,"emailFormat":"immediate"}`)
	rec1 := notificationsServe(api, scope.WorkOSUserID, req1)
	require.Equal(t, http.StatusOK, rec1.Code)

	req2 := issueSheetAuthedRequest(http.MethodPut, scope.OrgPath("/notification-preferences"), `{"emailEnabled":false,"emailFormat":"digest"}`)
	rec2 := notificationsServe(api, scope.WorkOSUserID, req2)
	require.Equal(t, http.StatusOK, rec2.Code)

	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from user_notification_preferences where user_id=$1`, scope.UserID,
	).Scan(&count))
	require.Equal(t, 1, count, "the user_id primary key must prevent duplicate rows across repeated PUTs")

	reqGet := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notification-preferences"), "")
	recGet := notificationsServe(api, scope.WorkOSUserID, reqGet)
	var resp struct {
		Preferences struct {
			EmailEnabled bool   `json:"emailEnabled"`
			EmailFormat  string `json:"emailFormat"`
		} `json:"preferences"`
	}
	require.NoError(t, json.Unmarshal(recGet.Body.Bytes(), &resp))
	require.False(t, resp.Preferences.EmailEnabled)
	require.Equal(t, "digest", resp.Preferences.EmailFormat, "the second PUT must win")
}

func TestNotificationPreferencesPutInvalid(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	cases := []string{
		`{"emailEnabled":true}`,
		`{"emailFormat":"digest"}`,
		`{"emailEnabled":true,"emailFormat":"weekly"}`,
		`{}`,
	}
	for _, body := range cases {
		req := issueSheetAuthedRequest(http.MethodPut, scope.OrgPath("/notification-preferences"), body)
		rec := notificationsServe(api, scope.WorkOSUserID, req)
		require.Equal(t, http.StatusBadRequest, rec.Code, body)
		require.Contains(t, rec.Body.String(), "invalid_notification_preferences_payload", body)
	}
}

func TestNotificationPreferencesNoCapabilityGate(t *testing.T) {
	api, scope := notificationsTestAPI(t, "member")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notification-preferences"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
}
