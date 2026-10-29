package main

import (
	"context"
)

// reconcileRevokedMembership removes the membership and everything tied to it, and logs
// eventType. removeFromWorkos, when set, runs while the admin rows are locked, so two
// admins leaving or removing each other cannot both get past the last-admin check.
func (api *memberAPI) reconcileRevokedMembership(ctx context.Context, actor memberActor, member organizationMember, eventType string, removeFromWorkos func(context.Context) error) error {
	timeout := memberRevokeReconcileTimeout
	if removeFromWorkos != nil {
		timeout += memberWorkosRemoveTimeout
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
	defer cancel()
	deleted, err := api.revokeOrganizationMembershipAccessAfter(cleanupCtx, actor, member, removeFromWorkos)
	if err != nil {
		return err
	}
	if shouldCleanupPlaceholderUserOnMemberRemoval(member.workosUserID) {
		api.cleanupInvitedPlaceholderUser(cleanupCtx, member.localUserID)
	}
	// The WorkOS webhook may have removed the row first; it logs that removal itself.
	if !deleted {
		return nil
	}
	api.enqueueMemberActivity(cleanupCtx, actor, eventType, "membership", member.membershipID, map[string]any{
		"memberUserId": member.localUserID,
		"membershipId": member.membershipID,
	})
	return nil
}

func (api *memberAPI) revokeOrganizationMembershipAccess(ctx context.Context, actor memberActor, member organizationMember) error {
	_, err := api.revokeOrganizationMembershipAccessAfter(ctx, actor, member, nil)
	return err
}

// revokeOrganizationMembershipAccessAfter reports whether it removed the membership row.
func (api *memberAPI) revokeOrganizationMembershipAccessAfter(ctx context.Context, actor memberActor, member organizationMember, removeFromWorkos func(context.Context) error) (bool, error) {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The row stays locked through the WorkOS call, so the WorkOS webhook waits for this
	// removal instead of racing it. An admin's row is locked with the other admins' rows,
	// in one statement, so two admins never lock each other's rows in opposite orders.
	if member.role == "admin" {
		if err := lockOrganizationAdminsAndCount(ctx, tx, actor.organizationID, member.localUserID); err != nil {
			return false, err
		}
	} else if _, err := tx.Exec(ctx, `
        select id from organization_memberships
        where organization_id=$1 and user_id=$2
        for update`, actor.organizationID, member.localUserID); err != nil {
		return false, err
	}
	if removeFromWorkos != nil {
		workosCtx, cancel := context.WithTimeout(ctx, memberWorkosRemoveTimeout)
		err := removeFromWorkos(workosCtx)
		cancel()
		if err != nil {
			return false, err
		}
	}

	tag, err := tx.Exec(ctx, `
        delete from organization_memberships
        where organization_id=$1 and user_id=$2`, actor.organizationID, member.localUserID)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx, `
        delete from team_memberships
        where user_id=$1
          and team_id in (select id from teams where organization_id=$2)`,
		member.localUserID, actor.organizationID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
        delete from mcp_sessions
        where user_id=$1 and organization_id=$2`,
		member.localUserID, actor.organizationID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
        update figma_oauth_tokens
        set revoked_at=now(), updated_at=now()
        where user_id=$1 and organization_id=$2 and revoked_at is null`,
		member.localUserID, actor.organizationID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
        update canva_oauth_tokens
        set revoked_at=now(), updated_at=now()
        where user_id=$1 and organization_id=$2 and revoked_at is null`,
		member.localUserID, actor.organizationID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
        update sanity_plugin_oauth_tokens
        set revoked_at=now(), updated_at=now()
        where user_id=$1 and organization_id=$2 and revoked_at is null`,
		member.localUserID, actor.organizationID); err != nil {
		return false, err
	}

	rows, err := tx.Query(ctx, `
        update organization_api_keys
        set revoked_at=now()
        where organization_id=$1 and created_by_user_id=$2 and revoked_at is null
        returning id, key_prefix, name`,
		actor.organizationID, member.localUserID)
	if err != nil {
		return false, err
	}
	type revokedKey struct {
		id, keyPrefix, name string
	}
	var revoked []revokedKey
	for rows.Next() {
		var key revokedKey
		if err := rows.Scan(&key.id, &key.keyPrefix, &key.name); err != nil {
			rows.Close()
			return false, err
		}
		revoked = append(revoked, key)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
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
	return true, nil
}
