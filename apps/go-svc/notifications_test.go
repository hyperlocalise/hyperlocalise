package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func notificationsTestAPI(t *testing.T, role string) (*notificationsAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	return &notificationsAPI{pool: scope.Pool, membership: scope.Membership(role)}, scope
}

func notificationsServe(api *notificationsAPI, userID string, req *http.Request) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: userID}})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustNotification(t *testing.T, scope *testenv.Scope, projectID, issueID, recipientUserID, notifType, dedupeKey string, actorUserID *string, readAt *time.Time) string {
	t.Helper()
	var id string
	err := scope.Pool.QueryRow(t.Context(), `
        insert into issue_notifications (
            organization_id, project_id, issue_id, recipient_user_id, actor_user_id, type, dedupe_key, payload, read_at
        ) values ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8)
        returning id`,
		scope.OrganizationID, projectID, issueID, recipientUserID, actorUserID, notifType, dedupeKey, readAt,
	).Scan(&id)
	require.NoError(t, err)
	return id
}

func TestNotificationsUnauthorized(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	req := httptest.NewRequest(http.MethodGet, scope.OrgPath("/notifications"), nil)
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestNotificationsCrossUserAccessIs404(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	other := mustSecondUser(t, scope)
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	notifID := mustNotification(t, scope, scope.ProjectID, issueID, other, "assigned", "assigned:"+issueID+":"+other, nil, nil)

	reqGet := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/"+notifID), "")
	recGet := notificationsServe(api, scope.WorkOSUserID, reqGet)
	require.Equal(t, http.StatusNotFound, recGet.Code)
	require.Contains(t, recGet.Body.String(), "notification_not_found")

	reqRead := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/notifications/"+notifID+"/read"), "")
	recRead := notificationsServe(api, scope.WorkOSUserID, reqRead)
	require.Equal(t, http.StatusNotFound, recRead.Code)
	require.Contains(t, recRead.Body.String(), "notification_not_found")

	var readAt *time.Time
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select read_at from issue_notifications where id=$1`, notifID).Scan(&readAt))
	require.Nil(t, readAt, "a rejected mark-read attempt on someone else's notification must not mutate it")
}

func decodeMarkReadAt(t *testing.T, rec *httptest.ResponseRecorder, notificationID string) time.Time {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Notification struct {
			ID     string     `json:"id"`
			ReadAt *time.Time `json:"readAt"`
		} `json:"notification"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, notificationID, resp.Notification.ID)
	require.NotNil(t, resp.Notification.ReadAt)
	return resp.Notification.ReadAt.UTC()
}

func storedNotificationReadAt(t *testing.T, scope *testenv.Scope, id string) time.Time {
	t.Helper()
	var readAt time.Time
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select read_at from issue_notifications where id=$1`, id,
	).Scan(&readAt))
	return readAt.UTC()
}

func TestNotificationsMarkReadIdempotent(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	notifID := mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "dedupe-1", nil, nil)

	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/notifications/"+notifID+"/read"), "")
	firstReadAt := decodeMarkReadAt(t, notificationsServe(api, scope.WorkOSUserID, req), notifID)
	stored := storedNotificationReadAt(t, scope, notifID)
	require.True(t, firstReadAt.Equal(stored), "the first mark-read response must be the stored timestamptz, not the in-process now()")

	time.Sleep(20 * time.Millisecond)

	req2 := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/notifications/"+notifID+"/read"), "")
	secondReadAt := decodeMarkReadAt(t, notificationsServe(api, scope.WorkOSUserID, req2), notifID)
	storedAfter := storedNotificationReadAt(t, scope, notifID)
	require.True(t, secondReadAt.Equal(stored), "a second mark-read must return the original readAt, not bump it")
	require.True(t, storedAfter.Equal(stored), "a second mark-read must not rewrite the stored read_at")
}

func TestNotificationsMarkReadPreservesSeededReadAt(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	seeded := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	notifID := mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "dedupe-seeded", nil, &seeded)

	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/notifications/"+notifID+"/read"), "")
	got := decodeMarkReadAt(t, notificationsServe(api, scope.WorkOSUserID, req), notifID)
	require.True(t, got.Equal(seeded), "mark-read on an already-read row must return the original timestamp")
	require.True(t, storedNotificationReadAt(t, scope, notifID).Equal(seeded), "mark-read must leave a non-null read_at untouched")
}

func TestNotificationsUnreadCountAndFilter(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	now := time.Now().UTC()
	mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "d1", nil, nil)
	mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "d2", nil, &now)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/unread-count"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		UnreadCount int `json:"unreadCount"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 1, resp.UnreadCount)

	reqList := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications?unreadOnly=true"), "")
	recList := notificationsServe(api, scope.WorkOSUserID, reqList)
	require.Equal(t, http.StatusOK, recList.Code)
	var listResp struct {
		Notifications []map[string]any `json:"notifications"`
		Total         int              `json:"total"`
	}
	require.NoError(t, json.Unmarshal(recList.Body.Bytes(), &listResp))
	require.Equal(t, 1, listResp.Total)
	require.Len(t, listResp.Notifications, 1)
}

func TestNotificationsListOrdering(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	fixed := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	ids := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		id := mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", fmt.Sprintf("d%d", i), nil, nil)
		_, err := scope.Pool.Exec(t.Context(), `update issue_notifications set created_at=$1 where id=$2`, fixed, id)
		require.NoError(t, err)
		ids = append(ids, id)
	}
	sort.Strings(ids)
	want := []string{ids[2], ids[1], ids[0]} // created_at tied -> id DESC

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Notifications []map[string]any `json:"notifications"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Notifications, 3)
	got := []string{
		resp.Notifications[0]["id"].(string),
		resp.Notifications[1]["id"].(string),
		resp.Notifications[2]["id"].(string),
	}
	require.Equal(t, want, got)
}

func TestNotificationsHiddenWhenProjectInaccessible(t *testing.T) {
	api, scope := notificationsTestAPI(t, "member")
	team := scope.MustTeam(t, "team-a", "Team A", "member")
	mustSetProjectTeam(t, scope, scope.ProjectID, team)
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	notifID := mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "d1", nil, nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/"+notifID), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	_, err := scope.Pool.Exec(t.Context(), `delete from team_memberships where team_id=$1 and user_id=$2`, team, scope.UserID)
	require.NoError(t, err)

	req2 := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/"+notifID), "")
	rec2 := notificationsServe(api, scope.WorkOSUserID, req2)
	require.Equal(t, http.StatusNotFound, rec2.Code, "the owner's own notification must become invisible once project access is revoked")

	reqCount := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/unread-count"), "")
	recCount := notificationsServe(api, scope.WorkOSUserID, reqCount)
	var countResp struct {
		UnreadCount int `json:"unreadCount"`
	}
	require.NoError(t, json.Unmarshal(recCount.Body.Bytes(), &countResp))
	require.Equal(t, 0, countResp.UnreadCount)
}

func TestNotificationsReadAllSnapshotSemantics(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	issueID, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	already := time.Now().UTC()
	mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "d1", nil, nil)
	mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "d2", nil, nil)
	mustNotification(t, scope, scope.ProjectID, issueID, scope.UserID, "assigned", "d3", nil, &already)

	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/notifications/read-all"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		MarkedCount int `json:"markedCount"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 2, resp.MarkedCount, "read-all must only mark what was unread, never re-count an already-read row")

	reqCount := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/unread-count"), "")
	recCount := notificationsServe(api, scope.WorkOSUserID, reqCount)
	var countResp struct {
		UnreadCount int `json:"unreadCount"`
	}
	require.NoError(t, json.Unmarshal(recCount.Body.Bytes(), &countResp))
	require.Equal(t, 0, countResp.UnreadCount)

	req2 := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/notifications/read-all"), "")
	rec2 := notificationsServe(api, scope.WorkOSUserID, req2)
	require.Equal(t, http.StatusOK, rec2.Code)
	var resp2 struct {
		MarkedCount int `json:"markedCount"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &resp2))
	require.Equal(t, 0, resp2.MarkedCount, "calling read-all again with nothing unread must be a safe no-op")
}

func TestNotificationsInvalidIDFormat(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications/not-a-uuid"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_issue_notification_id")
}

func TestNotificationsInvalidListQuery(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/notifications?limit=101"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_issue_notifications_query")
}

func TestFormatNotificationActor(t *testing.T) {
	ptr := func(value string) *string { return &value }
	require.Nil(t, formatNotificationActor(nil, ptr("Ada"), ptr("Lovelace"), ptr("ada@example.com"), nil))

	named := formatNotificationActor(ptr("user_1"), ptr("Ada"), ptr("Lovelace"), ptr("ada@example.com"), ptr("https://cdn.example/a.png"))
	require.Equal(t, "user_1", named["userId"])
	require.Equal(t, "Ada Lovelace", named["displayName"])
	require.Equal(t, "ada@example.com", named["email"])
	require.Equal(t, ptr("https://cdn.example/a.png"), named["avatarUrl"])

	emailOnly := formatNotificationActor(ptr("user_2"), ptr(""), nil, ptr("ada@example.com"), nil)
	require.Equal(t, "ada@example.com", emailOnly["displayName"])

	idOnly := formatNotificationActor(ptr("user_3"), nil, nil, ptr(""), nil)
	require.Equal(t, "user_3", idOnly["displayName"])
	require.Equal(t, "", idOnly["email"])
}
