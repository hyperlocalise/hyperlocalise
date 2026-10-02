package main

import (
	"context"
)

func (api *memberAPI) reconcileRevokedMembership(ctx context.Context, actor memberActor, member organizationMember) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), memberRevokeReconcileTimeout)
	defer cancel()
	if err := api.revokeOrganizationMembershipAccess(cleanupCtx, actor, member); err != nil {
		return err
	}
	if shouldCleanupPlaceholderUserOnMemberRemoval(member.workosUserID) {
		api.cleanupInvitedPlaceholderUser(cleanupCtx, member.localUserID)
	}
	api.enqueueMemberActivity(cleanupCtx, actor, "member_removed", "membership", member.membershipID, map[string]any{
		"memberUserId": member.localUserID,
		"membershipId": member.membershipID,
	})
	return nil
}

func (api *memberAPI) revokeOrganizationMembershipAccess(ctx context.Context, actor memberActor, member organizationMember) error {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if member.role == "admin" {
		if err := lockOrganizationAdminsAndCount(ctx, tx, actor.organizationID); err != nil {
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

	rows, err := tx.Query(ctx, `
        update organization_api_keys
        set revoked_at=now()
        where organization_id=$1 and created_by_user_id=$2 and revoked_at is null
        returning id, key_prefix`,
		actor.organizationID, member.localUserID)
	if err != nil {
		return err
	}
	type revokedKey struct {
		id, keyPrefix string
	}
	var revoked []revokedKey
	for rows.Next() {
		var key revokedKey
		if err := rows.Scan(&key.id, &key.keyPrefix); err != nil {
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
		_ = patAuditor{}.emitPatRevoked(ctx, patRevokedAuditInput{
			actorUserID:    actor.userID,
			ownerUserID:    &member.localUserID,
			organizationID: actor.organizationID,
			tokenID:        key.id,
			keyPrefix:      key.keyPrefix,
			reason:         patRevokeReasonMembershipRemoved,
		})
		api.enqueueMemberActivity(ctx, actor, "personal_access_token_revoked", "personal_access_token", key.id, map[string]any{
			"keyPrefix": key.keyPrefix,
			"reason":    patRevokeReasonMembershipRemoved,
			"tokenId":   key.id,
		})
	}
	return nil
}
