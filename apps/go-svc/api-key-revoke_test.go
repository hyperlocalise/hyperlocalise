package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func patAuditTargetOf(entry map[string]any) map[string]any {
	return entry["audit"].(map[string]any)["target"].(map[string]any)
}

func patAuditActorOf(entry map[string]any) map[string]any {
	return entry["audit"].(map[string]any)["actor"].(map[string]any)
}

func revokedActivity(env *apiKeyTestEnv) []activityLogEventInput {
	var out []activityLogEventInput
	for _, event := range env.activity.recorded() {
		if event.EventType == "personal_access_token_revoked" {
			out = append(out, event)
		}
	}
	return out
}

func TestAPIKeyRevokeAuthorization(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	peer := env.addMember(t, "member")
	developer := env.addMember(t, "developer")
	manager := env.addMember(t, "localization_manager")

	own := env.mustCreate(t, member, `{"name":"own"}`).APIKey
	peerKey := env.mustCreate(t, peer, `{"name":"peer"}`).APIKey
	peerKey2 := env.mustCreate(t, peer, `{"name":"peer-2"}`).APIKey
	adminKey := env.mustCreate(t, env.owner, `{"name":"admin"}`).APIKey

	unknown := env.request(member, http.MethodDelete, "/7f1c9d1e-4b2a-4c3d-8e5f-0a1b2c3d4e5f", "")
	require.Equal(t, http.StatusNotFound, unknown.Code)

	rec := env.request(member, http.MethodDelete, "/"+peerKey.ID, "")
	require.Equal(t, http.StatusNotFound, rec.Code, "a member cannot revoke another member's token")
	require.JSONEq(t, unknown.Body.String(), rec.Body.String(), "foreign tokens must look unknown")
	require.Nil(t, env.revokedAt(t, peerKey.ID))

	rec = env.request(developer, http.MethodDelete, "/"+adminKey.ID, "")
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Nil(t, env.revokedAt(t, adminKey.ID))

	rec = env.request(member, http.MethodDelete, "/"+own.ID, "")
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	require.Empty(t, rec.Body.String())
	require.NotNil(t, env.revokedAt(t, own.ID))

	rec = env.request(env.owner, http.MethodDelete, "/"+peerKey.ID, "")
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	rec = env.request(manager, http.MethodDelete, "/"+peerKey2.ID, "")
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	audits := env.audit.byAction(patRevokedAuditAction)
	require.Len(t, audits, 3)
	require.Equal(t, member.userID, patAuditActorOf(audits[0])["id"])
	require.Equal(t, member.userID, patAuditTargetOf(audits[0])["ownerUserId"])
	require.Equal(t, env.owner.userID, patAuditActorOf(audits[1])["id"])
	require.Equal(t, peer.userID, patAuditTargetOf(audits[1])["ownerUserId"])
	require.Equal(t, manager.userID, patAuditActorOf(audits[2])["id"])
	require.Equal(t, patRevokeReasonManual, audits[2]["audit"].(map[string]any)["reason"])

	events := revokedActivity(env)
	require.Len(t, events, 3)
	require.Equal(t, env.owner.userID, events[1].ActorUserID)
	require.Equal(t, map[string]any{"keyPrefix": peerKey.KeyPrefix, "reason": "manual", "tokenId": peerKey.ID}, events[1].Payload)

	foreign := newAPIKeyTestEnv(t, "admin")
	foreignKey := foreign.mustCreate(t, foreign.owner, `{"name":"foreign"}`).APIKey
	rec = env.request(env.owner, http.MethodDelete, "/"+foreignKey.ID, "")
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Nil(t, foreign.revokedAt(t, foreignKey.ID))
}

func TestAPIKeyRevokeIsIdempotent(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	key := env.mustCreate(t, env.owner, `{"name":"twice"}`).APIKey

	var createdUpdatedAt time.Time
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(),
		`select updated_at from organization_api_keys where id=$1`, key.ID).Scan(&createdUpdatedAt))

	require.Equal(t, http.StatusNoContent, env.request(env.owner, http.MethodDelete, "/"+key.ID, "").Code)
	first := env.revokedAt(t, key.ID)
	require.NotNil(t, first)
	var revokedUpdatedAt time.Time
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(),
		`select updated_at from organization_api_keys where id=$1`, key.ID).Scan(&revokedUpdatedAt))
	require.True(t, revokedUpdatedAt.After(createdUpdatedAt), "revocation bumps updated_at")

	require.Equal(t, http.StatusNoContent, env.request(env.owner, http.MethodDelete, "/"+key.ID, "").Code)
	require.Equal(t, *first, *env.revokedAt(t, key.ID), "the first revocation timestamp is kept")
	require.Len(t, env.audit.byAction(patRevokedAuditAction), 1)
	require.Len(t, revokedActivity(env), 1)
}

func TestAPIKeyRevokeLegacyOwnerlessToken(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	var legacyID string
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(), `
        insert into organization_api_keys (organization_id, name, key_hash, key_prefix, created_by_user_id)
        values ($1, 'legacy', $2, 'hl_Legac', null) returning id`,
		env.scope.OrganizationID, hashAPIKey("legacy-revoke-"+env.scope.OrganizationID)).Scan(&legacyID))

	require.Equal(t, http.StatusNotFound, env.request(member, http.MethodDelete, "/"+legacyID, "").Code)
	require.Equal(t, http.StatusNoContent, env.request(env.owner, http.MethodDelete, "/"+legacyID, "").Code)

	audits := env.audit.byAction(patRevokedAuditAction)
	require.Len(t, audits, 1)
	owner, present := patAuditTargetOf(audits[0])["ownerUserId"]
	require.True(t, present)
	require.Nil(t, owner)
}

type unreachableAPIKeyPool struct{ calls atomic.Int32 }

var errUnexpectedAPIKeyQuery = errors.New("unexpected database call")

func (p *unreachableAPIKeyPool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	p.calls.Add(1)
	return nil, errUnexpectedAPIKeyQuery
}

func (p *unreachableAPIKeyPool) QueryRow(context.Context, string, ...any) pgx.Row {
	p.calls.Add(1)
	return unreachableAPIKeyRow{}
}

func (p *unreachableAPIKeyPool) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	p.calls.Add(1)
	return pgconn.CommandTag{}, errUnexpectedAPIKeyQuery
}

func (p *unreachableAPIKeyPool) Begin(context.Context) (pgx.Tx, error) {
	p.calls.Add(1)
	return nil, errUnexpectedAPIKeyQuery
}

type unreachableAPIKeyRow struct{}

func (unreachableAPIKeyRow) Scan(...any) error { return errUnexpectedAPIKeyQuery }

func TestAPIKeyRevokeRejectsMalformedIDsWithoutQuery(t *testing.T) {
	t.Parallel()

	pool := &unreachableAPIKeyPool{}
	api := &apiKeyAPI{pool: pool}
	actor := organizationActor{userID: "user-1", organizationID: "org-1", role: "admin"}
	ids := []string{
		"",
		"not-a-uuid",
		"7f1c9d1e4b2a4c3d8e5f0a1b2c3d4e5f",
		"{7f1c9d1e-4b2a-4c3d-8e5f-0a1b2c3d4e5f}",
		"urn:uuid:7f1c9d1e-4b2a-4c3d-8e5f-0a1b2c3d4e5f",
		"7f1c9d1e-4b2a-0c3d-8e5f-0a1b2c3d4e5f", // version 0
		"7f1c9d1e-4b2a-4c3d-7e5f-0a1b2c3d4e5f", // NCS variant
		"7f1c9d1e-4b2a-4c3d-8e5f-0a1b2c3d4e5f' or '1'='1",
	}
	for _, id := range ids {
		req := httptest.NewRequest(http.MethodDelete, "/", nil)
		req.SetPathValue("apiKeyId", id)
		_, _, err := api.revokeAPIKeyHandler(req, actor)
		var failure *apiKeyError
		require.ErrorAs(t, err, &failure, id)
		require.Equal(t, http.StatusNotFound, failure.status, id)
		require.Equal(t, "api_key_not_found", failure.code, id)
	}
	require.Zero(t, pool.calls.Load())

	for _, id := range []string{
		" 7F1C9D1E-4B2A-4C3D-8E5F-0A1B2C3D4E5F ",
		"00000000-0000-0000-0000-000000000000",
		"ffffffff-ffff-ffff-ffff-ffffffffffff",
	} {
		req := httptest.NewRequest(http.MethodDelete, "/", nil)
		req.SetPathValue("apiKeyId", id)
		_, _, err := api.revokeAPIKeyHandler(req, actor)
		require.ErrorIs(t, err, errUnexpectedAPIKeyQuery, "valid id %q reaches the database", id)
	}
}

func TestAPIKeyConcurrentRevocationEmitsOnce(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	key := env.mustCreate(t, member, `{"name":"raced"}`).APIKey

	const racers = 8
	codes := make([]int, racers)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range racers {
		as := member
		if i%2 == 1 {
			as = env.owner
		}
		wg.Go(func() {
			<-start
			codes[i] = env.request(as, http.MethodDelete, "/"+key.ID, "").Code
		})
	}
	close(start)
	wg.Wait()

	for i, code := range codes {
		require.Equal(t, http.StatusNoContent, code, "racer %d", i)
	}
	require.NotNil(t, env.revokedAt(t, key.ID))
	require.Len(t, env.audit.byAction(patRevokedAuditAction), 1)
	require.Len(t, revokedActivity(env), 1)
}

func TestAPIKeyRevokeRacesMembershipRemovalEmitsOnce(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&lockedWriter{w: &buf}, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	for range 5 {
		member := env.addMember(t, "member")
		key := env.mustCreate(t, member, `{"name":"raced"}`).APIKey
		buf.Reset()
		manualBefore := len(env.audit.byAction(patRevokedAuditAction))

		var (
			wg         sync.WaitGroup
			code       int
			removalErr error
		)
		start := make(chan struct{})
		wg.Go(func() {
			<-start
			code = env.request(env.owner, http.MethodDelete, "/"+key.ID, "").Code
		})
		wg.Go(func() {
			<-start
			members := &memberAPI{pool: env.scope.Pool}
			removalErr = members.revokeOrganizationMembershipAccess(context.Background(),
				memberActor{userID: env.owner.userID, organizationID: env.scope.OrganizationID},
				organizationMember{localUserID: member.userID, role: "member"})
		})
		close(start)
		wg.Wait()

		require.NoError(t, removalErr)
		require.Equal(t, http.StatusNoContent, code)
		require.NotNil(t, env.revokedAt(t, key.ID))
		manual := len(env.audit.byAction(patRevokedAuditAction)) - manualBefore
		removal := strings.Count(buf.String(), `"msg":"pat.revoked"`)
		require.Equal(t, 1, manual+removal, "exactly one revocation audit (manual=%d removal=%d)", manual, removal)
	}
}

// A membership removal that commits while create waits for the membership
// lock leaves no token behind.
func TestAPIKeyCreateWaitsForConcurrentMembershipRemoval(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	ctx := t.Context()

	tx, err := env.scope.Pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(context.Background()) }()
	_, err = tx.Exec(ctx, `select 1 from organization_memberships where organization_id=$1 and user_id=$2 for update`,
		env.scope.OrganizationID, member.userID)
	require.NoError(t, err)

	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- env.request(member, http.MethodPost, "", `{"name":"racing"}`) }()
	waitForLockWait(t, env, "for share")

	_, err = tx.Exec(ctx, `delete from organization_memberships where organization_id=$1 and user_id=$2`,
		env.scope.OrganizationID, member.userID)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `
        update organization_api_keys set revoked_at=now()
        where organization_id=$1 and created_by_user_id=$2 and revoked_at is null`,
		env.scope.OrganizationID, member.userID)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	rec := <-done
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	require.Equal(t, "organization_access_denied", decodeAPIKeyBody[apiKeyErrorResponse](t, rec).Error)
	var keys int
	require.NoError(t, env.scope.Pool.QueryRow(ctx,
		`select count(*)::int from organization_api_keys where created_by_user_id=$1`, member.userID).Scan(&keys))
	require.Zero(t, keys)
	require.Empty(t, env.audit.byAction(patCreatedAuditAction))
}

// A membership removal that starts while create holds the membership lock
// waits for the token to commit and then revokes it.
func TestAPIKeyMembershipRemovalWaitsForCreateAndRevokes(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")

	inAudit := make(chan struct{})
	release := make(chan struct{})
	releaseCreate := sync.OnceFunc(func() { close(release) })
	// Unblock create on failure too, or its open transaction stalls cleanup.
	t.Cleanup(releaseCreate)
	var once sync.Once
	env.audit.mu.Lock()
	env.audit.hook = func() {
		once.Do(func() {
			close(inAudit)
			<-release
		})
	}
	env.audit.mu.Unlock()

	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- env.request(member, http.MethodPost, "", `{"name":"racing"}`) }()
	select {
	case <-inAudit:
	case <-time.After(10 * time.Second):
		t.Fatal("create never reached the audit write")
	}

	removal := make(chan error, 1)
	go func() {
		members := &memberAPI{pool: env.scope.Pool}
		removal <- members.revokeOrganizationMembershipAccess(context.Background(),
			memberActor{userID: env.owner.userID, organizationID: env.scope.OrganizationID},
			organizationMember{localUserID: member.userID, role: "member"})
	}()
	waitForLockWait(t, env, "delete from organization_memberships")
	releaseCreate()

	rec := <-done
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.NoError(t, <-removal)
	created := decodeAPIKeyBody[apiKeyCreateResponse](t, rec)
	require.NotNil(t, env.revokedAt(t, created.APIKey.ID), "removal must revoke the token it waited for")
}

type failingPatRevokedHandler struct{ slog.Handler }

func (h failingPatRevokedHandler) Handle(ctx context.Context, record slog.Record) error {
	if record.Message == patRevokedAuditAction {
		return errors.New("audit sink unavailable")
	}
	return h.Handler.Handle(ctx, record)
}

func captureFailingPatRevokedLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(failingPatRevokedHandler{slog.NewJSONHandler(&lockedWriter{w: &buf}, nil)}))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return &buf
}

func requirePatAuditFailureLogged(t *testing.T, logs string, organizationID, tokenID string) {
	t.Helper()
	var found map[string]any
	for _, line := range strings.Split(strings.TrimSpace(logs), "\n") {
		var entry map[string]any
		if json.Unmarshal([]byte(line), &entry) == nil && entry["msg"] == "pat_audit_emit_failed" {
			found = entry
		}
	}
	require.NotNil(t, found, logs)
	require.Equal(t, "ERROR", found["level"])
	require.Equal(t, patRevokedAuditAction, found["action"])
	require.Equal(t, organizationID, found["organization_id"])
	require.Equal(t, tokenID, found["token_id"])
	require.Equal(t, "audit sink unavailable", found["error"])
}

func TestAPIKeyRevokeReportsAuditFailureWithoutUndoingRevocation(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	created := env.mustCreate(t, env.owner, `{"name":"audit down"}`).APIKey
	buf := captureFailingPatRevokedLogs(t)
	env.api.audit = patAuditor{}

	rec := env.request(env.owner, http.MethodDelete, "/"+created.ID, "")
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	require.NotNil(t, env.revokedAt(t, created.ID))
	require.Len(t, revokedActivity(env), 1)

	logs := buf.String()
	requirePatAuditFailureLogged(t, logs, env.scope.OrganizationID, created.ID)
	require.NotContains(t, logs, created.Key)
	require.NotContains(t, logs, hashAPIKey(created.Key))
}

func TestMembershipRemovalReportsPatAuditFailure(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	created := env.mustCreate(t, member, `{"name":"leaving"}`).APIKey
	buf := captureFailingPatRevokedLogs(t)

	members := &memberAPI{pool: env.scope.Pool}
	require.NoError(t, members.revokeOrganizationMembershipAccess(t.Context(),
		memberActor{userID: env.owner.userID, organizationID: env.scope.OrganizationID},
		organizationMember{localUserID: member.userID, role: "member"}))
	require.NotNil(t, env.revokedAt(t, created.ID))

	logs := buf.String()
	requirePatAuditFailureLogged(t, logs, env.scope.OrganizationID, created.ID)
	require.NotContains(t, logs, created.Key)
	require.NotContains(t, logs, hashAPIKey(created.Key))
}
