package main

var apiKeyScopes = []string{"jobs:read", "jobs:write", "files:read", "files:write"}

var apiKeyScopeCapability = map[string]string{
	"jobs:read":   "jobs:read",
	"jobs:write":  "jobs:write",
	"files:read":  "projects:read",
	"files:write": "jobs:create",
}

func isAPIKeyScope(scope string) bool {
	_, ok := apiKeyScopeCapability[scope]
	return ok
}

func grantableAPIKeyPermissions(role string) []string {
	grantable := make([]string, 0, len(apiKeyScopes))
	for _, scope := range apiKeyScopes {
		if hasOrganizationCapability(role, apiKeyScopeCapability[scope]) {
			grantable = append(grantable, scope)
		}
	}
	return grantable
}

func refusedAPIKeyPermissions(role string, requested []string) []string {
	refused := make([]string, 0)
	for _, scope := range requested {
		if !isAPIKeyScope(scope) || !hasOrganizationCapability(role, apiKeyScopeCapability[scope]) {
			refused = append(refused, scope)
		}
	}
	return refused
}

func canAdministerOtherUsersAPIKeys(role string) bool {
	return hasOrganizationCapability(role, "api_keys:read")
}

func canRevokeOtherUsersAPIKeys(role string) bool {
	return hasOrganizationCapability(role, "api_keys:write")
}
