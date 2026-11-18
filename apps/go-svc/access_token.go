package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	accessTokenClockLeeway = 30 * time.Second
	workOSUserIDPrefix     = "user_"
)

type workosAccessTokenClaims struct {
	jwt.RegisteredClaims
	SessionID      string          `json:"sid"`
	OrganizationID string          `json:"org_id"`
	Act            json.RawMessage `json:"act"`
}

func (v *WorkOSSessionVerifier) VerifyAccessToken(ctx context.Context, accessToken string) (AuthClaims, error) {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return AuthClaims{}, newAuthError("missing_access_token", "invalid access token")
	}
	if v.clientID == "" {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}

	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(accessTokenClockLeeway),
	)
	claims := &workosAccessTokenClaims{}
	token, err := parser.ParseWithClaims(accessToken, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if strings.TrimSpace(kid) == "" {
			return nil, errors.New("missing kid")
		}
		if v.jwks == nil {
			return nil, errors.New("jwks unavailable")
		}
		return v.jwks.PublicKey(ctx, kid)
	})
	if err != nil || token == nil || !token.Valid {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}

	// `iss` and the JWKS are shared by every WorkOS application in the
	// environment, so they pin the token; `client_id` and `aud` only name the
	// application (web or Iris desktop) and are not checked.
	if !issuerAllowed(claims.Issuer, v.apiBaseURL, v.clientID) {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}
	if !strings.HasPrefix(claims.Subject, workOSUserIDPrefix) || claims.SessionID == "" {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}
	if !actAllowed(claims.Act) {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}

	return AuthClaims{
		UserID:    claims.Subject,
		OrgID:     claims.OrganizationID,
		SessionID: claims.SessionID,
	}, nil
}

// actAllowed accepts a missing `act` claim and the WorkOS impersonation shape,
// where `act.sub` names the impersonating admin (an email, not a user id).
// Agent registration JWTs put the claimed user id (`user_...`) in `act.sub`;
// those stay rejected so agent credentials cannot use this channel.
func actAllowed(raw json.RawMessage) bool {
	if len(raw) == 0 || string(raw) == "null" {
		return true
	}
	var act struct {
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(raw, &act); err != nil {
		return false
	}
	sub := strings.TrimSpace(act.Sub)
	return sub != "" && !strings.HasPrefix(sub, workOSUserIDPrefix)
}

func issuerAllowed(issuer, apiBaseURL, clientID string) bool {
	issuer = strings.TrimRight(strings.TrimSpace(issuer), "/")
	apiBaseURL = strings.TrimRight(strings.TrimSpace(apiBaseURL), "/")
	if issuer == "" || apiBaseURL == "" {
		return false
	}
	if issuer == apiBaseURL {
		return true
	}
	return issuer == apiBaseURL+"/"+clientID || issuer == apiBaseURL+"/user_management/"+clientID
}
