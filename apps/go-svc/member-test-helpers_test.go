package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type stubMemberWorkos struct {
	mu sync.Mutex

	sendErr    error
	sendRetry  error
	sendCalls  int
	resendErr  error
	resendID   string
	revokeErr  error
	revokeID   string
	pendingID  string
	findErr    error
	updateErr  error
	updateID   string
	updateRole string
	deleteErr  error
	deleteID   string
}

func (s *stubMemberWorkos) SendInvitation(_ context.Context, _ memberInvitationInput) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sendCalls++
	if s.sendCalls == 1 && s.sendErr != nil {
		return s.sendErr
	}
	if s.sendCalls > 1 && s.sendRetry != nil {
		return s.sendRetry
	}
	return nil
}

func (s *stubMemberWorkos) ResendInvitation(_ context.Context, invitationID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resendID = invitationID
	return s.resendErr
}

func (s *stubMemberWorkos) RevokeInvitation(_ context.Context, invitationID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revokeID = invitationID
	return s.revokeErr
}

func (s *stubMemberWorkos) FindPendingInvitation(_ context.Context, _, _ string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.findErr != nil {
		return "", false, s.findErr
	}
	if s.pendingID == "" {
		return "", false, nil
	}
	return s.pendingID, true, nil
}

func (s *stubMemberWorkos) UpdateOrganizationMembershipRole(_ context.Context, membershipID, roleSlug string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.updateID = membershipID
	s.updateRole = roleSlug
	return s.updateErr
}

func (s *stubMemberWorkos) DeleteOrganizationMembership(_ context.Context, membershipID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleteID = membershipID
	return s.deleteErr
}

func memberTestAPI(t *testing.T, role string) (*memberAPI, *testenv.Scope, *stubMemberWorkos) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	workos := &stubMemberWorkos{}
	return &memberAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		workos:     workos,
		seats:      allowMemberSeats{},
	}, scope, workos
}

func memberRequest(api *memberAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func memberRequestForTest(api *memberAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustInvitedMember(t *testing.T, scope *testenv.Scope, email, role string) (userID, workosUserID string) {
	t.Helper()
	userID = uuid.NewString()
	workosUserID = invitedWorkosUserIDPrefix + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into users (id, workos_user_id, email)
        values ($1, $2, $3)`, userID, workosUserID, email)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, null, $3)`,
		scope.OrganizationID, userID, role)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = scope.Pool.Exec(t.Context(), `delete from users where id=$1`, userID)
	})
	return userID, workosUserID
}

func mustActiveMember(t *testing.T, scope *testenv.Scope, email, role string) (userID, workosUserID, membershipID string) {
	t.Helper()
	userID = uuid.NewString()
	workosUserID = "user_" + uuid.NewString()
	membershipID = "om_" + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into users (id, workos_user_id, email)
        values ($1, $2, $3)`, userID, workosUserID, email)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, $4)`,
		scope.OrganizationID, userID, membershipID, role)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = scope.Pool.Exec(t.Context(), `delete from users where id=$1`, userID)
	})
	return userID, workosUserID, membershipID
}
