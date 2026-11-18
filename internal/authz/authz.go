// Package authz holds the workspace role and token scope rules shared by go-svc and the public
// API, so both grant a personal access token or an agent the same access. The role table ports
// the web app's policy (apps/hyperlocalise-web/src/api/auth/policy.ts) and the token scopes port
// its API key permissions (src/api/routes/api-key/api-key.permissions.ts). Keep them in step.
package authz

const (
	RoleAdmin               = "admin"
	RoleLocalizationManager = "localization_manager"
	RoleDeveloper           = "developer"
	RoleReviewer            = "reviewer"
	RoleTranslator          = "translator"
	RoleMember              = "member"
)

// RoleVendor is an outside person who holds no capability and no token scope. It is left out of
// Roles and the capability table on purpose: IsKnownRole refuses it, so the public API and every
// go-svc route are closed to a vendor unless a route asks for the role by name. What a vendor
// may reach comes from the open tasks they own (apps/go-svc/vendor-access.go).
const RoleVendor = "vendor"

// Roles lists the workspace roles from most to least privileged.
var Roles = []string{
	RoleAdmin,
	RoleLocalizationManager,
	RoleDeveloper,
	RoleReviewer,
	RoleTranslator,
	RoleMember,
}

var (
	memberReadCapabilities = []string{
		"workspace:read", "projects:read", "teams:read", "glossaries:read", "memories:read",
		"dictionaries:read", "jobs:read", "experiments:read",
	}
	jobContributorCapabilities = []string{"jobs:create", "jobs:write", "ai_actions:run"}
	writeBackCapabilities      = []string{"write_back:translation"}
	reviewCapabilities         = []string{"reviews:read", "reviews:approve", "write_back:approve", "agent_write:approve"}
	memoryReviewCapabilities   = []string{"memories:review"}
	developerCapabilities      = []string{"projects:create", "projects:write", "integrations:read", "experiments:write"}
	managerCapabilities        = []string{
		"workspace:update", "members:invite", "teams:write", "projects:create", "projects:write",
		"glossaries:write", "memories:write", "dictionaries:write", "provider_credentials:read",
		"provider_credentials:write", "api_keys:read", "api_keys:write", "integrations:read",
		"integrations:write", "experiments:write", "billing:read", "activity_logs:read",
	}
	adminCapabilities = []string{"billing:write"}
)

var capabilitiesByRole = map[string]map[string]struct{}{
	RoleAdmin: capabilitySet(memberReadCapabilities, jobContributorCapabilities, writeBackCapabilities,
		reviewCapabilities, memoryReviewCapabilities, managerCapabilities, adminCapabilities),
	RoleLocalizationManager: capabilitySet(memberReadCapabilities, jobContributorCapabilities, writeBackCapabilities,
		reviewCapabilities, memoryReviewCapabilities, managerCapabilities),
	RoleDeveloper: capabilitySet(memberReadCapabilities, jobContributorCapabilities, writeBackCapabilities,
		developerCapabilities),
	RoleReviewer: capabilitySet(memberReadCapabilities, jobContributorCapabilities, writeBackCapabilities,
		reviewCapabilities, memoryReviewCapabilities),
	RoleTranslator: capabilitySet(memberReadCapabilities, jobContributorCapabilities, writeBackCapabilities),
	RoleMember:     capabilitySet(memberReadCapabilities),
}

func capabilitySet(groups ...[]string) map[string]struct{} {
	set := make(map[string]struct{})
	for _, group := range groups {
		for _, capability := range group {
			set[capability] = struct{}{}
		}
	}
	return set
}

// IsKnownRole reports whether role is one of the workspace roles.
func IsKnownRole(role string) bool {
	_, ok := capabilitiesByRole[role]
	return ok
}

// HasCapability reports whether role holds capability. Unknown roles hold none.
func HasCapability(role, capability string) bool {
	_, ok := capabilitiesByRole[role][capability]
	return ok
}

// APIKeyScopes lists the scopes a personal access token can be granted.
var APIKeyScopes = []string{
	"jobs:read", "jobs:write", "files:read", "files:write", "memories:read", "memories:write", "reports:read",
}

// apiKeyScopeCapability names the capability a token's owner must hold to use each scope.
var apiKeyScopeCapability = map[string]string{
	"jobs:read":      "jobs:read",
	"jobs:write":     "jobs:write",
	"files:read":     "projects:read",
	"files:write":    "jobs:create",
	"memories:read":  "memories:read",
	"memories:write": "memories:write",
	// Reports are for the roles that see what work costs: admins and localization managers.
	"reports:read": "billing:read",
}

// IsAPIKeyScope reports whether scope is one a token can be granted.
func IsAPIKeyScope(scope string) bool {
	_, ok := apiKeyScopeCapability[scope]
	return ok
}

// RoleAllowsScope reports whether a token owner with role may still use scope. It is checked when
// a token is created and on every request, so a demoted owner's tokens lose what the role lost.
func RoleAllowsScope(role, scope string) bool {
	capability, ok := apiKeyScopeCapability[scope]
	return ok && HasCapability(role, capability)
}

// GrantableAPIKeyScopes lists the scopes role may grant a new token, in APIKeyScopes order.
func GrantableAPIKeyScopes(role string) []string {
	grantable := make([]string, 0, len(APIKeyScopes))
	for _, scope := range APIKeyScopes {
		if RoleAllowsScope(role, scope) {
			grantable = append(grantable, scope)
		}
	}
	return grantable
}

// RefusedAPIKeyScopes lists the requested scopes role may not grant.
func RefusedAPIKeyScopes(role string, requested []string) []string {
	refused := make([]string, 0)
	for _, scope := range requested {
		if !RoleAllowsScope(role, scope) {
			refused = append(refused, scope)
		}
	}
	return refused
}

// EffectivePermissions turns a token's stored scopes into the public API's finer permissions:
// the scopes the owner's role still allows, plus the permissions each one implies for role.
func EffectivePermissions(stored []string, role string) []string {
	seen := make(map[string]struct{}, len(stored)+2)
	out := make([]string, 0, len(stored)+2)
	add := func(permission string) {
		if _, ok := seen[permission]; ok {
			return
		}
		seen[permission] = struct{}{}
		out = append(out, permission)
	}
	has := func(permission string) bool {
		_, ok := seen[permission]
		return ok
	}
	isManager := role == RoleAdmin || role == RoleLocalizationManager
	for _, scope := range stored {
		if RoleAllowsScope(role, scope) {
			add(scope)
		}
	}
	if has("files:read") {
		add("projects:read")
		add("queries:read")
		add("strings:read")
		add("glossaries:read")
		add("translation-memories:read")
	}
	if has("files:write") {
		add("strings:write")
		if HasCapability(role, "projects:write") {
			add("projects:write")
		}
		// Approving and rejecting follow write_back:approve, as the MCP tools do.
		if HasCapability(role, "write_back:approve") {
			add("translations:approve")
		}
		// Admins and localization managers manage project templates and custom field definitions.
		if isManager {
			add("project-templates:write")
			add("custom-fields:write")
		}
		// Glossary edits: managers, and translators on their teams' glossaries.
		if isManager || role == RoleTranslator {
			add("glossaries:write")
		}
	}
	// Every workspace member can list templates to create a project from one.
	if has("projects:read") {
		add("project-templates:read")
		add("custom-fields:read")
	}
	if has("memories:read") {
		add("translation-memories:read")
	}
	if has("memories:write") {
		add("translation-memories:write")
	}
	// Job webhooks sit with API keys in Settings, so they follow api_keys:write. Tokens never
	// carry api_keys:write, so jobs scopes plus that capability grant the webhook permissions.
	if HasCapability(role, "api_keys:write") {
		if has("jobs:read") {
			add("webhooks:read")
		}
		if has("jobs:write") {
			add("webhooks:write")
		}
	}
	return out
}
