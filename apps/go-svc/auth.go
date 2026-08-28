package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/ironsession"
	"github.com/workos/workos-go/v10"
)

const (
	workOSSessionCookieName    = "wos-session"
	sessionCookieMaxAgeSeconds = 60 * 60 * 24 * 400
)

type authContextKey struct{}

type AuthClaims struct {
	UserID    string
	OrgID     string
	SessionID string
}

type SessionResult struct {
	Claims       AuthClaims
	SealedCookie string
}

type SessionVerifier interface {
	Verify(ctx context.Context, sealedSession string) (SessionResult, error)
}

type authError struct {
	reason  string
	message string
}

func (e authError) Error() string {
	return e.message
}

func newAuthError(reason, message string) error {
	return authError{reason: reason, message: message}
}

func authReason(err error) string {
	var ae authError
	if errors.As(err, &ae) {
		return ae.reason
	}
	return "invalid_session"
}

type sessionRefreshFunc func(ctx context.Context, refreshToken, organizationID string) (accessToken, newRefreshToken string, err error)

type WorkOSSessionVerifier struct {
	cookiePassword string
	apiKey         string
	clientID       string
	refresh        sessionRefreshFunc
}

type authKitSession struct {
	AccessToken  string          `json:"accessToken"`
	RefreshToken string          `json:"refreshToken"`
	User         json.RawMessage `json:"user"`
	Impersonator json.RawMessage `json:"impersonator,omitempty"`
}

type authKitUser struct {
	ID string `json:"id"`
}

type sessionJWTClaims struct {
	Subject        string `json:"sub"`
	SessionID      string `json:"sid"`
	OrganizationID string `json:"org_id"`
	Exp            int64  `json:"exp"`
}

func NewWorkOSSessionVerifier(cookiePassword string) (*WorkOSSessionVerifier, error) {
	cookiePassword = strings.TrimSpace(cookiePassword)
	if cookiePassword == "" {
		return nil, errors.New("WORKOS_COOKIE_PASSWORD is required")
	}
	if len(cookiePassword) < 32 {
		return nil, errors.New("WORKOS_COOKIE_PASSWORD must be at least 32 characters")
	}
	verifier := &WorkOSSessionVerifier{
		cookiePassword: cookiePassword,
		apiKey:         strings.TrimSpace(os.Getenv("WORKOS_API_KEY")),
		clientID:       strings.TrimSpace(os.Getenv("WORKOS_CLIENT_ID")),
	}
	verifier.refresh = verifier.refreshWithWorkOS
	return verifier, nil
}

func (v *WorkOSSessionVerifier) Verify(ctx context.Context, sealedSession string) (SessionResult, error) {
	sealedSession = strings.TrimSpace(sealedSession)
	if sealedSession == "" {
		return SessionResult{}, newAuthError("missing_session_cookie", "missing session cookie")
	}
	if ironsession.IsSealed(sealedSession) {
		return v.verifyAuthKit(ctx, sealedSession)
	}
	return v.verifyGoSDK(ctx, sealedSession)
}

func (v *WorkOSSessionVerifier) verifyAuthKit(ctx context.Context, sealedSession string) (SessionResult, error) {
	var session authKitSession
	if err := ironsession.Unseal(sealedSession, v.cookiePassword, &session); err != nil {
		return SessionResult{}, newAuthError("invalid_session_cookie", "invalid session: invalid_session_cookie")
	}
	if session.AccessToken == "" {
		return SessionResult{}, newAuthError("invalid_session_cookie", "invalid session: invalid_session_cookie")
	}

	claims, err := parseSessionJWT(session.AccessToken)
	needsRefresh := err != nil || jwtExpired(claims)
	sealedCookie := ""
	if needsRefresh {
		session, err = v.refreshAuthKit(ctx, session)
		if err != nil {
			return SessionResult{}, err
		}
		claims, err = parseSessionJWT(session.AccessToken)
		if err != nil {
			return SessionResult{}, newAuthError("invalid_jwt", "invalid session: invalid_jwt")
		}
		sealedCookie, err = ironsession.Seal(session, v.cookiePassword)
		if err != nil {
			return SessionResult{}, newAuthError("refresh_failed", "invalid session: refresh_failed")
		}
	}

	userID := userIDFromAuthKit(session)
	if userID == "" {
		userID = claims.Subject
	}
	if userID == "" {
		return SessionResult{}, newAuthError("session_missing_user", "session missing user")
	}

	return SessionResult{
		Claims: AuthClaims{
			UserID:    userID,
			OrgID:     claims.OrganizationID,
			SessionID: claims.SessionID,
		},
		SealedCookie: sealedCookie,
	}, nil
}

func (v *WorkOSSessionVerifier) refreshAuthKit(ctx context.Context, session authKitSession) (authKitSession, error) {
	if session.RefreshToken == "" {
		return session, newAuthError("session_expired", "invalid session: session_expired")
	}
	if v.refresh == nil {
		return session, newAuthError("session_expired", "invalid session: session_expired")
	}

	claims, _ := parseSessionJWT(session.AccessToken)
	accessToken, refreshToken, err := v.refresh(ctx, session.RefreshToken, claims.OrganizationID)
	if err != nil {
		var ae authError
		if errors.As(err, &ae) {
			return session, err
		}
		return session, newAuthError("refresh_failed", "invalid session: refresh_failed")
	}
	session.AccessToken = accessToken
	session.RefreshToken = refreshToken
	return session, nil
}

func (v *WorkOSSessionVerifier) refreshWithWorkOS(ctx context.Context, refreshToken, organizationID string) (string, string, error) {
	if v.apiKey == "" || v.clientID == "" {
		return "", "", newAuthError("session_expired", "invalid session: session_expired")
	}

	client := workos.NewClient(v.apiKey, workos.WithClientID(v.clientID))
	var orgID *string
	if organizationID != "" {
		orgID = &organizationID
	}
	resp, err := client.UserManagement().AuthenticateWithRefreshToken(ctx, &workos.UserManagementAuthenticateWithRefreshTokenParams{
		RefreshToken:   refreshToken,
		OrganizationID: orgID,
	})
	if err != nil {
		reason := "refresh_failed"
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode == "invalid_grant" {
			reason = "refresh_token_revoked"
		}
		return "", "", newAuthError(reason, "invalid session: "+reason)
	}
	return resp.AccessToken, resp.RefreshToken, nil
}

func (v *WorkOSSessionVerifier) verifyGoSDK(ctx context.Context, sealedSession string) (SessionResult, error) {
	result, err := workos.AuthenticateSession(sealedSession, v.cookiePassword)
	if err != nil {
		return SessionResult{}, newAuthError("invalid_session_cookie", "invalid session: invalid_session_cookie")
	}
	if result != nil && result.NeedsRefresh {
		return v.refreshGoSDK(ctx, sealedSession)
	}
	if result == nil || !result.Authenticated {
		reason := "invalid_session_cookie"
		if result != nil && result.Reason != "" {
			reason = result.Reason
		}
		return SessionResult{}, newAuthError(reason, "invalid session: "+reason)
	}

	userID := ""
	if result.User != nil {
		userID = result.User.ID
	}
	if userID == "" {
		return SessionResult{}, newAuthError("session_missing_user", "session missing user")
	}

	return SessionResult{
		Claims: AuthClaims{
			UserID:    userID,
			OrgID:     result.OrganizationID,
			SessionID: result.SessionID,
		},
	}, nil
}

func (v *WorkOSSessionVerifier) refreshGoSDK(ctx context.Context, sealedSession string) (SessionResult, error) {
	if v.apiKey == "" || v.clientID == "" {
		return SessionResult{}, newAuthError("session_expired", "invalid session: session_expired")
	}

	client := workos.NewClient(v.apiKey, workos.WithClientID(v.clientID))
	refreshed, err := client.RefreshSession(ctx, sealedSession, v.cookiePassword)
	if err != nil {
		reason := "refresh_failed"
		if refreshed != nil && refreshed.Reason != "" {
			reason = refreshed.Reason
		}
		return SessionResult{}, newAuthError(reason, "invalid session: "+reason)
	}
	if refreshed == nil || !refreshed.Authenticated || refreshed.Session == nil || refreshed.Session.User == nil {
		reason := "refresh_failed"
		if refreshed != nil && refreshed.Reason != "" {
			reason = refreshed.Reason
		}
		return SessionResult{}, newAuthError(reason, "invalid session: "+reason)
	}

	claims, err := parseSessionJWT(refreshed.Session.AccessToken)
	if err != nil {
		return SessionResult{}, newAuthError("invalid_jwt", "invalid session: invalid_jwt")
	}

	return SessionResult{
		Claims: AuthClaims{
			UserID:    refreshed.Session.User.ID,
			OrgID:     claims.OrganizationID,
			SessionID: claims.SessionID,
		},
		SealedCookie: refreshed.SealedSession,
	}, nil
}

func userIDFromAuthKit(session authKitSession) string {
	if len(session.User) == 0 {
		return ""
	}
	var user authKitUser
	if err := json.Unmarshal(session.User, &user); err != nil {
		return ""
	}
	return user.ID
}

func parseSessionJWT(token string) (sessionJWTClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return sessionJWTClaims{}, errors.New("invalid_jwt")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return sessionJWTClaims{}, errors.New("invalid_jwt")
	}
	var claims sessionJWTClaims
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return sessionJWTClaims{}, errors.New("invalid_jwt")
	}
	return claims, nil
}

func jwtExpired(claims sessionJWTClaims) bool {
	return claims.Exp != 0 && time.Now().Unix() >= claims.Exp
}

func sessionCookieValue(r *http.Request) (string, error) {
	cookie, err := r.Cookie(workOSSessionCookieName)
	if err != nil {
		return "", err
	}
	value := strings.TrimSpace(cookie.Value)
	if value == "" {
		return "", errors.New("empty session cookie")
	}
	return value, nil
}

func requestIsHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	proto := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0])
	return strings.EqualFold(proto, "https")
}

func newSessionCookie(r *http.Request, value string) *http.Cookie {
	cookie := &http.Cookie{
		Name:     workOSSessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   sessionCookieMaxAgeSeconds,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   requestIsHTTPS(r),
	}
	if domain := strings.TrimSpace(os.Getenv("WORKOS_COOKIE_DOMAIN")); domain != "" {
		cookie.Domain = domain
	}
	return cookie
}

func authMiddleware(verifier SessionVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sealedSession, err := sessionCookieValue(r)
			if err != nil {
				logAuthRejected(r, "missing_session_cookie")
				writeUnauthorized(w, "missing session cookie")
				return
			}

			result, err := verifier.Verify(r.Context(), sealedSession)
			if err != nil {
				logAuthRejected(r, authReason(err))
				writeUnauthorized(w, err.Error())
				return
			}

			if result.SealedCookie != "" {
				http.SetCookie(w, newSessionCookie(r, result.SealedCookie))
			}

			logAuthOK(r, result.Claims.UserID)
			ctx := context.WithValue(r.Context(), authContextKey{}, result.Claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func logAuthRejected(r *http.Request, reason string) {
	attrs := []any{"reason", reason}
	if id := requestID(r); id != "" {
		attrs = append(attrs, "request_id", id)
	}
	slog.Info("auth rejected", attrs...)
}

func logAuthOK(r *http.Request, userID string) {
	attrs := []any{"user_id", userID}
	if id := requestID(r); id != "" {
		attrs = append(attrs, "request_id", id)
	}
	slog.Info("auth ok", attrs...)
}

func writeUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "unauthorized",
		"message": message,
	})
}
