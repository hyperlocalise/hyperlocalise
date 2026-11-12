package main

var apiKeyScopeCapability = map[string]string{
	"projects:read":  "projects:read",
	"queries:read":   "projects:read",
	"jobs:read":      "jobs:read",
	"jobs:write":     "jobs:write",
	"files:read":     "projects:read",
	"files:write":    "jobs:create",
	"memories:read":  "memories:read",
	"memories:write": "memories:write",
}

func roleAllowsCapability(role, capability string) bool {
	switch capability {
	case "projects:read", "jobs:read":
		return role != ""
	case "jobs:write", "jobs:create":
		return role != "" && role != "member"
	case "memories:read":
		return role != ""
	case "memories:write":
		// go-svc's canWriteMemories.
		return role == "admin" || role == "localization_manager"
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
		add("strings:read")
		add("glossaries:read")
		add("translation-memories:read")
	}
	if _, ok := seen["files:write"]; ok {
		add("strings:write")
		// Project settings follow the web app's projects:write capability.
		if role == "admin" || role == "localization_manager" || role == "developer" {
			add("projects:write")
		}
		// Approving and rejecting follow the web app's write_back:approve, as the MCP tools do.
		if role == "admin" || role == "localization_manager" || role == "reviewer" {
			add("translations:approve")
		}
		// Glossary edits follow go-svc: managers, and translators on their teams' glossaries.
		if role == "admin" || role == "localization_manager" || role == "translator" {
			add("glossaries:write")
		}
	}
	if _, ok := seen["memories:read"]; ok {
		add("translation-memories:read")
	}
	if _, ok := seen["memories:write"]; ok {
		add("translation-memories:write")
	}
	return out
}
