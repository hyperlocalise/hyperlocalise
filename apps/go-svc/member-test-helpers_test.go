package main

import (
	"context"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type productUsageEvent struct {
	name       string
	properties map[string]string
}

type recordingMemberAnalytics struct {
	mu     sync.Mutex
	events []productUsageEvent
}

func (r *recordingMemberAnalytics) Track(_ context.Context, name string, properties map[string]string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.events = append(r.events, productUsageEvent{name: name, properties: maps.Clone(properties)})
	r.mu.Unlock()
}

func (r *recordingMemberAnalytics) snapshot() []productUsageEvent {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]productUsageEvent, len(r.events))
	copy(out, r.events)
	return out
}

func memberTestAnalytics(api *memberAPI) *recordingMemberAnalytics {
	rec, _ := api.analytics.(*recordingMemberAnalytics)
	return rec
}

func requireSeatAddedEvents(t *testing.T, api *memberAPI, count int) {
	t.Helper()
	events := memberTestAnalytics(api).snapshot()
	require.Len(t, events, count)
	for _, event := range events {
		require.Equal(t, productUsageSeatAddedEvent, event.name)
		require.Equal(t, map[string]string{
			"status": productUsageSeatAddedStatus,
			"source": workspaceResourceSeatsFeatureID,
		}, event.properties)
	}
}

type stubMemberWorkos struct {
	mu sync.Mutex

	sendErr     error
	sendRetry   error
	sendCalls   int
	resendErr   error
	resendID    string
	revokeErr   error
	revokeID    string
	pendingID   string
	findErr     error
	updateErr   error
	updateID    string
	updateRole  string
	deleteErr   error
	deleteID    string
	afterDelete func()
	afterSend   func()
}

func (s *stubMemberWorkos) SendInvitation(ctx context.Context, _ memberInvitationInput) error {
	s.mu.Lock()
	s.sendCalls++
	afterSend := s.afterSend
	var err error
	if s.sendCalls == 1 && s.sendErr != nil {
		err = s.sendErr
	} else if s.sendCalls > 1 && s.sendRetry != nil {
		err = s.sendRetry
	}
	s.mu.Unlock()
	if afterSend != nil {
		afterSend()
	}
	if err != nil {
		return err
	}
	return ctx.Err()
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
	s.deleteID = membershipID
	afterDelete := s.afterDelete
	err := s.deleteErr
	s.mu.Unlock()
	if afterDelete != nil {
		afterDelete()
	}
	return err
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
		analytics:  &recordingMemberAnalytics{},
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

func uniqueTestEmail(label string) string {
	return label + "-" + uuid.NewString() + "@example.com"
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
		_, _ = scope.Pool.Exec(t.Context(), `delete from organization_memberships where user_id=$1`, userID)
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
		_, _ = scope.Pool.Exec(t.Context(), `delete from organization_memberships where user_id=$1`, userID)
		_, _ = scope.Pool.Exec(t.Context(), `delete from users where id=$1`, userID)
	})
	return userID, workosUserID, membershipID
}
