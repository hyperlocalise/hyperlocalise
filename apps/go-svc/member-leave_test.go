package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func scopeMemberActor(scope *testenv.Scope, role string) memberActor {
	return memberActor{
		userID:               scope.UserID,
		organizationID:       scope.OrganizationID,
		workosOrganizationID: scope.WorkOSOrganizationID,
		role:                 role,
		workosUserID:         scope.WorkOSUserID,
	}
}

func membershipCount(t *testing.T, scope *testenv.Scope, workosUserID string) int {
	t.Helper()
	var count int
	err := scope.Pool.QueryRow(t.Context(), `
        select count(*)::int from organization_memberships m join users u on u.id=m.user_id
        where m.organization_id=$1 and u.workos_user_id=$2`, scope.OrganizationID, workosUserID).Scan(&count)
	require.NoError(t, err)
	return count
}

func TestMemberLeave(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	mustActiveMember(t, scope, uniqueTestEmail("other-admin"), "admin")
	teamID := scope.MustTeam(t, "leave-team", "Leave", "")
	_, err := scope.Pool.Exec(t.Context(), `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member')`, teamID, scope.UserID)
	require.NoError(t, err)

	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 204, rec.Code, rec.Body.String())
	require.Equal(t, scope.WorkOSMembershipID, workos.deleteID)
	require.Equal(t, 0, membershipCount(t, scope, scope.WorkOSUserID))

	var teams, events int
	err = scope.Pool.QueryRow(t.Context(), `select count(*)::int from team_memberships where team_id=$1 and user_id=$2`, teamID, scope.UserID).Scan(&teams)
	require.NoError(t, err)
	require.Equal(t, 0, teams)
	err = scope.Pool.QueryRow(t.Context(), `
        select count(*)::int from organization_activity_events
        where organization_id=$1 and event_type='member_left' and actor_user_id=$2`, scope.OrganizationID, scope.UserID).Scan(&events)
	require.NoError(t, err)
	require.Equal(t, 1, events)
}

func TestMemberLeaveAsMember(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "member")

	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 204, rec.Code, rec.Body.String())
	require.Equal(t, scope.WorkOSMembershipID, workos.deleteID)
	require.Equal(t, 0, membershipCount(t, scope, scope.WorkOSUserID))
}

func TestMemberLeaveRefusesLastAcceptedAdmin(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	// An unaccepted admin invitation cannot run the workspace.
	mustInvitedMember(t, scope, uniqueTestEmail("pending-admin"), "admin")

	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 409, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"last_admin_protected"`)
	require.Empty(t, workos.deleteID)
	require.Equal(t, 1, membershipCount(t, scope, scope.WorkOSUserID))
}

func TestMemberLeaveKeepsMembershipWhenWorkosFails(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "member")
	workos.deleteErr = errors.New("boom")

	rec := memberRequest(api, scope, http.MethodPost, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 500, rec.Code)
	require.Contains(t, rec.Body.String(), `"member_sync_failed"`)
	require.Equal(t, 1, membershipCount(t, scope, scope.WorkOSUserID))
}

func TestMemberDemoteRefusesLastAcceptedAdmin(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	_, otherWorkosUserID, _ := mustActiveMember(t, scope, uniqueTestEmail("demote-admin"), "admin")
	mustInvitedMember(t, scope, uniqueTestEmail("pending-admin"), "admin")

	// Removing the scope admin's only accepted peer is fine; the scope admin stays.
	remove := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+otherWorkosUserID), "")
	require.Equal(t, 204, remove.Code, remove.Body.String())

	member, err := api.getOrganizationMember(t.Context(), scope.OrganizationID, scope.WorkOSUserID)
	require.NoError(t, err)
	_, err = api.updateMemberRole(t.Context(), scope.OrganizationID, member, "member")
	var failure *memberError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, "last_admin_protected", failure.code)
}

func TestMemberLeaveHoldsAdminLockWhileWorkosRemoves(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "admin")
	otherUserID, otherWorkosUserID, _ := mustActiveMember(t, scope, uniqueTestEmail("racing-admin"), "admin")
	other := memberActor{
		userID:               otherUserID,
		organizationID:       scope.OrganizationID,
		workosOrganizationID: scope.WorkOSOrganizationID,
		role:                 "admin",
		workosUserID:         otherWorkosUserID,
	}

	otherResult := make(chan error, 1)
	var once sync.Once
	workos.afterDelete = func() {
		once.Do(func() {
			go func() {
				_, err := api.leaveWorkspace(context.Background(), other)
				otherResult <- err
			}()
			waitForAdvisoryLockWait(t, scope)
		})
	}

	status, err := api.leaveWorkspace(t.Context(), scopeMemberActor(scope, "admin"))
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, status)

	select {
	case err := <-otherResult:
		var failure *memberError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, "last_admin_protected", failure.code)
	case <-time.After(10 * time.Second):
		t.Fatal("second leave did not finish")
	}
	require.Equal(t, scope.WorkOSMembershipID, workos.deleteID)
	require.Equal(t, 1, membershipCount(t, scope, otherWorkosUserID))
}

func TestMemberLeavePreview(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	ctx := t.Context()
	_, err := scope.Pool.Exec(ctx, `
        insert into organization_api_keys (organization_id, name, key_hash, key_prefix, created_by_user_id)
        values ($1, 'CI key', $2, 'hl_abcd1', $3), ($1, 'Old key', $4, 'hl_old12', $3)`,
		scope.OrganizationID, uuid.NewString(), scope.UserID, uuid.NewString())
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `update organization_api_keys set revoked_at=now() where organization_id=$1 and name='Old key'`, scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
        insert into workspace_automations (organization_id, name, instructions, status, tool_config)
        values
            ($1, 'Mine', '', 'active', jsonb_build_object('ahrefs', jsonb_build_object('enabled', true, 'workosUserId', $2::text))),
            ($1, 'Archived', '', 'archived', jsonb_build_object('gitlab', jsonb_build_object('enabled', true, 'workosUserId', $2::text))),
            ($1, 'Someone else', '', 'active', jsonb_build_object('ahrefs', jsonb_build_object('enabled', true, 'workosUserId', 'user_other'))),
            ($1, 'No tools', '', 'paused', '{}'::jsonb)`,
		scope.OrganizationID, scope.WorkOSUserID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = scope.Pool.Exec(context.Background(), `delete from workspace_automations where organization_id=$1`, scope.OrganizationID)
		_, _ = scope.Pool.Exec(context.Background(), `delete from organization_api_keys where organization_id=$1`, scope.OrganizationID)
	})

	rec := memberRequest(api, scope, http.MethodGet, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	var body leaveWorkspacePreview
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.NotNil(t, body.BlockedReason)
	require.Equal(t, "last_admin", *body.BlockedReason)
	require.Equal(t, []leaveWorkspaceAPIKey{{Name: "CI key", KeyPrefix: "hl_abcd1"}}, body.APIKeys)
	require.Equal(t, 1, body.APIKeyTotal)
	require.Len(t, body.Automations, 1)
	require.Equal(t, 1, body.AutomationTotal)
	require.Equal(t, "Mine", body.Automations[0].Name)

	mustActiveMember(t, scope, uniqueTestEmail("second-admin"), "admin")
	rec = memberRequest(api, scope, http.MethodGet, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	body = leaveWorkspacePreview{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Nil(t, body.BlockedReason)
}

func TestMemberLeavePreviewForNonAdmin(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "member")

	rec := memberRequest(api, scope, http.MethodGet, scope.OrgPath("/members/leave"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	var body leaveWorkspacePreview
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Nil(t, body.BlockedReason)
	require.Empty(t, body.APIKeys)
	require.Empty(t, body.Automations)
}

func TestMemberLeaveLeavesTheLogToAWebhookThatRemovedTheRowFirst(t *testing.T) {
	api, scope, workos := memberTestAPI(t, "member")
	workos.afterDelete = func() {
		_, _ = scope.Pool.Exec(context.Background(), `delete from organization_memberships where organization_id=$1 and user_id=$2`, scope.OrganizationID, scope.UserID)
	}

	status, err := api.leaveWorkspace(t.Context(), scopeMemberActor(scope, "member"))
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, status)

	var events int
	err = scope.Pool.QueryRow(t.Context(), `
        select count(*)::int from organization_activity_events
        where organization_id=$1 and event_type='member_left'`, scope.OrganizationID).Scan(&events)
	require.NoError(t, err)
	require.Equal(t, 0, events)
}

func TestMemberLeaveCountsAPromotionMadeWhileLeaving(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	leaverUserID, leaverWorkosUserID, _ := mustActiveMember(t, scope, uniqueTestEmail("promoted-leaver"), "member")
	leaver := memberActor{
		userID:               leaverUserID,
		organizationID:       scope.OrganizationID,
		workosOrganizationID: scope.WorkOSOrganizationID,
		role:                 "member",
		workosUserID:         leaverWorkosUserID,
	}
	member, err := api.getOrganizationMember(t.Context(), scope.OrganizationID, leaverWorkosUserID)
	require.NoError(t, err)
	// Promoted after the leave read the role, before its transaction began.
	_, err = scope.Pool.Exec(t.Context(), `update organization_memberships set role='admin' where user_id=$1`, leaverUserID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `update organization_memberships set role='member' where user_id=$1`, scope.UserID)
	require.NoError(t, err)

	_, err = api.revokeOrganizationMembershipAccess(t.Context(), leaver, member, nil)
	var failure *memberError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, "last_admin_protected", failure.code)
	require.Equal(t, 1, membershipCount(t, scope, leaverWorkosUserID))
}

func TestMemberRemovalStillTellsWorkosWhenTheLocalRowIsGone(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	userID, workosUserID, _ := mustActiveMember(t, scope, uniqueTestEmail("gone-locally"), "member")
	member, err := api.getOrganizationMember(t.Context(), scope.OrganizationID, workosUserID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `delete from organization_memberships where user_id=$1`, userID)
	require.NoError(t, err)

	told := false
	deleted, err := api.revokeOrganizationMembershipAccess(t.Context(), scopeMemberActor(scope, "admin"), member,
		func(context.Context) error {
			told = true
			return nil
		})
	require.NoError(t, err)
	require.False(t, deleted)
	require.True(t, told)
}

func TestMemberLeaveWithoutWorkosCountsEveryAdmin(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	api.workos = nil
	// Without WorkOS no membership records a WorkOS id.
	mustInvitedMember(t, scope, uniqueTestEmail("local-admin"), "admin")

	status, err := api.leaveWorkspace(t.Context(), scopeMemberActor(scope, "admin"))
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, status)
}

// waitForAdvisoryLockWait blocks until another backend waits on this workspace's admin lock.
func waitForAdvisoryLockWait(t *testing.T, scope *testenv.Scope) {
	t.Helper()
	require.Eventually(t, func() bool {
		var waiting int
		err := scope.Pool.QueryRow(context.Background(), `
            with lock_key as (select hashtextextended($1, 0) as key)
            select count(*)::int from pg_locks, lock_key
            where locktype='advisory' and not granted
              and database=(select oid from pg_database where datname=current_database())
              and classid=((key >> 32) & 4294967295)::oid
              and objid=(key & 4294967295)::oid`,
			organizationAdminsLockKey(scope.OrganizationID)).Scan(&waiting)
		return err == nil && waiting > 0
	}, 10*time.Second, 10*time.Millisecond, "no backend waiting on the workspace's admin lock")
}

func TestMemberDemoteCountsAPromotionTheRequestDidNotSee(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	userID, workosUserID, _ := mustActiveMember(t, scope, uniqueTestEmail("promoted-demoted"), "member")
	member, err := api.getOrganizationMember(t.Context(), scope.OrganizationID, workosUserID)
	require.NoError(t, err)
	// Promoted after the request read the role, and now the only admin.
	_, err = scope.Pool.Exec(t.Context(), `update organization_memberships set role='admin' where user_id=$1`, userID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `update organization_memberships set role='member' where user_id=$1`, scope.UserID)
	require.NoError(t, err)

	_, err = api.updateMemberRole(t.Context(), scope.OrganizationID, member, "developer")
	var failure *memberError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, "last_admin_protected", failure.code)
}

func TestMemberRevokeClearsItsMarkWhenTheRemovalFails(t *testing.T) {
	api, scope, _ := memberTestAPI(t, "admin")
	_, workosUserID := mustInvitedMember(t, scope, uniqueTestEmail("pending-admin"), "admin")
	// No accepted admin is left, so removing the invited admin is refused after the revoke.
	_, err := scope.Pool.Exec(t.Context(), `update organization_memberships set role='member' where user_id=$1`, scope.UserID)
	require.NoError(t, err)

	rec := memberRequest(api, scope, http.MethodDelete, scope.OrgPath("/members/"+workosUserID), "")
	require.Equal(t, 409, rec.Code, rec.Body.String())

	var membershipID *string
	err = scope.Pool.QueryRow(t.Context(), `select m.workos_membership_id from organization_memberships m join users u on u.id=m.user_id where u.workos_user_id=$1`, workosUserID).Scan(&membershipID)
	require.NoError(t, err)
	require.Nil(t, membershipID)
}
