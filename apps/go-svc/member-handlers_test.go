package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

var memberUnitCreatedAt = time.Date(2026, 3, 4, 5, 6, 7, 891_000_000, time.UTC)

func requireMemberFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	var failure *memberError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
}

func requireScriptDone(t *testing.T, pool *scriptPool) {
	t.Helper()
	require.NoError(t, pool.failed)
	require.Equal(t, len(pool.steps), pool.n, "unused scripted database calls")
}

func memberUnitActor(role string) memberActor {
	return memberActor{
		userID:               "11111111-1111-4111-8111-111111111111",
		organizationID:       "22222222-2222-4222-8222-222222222222",
		workosOrganizationID: "org_unit",
		role:                 role,
		workosUserID:         "user_actor",
	}
}

func memberUnitRequest(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
}

func memberUnitMemberRow(role string, workosMembershipID any) dbStep {
	return dbStep{op: opQueryRow, scan: []any{
		"membership_1", workosMembershipID, role, memberUnitCreatedAt,
		"user_target", "target@example.com", "Tara", nil, nil, "33333333-3333-4333-8333-333333333333",
	}}
}

func TestToMemberSummary(t *testing.T) {
	first, last, active, replacing := "  Ada ", "Lovelace", "om_1", "replacing:om_1"
	row := memberRow{
		userID:             "u1",
		workosUserID:       "user_1",
		email:              "ada@example.com",
		firstName:          &first,
		lastName:           &last,
		role:               "member",
		createdAt:          memberUnitCreatedAt,
		workosMembershipID: &active,
	}

	summary := toMemberSummary(row, "user_other", nil)
	require.Equal(t, "Ada Lovelace", summary.DisplayName)
	require.Equal(t, "active", summary.Status)
	require.Equal(t, "2026-03-04T05:06:07.891Z", summary.CreatedAt)
	require.False(t, summary.IsCurrentUser)
	require.Nil(t, summary.CanUpdateRole)
	require.Nil(t, summary.CanRemove)

	admin := "admin"
	summary = toMemberSummary(row, "user_other", &admin)
	require.True(t, *summary.CanUpdateRole)
	require.True(t, *summary.CanRemove)

	summary = toMemberSummary(row, "user_1", &admin)
	require.True(t, summary.IsCurrentUser)
	require.False(t, *summary.CanUpdateRole)
	require.False(t, *summary.CanRemove)

	manager := "localization_manager"
	row.role = "admin"
	summary = toMemberSummary(row, "user_other", &manager)
	require.False(t, *summary.CanUpdateRole)
	require.False(t, *summary.CanRemove)

	row.firstName, row.lastName = nil, nil
	for _, membershipID := range []*string{nil, &replacing} {
		row.workosMembershipID = membershipID
		summary = toMemberSummary(row, "", nil)
		require.Equal(t, "invited", summary.Status)
		require.Equal(t, "ada@example.com", summary.DisplayName)
	}
}

func TestDerefString(t *testing.T) {
	value := "x"
	require.Equal(t, "", derefString(nil))
	require.Equal(t, "x", derefString(&value))
}

func TestOrganizationAdminsLockKey(t *testing.T) {
	require.Equal(t, "organization_admins:org_1", organizationAdminsLockKey("org_1"))
}

func TestDecodeInviteMemberBody(t *testing.T) {
	teamID := uuid.NewString()
	for _, tc := range []struct {
		name, body, role string
		teamID           *string
		code             string
	}{
		{name: "default role", body: `{"email":"a@example.com"}`, role: "member"},
		{name: "blank role", body: `{"email":"a@example.com","role":"  "}`, role: "member"},
		{name: "explicit role", body: `{"role":"reviewer"}`, role: "reviewer"},
		{name: "blank team", body: `{"teamId":"   "}`, role: "member"},
		{name: "null team", body: `{"teamId":null}`, role: "member"},
		{name: "trimmed team", body: `{"teamId":" ` + teamID + ` "}`, role: "member", teamID: &teamID},
		{name: "unknown role", body: `{"role":"superuser"}`, code: "invalid_member_payload"},
		{name: "invalid team", body: `{"teamId":"team-1"}`, code: "invalid_member_payload"},
		{name: "empty body", body: ``, code: "invalid_member_payload"},
		{name: "malformed", body: `{bad`, code: "invalid_member_payload"},
		{name: "wrong type", body: `{"role":5}`, code: "invalid_member_payload"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := decodeInviteMemberBody(memberUnitRequest(tc.body))
			if tc.code != "" {
				requireMemberFailure(t, err, http.StatusBadRequest, tc.code)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.role, body.Role)
			require.Equal(t, tc.teamID, body.TeamID)
		})
	}
}

func TestDecodeUpdateMemberBody(t *testing.T) {
	body, err := decodeUpdateMemberBody(memberUnitRequest(`{"role":"translator"}`))
	require.NoError(t, err)
	require.Equal(t, "translator", body.Role)

	for _, raw := range []string{`{}`, `{"role":"owner"}`, `{"role":""}`, `[]`, ``} {
		_, err := decodeUpdateMemberBody(memberUnitRequest(raw))
		requireMemberFailure(t, err, http.StatusBadRequest, "invalid_member_payload")
	}
}

func TestDecodeMemberJSONRejectsOversizedBody(t *testing.T) {
	req := memberUnitRequest(`{"email":"` + strings.Repeat("a", 64) + `@example.com"}`)
	req.Body = http.MaxBytesReader(httptest.NewRecorder(), req.Body, 16)
	var body inviteMemberBody
	requireMemberFailure(t, decodeMemberJSON(req, &body), http.StatusRequestEntityTooLarge, "payload_too_large")
}

func TestMemberHandlersRejectBeforeDatabase(t *testing.T) {
	ctx := context.Background()
	withWorkos := &memberAPI{workos: &stubMemberWorkos{}}
	withoutWorkos := &memberAPI{}

	_, _, err := withoutWorkos.listMembers(ctx, memberUnitActor("unknown"))
	requireMemberFailure(t, err, http.StatusForbidden, "forbidden")

	for _, tc := range []struct {
		name, role, body string
		api              *memberAPI
		status           int
		code             string
	}{
		{name: "member cannot invite", role: "member", body: `{"email":"a@example.com"}`, api: withWorkos, status: 403, code: "forbidden"},
		{name: "manager cannot invite admin", role: "localization_manager", body: `{"email":"a@example.com","role":"admin"}`, api: withWorkos, status: 403, code: "forbidden"},
		{name: "invalid payload", role: "admin", body: `{"email":"a@example.com","role":"owner"}`, api: withWorkos, status: 400, code: "invalid_member_payload"},
		{name: "workos missing", role: "admin", body: `{"email":"a@example.com"}`, api: withoutWorkos, status: 503, code: "workos_server_not_configured"},
		{name: "invalid email", role: "admin", body: `{"email":"not an email"}`, api: withWorkos, status: 400, code: "invalid_member_payload"},
		{name: "missing email", role: "admin", body: `{}`, api: withWorkos, status: 400, code: "invalid_member_payload"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := tc.api.inviteMember(ctx, memberUnitActor(tc.role), memberUnitRequest(tc.body))
			requireMemberFailure(t, err, tc.status, tc.code)
		})
	}

	_, _, err = withWorkos.updateMember(ctx, memberUnitActor("reviewer"), "user_target", memberUnitRequest(`{"role":"member"}`))
	requireMemberFailure(t, err, http.StatusForbidden, "forbidden")
	_, _, err = withWorkos.updateMember(ctx, memberUnitActor("admin"), "user_target", memberUnitRequest(`{"role":"owner"}`))
	requireMemberFailure(t, err, http.StatusBadRequest, "invalid_member_payload")

	_, err = withWorkos.deleteMember(ctx, memberUnitActor("translator"), "user_target")
	requireMemberFailure(t, err, http.StatusForbidden, "forbidden")
}

func TestMemberListMembersScripted(t *testing.T) {
	ctx := context.Background()
	actor := memberUnitActor("admin")

	t.Run("query error", func(t *testing.T) {
		boom := errors.New("boom")
		pool := &scriptPool{steps: []dbStep{{op: opQuery, err: boom}}}
		_, _, err := (&memberAPI{pool: pool}).listMembers(ctx, actor)
		require.ErrorIs(t, err, boom)
		requireScriptDone(t, pool)
	})

	t.Run("rows error", func(t *testing.T) {
		boom := errors.New("rows failed")
		pool := &scriptPool{steps: []dbStep{{op: opQuery, rowsErr: boom}}}
		_, _, err := (&memberAPI{pool: pool}).listMembers(ctx, actor)
		require.ErrorIs(t, err, boom)
	})

	t.Run("scan error", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQuery, table: [][]any{{"too", "few"}}}}}
		_, _, err := (&memberAPI{pool: pool}).listMembers(ctx, actor)
		require.Error(t, err)
	})

	t.Run("maps rows", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQuery, table: [][]any{
			{"u_actor", "user_actor", "me@example.com", "Me", nil, nil, "admin", memberUnitCreatedAt, "om_actor"},
			{"u_invited", "invited_user_x", "new@example.com", nil, nil, nil, "member", memberUnitCreatedAt, nil},
		}}}}
		value, status, err := (&memberAPI{pool: pool}).listMembers(ctx, actor)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		body := value.(map[string]any)
		members := body["members"].([]memberSummary)
		require.Len(t, members, 2)
		require.True(t, members[0].IsCurrentUser)
		require.Equal(t, "active", members[0].Status)
		require.False(t, *members[0].CanUpdateRole)
		require.Equal(t, "invited", members[1].Status)
		require.Equal(t, "new@example.com", members[1].DisplayName)
		require.True(t, *members[1].CanRemove)
		require.Equal(t, memberManagementContext{CanInvite: true, AssignableRoles: memberSettingsRoleOrder}, body["memberManagement"])
		requireScriptDone(t, pool)
	})
}

func TestMemberDeleteScripted(t *testing.T) {
	ctx := context.Background()

	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	status, err := (&memberAPI{pool: pool}).deleteMember(ctx, memberUnitActor("admin"), "user_missing")
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, status)
	requireScriptDone(t, pool)

	boom := errors.New("boom")
	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}
	_, err = (&memberAPI{pool: pool}).deleteMember(ctx, memberUnitActor("admin"), "user_target")
	require.ErrorIs(t, err, boom)

	pool = &scriptPool{steps: []dbStep{memberUnitMemberRow("admin", "om_target")}}
	_, err = (&memberAPI{pool: pool}).deleteMember(ctx, memberUnitActor("localization_manager"), "user_target")
	requireMemberFailure(t, err, http.StatusForbidden, "forbidden")
	requireScriptDone(t, pool)
}

func TestMemberUpdateScripted(t *testing.T) {
	ctx := context.Background()

	t.Run("not found", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
		_, _, err := (&memberAPI{pool: pool}).updateMember(ctx, memberUnitActor("admin"), "user_missing", memberUnitRequest(`{"role":"member"}`))
		requireMemberFailure(t, err, http.StatusNotFound, "member_not_found")
	})

	t.Run("manager cannot promote to admin", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{memberUnitMemberRow("member", "om_target")}}
		_, _, err := (&memberAPI{pool: pool}).updateMember(ctx, memberUnitActor("localization_manager"), "user_target", memberUnitRequest(`{"role":"admin"}`))
		requireMemberFailure(t, err, http.StatusForbidden, "forbidden")
		requireScriptDone(t, pool)
	})

	t.Run("unchanged role skips sync and activity", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			memberUnitMemberRow("member", "om_target"),
			{op: opBegin},
			{op: opExec},
			{op: opQueryRow, scan: []any{"member"}},
			{op: opQueryRow, scan: []any{"member", memberUnitCreatedAt}},
		}}
		value, status, err := (&memberAPI{pool: pool}).updateMember(ctx, memberUnitActor("admin"), "user_target", memberUnitRequest(`{"role":"member"}`))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		member := value.(map[string]any)["member"].(memberSummary)
		require.Equal(t, "member", member.Role)
		require.Equal(t, "Tara", member.DisplayName)
		require.Equal(t, "active", member.Status)
		require.Nil(t, member.CanUpdateRole)
		requireScriptDone(t, pool)
	})

	t.Run("workos sync failure restores role", func(t *testing.T) {
		workos := &stubMemberWorkos{updateErr: errors.New("workos down")}
		pool := &scriptPool{steps: []dbStep{
			memberUnitMemberRow("member", "om_target"),
			{op: opBegin},
			{op: opExec},
			{op: opQueryRow, scan: []any{"member"}},
			{op: opQueryRow, scan: []any{"reviewer", memberUnitCreatedAt}},
			{op: opExec},
		}}
		_, _, err := (&memberAPI{pool: pool, workos: workos}).updateMember(ctx, memberUnitActor("admin"), "user_target", memberUnitRequest(`{"role":"reviewer"}`))
		requireMemberFailure(t, err, http.StatusInternalServerError, "member_sync_failed")
		require.Equal(t, "om_target", workos.updateID)
		require.Equal(t, "reviewer", workos.updateRole)
		requireScriptDone(t, pool)
	})

	t.Run("pending role change without workos restores role", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			memberUnitMemberRow("member", nil),
			{op: opBegin},
			{op: opExec},
			{op: opQueryRow, scan: []any{"member"}},
			{op: opQueryRow, scan: []any{"reviewer", memberUnitCreatedAt}},
			{op: opExec},
		}}
		_, _, err := (&memberAPI{pool: pool}).updateMember(ctx, memberUnitActor("admin"), "user_target", memberUnitRequest(`{"role":"reviewer"}`))
		requireMemberFailure(t, err, http.StatusServiceUnavailable, "workos_server_not_configured")
		requireScriptDone(t, pool)
	})
}

func TestUpdateMemberRoleScripted(t *testing.T) {
	ctx := context.Background()
	member := organizationMember{membershipID: "membership_1", localUserID: "user_local", role: "admin"}
	boom := errors.New("boom")

	pool := &scriptPool{steps: []dbStep{{op: opBegin, err: boom}}}
	_, err := (&memberAPI{pool: pool}).updateMemberRole(ctx, "org_1", member, "member")
	require.ErrorIs(t, err, boom)

	pool = &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opQueryRow, scan: []any{"admin", memberUnitCreatedAt}},
	}}
	updated, err := (&memberAPI{pool: pool}).updateMemberRole(ctx, "org_1", member, "admin")
	require.NoError(t, err)
	require.Equal(t, "admin", updated.role)
	requireScriptDone(t, pool)

	pool = &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opExec},
		{op: opQueryRow, scan: []any{"admin"}},
		{op: opQueryRow, scan: []any{0}},
	}}
	_, err = (&memberAPI{pool: pool}).updateMemberRole(ctx, "org_1", member, "member")
	requireMemberFailure(t, err, http.StatusConflict, "last_admin_protected")
	requireScriptDone(t, pool)

	pool = &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opExec},
		{op: opQueryRow, scan: []any{"admin"}},
		{op: opQueryRow, scan: []any{1}},
		{op: opQueryRow, scan: []any{"member", memberUnitCreatedAt}},
	}}
	updated, err = (&memberAPI{pool: pool, workos: &stubMemberWorkos{}}).updateMemberRole(ctx, "org_1", member, "member")
	require.NoError(t, err)
	require.Equal(t, "member", updated.role)
	requireScriptDone(t, pool)

	pool = &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opExec},
		{op: opQueryRow, err: pgx.ErrNoRows},
		{op: opQueryRow, scan: []any{"member", memberUnitCreatedAt}},
	}}
	_, err = (&memberAPI{pool: pool}).updateMemberRole(ctx, "org_1", member, "member")
	require.NoError(t, err)
	requireScriptDone(t, pool)

	for _, steps := range [][]dbStep{
		{{op: opBegin}, {op: opExec, err: boom}},
		{{op: opBegin}, {op: opExec}, {op: opQueryRow, err: boom}},
		{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{"admin"}}, {op: opQueryRow, err: boom}},
		{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{"member"}}, {op: opQueryRow, err: boom}},
	} {
		pool = &scriptPool{steps: steps}
		_, err = (&memberAPI{pool: pool}).updateMemberRole(ctx, "org_1", member, "member")
		require.ErrorIs(t, err, boom)
		requireScriptDone(t, pool)
	}
}

func TestFindMembershipByEmailScripted(t *testing.T) {
	ctx := context.Background()
	api := &memberAPI{}

	found, err := api.findMembershipByEmail(ctx, &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}, "org_1", "a@example.com")
	require.NoError(t, err)
	require.Nil(t, found)

	boom := errors.New("boom")
	_, err = api.findMembershipByEmail(ctx, &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}, "org_1", "a@example.com")
	require.ErrorIs(t, err, boom)

	found, err = api.findMembershipByEmail(ctx, &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{
		"membership_1", nil, "reviewer", memberUnitCreatedAt, "invited_user_1", "a@example.com", nil, nil, "user_local",
	}}}}, "org_1", "a@example.com")
	require.NoError(t, err)
	require.Equal(t, "membership_1", found.membershipID)
	require.Equal(t, "reviewer", found.role)
	require.Nil(t, found.workosMembershipID)
	require.Equal(t, "user_local", found.localUserID)
}

func TestDeleteWorkosMembership(t *testing.T) {
	ctx := context.Background()
	membershipID := "om_target"
	member := organizationMember{membershipID: "membership_1", workosMembershipID: &membershipID}

	for _, tc := range []struct {
		name string
		err  error
		code string
	}{
		{name: "deleted"},
		{name: "already gone", err: &workosHTTPError{status: http.StatusNotFound}},
		{name: "failed", err: &workosHTTPError{status: http.StatusBadGateway}, code: "member_sync_failed"},
		{name: "network", err: errors.New("dial"), code: "member_sync_failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			workos := &stubMemberWorkos{deleteErr: tc.err}
			err := (&memberAPI{workos: workos}).deleteWorkosMembership(ctx, memberUnitActor("admin"), member)
			require.Equal(t, membershipID, workos.deleteID)
			if tc.code == "" {
				require.NoError(t, err)
				return
			}
			requireMemberFailure(t, err, http.StatusInternalServerError, tc.code)
		})
	}
}

func TestRequireAnotherAcceptedAdminPropagatesErrors(t *testing.T) {
	boom := errors.New("boom")
	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}
	require.ErrorIs(t, requireAnotherAcceptedAdmin(context.Background(), &scriptTx{pool: pool}, "org_1", "user_1", true), boom)

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{2}}}}
	require.NoError(t, requireAnotherAcceptedAdmin(context.Background(), &scriptTx{pool: pool}, "org_1", "user_1", true))
}

func TestInviteMemberScriptedLookups(t *testing.T) {
	ctx := context.Background()
	boom := errors.New("boom")
	teamID := "44444444-4444-4444-8444-444444444444"
	existingRow := func(role string, workosMembershipID any) dbStep {
		return dbStep{op: opQueryRow, scan: []any{"membership_1", workosMembershipID, role, memberUnitCreatedAt, "user_target", "a@example.com", nil, nil, "user_local"}}
	}
	for _, tc := range []struct {
		name, role, body string
		steps            []dbStep
		status           int
		code             string
	}{
		{name: "team missing", role: "admin", body: `{"email":"a@example.com","teamId":"` + teamID + `"}`, steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}, status: 404, code: "team_not_found"},
		{name: "team lookup fails", role: "admin", body: `{"email":"a@example.com","teamId":"` + teamID + `"}`, steps: []dbStep{{op: opQueryRow, err: boom}}},
		{name: "membership lookup fails", role: "admin", body: `{"email":"a@example.com"}`, steps: []dbStep{{op: opQueryRow, err: boom}}},
		{name: "existing lookup fails", role: "admin", body: `{"email":"a@example.com"}`, steps: []dbStep{{op: opQueryRow, scan: []any{"membership_1"}}, {op: opQueryRow, err: boom}}},
		{name: "already a member", role: "admin", body: `{"email":"A@Example.com"}`, steps: []dbStep{{op: opQueryRow, scan: []any{"membership_1"}}, existingRow("member", "om_1")}, status: 409, code: "member_already_exists"},
		{name: "manager cannot reinvite pending admin", role: "localization_manager", body: `{"email":"a@example.com","role":"member"}`, steps: []dbStep{{op: opQueryRow, scan: []any{"membership_1"}}, existingRow("admin", nil)}, status: 403, code: "forbidden"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &scriptPool{steps: tc.steps}
			api := &memberAPI{pool: pool, workos: &stubMemberWorkos{}}
			_, _, err := api.inviteMember(ctx, memberUnitActor(tc.role), memberUnitRequest(tc.body))
			if tc.code == "" {
				require.ErrorIs(t, err, boom)
			} else {
				requireMemberFailure(t, err, tc.status, tc.code)
			}
			requireScriptDone(t, pool)
		})
	}
}
