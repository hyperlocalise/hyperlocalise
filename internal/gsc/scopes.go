package gsc

// OAuthProviderID is the Better Auth / provider identifier for incremental
// Google Search Console connections in Hyperlocalise.
const OAuthProviderID = "google-search-console"

// OAuth scopes requested when connecting Search Console.
const (
	ScopeOpenID             = "openid"
	ScopeEmail              = "email"
	ScopeProfile            = "profile"
	ScopeWebmastersReadonly = "https://www.googleapis.com/auth/webmasters.readonly"
)

// OAuthScopes is the full scope set for a Search Console connection.
var OAuthScopes = []string{
	ScopeOpenID,
	ScopeEmail,
	ScopeProfile,
	ScopeWebmastersReadonly,
}
