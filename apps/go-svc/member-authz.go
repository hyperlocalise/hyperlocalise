package main

import "github.com/hyperlocalise/hyperlocalise/internal/authz"

func isOrganizationAdminRole(role string) bool {
	return role == "admin"
}

func assignableRolesForActor(actorRole string) []string {
	if isOrganizationAdminRole(actorRole) {
		return append([]string(nil), authz.Roles...)
	}
	if authz.HasCapability(actorRole, "members:invite") {
		roles := make([]string, 0, len(authz.Roles)-1)
		for _, role := range authz.Roles {
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
	if !authz.HasCapability(actorRole, "members:invite") {
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
	return authz.IsKnownRole(role)
}
