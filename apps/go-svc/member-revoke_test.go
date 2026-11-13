package main

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func revokeUnitMember(workosUserID string) organizationMember {
	return organizationMember{
		membershipID: "membership_1",
		workosUserID: workosUserID,
		localUserID:  "33333333-3333-4333-8333-333333333333",
	}
}

func revokeUnitDeleteSteps() []dbStep {
	return []dbStep{
		{op: opBegin},
		{op: opExec},
		{op: opQueryRow, scan: []any{"member"}},
		{op: opExec, tag: pgconn.NewCommandTag("DELETE 1")},
		{op: opExec},
		{op: opExec},
		{op: opExec},
		{op: opExec},
		{op: opExec},
	}
}

func TestRevokeOrganizationMembershipAccessScripted(t *testing.T) {
	ctx := context.Background()
	actor := memberUnitActor("admin")
	member := revokeUnitMember("user_target")
	boom := errors.New("boom")

	for name, steps := range map[string][]dbStep{
		"begin": {{op: opBegin, err: boom}},
		"lock":  {{op: opBegin}, {op: opExec, err: boom}},
		"role":  {{op: opBegin}, {op: opExec}, {op: opQueryRow, err: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: steps}
			deleted, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, nil)
			require.ErrorIs(t, err, boom)
			require.False(t, deleted)
			requireScriptDone(t, pool)
		})
	}

	t.Run("missing row still tells workos", func(t *testing.T) {
		removed := 0
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, err: pgx.ErrNoRows}}}
		deleted, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, func(context.Context) error {
			removed++
			return nil
		})
		require.NoError(t, err)
		require.False(t, deleted)
		require.Equal(t, 1, removed)
		requireScriptDone(t, pool)
	})

	t.Run("workos failure keeps the row", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{"member"}}}}
		deleted, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, func(context.Context) error { return boom })
		require.ErrorIs(t, err, boom)
		require.False(t, deleted)
		requireScriptDone(t, pool)
	})

	t.Run("last admin", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{"admin"}}, {op: opQueryRow, scan: []any{0}}}}
		_, err := (&memberAPI{pool: pool, workos: &stubMemberWorkos{}}).revokeOrganizationMembershipAccess(ctx, actor, member, nil)
		requireMemberFailure(t, err, http.StatusConflict, "last_admin_protected")
		requireScriptDone(t, pool)
	})

	t.Run("row removed concurrently", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opBegin},
			{op: opExec},
			{op: opQueryRow, scan: []any{"member"}},
			{op: opExec, tag: pgconn.NewCommandTag("DELETE 0")},
		}}
		deleted, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, nil)
		require.NoError(t, err)
		require.False(t, deleted)
		requireScriptDone(t, pool)
	})

	t.Run("revokes keys and logs each", func(t *testing.T) {
		steps := append(revokeUnitDeleteSteps(),
			dbStep{op: opQuery, table: [][]any{{"key_1", "hl_abc", "CI"}, {"key_2", "hl_def", "Deploy"}}},
			dbStep{op: opExec},
			dbStep{op: opExec},
		)
		pool := &scriptPool{steps: steps}
		deleted, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, nil)
		require.NoError(t, err)
		require.True(t, deleted)
		requireScriptDone(t, pool)
	})

	for i := 3; i < len(revokeUnitDeleteSteps()); i++ {
		t.Run("cleanup statement fails", func(t *testing.T) {
			steps := revokeUnitDeleteSteps()[:i+1]
			steps[i].err = boom
			pool := &scriptPool{steps: steps}
			_, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, nil)
			require.ErrorIs(t, err, boom)
			requireScriptDone(t, pool)
		})
	}

	for name, step := range map[string]dbStep{
		"key query": {op: opQuery, err: boom},
		"key scan":  {op: opQuery, table: [][]any{{"key_1"}}},
		"key rows":  {op: opQuery, rowsErr: boom},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: append(revokeUnitDeleteSteps(), step)}
			_, err := (&memberAPI{pool: pool}).revokeOrganizationMembershipAccess(ctx, actor, member, nil)
			require.Error(t, err)
			requireScriptDone(t, pool)
		})
	}
}

func TestReconcileRevokedMembershipScripted(t *testing.T) {
	ctx := context.Background()
	actor := memberUnitActor("admin")
	boom := errors.New("boom")

	t.Run("already removed cleans the placeholder without logging", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, err: pgx.ErrNoRows}, {op: opExec}}}
		require.NoError(t, (&memberAPI{pool: pool}).reconcileRevokedMembership(ctx, actor, revokeUnitMember(invitedWorkosUserIDPrefix+"x"), "member_removed", nil))
		requireScriptDone(t, pool)
	})

	t.Run("removed logs the event", func(t *testing.T) {
		pool := &scriptPool{steps: append(revokeUnitDeleteSteps(), dbStep{op: opQuery}, dbStep{op: opExec})}
		require.NoError(t, (&memberAPI{pool: pool}).reconcileRevokedMembership(ctx, actor, revokeUnitMember("user_target"), "member_left", nil))
		requireScriptDone(t, pool)
	})

	t.Run("activity insert failure is ignored", func(t *testing.T) {
		pool := &scriptPool{steps: append(revokeUnitDeleteSteps(), dbStep{op: opQuery}, dbStep{op: opExec, err: boom})}
		require.NoError(t, (&memberAPI{pool: pool}).reconcileRevokedMembership(ctx, actor, revokeUnitMember("user_target"), "member_left", nil))
		requireScriptDone(t, pool)
	})

	t.Run("failure is returned", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin, err: boom}}}
		require.ErrorIs(t, (&memberAPI{pool: pool}).reconcileRevokedMembership(ctx, actor, revokeUnitMember(invitedWorkosUserIDPrefix+"x"), "member_removed", nil), boom)
		requireScriptDone(t, pool)
	})
}
