package main

import (
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
)

func apiKeyScopeOptionMessage() string {
	parts := make([]string, len(authz.APIKeyScopes))
	for i, scope := range authz.APIKeyScopes {
		parts[i] = `"` + scope + `"`
	}
	return `Invalid option: expected one of ` + strings.Join(parts, "|")
}

func canAdministerOtherUsersAPIKeys(role string) bool {
	return authz.HasCapability(role, "api_keys:read")
}

func canRevokeOtherUsersAPIKeys(role string) bool {
	return authz.HasCapability(role, "api_keys:write")
}
