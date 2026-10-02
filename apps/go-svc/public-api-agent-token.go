package main

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

const agentAccessTokenMCPScope = "mcp"

var errInvalidAgentAccessToken = errors.New("invalid_agent_access_token")

type agentAccessTokenClaims struct {
	registrationID       string
	workosUserID         string
	workosOrganizationID string
	scopes               []string
}

type agentAccessTokenVerifier struct {
	issuer    string
	audiences []string
	jwks      *jwksCache
}

func newAgentAccessTokenVerifierFromEnv() *agentAccessTokenVerifier {
	return newAgentAccessTokenVerifier(
		os.Getenv("WORKOS_AUTHKIT_DOMAIN"),
		os.Getenv("WORKOS_CLIENT_ID"),
		os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL"),
	)
}

func newAgentAccessTokenVerifier(authkitDomain, clientID, publicAppURL string) *agentAccessTokenVerifier {
	v := &agentAccessTokenVerifier{}
	if domain := strings.TrimSpace(authkitDomain); domain != "" {
		v.issuer = "https://" + domain
		v.jwks = newJWKSCache(v.issuer + "/.well-known/jwks.json")
	}
	if id := strings.TrimSpace(clientID); id != "" {
		v.audiences = append(v.audiences, id)
	}
	if origin := publicAppOrigin(publicAppURL); origin != "" {
		v.audiences = append(v.audiences, origin+"/api/v1", origin+"/mcp")
	}
	return v
}

func publicAppOrigin(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

func isCompactJWT(token string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
	}
	return true
}

func (v *agentAccessTokenVerifier) verify(ctx context.Context, token string) (agentAccessTokenClaims, error) {
	if v == nil || v.issuer == "" || len(v.audiences) == 0 || v.jwks == nil || !isCompactJWT(token) {
		return agentAccessTokenClaims{}, errInvalidAgentAccessToken
	}

	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}))
	claims := jwt.MapClaims{}
	parsed, err := parser.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("missing kid")
		}
		return v.jwks.publicKey(ctx, kid)
	})
	if err != nil || parsed == nil || !parsed.Valid {
		return agentAccessTokenClaims{}, errInvalidAgentAccessToken
	}

	if issuer, _ := claims["iss"].(string); issuer != v.issuer {
		return agentAccessTokenClaims{}, errInvalidAgentAccessToken
	}
	audience, err := claims.GetAudience()
	if err != nil || !agentAudienceAllowed(audience, v.audiences) {
		return agentAccessTokenClaims{}, errInvalidAgentAccessToken
	}

	registrationID, _ := claims["sub"].(string)
	workosOrganizationID, _ := claims["org_id"].(string)
	var workosUserID string
	if act, ok := claims["act"].(map[string]any); ok {
		workosUserID, _ = act["sub"].(string)
	}
	if registrationID == "" || workosOrganizationID == "" || workosUserID == "" {
		return agentAccessTokenClaims{}, errInvalidAgentAccessToken
	}

	scope, _ := claims["scope"].(string)
	scopes := make([]string, 0)
	for _, value := range strings.FieldsFunc(scope, isDictionaryTrimRune) {
		if isAPIKeyScope(value) || value == agentAccessTokenMCPScope {
			scopes = append(scopes, value)
		}
	}

	return agentAccessTokenClaims{
		registrationID:       registrationID,
		workosUserID:         workosUserID,
		workosOrganizationID: workosOrganizationID,
		scopes:               scopes,
	}, nil
}

func agentAudienceAllowed(audience jwt.ClaimStrings, allowed []string) bool {
	for _, value := range audience {
		for _, candidate := range allowed {
			if value == candidate {
				return true
			}
		}
	}
	return false
}
