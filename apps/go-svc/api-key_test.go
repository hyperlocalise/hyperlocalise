package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

var apiKeyTimestampFormat = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`)

func TestAPIKeyCreateIssuesHashedTokenOnce(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")

	rec := env.request(env.owner, http.MethodPost, "", `{"name":"  CI deploy  "}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	created := decodeAPIKeyBody[apiKeyCreateResponse](t, rec)
	key := created.APIKey

	require.Regexp(t, apiKeyFormat, key.Key)
	require.Equal(t, "CI deploy", key.Name)
	require.Equal(t, key.Key[:8], key.KeyPrefix)
	require.Equal(t, []string{"jobs:read", "jobs:write", "files:read", "files:write"}, key.Permissions)
	require.Regexp(t, apiKeyTimestampFormat, key.CreatedAt)
	require.NotNil(t, key.Owner)
	require.Equal(t, env.owner.userID, key.Owner.UserID)
	require.NotEmpty(t, key.Owner.Email)

	var (
		keyHash, keyPrefix, createdBy string
		row                           string
		revokedAt                     *string
	)
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(), `
        select key_hash, key_prefix, created_by_user_id::text, revoked_at::text, row_to_json(k)::text
        from organization_api_keys k where id=$1`, key.ID).
		Scan(&keyHash, &keyPrefix, &createdBy, &revokedAt, &row))
	require.Equal(t, hashAPIKey(key.Key), keyHash)
	require.Equal(t, key.KeyPrefix, keyPrefix)
	require.Equal(t, env.owner.userID, createdBy)
	require.Nil(t, revokedAt)
	require.NotContains(t, row, key.Key, "plaintext must never be stored")

	audits := env.audit.byAction(patCreatedAuditAction)
	require.Len(t, audits, 1)
	target := audits[0]["audit"].(map[string]any)["target"].(map[string]any)
	require.Equal(t, key.ID, target["id"])
	require.Equal(t, env.owner.userID, target["ownerUserId"])

	events := env.activity.recorded()
	require.Len(t, events, 1)
	require.Equal(t, "personal_access_token_created", events[0].EventType)
	require.Equal(t, patAuditTarget, events[0].TargetKind)
	require.Equal(t, key.ID, events[0].TargetID)
	require.Equal(t, env.owner.userID, events[0].ActorUserID)
	require.Equal(t, map[string]any{
		"keyPrefix":   key.KeyPrefix,
		"permissions": []string{"jobs:read", "jobs:write", "files:read", "files:write"},
		"tokenId":     key.ID,
	}, events[0].Payload)

	listRec := env.request(env.owner, http.MethodGet, "", "")
	require.Equal(t, http.StatusOK, listRec.Code)
	require.NotContains(t, listRec.Body.String(), key.Key)
	require.NotContains(t, listRec.Body.String(), keyHash)
	require.NotContains(t, listRec.Body.String(), `"key"`)
}

func TestAPIKeyCreateIgnoresClientSuppliedOwner(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	other := env.addMember(t, "member")

	body := `{"name":"Mine","owner":"` + other.userID + `","createdByUserId":"` + other.userID + `"}`
	created := env.mustCreate(t, env.owner, body)
	require.Equal(t, env.owner.userID, created.APIKey.Owner.UserID)
}

func TestAPIKeyCreateValidation(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")

	cases := map[string]string{
		"empty body":           ``,
		"malformed json":       `{"name":`,
		"trailing data":        `{"name":"ok"} {}`,
		"array body":           `[{"name":"ok"}]`,
		"null body":            `null`,
		"missing name":         `{}`,
		"null name":            `{"name":null}`,
		"numeric name":         `{"name":42}`,
		"blank name":           `{"name":"   "}`,
		"bom only name":        `{"name":"\ufeff \u00a0"}`,
		"name too long":        `{"name":"` + strings.Repeat("a", 129) + `"}`,
		"emoji name too long":  `{"name":"` + strings.Repeat("😀", 65) + `"}`,
		"null permissions":     `{"name":"ok","permissions":null}`,
		"object permissions":   `{"name":"ok","permissions":{"jobs:read":true}}`,
		"string permissions":   `{"name":"ok","permissions":"jobs:read"}`,
		"unknown scope":        `{"name":"ok","permissions":["queries:read"]}`,
		"null scope":           `{"name":"ok","permissions":[null]}`,
		"api_keys scope":       `{"name":"ok","permissions":["api_keys:write"]}`,
		"capability not scope": `{"name":"ok","permissions":["projects:read"]}`,
	}
	for name, body := range cases {
		rec := env.request(env.owner, http.MethodPost, "", body)
		require.Equal(t, http.StatusBadRequest, rec.Code, "%s: %s", name, rec.Body.String())
		failure := decodeAPIKeyBody[apiKeyErrorResponse](t, rec)
		require.Equal(t, "invalid_api_key_payload", failure.Error, name)
		require.Equal(t, "Invalid API key payload", failure.Message, name)
	}

	rec := env.request(env.owner, http.MethodPost, "", `{"name":"`+strings.Repeat("a", apiKeyBodyLimit)+`"}`)
	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code, rec.Body.String())
	require.Equal(t, 0, env.countKeys(t))
	require.Empty(t, env.audit.byAction(patCreatedAuditAction))

	rec = env.request(env.owner, http.MethodPost, "", `{"name":"x","permissions":["jobs:read","bogus"]}`)
	failure := decodeAPIKeyBody[apiKeyErrorResponse](t, rec)
	issues := failure.Details["issues"].([]any)
	require.Len(t, issues, 1)
	require.Equal(t, []any{"permissions", float64(1)}, issues[0].(map[string]any)["path"])

	created := env.mustCreate(t, env.owner, `{"name":"`+strings.Repeat("😀", 64)+`"}`)
	require.Equal(t, strings.Repeat("😀", 64), created.APIKey.Name)
	created = env.mustCreate(t, env.owner, `{"name":"\ufeff Release bot \u00a0"}`)
	require.Equal(t, "Release bot", created.APIKey.Name)
}

func TestAPIKeyCreateCapsScopesByRole(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	translator := env.addMember(t, "translator")

	created := env.mustCreate(t, member, `{"name":"Read only"}`)
	require.Equal(t, []string{"jobs:read", "files:read"}, created.APIKey.Permissions)

	rec := env.request(member, http.MethodPost, "", `{"name":"Writer","permissions":["jobs:read","jobs:write"]}`)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	failure := decodeAPIKeyBody[apiKeyErrorResponse](t, rec)
	require.Equal(t, "api_key_permissions_not_grantable", failure.Error)
	require.Equal(t, "Requested API key permissions exceed the owner's role", failure.Message)
	require.Equal(t, []any{"jobs:write"}, failure.Details["permissions"])

	created = env.mustCreate(t, translator, `{"name":"Full"}`)
	require.Equal(t, []string{"jobs:read", "jobs:write", "files:read", "files:write"}, created.APIKey.Permissions)
}

func TestAPIKeyCreatePinsEmptyAndDuplicatePermissions(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")

	empty := env.mustCreate(t, env.owner, `{"name":"Whoami","permissions":[]}`)
	require.Equal(t, []string{}, empty.APIKey.Permissions)

	dup := env.mustCreate(t, env.owner, `{"name":"Dup","permissions":["files:read","jobs:read","files:read"]}`)
	require.Equal(t, []string{"files:read", "jobs:read", "files:read"}, dup.APIKey.Permissions)

	var stored string
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(),
		`select permissions::text from organization_api_keys where id=$1`, empty.APIKey.ID).Scan(&stored))
	require.Equal(t, "[]", stored)
}

func TestAPIKeyCreateAuditFailureRevokesToken(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	env.audit.fail = errors.New("audit sink unavailable")

	rec := env.request(env.owner, http.MethodPost, "", `{"name":"Unaudited"}`)
	require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), `"key"`)
	require.NotContains(t, rec.Body.String(), "hl_")
	failure := decodeAPIKeyBody[apiKeyErrorResponse](t, rec)
	require.Equal(t, "access_token_audit_failed", failure.Error)
	require.Equal(t, "The token could not be recorded safely and was not issued", failure.Message)

	listed := env.list(t, env.owner)
	require.Len(t, listed.APIKeys, 1)
	require.Equal(t, "Unaudited", listed.APIKeys[0].Name)
	require.NotNil(t, listed.APIKeys[0].RevokedAt)
	require.NotNil(t, env.revokedAt(t, listed.APIKeys[0].ID))
	require.Empty(t, env.activity.recorded())
}

func TestAPIKeyCreateSucceedsWhenActivityPublishFails(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	env.api.activityLog = failingActivityLogPublisher{}

	created := env.mustCreate(t, env.owner, `{"name":"Queue down"}`)
	require.NotEmpty(t, created.APIKey.Key)
	require.Nil(t, env.revokedAt(t, created.APIKey.ID))
}

func TestAPIKeyCreateNeverLogsSecrets(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	env.api.audit = patAuditor{}
	env.api.activityLog = failingActivityLogPublisher{}

	created := env.mustCreate(t, env.owner, `{"name":"secret-body-marker-1"}`)
	logs := buf.String()
	require.Contains(t, logs, `"msg":"pat.created"`)
	require.NotContains(t, logs, created.APIKey.Key)
	require.NotContains(t, logs, hashAPIKey(created.APIKey.Key))
	require.NotContains(t, logs, "secret-body-marker-1")

	buf.Reset()
	env.audit.fail = errors.New("audit sink unavailable")
	env.api.audit = env.audit.auditor()
	rec := env.request(env.owner, http.MethodPost, "", `{"name":"secret-body-marker-2"}`,
		"Authorization", "Bearer secret-header-marker")
	require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
	var keyHash string
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(),
		`select key_hash from organization_api_keys where name='secret-body-marker-2'`).Scan(&keyHash))
	logs = buf.String()
	require.Contains(t, logs, "access_token_audit_failed")
	require.NotContains(t, logs, keyHash)
	require.NotContains(t, logs, "secret-body-marker-2")
	require.NotContains(t, logs, "secret-header-marker")
	require.NotContains(t, logs, "hl_")
}

func TestAPIKeyListVisibility(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")
	other := env.addMember(t, "developer")
	manager := env.addMember(t, "localization_manager")
	loner := env.addMember(t, "translator")

	adminKey := env.mustCreate(t, env.owner, `{"name":"admin"}`).APIKey
	memberKey := env.mustCreate(t, member, `{"name":"member"}`).APIKey
	otherKey := env.mustCreate(t, other, `{"name":"other"}`).APIKey

	foreign := newAPIKeyTestEnv(t, "admin")
	foreign.mustCreate(t, foreign.owner, `{"name":"foreign"}`)

	ids := func(list apiKeyListResponse) []string {
		out := make([]string, 0, len(list.APIKeys))
		for _, key := range list.APIKeys {
			out = append(out, key.ID)
		}
		return out
	}

	require.Equal(t, []string{memberKey.ID}, ids(env.list(t, member)))
	require.Equal(t, []string{otherKey.ID}, ids(env.list(t, other)))
	all := []string{adminKey.ID, memberKey.ID, otherKey.ID}
	require.Equal(t, all, ids(env.list(t, env.owner)))
	managed := env.list(t, manager)
	require.Equal(t, all, ids(managed))
	require.Equal(t, member.userID, managed.APIKeys[1].Owner.UserID)
	require.Equal(t, other.userID, managed.APIKeys[2].Owner.UserID)

	for _, key := range managed.APIKeys {
		require.Regexp(t, apiKeyTimestampFormat, key.CreatedAt)
		require.Nil(t, key.LastUsedAt)
		require.Nil(t, key.RevokedAt)
	}

	rec := env.request(loner, http.MethodGet, "", "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"apiKeys":[]}`, rec.Body.String())
}

func TestAPIKeyListFormatsUsageAndLegacyOwnerlessTokens(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")
	member := env.addMember(t, "member")

	used := env.mustCreate(t, member, `{"name":"used"}`).APIKey
	_, err := env.scope.Pool.Exec(t.Context(),
		`update organization_api_keys set last_used_at='2026-01-02T03:04:05.678912Z' where id=$1`, used.ID)
	require.NoError(t, err)

	var legacyID string
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(), `
        insert into organization_api_keys (organization_id, name, key_hash, key_prefix, created_by_user_id, updated_at)
        values ($1, 'legacy', $2, 'hl_Legac', null, '2026-03-04T05:06:07.123456Z')
        returning id`, env.scope.OrganizationID, hashAPIKey("legacy-"+env.scope.OrganizationID)).Scan(&legacyID))

	listed := env.list(t, env.owner)
	require.Len(t, listed.APIKeys, 2)
	byID := map[string]int{}
	for i, key := range listed.APIKeys {
		byID[key.ID] = i
	}
	usedRow := listed.APIKeys[byID[used.ID]]
	require.Equal(t, "2026-01-02T03:04:05.678Z", *usedRow.LastUsedAt)
	legacy := listed.APIKeys[byID[legacyID]]
	require.Nil(t, legacy.Owner)
	require.NotNil(t, legacy.RevokedAt, "an ownerless token must never read as active")
	require.Equal(t, "2026-03-04T05:06:07.123Z", *legacy.RevokedAt)

	memberList := env.list(t, member)
	require.Len(t, memberList.APIKeys, 1)
	require.Equal(t, used.ID, memberList.APIKeys[0].ID)
}

func TestAPIKeyRoutesRequireAuthorizedMembership(t *testing.T) {
	env := newAPIKeyTestEnv(t, "admin")

	mux := http.NewServeMux()
	env.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: env.owner.workosUserID}})
	req, err := http.NewRequest(http.MethodGet, env.scope.OrgPath("/api-keys"), nil)
	require.NoError(t, err)
	unauthenticated := httptest.NewRecorder()
	mux.ServeHTTP(unauthenticated, req)
	require.Equal(t, http.StatusUnauthorized, unauthenticated.Code)

	rec := apiKeyRequest(env.api, env.owner.workosUserID, http.MethodGet, "/v1/orgs/not-my-org/api-keys", "")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Equal(t, "organization_access_denied", decodeAPIKeyBody[apiKeyErrorResponse](t, rec).Error)

	stranger := newAPIKeyTestEnv(t, "admin")
	rec = apiKeyRequest(env.api, stranger.owner.workosUserID, http.MethodGet, env.scope.OrgPath("/api-keys"), "")
	require.Equal(t, http.StatusForbidden, rec.Code)

	env.mu.Lock()
	env.lookupErr = errors.New("workos down")
	env.mu.Unlock()
	rec = env.request(env.owner, http.MethodGet, "", "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Equal(t, "workos_membership_lookup_failed", decodeAPIKeyBody[apiKeyErrorResponse](t, rec).Error)
	env.mu.Lock()
	env.lookupErr = nil
	env.mu.Unlock()

	rec = env.request(env.owner, http.MethodPost, "", `{"name":"csrf"}`, "Origin", "https://evil.example")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Equal(t, "forbidden", decodeAPIKeyBody[apiKeyErrorResponse](t, rec).Error)
	rec = env.request(env.owner, http.MethodDelete, "/"+"00000000-0000-0000-0000-000000000000", "", "Sec-Fetch-Site", "cross-site")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Equal(t, 0, env.countKeys(t))
}

func TestAPIKeyRoutesRequireDatabase(t *testing.T) {
	t.Parallel()

	api := &apiKeyAPI{}
	rec := apiKeyRequest(api, "user_1", http.MethodGet, "/v1/orgs/acme/api-keys", "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Equal(t, "api_key_unavailable", decodeAPIKeyBody[apiKeyErrorResponse](t, rec).Error)
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}

func TestParseCreateAPIKeyBodyNullFields(t *testing.T) {
	t.Parallel()

	for _, body := range []string{`{"name":"ok","permissions":null}`, `{"name":null}`} {
		req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "/", strings.NewReader(body))
		require.NoError(t, err)
		_, err = parseCreateAPIKeyBody(req)
		var failure *apiKeyError
		require.ErrorAs(t, err, &failure, body)
		require.Equal(t, "invalid_api_key_payload", failure.code, body)
		encoded, marshalErr := json.Marshal(failure.details)
		require.NoError(t, marshalErr)
		require.Contains(t, string(encoded), "expected", body)
	}
}
