package main

var memberSettingsRoleOrder = []string{
	"admin",
	"localization_manager",
	"developer",
	"reviewer",
	"translator",
	"member",
}

var organizationCapabilityByRole = map[string]map[string]struct{}{
	"admin": {
		"workspace:read": {}, "members:invite": {}, "teams:write": {},
	},
	"localization_manager": {
		"workspace:read": {}, "members:invite": {}, "teams:write": {},
	},
	"developer":  {"workspace:read": {}},
	"reviewer":   {"workspace:read": {}},
	"translator": {"workspace:read": {}},
	"member":     {"workspace:read": {}},
}

func hasOrganizationCapability(role, capability string) bool {
	caps, ok := organizationCapabilityByRole[role]
	if !ok {
		return false
	}
	_, ok = caps[capability]
	return ok
}

func isOrganizationAdminRole(role string) bool {
	return role == "admin"
}

func assignableRolesForActor(actorRole string) []string {
	if isOrganizationAdminRole(actorRole) {
		return append([]string(nil), memberSettingsRoleOrder...)
	}
	if hasOrganizationCapability(actorRole, "members:invite") {
		roles := make([]string, 0, len(memberSettingsRoleOrder)-1)
		for _, role := range memberSettingsRoleOrder {
			if role != "admin" {
				roles = append(roles, role)
			}
		}
		return roles
	}
	return nil
}

func canActorAssignRole(actorRole, role string) bool {
	for _, assigned := range assignableRolesForActor(actorRole) {
		if assigned == role {
			return true
		}
	}
	return false
}

func canActorManageTarget(actorRole, targetRole string, nextRole *string) bool {
	if !hasOrganizationCapability(actorRole, "members:invite") {
		return false
	}
	if !canActorAssignRole(actorRole, targetRole) {
		return false
	}
	if nextRole != nil && !canActorAssignRole(actorRole, *nextRole) {
		return false
	}
	return true
}

func memberRowCapabilities(actorRole, targetRole string, isCurrentUser bool) (canUpdateRole, canRemove bool) {
	if isCurrentUser {
		return false, false
	}
	canManage := canActorManageTarget(actorRole, targetRole, nil)
	return canManage, canManage
}

type memberManagementContext struct {
	CanInvite       bool     `json:"canInvite"`
	AssignableRoles []string `json:"assignableRoles"`
}

func buildMemberManagementContext(actorRole string) memberManagementContext {
	roles := assignableRolesForActor(actorRole)
	if roles == nil {
		roles = []string{}
	}
	return memberManagementContext{
		CanInvite:       len(roles) > 0,
		AssignableRoles: roles,
	}
}

func isKnownMemberRole(role string) bool {
	return isKnownOrganizationRole(role)
}
