package main

import (
	"context"
)

// reconcileRevokedMembership removes the membership and everything tied to it, and logs
// eventType. removeFromWorkos, when set, runs while the admin rows are locked, so two
// admins leaving or removing each other cannot both get past the last-admin check.
func (api *memberAPI) reconcileRevokedMembership(ctx context.Context, actor memberActor, member organizationMember, eventType string, removeFromWorkos func(context.Context) error) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), memberRevokeReconcileTimeout)
	defer cancel()
	if err := api.revokeOrganizationMembershipAccessAfter(cleanupCtx, actor, member, removeFromWorkos); err != nil {
		return err
	}
	if shouldCleanupPlaceholderUserOnMemberRemoval(member.workosUserID) {
		api.cleanupInvitedPlaceholderUser(cleanupCtx, member.localUserID)
	}
	api.enqueueMemberActivity(cleanupCtx, actor, eventType, "membership", member.membershipID, map[string]any{
		"memberUserId": member.localUserID,
		"membershipId": member.membershipID,
	})
	return nil
}

func (api *memberAPI) revokeOrganizationMembershipAccess(ctx context.Context, actor memberActor, member organizationMember) error {
	return api.revokeOrganizationMembershipAccessAfter(ctx, actor, member, nil)
}

func (api *memberAPI) revokeOrganizationMembershipAccessAfter(ctx context.Context, actor memberActor, member organizationMember, removeFromWorkos func(context.Context) error) error {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if member.role == "admin" {
		if err := lockOrganizationAdminsAndCount(ctx, tx, actor.organizationID, member.localUserID); err != nil {
			return err
		}
	}
	if removeFromWorkos != nil {
		if err := removeFromWorkos(ctx); err != nil {
			return err
		}
	}

	tag, err := tx.Exec(ctx, `
        delete from organization_memberships
        where organization_id=$1 and user_id=$2`, actor.organizationID, member.localUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx, `
        delete from team_memberships
        where user_id=$1
          and team_id in (select id from teams where organization_id=$2)`,
		member.localUserID, actor.organizationID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        delete from mcp_sessions
        where user_id=$1 and organization_id=$2`,
		member.localUserID, actor.organizationID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        update figma_oauth_tokens
        set revoked_at=now(), updated_at=now()
        where user_id=$1 and organization_id=$2 and revoked_at is null`,
		member.localUserID, actor.organizationID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        update canva_oauth_tokens
        set revoked_at=now(), updated_at=now()
        where user_id=$1 and organization_id=$2 and revoked_at is null`,
		member.localUserID, actor.organizationID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        update sanity_plugin_oauth_tokens
        set revoked_at=now(), updated_at=now()
        where user_id=$1 and organization_id=$2 and revoked_at is null`,
		member.localUserID, actor.organizationID); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
        update organization_api_keys
        set revoked_at=now()
        where organization_id=$1 and created_by_user_id=$2 and revoked_at is null
        returning id, key_prefix, name`,
		actor.organizationID, member.localUserID)
	if err != nil {
		return err
	}
	type revokedKey struct {
		id, keyPrefix, name string
	}
	var revoked []revokedKey
	for rows.Next() {
		var key revokedKey
		if err := rows.Scan(&key.id, &key.keyPrefix, &key.name); err != nil {
			rows.Close()
			return err
		}
		revoked = append(revoked, key)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	for _, key := range revoked {
		err := patAuditor{}.emitPatRevoked(ctx, patRevokedAuditInput{
			actorUserID:    actor.userID,
			ownerUserID:    &member.localUserID,
			organizationID: actor.organizationID,
			tokenID:        key.id,
			keyPrefix:      key.keyPrefix,
			reason:         patRevokeReasonMembershipRemoved,
		})
		logPatAuditFailure(ctx, patRevokedAuditAction, actor.organizationID, key.id, err)
		api.enqueueMemberActivity(ctx, actor, "organization_api_key_revoked", "organization_api_key", key.id, map[string]any{
			"apiKeyId":  key.id,
			"keyPrefix": key.keyPrefix,
			"name":      key.name,
			"reason":    patRevokeReasonMembershipRemoved,
		})
	}
	return nil
}
