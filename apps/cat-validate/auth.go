package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/workos/workos-go/v7"
)

const workOSSessionCookieName = "wos-session"

type authContextKey struct{}

type AuthClaims struct {
	UserID    string
	OrgID     string
	SessionID string
}

type SessionVerifier interface {
	Verify(ctx context.Context, sealedSession string) (AuthClaims, error)
}

type WorkOSSessionVerifier struct {
	cookiePassword string
}

func NewWorkOSSessionVerifier(cookiePassword string) (*WorkOSSessionVerifier, error) {
	cookiePassword = strings.TrimSpace(cookiePassword)
	if cookiePassword == "" {
		return nil, errors.New("WORKOS_COOKIE_PASSWORD is required")
	}
	if len(cookiePassword) < 32 {
		return nil, errors.New("WORKOS_COOKIE_PASSWORD must be at least 32 characters")
	}
	return &WorkOSSessionVerifier{cookiePassword: cookiePassword}, nil
}

func (v *WorkOSSessionVerifier) Verify(_ context.Context, sealedSession string) (AuthClaims, error) {
	sealedSession = strings.TrimSpace(sealedSession)
	if sealedSession == "" {
		return AuthClaims{}, errors.New("missing session cookie")
	}

	result, err := workos.AuthenticateSession(sealedSession, v.cookiePassword)
	if err != nil {
		return AuthClaims{}, fmt.Errorf("invalid session: %w", err)
	}
	if result == nil || !result.Authenticated {
		reason := "invalid session"
		if result != nil && result.Reason != "" {
			reason = result.Reason
		}
		return AuthClaims{}, fmt.Errorf("invalid session: %s", reason)
	}

	userID := ""
	if result.User != nil {
		userID = result.User.ID
	}
	if userID == "" {
		return AuthClaims{}, errors.New("session missing user")
	}

	return AuthClaims{
		UserID:    userID,
		OrgID:     result.OrganizationID,
		SessionID: result.SessionID,
	}, nil
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

func authMiddleware(verifier SessionVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sealedSession, err := sessionCookieValue(r)
			if err != nil {
				writeUnauthorized(w, "missing session cookie")
				return
			}

			claims, err := verifier.Verify(r.Context(), sealedSession)
			if err != nil {
				writeUnauthorized(w, err.Error())
				return
			}

			ctx := context.WithValue(r.Context(), authContextKey{}, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "unauthorized",
		"message": message,
	})
}
