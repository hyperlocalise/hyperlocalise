package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
	"github.com/workos/workos-go/v4/pkg/usermanagement"
)

const workOSIssuer = "https://api.workos.com"

type authContextKey struct{}

type AuthClaims struct {
	UserID    string
	OrgID     string
	SessionID string
}

type TokenVerifier interface {
	Verify(ctx context.Context, token string) (AuthClaims, error)
}

type WorkOSTokenVerifier struct {
	clientID string
	jwksURL  string
	cache    *jwk.Cache
}

func NewWorkOSTokenVerifier(clientID string) (*WorkOSTokenVerifier, error) {
	if strings.TrimSpace(clientID) == "" {
		return nil, errors.New("WORKOS_CLIENT_ID is required")
	}

	jwksURL, err := usermanagement.GetJWKSURL(clientID)
	if err != nil {
		return nil, fmt.Errorf("resolve WorkOS JWKS URL: %w", err)
	}

	cache := jwk.NewCache(context.Background())
	if err := cache.Register(jwksURL.String(), jwk.WithMinRefreshInterval(15*time.Minute)); err != nil {
		return nil, fmt.Errorf("register JWKS cache: %w", err)
	}

	return &WorkOSTokenVerifier{
		clientID: clientID,
		jwksURL:  jwksURL.String(),
		cache:    cache,
	}, nil
}

func (v *WorkOSTokenVerifier) Verify(ctx context.Context, token string) (AuthClaims, error) {
	keySet, err := v.cache.Get(ctx, v.jwksURL)
	if err != nil {
		return AuthClaims{}, fmt.Errorf("fetch JWKS: %w", err)
	}

	parsed, err := jwt.Parse(
		[]byte(token),
		jwt.WithKeySet(keySet),
		jwt.WithValidate(true),
		jwt.WithIssuer(workOSIssuer),
	)
	if err != nil {
		return AuthClaims{}, fmt.Errorf("invalid token: %w", err)
	}

	userID, _ := parsed.Get("sub")
	orgID, _ := parsed.Get("org_id")
	sessionID, _ := parsed.Get("sid")

	claims := AuthClaims{
		UserID:    stringClaim(userID),
		OrgID:     stringClaim(orgID),
		SessionID: stringClaim(sessionID),
	}
	if claims.UserID == "" {
		return AuthClaims{}, errors.New("token missing sub claim")
	}
	return claims, nil
}

func stringClaim(value any) string {
	switch v := value.(type) {
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

func authMiddleware(verifier TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				writeUnauthorized(w, "missing bearer token")
				return
			}

			token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
			if token == "" {
				writeUnauthorized(w, "missing bearer token")
				return
			}

			claims, err := verifier.Verify(r.Context(), token)
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
