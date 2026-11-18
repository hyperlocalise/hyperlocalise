package publicauth

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/hyperlocalise/hyperlocalise/internal/authz"
)

// AgentMCPScope lets a registered agent call the MCP server.
const AgentMCPScope = "mcp"

// ErrInvalidAgentToken is returned for any agent token that does not verify.
var ErrInvalidAgentToken = errors.New("invalid_agent_access_token")

// AgentClaims are the parts of a WorkOS agent registration token the APIs act on.
type AgentClaims struct {
	RegistrationID       string
	WorkOSUserID         string
	WorkOSOrganizationID string
	// Scopes keeps only token scopes and AgentMCPScope.
	Scopes []string
}

// AgentVerifier verifies WorkOS agent registration access tokens issued by AuthKit.
type AgentVerifier struct {
	issuer    string
	audiences []string
	// Keys holds AuthKit's signing keys.
	Keys *JWKS
}

// NewAgentVerifierFromEnv reads WORKOS_AUTHKIT_DOMAIN, WORKOS_CLIENT_ID and
// HYPERLOCALISE_PUBLIC_APP_URL.
func NewAgentVerifierFromEnv() *AgentVerifier {
	return NewAgentVerifier(
		os.Getenv("WORKOS_AUTHKIT_DOMAIN"),
		os.Getenv("WORKOS_CLIENT_ID"),
		os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL"),
	)
}

// NewAgentVerifier accepts tokens issued by authkitDomain for the client id or for the public
// app's /api/v1 and /mcp resources. Without a domain or an audience every token is rejected.
func NewAgentVerifier(authkitDomain, clientID, publicAppURL string) *AgentVerifier {
	v := &AgentVerifier{}
	if domain := strings.TrimSpace(authkitDomain); domain != "" {
		v.issuer = "https://" + domain
		v.Keys = NewJWKS(v.issuer + "/.well-known/jwks.json")
	}
	if id := strings.TrimSpace(clientID); id != "" {
		v.audiences = append(v.audiences, id)
	}
	if origin := PublicAppOrigin(publicAppURL); origin != "" {
		v.audiences = append(v.audiences, origin+"/api/v1", origin+"/mcp")
	}
	return v
}

// PublicAppOrigin returns the scheme and host of raw, or "" when raw is not an absolute URL.
func PublicAppOrigin(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

// IsCompactJWT reports whether token has three non-empty dot-separated parts.
func IsCompactJWT(token string) bool {
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

// Verify checks the token's RS256 signature, issuer and audience, and returns its claims.
func (v *AgentVerifier) Verify(ctx context.Context, token string) (AgentClaims, error) {
	if v == nil || v.issuer == "" || len(v.audiences) == 0 || v.Keys == nil || !IsCompactJWT(token) {
		return AgentClaims{}, ErrInvalidAgentToken
	}

	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}))
	claims := jwt.MapClaims{}
	parsed, err := parser.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("missing kid")
		}
		return v.Keys.PublicKey(ctx, kid)
	})
	if err != nil || parsed == nil || !parsed.Valid {
		return AgentClaims{}, ErrInvalidAgentToken
	}

	if issuer, _ := claims["iss"].(string); issuer != v.issuer {
		return AgentClaims{}, ErrInvalidAgentToken
	}
	audience, err := claims.GetAudience()
	if err != nil || !agentAudienceAllowed(audience, v.audiences) {
		return AgentClaims{}, ErrInvalidAgentToken
	}

	registrationID, _ := claims["sub"].(string)
	workosOrganizationID, _ := claims["org_id"].(string)
	var workosUserID string
	if act, ok := claims["act"].(map[string]any); ok {
		workosUserID, _ = act["sub"].(string)
	}
	if registrationID == "" || workosOrganizationID == "" || workosUserID == "" {
		return AgentClaims{}, ErrInvalidAgentToken
	}

	scope, _ := claims["scope"].(string)
	scopes := make([]string, 0)
	for _, value := range strings.FieldsFunc(scope, isScopeSeparator) {
		if authz.IsAPIKeyScope(value) || value == AgentMCPScope {
			scopes = append(scopes, value)
		}
	}

	return AgentClaims{
		RegistrationID:       registrationID,
		WorkOSUserID:         workosUserID,
		WorkOSOrganizationID: workosOrganizationID,
		Scopes:               scopes,
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

// isScopeSeparator matches the whitespace JavaScript's String.prototype.trim removes, so scopes
// split as the web app splits them.
func isScopeSeparator(r rune) bool {
	if r <= ' ' {
		return r == ' ' || (r >= '\t' && r <= '\r')
	}
	switch r {
	case '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff':
		return true
	}
	return false
}
