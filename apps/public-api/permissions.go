package main

var apiKeyScopeCapability = map[string]string{
	"projects:read": "projects:read",
	"queries:read":  "projects:read",
	"jobs:read":     "jobs:read",
	"jobs:write":    "jobs:write",
	"files:read":    "projects:read",
	"files:write":   "jobs:create",
}

func roleAllowsCapability(role, capability string) bool {
	switch capability {
	case "projects:read", "jobs:read":
		return role != ""
	case "jobs:write", "jobs:create":
		return role != "" && role != "member"
	default:
		return false
	}
}

func effectivePermissions(stored []string, role string) []string {
	seen := make(map[string]struct{}, len(stored)+2)
	out := make([]string, 0, len(stored)+2)
	add := func(permission string) {
		if _, ok := seen[permission]; ok {
			return
		}
		seen[permission] = struct{}{}
		out = append(out, permission)
	}
	for _, scope := range stored {
		capability, ok := apiKeyScopeCapability[scope]
		if !ok || !roleAllowsCapability(role, capability) {
			continue
		}
		add(scope)
	}
	if _, ok := seen["files:read"]; ok {
		add("projects:read")
		add("queries:read")
	}
	return out
}
