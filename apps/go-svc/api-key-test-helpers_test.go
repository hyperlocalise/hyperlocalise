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
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

type apiKeyIdentity struct {
	userID, workosUserID, membershipID, role string
}

// recordingPatAuditor captures audit records and can be switched to fail or block.
type recordingPatAuditor struct {
	mu      sync.Mutex
	records []map[string]any
	fail    error
	hook    func()
}

func (a *recordingPatAuditor) auditor() patAuditor {
	return patAuditor{write: func(ctx context.Context, record slog.Record) error {
		a.mu.Lock()
		hook, fail := a.hook, a.fail
		a.mu.Unlock()
		if hook != nil {
			hook()
		}
		if fail != nil {
			return fail
		}
		var buf bytes.Buffer
		if err := slog.NewJSONHandler(&buf, nil).Handle(ctx, record); err != nil {
			return err
		}
		var entry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
			return err
		}
		a.mu.Lock()
		a.records = append(a.records, entry)
		a.mu.Unlock()
		return nil
	}}
}

func (a *recordingPatAuditor) byAction(action string) []map[string]any {
	a.mu.Lock()
	defer a.mu.Unlock()
	var out []map[string]any
	for _, entry := range a.records {
		if entry["msg"] == action {
			out = append(out, entry)
		}
	}
	return out
}

type failingActivityLogPublisher struct{}

func (failingActivityLogPublisher) Publish(context.Context, activityLogEventInput) error {
	return errors.New("queue unavailable")
}

func (failingActivityLogPublisher) Ping(context.Context) error { return nil }

type apiKeyTestEnv struct {
	scope     *testenv.Scope
	api       *apiKeyAPI
	audit     *recordingPatAuditor
	activity  *recordingActivityLogPublisher
	mu        sync.Mutex
	members   map[string]apiKeyIdentity // by WorkOS membership id
	owner     apiKeyIdentity
	lookupErr error
}

// newAPIKeyTestEnv seeds an organization whose seeded user holds role.
func newAPIKeyTestEnv(t *testing.T, role string) *apiKeyTestEnv {
	t.Helper()
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: role})
	env := &apiKeyTestEnv{
		scope:    scope,
		audit:    &recordingPatAuditor{},
		activity: &recordingActivityLogPublisher{},
		members:  map[string]apiKeyIdentity{},
	}
	env.owner = apiKeyIdentity{userID: scope.UserID, workosUserID: scope.WorkOSUserID, membershipID: scope.WorkOSMembershipID, role: role}
	env.members[scope.WorkOSMembershipID] = env.owner
	env.api = &apiKeyAPI{
		pool:        scope.Pool,
		membership:  env.lookup,
		activityLog: env.activity,
		audit:       env.audit.auditor(),
	}
	return env
}

func (env *apiKeyTestEnv) lookup(_ context.Context, membershipID string) (*workos.UserOrganizationMembership, error) {
	env.mu.Lock()
	defer env.mu.Unlock()
	if env.lookupErr != nil {
		return nil, env.lookupErr
	}
	identity, ok := env.members[membershipID]
	if !ok {
		return nil, &workos.APIError{StatusCode: http.StatusNotFound}
	}
	return &workos.UserOrganizationMembership{
		ID:             identity.membershipID,
		UserID:         identity.workosUserID,
		OrganizationID: env.scope.WorkOSOrganizationID,
		Status:         "active",
		Role:           &workos.SlimRole{Slug: identity.role},
	}, nil
}

func (env *apiKeyTestEnv) addMember(t *testing.T, role string) apiKeyIdentity {
	t.Helper()
	userID, workosUserID, membershipID := mustActiveMember(t, env.scope, uniqueTestEmail("api-key-"+role), role)
	identity := apiKeyIdentity{userID: userID, workosUserID: workosUserID, membershipID: membershipID, role: role}
	env.mu.Lock()
	env.members[membershipID] = identity
	env.mu.Unlock()
	return identity
}

func (env *apiKeyTestEnv) request(as apiKeyIdentity, method, suffix, body string, headers ...string) *httptest.ResponseRecorder {
	return apiKeyRequest(env.api, as.workosUserID, method, env.scope.OrgPath("/api-keys"+suffix), body, headers...)
}

func apiKeyRequest(api *apiKeyAPI, workosUserID, method, path, body string, headers ...string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: workosUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

type apiKeyCreateResponse struct {
	APIKey struct {
		ID          string       `json:"id"`
		Name        string       `json:"name"`
		KeyPrefix   string       `json:"keyPrefix"`
		Permissions []string     `json:"permissions"`
		CreatedAt   string       `json:"createdAt"`
		Key         string       `json:"key"`
		Owner       *apiKeyOwner `json:"owner"`
	} `json:"apiKey"`
}

type apiKeyListResponse struct {
	APIKeys []struct {
		ID          string       `json:"id"`
		Name        string       `json:"name"`
		KeyPrefix   string       `json:"keyPrefix"`
		Permissions []string     `json:"permissions"`
		LastUsedAt  *string      `json:"lastUsedAt"`
		RevokedAt   *string      `json:"revokedAt"`
		CreatedAt   string       `json:"createdAt"`
		Owner       *apiKeyOwner `json:"owner"`
	} `json:"apiKeys"`
}

type apiKeyErrorResponse struct {
	Error   string         `json:"error"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

func decodeAPIKeyBody[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	return out
}

func (env *apiKeyTestEnv) mustCreate(t *testing.T, as apiKeyIdentity, body string) apiKeyCreateResponse {
	t.Helper()
	rec := env.request(as, http.MethodPost, "", body)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	return decodeAPIKeyBody[apiKeyCreateResponse](t, rec)
}

func (env *apiKeyTestEnv) list(t *testing.T, as apiKeyIdentity) apiKeyListResponse {
	t.Helper()
	rec := env.request(as, http.MethodGet, "", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	return decodeAPIKeyBody[apiKeyListResponse](t, rec)
}

func (env *apiKeyTestEnv) revokedAt(t *testing.T, tokenID string) *time.Time {
	t.Helper()
	var revokedAt *time.Time
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(),
		`select revoked_at from organization_api_keys where id=$1`, tokenID).Scan(&revokedAt))
	return revokedAt
}

func (env *apiKeyTestEnv) countKeys(t *testing.T) int {
	t.Helper()
	var count int
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(),
		`select count(*)::int from organization_api_keys where organization_id=$1`, env.scope.OrganizationID).Scan(&count))
	return count
}

// waitForLockWait blocks until a backend running a statement containing
// fragment is waiting on a lock.
func waitForLockWait(t *testing.T, env *apiKeyTestEnv, fragment string) {
	t.Helper()
	require.Eventually(t, func() bool {
		var waiting int
		err := env.scope.Pool.QueryRow(context.Background(), `
            select count(*)::int from pg_stat_activity
            where wait_event_type = 'Lock' and query like '%' || $1 || '%' and pid <> pg_backend_pid()`,
			fragment).Scan(&waiting)
		return err == nil && waiting > 0
	}, 10*time.Second, 10*time.Millisecond, "no backend waiting on a lock for %q", fragment)
}
