package main

import (
	"context"
	"errors"
	"net/http"
)

const leaveWorkspacePreviewLimit = 50

type leaveWorkspaceAPIKey struct {
	Name      string `json:"name"`
	KeyPrefix string `json:"keyPrefix"`
}

type leaveWorkspaceAutomation struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type leaveWorkspacePreview struct {
	// BlockedReason is "last_admin" when the person is the workspace's only admin.
	BlockedReason *string                    `json:"blockedReason"`
	APIKeys       []leaveWorkspaceAPIKey     `json:"apiKeys"`
	Automations   []leaveWorkspaceAutomation `json:"automations"`
}

func (api *memberAPI) leaveWorkspaceHandler(r *http.Request, actor memberActor) (any, int, error) {
	status, err := api.leaveWorkspace(r.Context(), actor)
	return nil, status, err
}

func (api *memberAPI) leaveWorkspacePreviewHandler(r *http.Request, actor memberActor) (any, int, error) {
	return api.leaveWorkspacePreview(r.Context(), actor)
}

// leaveWorkspace removes the caller's own membership. Anyone may leave except the last
// admin who has accepted their invitation.
func (api *memberAPI) leaveWorkspace(ctx context.Context, actor memberActor) (int, error) {
	member, err := api.getOrganizationMember(ctx, actor.organizationID, actor.workosUserID)
	if errors.Is(err, errMemberNotFound) {
		return http.StatusNoContent, nil
	}
	if err != nil {
		return 0, err
	}
	var removeFromWorkos func(context.Context) error
	if shouldSyncMembershipToWorkos(api.workos, member.workosMembershipID) {
		removeFromWorkos = func(ctx context.Context) error {
			return api.deleteWorkosMembership(ctx, actor, member)
		}
	}
	if err := api.reconcileRevokedMembership(ctx, actor, member, "member_left", removeFromWorkos); err != nil {
		return 0, err
	}
	return http.StatusNoContent, nil
}

// leaveWorkspacePreview lists what stops working when the caller leaves: their access keys,
// and automations that sign in to other services with accounts they connected.
func (api *memberAPI) leaveWorkspacePreview(ctx context.Context, actor memberActor) (any, int, error) {
	member, err := api.getOrganizationMember(ctx, actor.organizationID, actor.workosUserID)
	if err != nil {
		return nil, 0, err
	}
	preview := leaveWorkspacePreview{
		APIKeys:     []leaveWorkspaceAPIKey{},
		Automations: []leaveWorkspaceAutomation{},
	}
	if member.role == "admin" {
		var otherAdmins int
		if err := api.pool.QueryRow(ctx, `
            select count(*)::int from organization_memberships
            where organization_id=$1 and role='admin' and user_id<>$2
              and nullif(btrim(workos_membership_id), '') is not null
              and workos_membership_id<>$3 and workos_membership_id not like $4`,
			actor.organizationID, member.localUserID, replacingWorkosMembershipID, replacingWorkosMembershipIDPrefix+"%").Scan(&otherAdmins); err != nil {
			return nil, 0, err
		}
		if otherAdmins == 0 {
			reason := "last_admin"
			preview.BlockedReason = &reason
		}
	}

	keys, err := api.pool.Query(ctx, `
        select name, key_prefix from organization_api_keys
        where organization_id=$1 and created_by_user_id=$2 and revoked_at is null
        order by created_at
        limit $3`, actor.organizationID, member.localUserID, leaveWorkspacePreviewLimit)
	if err != nil {
		return nil, 0, err
	}
	for keys.Next() {
		var key leaveWorkspaceAPIKey
		if err := keys.Scan(&key.Name, &key.KeyPrefix); err != nil {
			keys.Close()
			return nil, 0, err
		}
		preview.APIKeys = append(preview.APIKeys, key)
	}
	keys.Close()
	if err := keys.Err(); err != nil {
		return nil, 0, err
	}

	// Each tool that signs in through WorkOS Pipes stores the connecting person's WorkOS
	// user under its own key in tool_config.
	automations, err := api.pool.Query(ctx, `
        select a.id::text, a.name from workspace_automations a
        where a.organization_id=$1 and a.status<>'archived'
          and jsonb_typeof(a.tool_config)='object'
          and exists (
              select 1 from jsonb_each(a.tool_config) tool
              where jsonb_typeof(tool.value)='object' and tool.value->>'workosUserId'=$2
          )
        order by a.name
        limit $3`, actor.organizationID, member.workosUserID, leaveWorkspacePreviewLimit)
	if err != nil {
		return nil, 0, err
	}
	for automations.Next() {
		var automation leaveWorkspaceAutomation
		if err := automations.Scan(&automation.ID, &automation.Name); err != nil {
			automations.Close()
			return nil, 0, err
		}
		preview.Automations = append(preview.Automations, automation)
	}
	automations.Close()
	if err := automations.Err(); err != nil {
		return nil, 0, err
	}
	return preview, http.StatusOK, nil
}
