package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestNormalizeMemberEmail(t *testing.T) {
	for _, tc := range []struct {
		raw, want string
	}{
		{raw: "  Ada@Example.COM ", want: "ada@example.com"},
		{raw: "first.last+tag@sub.example.org", want: "first.last+tag@sub.example.org"},
		{raw: ""},
		{raw: "   "},
		{raw: "not-an-email"},
		{raw: "Ada <ada@example.com>"},
		{raw: "a b@example.com"},
		{raw: strings.Repeat("a", memberEmailMaxLen) + "@example.com"},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			got, err := normalizeMemberEmail(tc.raw)
			if tc.want == "" {
				requireMemberFailure(t, err, http.StatusBadRequest, "invalid_member_payload")
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestMemberTeamExistsScripted(t *testing.T) {
	ctx := context.Background()
	teamID := uuid.NewString()

	require.NoError(t, (&memberAPI{}).teamExists(ctx, "org_1", ""))
	requireMemberFailure(t, (&memberAPI{}).teamExists(ctx, "org_1", "team-1"), http.StatusNotFound, "team_not_found")

	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	requireMemberFailure(t, (&memberAPI{pool: pool}).teamExists(ctx, "org_1", teamID), http.StatusNotFound, "team_not_found")

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{teamID}}}}
	require.NoError(t, (&memberAPI{pool: pool}).teamExists(ctx, "org_1", teamID))

	boom := errors.New("boom")
	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}
	require.ErrorIs(t, (&memberAPI{pool: pool}).teamExists(ctx, "org_1", teamID), boom)
}

func TestExistingMembershipIDForEmailScripted(t *testing.T) {
	ctx := context.Background()

	id, ok, err := (&memberAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}}).existingMembershipIDForEmail(ctx, "org_1", "a@example.com")
	require.NoError(t, err)
	require.False(t, ok)
	require.Empty(t, id)

	id, ok, err = (&memberAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{"membership_1"}}}}}).existingMembershipIDForEmail(ctx, "org_1", "a@example.com")
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, "membership_1", id)

	boom := errors.New("boom")
	_, _, err = (&memberAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}}).existingMembershipIDForEmail(ctx, "org_1", "a@example.com")
	require.ErrorIs(t, err, boom)
}

func TestFindOrCreateInvitedUserScripted(t *testing.T) {
	ctx := context.Background()
	api := &memberAPI{}
	boom := errors.New("boom")

	user, created, err := api.findOrCreateInvitedUser(ctx, &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"user_local", "user_workos", "a@example.com", "Ada", nil}},
	}}, "a@example.com", "invited_user_x")
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, "user_workos", user.workosUserID)
	require.Equal(t, "Ada", *user.firstName)

	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, err: pgx.ErrNoRows},
		{op: opQueryRow, scan: []any{"user_new", "invited_user_x", "a@example.com", nil, nil}},
	}}
	user, created, err = api.findOrCreateInvitedUser(ctx, pool, "a@example.com", "invited_user_x")
	require.NoError(t, err)
	require.True(t, created)
	require.Equal(t, "user_new", user.id)
	requireScriptDone(t, pool)

	_, _, err = api.findOrCreateInvitedUser(ctx, &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}, "a@example.com", "invited_user_x")
	require.ErrorIs(t, err, boom)

	_, _, err = api.findOrCreateInvitedUser(ctx, &scriptPool{steps: []dbStep{
		{op: opQueryRow, err: pgx.ErrNoRows},
		{op: opQueryRow, err: boom},
	}}, "a@example.com", "invited_user_x")
	require.ErrorIs(t, err, boom)
}

func TestEnsureTeamAccessForInvitedMemberScripted(t *testing.T) {
	ctx := context.Background()
	api := &memberAPI{}
	teamID := uuid.NewString()
	boom := errors.New("boom")

	t.Run("team managers need no team", func(t *testing.T) {
		pool := &scriptPool{}
		created, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "localization_manager", "")
		require.NoError(t, err)
		require.Nil(t, created)
		requireScriptDone(t, pool)
	})

	t.Run("selected team missing", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
		_, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "member", teamID)
		requireMemberFailure(t, err, http.StatusNotFound, "team_not_found")
	})

	t.Run("selected team lookup fails", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}
		_, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "admin", teamID)
		require.ErrorIs(t, err, boom)
	})

	t.Run("selected team already joined", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{teamID}},
			{op: opQueryRow, scan: []any{"team_membership_1"}},
		}}
		created, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "admin", teamID)
		require.NoError(t, err)
		require.Nil(t, created)
		requireScriptDone(t, pool)
	})

	t.Run("selected team joined", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{teamID}},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opExec},
		}}
		created, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "member", teamID)
		require.NoError(t, err)
		require.Equal(t, &createdTeamMembership{teamID: teamID, userID: "user_1"}, created)
		requireScriptDone(t, pool)
	})

	t.Run("selected team membership insert fails", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{teamID}},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opExec, err: boom},
		}}
		_, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "member", teamID)
		require.ErrorIs(t, err, boom)
	})

	t.Run("default team created by a concurrent invite", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: []any{"team_default"}},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opExec},
		}}
		created, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "member", "")
		require.NoError(t, err)
		require.Equal(t, &createdTeamMembership{teamID: "team_default", userID: "user_1"}, created)
		requireScriptDone(t, pool)
	})

	t.Run("default team inserted", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: []any{"team_default"}},
			{op: opQueryRow, scan: []any{"team_membership_1"}},
		}}
		created, err := api.ensureTeamAccessForInvitedMember(ctx, pool, "org_1", "user_1", "translator", "")
		require.NoError(t, err)
		require.Nil(t, created)
		requireScriptDone(t, pool)
	})

	for name, steps := range map[string][]dbStep{
		"default team lookup":      {{op: opQueryRow, err: boom}},
		"default team insert":      {{op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, err: boom}},
		"default team reread":      {{op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, err: boom}},
		"default membership check": {{op: opQueryRow, scan: []any{"team_default"}}, {op: opQueryRow, err: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			_, err := api.ensureTeamAccessForInvitedMember(ctx, &scriptPool{steps: steps}, "org_1", "user_1", "member", "")
			require.ErrorIs(t, err, boom)
		})
	}
}

func TestInviteOrganizationMemberScripted(t *testing.T) {
	ctx := context.Background()
	api := &memberAPI{}
	boom := errors.New("boom")

	t.Run("active member", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{
			"membership_1", "om_1", "member", memberUnitCreatedAt, "user_1", "a@example.com", nil, nil, "user_local",
		}}}}
		_, err := api.inviteOrganizationMember(ctx, pool, "org_1", "a@example.com", "member", "", "invited_user_x")
		requireMemberFailure(t, err, http.StatusConflict, "member_already_exists")
	})

	t.Run("pending invite with a new role", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{
				"membership_1", nil, "member", memberUnitCreatedAt, "invited_user_1", "a@example.com", "Ada", nil, "user_local",
			}},
			{op: opExec},
		}}
		invited, err := api.inviteOrganizationMember(ctx, pool, "org_1", "a@example.com", "admin", "", "invited_user_x")
		require.NoError(t, err)
		require.True(t, invited.resend)
		require.True(t, invited.roleChanged)
		require.False(t, invited.isNewUser)
		require.Equal(t, "member", invited.previousRole)
		require.Equal(t, "membership_1", invited.membershipID)
		require.Equal(t, "admin", invited.member.Role)
		require.Equal(t, "invited", invited.member.Status)
		require.Equal(t, "Ada", invited.member.DisplayName)
		requireScriptDone(t, pool)
	})

	t.Run("pending invite role update fails", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{
				"membership_1", nil, "member", memberUnitCreatedAt, "invited_user_1", "a@example.com", nil, nil, "user_local",
			}},
			{op: opExec, err: boom},
		}}
		_, err := api.inviteOrganizationMember(ctx, pool, "org_1", "a@example.com", "admin", "", "invited_user_x")
		require.ErrorIs(t, err, boom)
	})

	t.Run("new user", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: []any{"user_new", "invited_user_x", "a@example.com", nil, nil}},
			{op: opQueryRow, scan: []any{"membership_new", memberUnitCreatedAt}},
		}}
		invited, err := api.inviteOrganizationMember(ctx, pool, "org_1", "a@example.com", "admin", "", "invited_user_x")
		require.NoError(t, err)
		require.True(t, invited.isNewUser)
		require.False(t, invited.resend)
		require.Equal(t, "membership_new", invited.membershipID)
		require.Equal(t, "invited_user_x", invited.member.WorkosUserID)
		require.Equal(t, "2026-03-04T05:06:07.891Z", invited.member.CreatedAt)
		requireScriptDone(t, pool)
	})

	t.Run("membership insert fails", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: []any{"user_1", "user_workos", "a@example.com", nil, nil}},
			{op: opQueryRow, err: boom},
		}}
		_, err := api.inviteOrganizationMember(ctx, pool, "org_1", "a@example.com", "admin", "", "invited_user_x")
		require.ErrorIs(t, err, boom)
	})
}

func TestRollbackFailedInvitationScripted(t *testing.T) {
	ctx := context.Background()

	pool := &scriptPool{steps: []dbStep{{op: opExec}, {op: opExec}}}
	(&memberAPI{pool: pool}).rollbackFailedInvitation(ctx, invitedOrganizationMember{membershipID: "membership_1", localUserID: "user_1", isNewUser: true})
	requireScriptDone(t, pool)

	pool = &scriptPool{steps: []dbStep{{op: opExec}}}
	(&memberAPI{pool: pool}).rollbackFailedInvitation(ctx, invitedOrganizationMember{membershipID: "membership_1", localUserID: "user_1"})
	requireScriptDone(t, pool)

	pool = &scriptPool{steps: []dbStep{{op: opExec}, {op: opExec}}}
	(&memberAPI{pool: pool}).rollbackFailedInvitation(ctx, invitedOrganizationMember{
		membershipID:          "membership_1",
		resend:                true,
		roleChanged:           true,
		previousRole:          "member",
		createdTeamMembership: &createdTeamMembership{teamID: "team_1", userID: "user_1"},
	})
	requireScriptDone(t, pool)

	pool = &scriptPool{}
	(&memberAPI{pool: pool}).rollbackFailedInvitation(ctx, invitedOrganizationMember{membershipID: "membership_1", resend: true})
	requireScriptDone(t, pool)
}
