package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const (
	memberBodyLimit                 = 64 << 10
	memberRequestTimeout            = 30 * time.Second
	memberRevokeReconcileTimeout    = 15 * time.Second
	invitedWorkosUserIDPrefix       = "invited_user_"
	replacingWorkosMembershipID     = "replacing"
	defaultWorkspaceTeamSlug        = "default"
	defaultWorkspaceTeamName        = "Default team"
	workspaceResourceSeatsFeatureID = "seats"
	localSeatFallbackLimit          = 1
	memberWorkosUserIDMaxLen        = 256
	memberEmailMaxLen               = 320
)

type memberAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	workos     memberWorkos
	seats      memberSeatChecker
	analytics  memberProductUsageTracker
}

type memberActor struct {
	userID, organizationID, workosOrganizationID, role, workosUserID string
}

func (a memberActor) canListMembers() bool {
	return hasOrganizationCapability(a.role, "workspace:read")
}

func (a memberActor) canManageMembers() bool {
	return hasOrganizationCapability(a.role, "members:invite")
}

type memberError struct {
	status        int
	code, message string
	details       map[string]any
}

func (e *memberError) Error() string { return e.code }

func memberFailure(status int, code, message string) error {
	return &memberError{status: status, code: code, message: message}
}

func memberFailureDetails(status int, code, message string, details map[string]any) error {
	return &memberError{status: status, code: code, message: message, details: details}
}

func memberJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "member_response_write_failed")
	}
}

func writeMemberError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *memberError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "member_request_failed", phase, err)
		failure = &memberError{500, "internal_error", "Internal server error", nil}
	} else {
		logRequestFailure(r, "member_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	body := map[string]any{"error": failure.code, "message": failure.message}
	if len(failure.details) > 0 {
		body["details"] = failure.details
	}
	memberJSON(r.Context(), w, failure.status, body)
}

func formatMemberTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func (api *memberAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	m := orgRoutePrefix + "/members"
	route := func(pattern string, fn func(*http.Request, memberActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+m, bindActor(api, (*memberAPI).listMembersHandler))
	route("POST "+m, bindActor(api, (*memberAPI).inviteMemberHandler))
	route("PATCH "+m+"/{workosUserId}", bindActor(api, (*memberAPI).updateMemberHandler))
	route("DELETE "+m+"/{workosUserId}", bindActor(api, (*memberAPI).deleteMemberHandler))
}

func (api *memberAPI) actor(ctx context.Context, claims AuthClaims, slug string) (memberActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return memberActor{}, mapOrganizationAccessCode(err, func(status int, code string) error {
			return memberFailure(status, code, organizationAccessMessage(code))
		})
	}
	var workosOrg string
	err = api.pool.QueryRow(ctx, `select workos_organization_id from organizations where id=$1`, resolved.organizationID).Scan(&workosOrg)
	if err != nil {
		return memberActor{}, err
	}
	return memberActor{
		userID:               resolved.userID,
		organizationID:       resolved.organizationID,
		workosOrganizationID: workosOrg,
		role:                 resolved.role,
		workosUserID:         claims.UserID,
	}, nil
}

func organizationAccessMessage(code string) string {
	switch code {
	case "organization_access_denied":
		return "Organization access denied"
	case "workos_membership_lookup_failed":
		return "Organization membership could not be verified"
	default:
		return code
	}
}

func (api *memberAPI) handle(fn func(*http.Request, memberActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeMemberError(w, r, "origin_guard", memberFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		if api.pool == nil {
			writeMemberError(w, r, "availability", memberFailure(503, "member_unavailable", "Member API is unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), memberRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeMemberError(w, r, "auth", memberFailure(401, "unauthorized", "Unauthorized"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeMemberError(w, r, "resolve_actor", err)
			return
		}
		if r.Method == http.MethodPost || r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, memberBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeMemberError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		memberJSON(r.Context(), w, status, value)
	})
}

func (api *memberAPI) listMembersHandler(r *http.Request, actor memberActor) (any, int, error) {
	return api.listMembers(r.Context(), actor)
}

func (api *memberAPI) inviteMemberHandler(r *http.Request, actor memberActor) (any, int, error) {
	return api.inviteMember(r.Context(), actor, r)
}

func (api *memberAPI) updateMemberHandler(r *http.Request, actor memberActor) (any, int, error) {
	workosUserID, err := requireMemberWorkosUserID(r)
	if err != nil {
		return nil, 0, err
	}
	return api.updateMember(r.Context(), actor, workosUserID, r)
}

func (api *memberAPI) deleteMemberHandler(r *http.Request, actor memberActor) (any, int, error) {
	workosUserID, err := requireMemberWorkosUserID(r)
	if err != nil {
		return nil, 0, err
	}
	status, err := api.deleteMember(r.Context(), actor, workosUserID)
	return nil, status, err
}

func requireMemberWorkosUserID(r *http.Request) (string, error) {
	workosUserID := strings.TrimSpace(r.PathValue("workosUserId"))
	if workosUserID == "" || len(workosUserID) > memberWorkosUserIDMaxLen {
		return "", memberFailure(404, "member_not_found", "Workspace member not found")
	}
	return workosUserID, nil
}

func isActiveOrganizationMembership(workosMembershipID *string) bool {
	if workosMembershipID == nil {
		return false
	}
	id := strings.TrimSpace(*workosMembershipID)
	return id != "" && id != replacingWorkosMembershipID
}

func isPendingOrganizationMembership(workosMembershipID *string) bool {
	return !isActiveOrganizationMembership(workosMembershipID)
}

func shouldCleanupPlaceholderUserOnMemberRemoval(workosUserID string) bool {
	return strings.HasPrefix(workosUserID, invitedWorkosUserIDPrefix)
}

func resolveMemberStatus(workosMembershipID *string) string {
	if isPendingOrganizationMembership(workosMembershipID) {
		return "invited"
	}
	return "active"
}

func shouldSyncMembershipToWorkos(workos memberWorkos, workosMembershipID *string) bool {
	return workos != nil && isActiveOrganizationMembership(workosMembershipID)
}

func formatMemberDisplayName(firstName, lastName, email string) string {
	parts := make([]string, 0, 2)
	if first := strings.TrimSpace(firstName); first != "" {
		parts = append(parts, first)
	}
	if last := strings.TrimSpace(lastName); last != "" {
		parts = append(parts, last)
	}
	if len(parts) > 0 {
		return strings.Join(parts, " ")
	}
	return email
}
