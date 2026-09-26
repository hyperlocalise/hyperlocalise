package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMemberRoutesRequireDatabase(t *testing.T) {
	api := &memberAPI{}
	rec := memberRequestForTest(api, http.MethodGet, "/v1/orgs/acme/members", "")
	require.Equal(t, 503, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_unavailable"`)
}

func TestMemberSessionAndOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, cookie, origin, site string
		status                     int
	}{
		{name: "missing cookie", status: 401},
		{name: "cross origin", cookie: "session", origin: "https://evil.example", status: 403},
		{name: "web origin", cookie: "session", origin: "https://hyperlocalise.com", status: 503},
		{name: "unconfigured database", cookie: "session", status: 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api := &memberAPI{}
			mux := http.NewServeMux()
			api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
			req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/members", nil)
			req.Header.Set("Content-Type", "application/json")
			if tc.cookie != "" {
				req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: tc.cookie})
			}
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
		})
	}
}

func TestMemberListAndInvite(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")

	list := memberRequest(api, scope, http.MethodGet, scope.OrgPath("/members"), "")
	require.Equal(t, 200, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), `"memberManagement"`)
	require.Contains(t, list.Body.String(), `"canInvite":true`)

	invite := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"new-member@example.com","role":"developer"}`)
	require.Equal(t, 201, invite.Code, invite.Body.String())
	require.Contains(t, invite.Body.String(), `"new-member@example.com"`)
	require.Contains(t, invite.Body.String(), `"developer"`)
	require.Contains(t, invite.Body.String(), `"invited"`)
	require.Equal(t, 1, workos.sendCalls)

	var invitedUserID string
	err := scope.Pool.QueryRow(t.Context(), `select id from users where email='new-member@example.com'`).Scan(&invitedUserID)
	require.NoError(t, err)
	var teamID string
	err = scope.Pool.QueryRow(t.Context(), `select id from teams where organization_id=$1 and slug='default'`, scope.OrganizationID).Scan(&teamID)
	require.NoError(t, err)
	var teamRole string
	err = scope.Pool.QueryRow(t.Context(), `select role from team_memberships where team_id=$1 and user_id=$2`, teamID, invitedUserID).Scan(&teamRole)
	require.NoError(t, err)
	require.Equal(t, "member", teamRole)
}

func TestMemberInviteOperatorSkipsDefaultTeam(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"manager-invite@example.com","role":"localization_manager"}`)
	require.Equal(t, 201, rec.Code, rec.Body.String())

	var invitedUserID string
	err := scope.Pool.QueryRow(t.Context(), `select id from users where email='manager-invite@example.com'`).Scan(&invitedUserID)
	require.NoError(t, err)
	var count int
	err = scope.Pool.QueryRow(t.Context(), `select count(*)::int from team_memberships where user_id=$1`, invitedUserID).Scan(&count)
	require.NoError(t, err)
	require.Equal(t, 0, count)
}

func TestMemberInviteSelectedTeam(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	teamID := scope.MustTeam(t, "localization", "Localization", "")
	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"translator-invite@example.com","role":"translator","teamId":"`+teamID+`"}`)
	require.Equal(t, 201, rec.Code, rec.Body.String())

	var invitedUserID string
	err := scope.Pool.QueryRow(t.Context(), `select id from users where email='translator-invite@example.com'`).Scan(&invitedUserID)
	require.NoError(t, err)
	var teamRole string
	err = scope.Pool.QueryRow(t.Context(), `select role from team_memberships where team_id=$1 and user_id=$2`, teamID, invitedUserID).Scan(&teamRole)
	require.NoError(t, err)
	require.Equal(t, "member", teamRole)
}

func TestMemberInviteResendAndRoleChange(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	first := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"resend@example.com","role":"member"}`)
	require.Equal(t, 201, first.Code, first.Body.String())
	workos.pendingID = "invitation_pending"
	workos.sendCalls = 0

	resend := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"resend@example.com","role":"member"}`)
	require.Equal(t, 200, resend.Code, resend.Body.String())
	require.Equal(t, "invitation_pending", workos.resendID)
	require.Equal(t, 0, workos.sendCalls)

	workos.pendingID = "invitation_stale"
	roleChange := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"resend@example.com","role":"developer"}`)
	require.Equal(t, 200, roleChange.Code, roleChange.Body.String())
	require.Equal(t, "invitation_stale", workos.revokeID)
	require.Equal(t, 1, workos.sendCalls)
}

func TestMemberInviteWorkosUnavailable(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	api.workos = nil
	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"missing-client@example.com","role":"member"}`)
	require.Equal(t, 503, rec.Code)
	require.Contains(t, rec.Body.String(), `"workos_server_not_configured"`)
}

func TestMemberInviteRollbackOnDeliveryFailure(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	workos.sendErr = errors.New("boom")
	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"rollback@example.com","role":"member"}`)
	require.Equal(t, 500, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_invite_failed"`)

	var count int
	err := scope.Pool.QueryRow(t.Context(), `select count(*)::int from users where email='rollback@example.com'`).Scan(&count)
	require.NoError(t, err)
	require.Equal(t, 0, count)
}

func TestMemberInviteRevokedNotDelivered(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	workos.pendingID = "invitation_stale"
	workos.sendErr = errors.New("first")
	workos.sendRetry = errors.New("retry")
	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"revoked@example.com","role":"member"}`)
	require.Equal(t, 500, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_invite_revoked_not_delivered"`)
}

func TestMemberUpdateAndRemove(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	_, workosUserID, membershipID := mustActiveMember(t, scope, "promote-me@example.com", "member")

	update := memberRequest(api, scope, http.MethodPatch, scope.OrgPath("/members/"+workosUserID), `{"role":"developer"}`)
	require.Equal(t, 200, update.Code, update.Body.String())
	require.Contains(t, update.Body.String(), `"developer"`)
	require.Equal(t, membershipID, workos.updateID)
	require.Equal(t, "developer", workos.updateRole)

	remove := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+workosUserID), "")
	require.Equal(t, 204, remove.Code, remove.Body.String())
	require.Equal(t, membershipID, workos.deleteID)

	var remaining int
	err := scope.Pool.QueryRow(t.Context(), `select count(*)::int from organization_memberships where organization_id=$1 and user_id in (select id from users where workos_user_id=$2)`, scope.OrganizationID, workosUserID).Scan(&remaining)
	require.NoError(t, err)
	require.Equal(t, 0, remaining)
}

func TestMemberRemovePlaceholderUser(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	_, workosUserID := mustInvitedMember(t, scope, "orphan-cleanup@example.com", "member")
	rec := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+workosUserID), "")
	require.Equal(t, 204, rec.Code)

	var remaining int
	err := scope.Pool.QueryRow(t.Context(), `select count(*)::int from users where email='orphan-cleanup@example.com'`).Scan(&remaining)
	require.NoError(t, err)
	require.Equal(t, 0, remaining)
}

func TestMemberRemoveCleansTeamAndMcp(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	userID, workosUserID, _ := mustActiveMember(t, scope, "cleanup@example.com", "member")
	teamID := scope.MustTeam(t, "cleanup-team", "Cleanup", "")
	_, err := scope.Pool.Exec(t.Context(), `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member')`, teamID, userID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into mcp_sessions (user_id, organization_id, scope, access_token_hash, refresh_token_hash, expires_at, refresh_expires_at)
        values ($1, $2, 'mcp', $3, $4, now() + interval '1 hour', now() + interval '2 hours')`,
		userID, scope.OrganizationID, "access_"+userID, "refresh_"+userID)
	require.NoError(t, err)

	rec := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+workosUserID), "")
	require.Equal(t, 204, rec.Code)

	var teamCount, mcpCount int
	err = scope.Pool.QueryRow(t.Context(), `select count(*)::int from team_memberships where team_id=$1 and user_id=$2`, teamID, userID).Scan(&teamCount)
	require.NoError(t, err)
	err = scope.Pool.QueryRow(t.Context(), `select count(*)::int from mcp_sessions where user_id=$1 and organization_id=$2`, userID, scope.OrganizationID).Scan(&mcpCount)
	require.NoError(t, err)
	require.Equal(t, 0, teamCount)
	require.Equal(t, 0, mcpCount)
}

func TestMemberRoleSyncRollback(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	_, workosUserID, _ := mustActiveMember(t, scope, "keep-role@example.com", "member")
	workos.updateErr = errors.New("boom")
	rec := memberRequest(api, scope, http.MethodPatch, scope.OrgPath("/members/"+workosUserID), `{"role":"admin"}`)
	require.Equal(t, 500, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_sync_failed"`)

	var role string
	err := scope.Pool.QueryRow(t.Context(), `select m.role from organization_memberships m join users u on u.id=m.user_id where u.workos_user_id=$1`, workosUserID).Scan(&role)
	require.NoError(t, err)
	require.Equal(t, "member", role)
}

func TestMemberRemovalPreservesLocalDataWhenWorkosFails(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	userID, workosUserID, _ := mustActiveMember(t, scope, "keep-member@example.com", "member")
	teamID := scope.MustTeam(t, "keep-team", "Keep", "")
	_, err := scope.Pool.Exec(t.Context(), `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member')`, teamID, userID)
	require.NoError(t, err)
	workos.deleteErr = errors.New("boom")

	rec := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+workosUserID), "")
	require.Equal(t, 500, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_sync_failed"`)

	var remaining int
	err = scope.Pool.QueryRow(t.Context(), `select count(*)::int from organization_memberships m join users u on u.id=m.user_id where u.workos_user_id=$1`, workosUserID).Scan(&remaining)
	require.NoError(t, err)
	require.Equal(t, 1, remaining)
}

func TestMemberLastAdminProtected(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	rec := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+scope.WorkOSUserID), "")
	require.Equal(t, 409, rec.Code)
	require.Contains(t, rec.Body.String(), `"last_admin_protected"`)

	_, workosUserID := mustInvitedMember(t, scope, "other-admin@example.com", "admin")
	otherDelete := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+workosUserID), "")
	require.Equal(t, 204, otherDelete.Code)
}

func TestMemberAuthorization(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "member")
	list := memberRequest(api, scope, http.MethodGet, scope.OrgPath("/members"), "")
	require.Equal(t, 200, list.Code, list.Body.String())

	invite := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"denied@example.com","role":"member"}`)
	require.Equal(t, 403, invite.Code)

	managerAPI, managerScope, _ := memberTestAPI(t, "localization_manager")
	adminInvite := memberRequest(managerAPI, managerScope, http.MethodPost, managerScope.OrgPath("/members"), `{"email":"no-admin@example.com","role":"admin"}`)
	require.Equal(t, 403, adminInvite.Code)
}

func TestMemberInviteAlreadyExists(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	_, _, _ = mustActiveMember(t, scope, "exists@example.com", "member")
	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members"), `{"email":"exists@example.com","role":"member"}`)
	require.Equal(t, 409, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_already_exists"`)
}

func TestMemberPendingRoleUpdateReplacesInvitation(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	_, workosUserID := mustInvitedMember(t, scope, "pending-role@example.com", "member")
	workos.pendingID = "invitation_pending"
	rec := memberRequest(api, scope, http.MethodPatch, scope.OrgPath("/members/"+workosUserID), `{"role":"translator"}`)
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Equal(t, "invitation_pending", workos.revokeID)
	require.Equal(t, 1, workos.sendCalls)
	require.Empty(t, workos.updateID)
}

func TestMemberDeleteMissingIsIdempotent(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	rec := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/missing_user"), "")
	require.Equal(t, 204, rec.Code)
}

func TestMemberListCapabilities(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	_, _, _ = mustActiveMember(t, scope, uniqueTestEmail("list-member"), "member")
	rec := memberRequest(api, scope, http.MethodGet, scope.OrgPath("/members"), "")
	require.Equal(t, 200, rec.Code)
	var body struct {
		Members []struct {
			Email         string `json:"email"`
			IsCurrentUser bool   `json:"isCurrentUser"`
			CanUpdateRole *bool  `json:"canUpdateRole"`
			CanRemove     *bool  `json:"canRemove"`
		} `json:"members"`
		MemberManagement struct {
			CanInvite       bool     `json:"canInvite"`
			AssignableRoles []string `json:"assignableRoles"`
		} `json:"memberManagement"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.True(t, body.MemberManagement.CanInvite)
	require.Contains(t, body.MemberManagement.AssignableRoles, "admin")
	for _, member := range body.Members {
		if member.IsCurrentUser {
			require.NotNil(t, member.CanUpdateRole)
			require.False(t, *member.CanUpdateRole)
			require.False(t, *member.CanRemove)
		}
	}
}
