package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
)

const publicAPIProtectedResourcePath = "/.well-known/oauth-protected-resource/api/v1"

type publicAPIPrincipal = publicauth.Principal

type publicAPIPrincipalKey struct{}

func publicAPIPrincipalFrom(ctx context.Context) (publicAPIPrincipal, bool) {
	principal, ok := ctx.Value(publicAPIPrincipalKey{}).(publicAPIPrincipal)
	return principal, ok
}

type publicAPIAuth struct {
	pool         dictionaryPool
	membership   organizationMembershipLookup
	agent        *publicauth.AgentVerifier
	publicAppURL string
}

func newPublicAPIAuthFromEnv(pool dictionaryPool, membership organizationMembershipLookup) *publicAPIAuth {
	return &publicAPIAuth{
		pool:         pool,
		membership:   membership,
		agent:        publicauth.NewAgentVerifierFromEnv(),
		publicAppURL: os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL"),
	}
}

type publicAPIError struct {
	status          int
	code, message   string
	wwwAuthenticate bool
	cause           error
}

func (e *publicAPIError) Error() string { return e.code }

func (e *publicAPIError) Unwrap() error { return e.cause }

func publicAPIFailure(status int, code, message string) error {
	return &publicAPIError{status: status, code: code, message: message}
}

func publicAPIInternalFailure(cause error) error {
	return &publicAPIError{status: http.StatusInternalServerError, code: "internal_error", message: "Internal server error", cause: cause}
}

func publicAPIAuthenticationRequired() error {
	return &publicAPIError{status: http.StatusUnauthorized, code: "unauthorized", message: "Authentication required", wwwAuthenticate: true}
}

func (a *publicAPIAuth) writeError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *publicAPIError
	var authFailure *publicauth.Error
	switch {
	case errors.As(err, &failure):
	case errors.As(err, &authFailure):
		failure = &publicAPIError{
			status: authFailure.Status, code: authFailure.Code, message: authFailure.Message,
			wwwAuthenticate: authFailure.Challenge, cause: authFailure.Cause,
		}
	default:
		failure = publicAPIInternalFailure(err).(*publicAPIError)
	}
	logRequestFailure(r, "public_api_request_failed", phase, err, "status", failure.status, "code", failure.code)
	if failure.wwwAuthenticate {
		w.Header().Set("WWW-Authenticate", a.wwwAuthenticate(r))
	}
	body := map[string]string{"error": failure.code}
	if failure.message != "" {
		body["message"] = failure.message
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(failure.status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.WarnContext(r.Context(), "public_api_response_write_failed")
	}
}

func (a *publicAPIAuth) wwwAuthenticate(r *http.Request) string {
	origin := publicauth.PublicAppOrigin(a.publicAppURL)
	if origin == "" {
		scheme := "http"
		if requestIsHTTPS(r) {
			scheme = "https"
		}
		origin = scheme + "://" + r.Host
	}
	return `Bearer resource_metadata="` + origin + publicAPIProtectedResourcePath + `"`
}

func headerValue(r *http.Request, name string) string {
	return strings.Join(r.Header.Values(name), ", ")
}

func (a *publicAPIAuth) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, err := a.authenticate(r)
		if err != nil {
			a.writeError(w, r, "auth", err)
			return
		}
		noteRequest(r, "auth_kind", principal.Kind, "credential_id", principal.CredentialID,
			"organization_id", principal.OrganizationID, "user_id", principal.UserID)
		ctx := context.WithValue(r.Context(), publicAPIPrincipalKey{}, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *publicAPIAuth) authenticate(r *http.Request) (publicAPIPrincipal, error) {
	authenticator := publicauth.Authenticator{DB: a.pool, Membership: a.membership, Agent: a.agent}
	return authenticator.Authenticate(r.Context(), headerValue(r, "X-API-Key"), headerValue(r, "Authorization"))
}

func (a *publicAPIAuth) requirePermission(scope string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := publicAPIPrincipalFrom(r.Context())
		if !ok {
			a.writeError(w, r, "permission", publicAPIFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
			return
		}
		if !slices.Contains(principal.Permissions, scope) || !authz.RoleAllowsScope(principal.Role, scope) {
			a.writeError(w, r, "permission", publicAPIFailure(http.StatusForbidden, "forbidden", "Missing required permission: "+scope))
			return
		}
		next.ServeHTTP(w, r)
	})
}
