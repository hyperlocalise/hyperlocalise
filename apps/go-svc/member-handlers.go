package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type memberSummary struct {
	UserID        string  `json:"userId"`
	WorkosUserID  string  `json:"workosUserId"`
	Email         string  `json:"email"`
	FirstName     *string `json:"firstName"`
	LastName      *string `json:"lastName"`
	DisplayName   string  `json:"displayName"`
	AvatarURL     *string `json:"avatarUrl"`
	Role          string  `json:"role"`
	IsCurrentUser bool    `json:"isCurrentUser"`
	CreatedAt     string  `json:"createdAt"`
	Status        string  `json:"status"`
	CanUpdateRole *bool   `json:"canUpdateRole,omitempty"`
	CanRemove     *bool   `json:"canRemove,omitempty"`
}

type memberRow struct {
	userID             string
	workosUserID       string
	email              string
	firstName          *string
	lastName           *string
	avatarURL          *string
	role               string
	createdAt          time.Time
	workosMembershipID *string
}

type organizationMember struct {
	membershipID       string
	workosMembershipID *string
	role               string
	createdAt          time.Time
	workosUserID       string
	email              string
	firstName          *string
	lastName           *string
	avatarURL          *string
	localUserID        string
}

func toMemberSummary(row memberRow, currentWorkosUserID string, actorRole *string) memberSummary {
	isCurrentUser := row.workosUserID == currentWorkosUserID
	summary := memberSummary{
		UserID:        row.userID,
		WorkosUserID:  row.workosUserID,
		Email:         row.email,
		FirstName:     row.firstName,
		LastName:      row.lastName,
		DisplayName:   formatMemberDisplayName(derefString(row.firstName), derefString(row.lastName), row.email),
		AvatarURL:     row.avatarURL,
		Role:          row.role,
		IsCurrentUser: isCurrentUser,
		CreatedAt:     formatMemberTime(row.createdAt),
		Status:        resolveMemberStatus(row.workosMembershipID),
	}
	if actorRole != nil {
		canUpdate, canRemove := memberRowCapabilities(*actorRole, row.role, isCurrentUser)
		summary.CanUpdateRole = &canUpdate
		summary.CanRemove = &canRemove
	}
	return summary
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (api *memberAPI) listMembers(ctx context.Context, actor memberActor) (any, int, error) {
	if !actor.canListMembers() {
		return nil, 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}
	rows, err := api.pool.Query(ctx, `
        select u.id, u.workos_user_id, u.email, u.first_name, u.last_name, u.avatar_url,
               m.role, m.created_at, m.workos_membership_id
        from organization_memberships m
        join users u on u.id=m.user_id
        where m.organization_id=$1
        order by m.created_at`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	members := make([]memberSummary, 0)
	actorRole := actor.role
	for rows.Next() {
		var row memberRow
		if err := rows.Scan(
			&row.userID, &row.workosUserID, &row.email, &row.firstName, &row.lastName, &row.avatarURL,
			&row.role, &row.createdAt, &row.workosMembershipID,
		); err != nil {
			return nil, 0, err
		}
		members = append(members, toMemberSummary(row, actor.workosUserID, &actorRole))
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"members":          members,
		"memberManagement": buildMemberManagementContext(actor.role),
	}, 200, nil
}

type inviteMemberBody struct {
	Email  string  `json:"email"`
	Role   string  `json:"role"`
	TeamID *string `json:"teamId"`
}

func (api *memberAPI) inviteMember(ctx context.Context, actor memberActor, r *http.Request) (any, int, error) {
	if !actor.canManageMembers() {
		return nil, 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}
	body, err := decodeInviteMemberBody(r)
	if err != nil {
		return nil, 0, err
	}
	if !canActorAssignRole(actor.role, body.Role) {
		return nil, 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}
	if api.workos == nil {
		return nil, 0, memberFailure(503, "workos_server_not_configured", "WorkOS server integration is not configured")
	}
	email, err := normalizeMemberEmail(body.Email)
	if err != nil {
		return nil, 0, err
	}
	teamID := strings.TrimSpace(derefString(body.TeamID))
	if err := api.teamExists(ctx, actor.organizationID, teamID); err != nil {
		return nil, 0, err
	}

	_, exists, err := api.existingMembershipIDForEmail(ctx, actor.organizationID, email)
	if err != nil {
		return nil, 0, err
	}

	placeholder := invitedWorkosUserIDPrefix + uuid.NewString()
	var pending invitedOrganizationMember
	if !exists {
		err = api.withSeatLimit(ctx, actor.organizationID, func(tx pgx.Tx) error {
			invited, inviteErr := api.inviteOrganizationMember(ctx, tx, actor.organizationID, email, body.Role, teamID, placeholder)
			if inviteErr != nil {
				return inviteErr
			}
			pending = invited
			return nil
		})
		if err != nil {
			return nil, 0, err
		}
	} else {
		existing, findErr := api.findMembershipByEmail(ctx, api.pool, actor.organizationID, email)
		if findErr != nil {
			return nil, 0, findErr
		}
		if existing != nil {
			if isActiveOrganizationMembership(existing.workosMembershipID) {
				return nil, 0, memberFailure(409, "member_already_exists", "This user is already a workspace member")
			}
			// Resend/role-change must not manage targets the actor cannot assign
			// (e.g. localization_manager demoting a pending admin invite).
			if !canActorManageTarget(actor.role, existing.role, &body.Role) {
				return nil, 0, memberFailure(403, "forbidden", "Insufficient permissions")
			}
		}
		pending, err = api.inviteOrganizationMember(ctx, api.pool, actor.organizationID, email, body.Role, teamID, placeholder)
		if err != nil {
			return nil, 0, err
		}
	}

	err = api.deliverWorkosInvitation(ctx, memberInvitationInput{
		workosOrganizationID: actor.workosOrganizationID,
		email:                email,
		inviterUserID:        actor.workosUserID,
		roleSlug:             body.Role,
	}, pending.membershipID, !pending.resend || pending.roleChanged)
	if err != nil {
		slog.ErrorContext(ctx, "workspace member invitation delivery failed",
			"organization_id", actor.organizationID,
			"membership_id", pending.membershipID,
			"local_user_id", pending.localUserID,
			"actor_workos_user_id", actor.workosUserID,
			"role", body.Role,
			"is_resend", pending.resend,
			"role_changed", pending.roleChanged,
		)
		api.rollbackFailedInvitation(ctx, pending)
		if isWorkosInvitationRevokedNotDeliveredError(err) {
			return nil, 0, memberFailure(500, "member_invite_revoked_not_delivered", "The previous invitation was revoked but a new one could not be sent. Invite this member again.")
		}
		return nil, 0, memberFailure(500, "member_invite_failed", "Failed to send workspace invitation")
	}

	if pending.resend {
		api.enqueueMemberActivity(ctx, actor, "member_invite_resent", "invitation", pending.membershipID, map[string]any{
			"invitationId": pending.membershipID,
		})
	} else {
		api.enqueueMemberActivity(ctx, actor, "member_invited", "invitation", pending.membershipID, map[string]any{
			"invitationId": pending.membershipID,
			"membershipId": pending.membershipID,
		})
	}

	pending.member.IsCurrentUser = false
	status := http.StatusCreated
	if pending.resend {
		status = http.StatusOK
	}
	return map[string]any{"member": pending.member}, status, nil
}

type updateMemberBody struct {
	Role string `json:"role"`
}

func (api *memberAPI) updateMember(ctx context.Context, actor memberActor, workosUserID string, r *http.Request) (any, int, error) {
	if !actor.canManageMembers() {
		return nil, 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}
	body, err := decodeUpdateMemberBody(r)
	if err != nil {
		return nil, 0, err
	}
	member, err := api.getOrganizationMember(ctx, actor.organizationID, workosUserID)
	if err != nil {
		return nil, 0, err
	}
	if !canActorManageTarget(actor.role, member.role, &body.Role) {
		return nil, 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}

	previousRole := member.role
	updated, err := api.updateMemberRole(ctx, actor.organizationID, member, body.Role)
	if err != nil {
		return nil, 0, err
	}
	roleChanged := previousRole != body.Role
	isPendingInvite := isPendingOrganizationMembership(member.workosMembershipID)

	if shouldSyncMembershipToWorkos(api.workos, member.workosMembershipID) {
		if err := api.workos.UpdateOrganizationMembershipRole(ctx, derefString(member.workosMembershipID), body.Role); err != nil {
			slog.ErrorContext(ctx, "workspace member role sync failed",
				"organization_id", actor.organizationID,
				"membership_id", member.membershipID,
				"workos_membership_id", derefString(member.workosMembershipID),
				"actor_workos_user_id", actor.workosUserID,
				"target_workos_user_id", member.workosUserID,
				"previous_role", previousRole,
				"role", body.Role,
			)
			_, _ = api.pool.Exec(ctx, `update organization_memberships set role=$2 where id=$1`, member.membershipID, previousRole)
			return nil, 0, memberFailure(500, "member_sync_failed", "Failed to sync member role with identity provider")
		}
	} else if isPendingInvite && roleChanged {
		if api.workos == nil {
			_, _ = api.pool.Exec(ctx, `update organization_memberships set role=$2 where id=$1`, member.membershipID, previousRole)
			return nil, 0, memberFailure(503, "workos_server_not_configured", "WorkOS server integration is not configured")
		}
		if err := api.deliverWorkosInvitation(ctx, memberInvitationInput{
			workosOrganizationID: actor.workosOrganizationID,
			email:                member.email,
			inviterUserID:        actor.workosUserID,
			roleSlug:             body.Role,
		}, member.membershipID, true); err != nil {
			slog.ErrorContext(ctx, "workspace pending invitation role update failed",
				"organization_id", actor.organizationID,
				"membership_id", member.membershipID,
				"actor_workos_user_id", actor.workosUserID,
				"target_workos_user_id", member.workosUserID,
				"previous_role", previousRole,
				"role", body.Role,
			)
			_, _ = api.pool.Exec(ctx, `update organization_memberships set role=$2 where id=$1`, member.membershipID, previousRole)
			if isWorkosInvitationRevokedNotDeliveredError(err) {
				return nil, 0, memberFailure(500, "member_invite_revoked_not_delivered", "The previous invitation was revoked but a new one could not be sent. Invite this member again.")
			}
			return nil, 0, memberFailure(500, "member_sync_failed", "Failed to sync member role with identity provider")
		}
	}

	if roleChanged {
		api.enqueueMemberActivity(ctx, actor, "member_role_changed", "membership", member.membershipID, map[string]any{
			"memberUserId": member.localUserID,
			"membershipId": member.membershipID,
			"nextRole":     updated.role,
			"previousRole": previousRole,
		})
	}

	return map[string]any{
		"member": toMemberSummary(memberRow{
			userID:             member.localUserID,
			workosUserID:       member.workosUserID,
			email:              member.email,
			firstName:          member.firstName,
			lastName:           member.lastName,
			avatarURL:          member.avatarURL,
			role:               updated.role,
			createdAt:          updated.createdAt,
			workosMembershipID: member.workosMembershipID,
		}, actor.workosUserID, nil),
	}, 200, nil
}

func (api *memberAPI) deleteMember(ctx context.Context, actor memberActor, workosUserID string) (int, error) {
	if !actor.canManageMembers() {
		return 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}
	member, err := api.getOrganizationMember(ctx, actor.organizationID, workosUserID)
	if errors.Is(err, errMemberNotFound) {
		return http.StatusNoContent, nil
	}
	if err != nil {
		return 0, err
	}
	if !canActorManageTarget(actor.role, member.role, nil) {
		return 0, memberFailure(403, "forbidden", "Insufficient permissions")
	}

	isPendingInvite := isPendingOrganizationMembership(member.workosMembershipID)
	if member.role == "admin" {
		if err := api.guardLastAdmin(ctx, actor.organizationID); err != nil {
			return 0, err
		}
	}

	if shouldSyncMembershipToWorkos(api.workos, member.workosMembershipID) {
		if err := api.workos.DeleteOrganizationMembership(ctx, derefString(member.workosMembershipID)); err != nil && !isWorkosNotFoundError(err) {
			slog.ErrorContext(ctx, "workspace member removal sync failed",
				"organization_id", actor.organizationID,
				"membership_id", member.membershipID,
				"workos_membership_id", derefString(member.workosMembershipID),
				"actor_workos_user_id", actor.workosUserID,
				"target_workos_user_id", member.workosUserID,
			)
			return 0, memberFailure(500, "member_sync_failed", "Failed to sync member removal with identity provider")
		}
	} else if isPendingInvite && api.workos != nil {
		if err := api.revokePendingWorkosInvitation(ctx, actor.workosOrganizationID, member.email); err != nil {
			slog.ErrorContext(ctx, "workspace pending invitation revoke failed",
				"organization_id", actor.organizationID,
				"membership_id", member.membershipID,
				"actor_workos_user_id", actor.workosUserID,
				"target_workos_user_id", member.workosUserID,
			)
			return 0, memberFailure(500, "member_sync_failed", "Failed to revoke workspace invitation with identity provider")
		}
	}

	if err := api.reconcileRevokedMembership(ctx, actor, member); err != nil {
		return 0, err
	}
	return http.StatusNoContent, nil
}

var errMemberNotFound = memberFailure(404, "member_not_found", "Workspace member not found")

func (api *memberAPI) getOrganizationMember(ctx context.Context, organizationID, workosUserID string) (organizationMember, error) {
	var member organizationMember
	err := api.pool.QueryRow(ctx, `
        select m.id, m.workos_membership_id, m.role, m.created_at,
               u.workos_user_id, u.email, u.first_name, u.last_name, u.avatar_url, u.id
        from organization_memberships m
        join users u on u.id=m.user_id
        where m.organization_id=$1 and u.workos_user_id=$2
        limit 1`, organizationID, workosUserID).Scan(
		&member.membershipID, &member.workosMembershipID, &member.role, &member.createdAt,
		&member.workosUserID, &member.email, &member.firstName, &member.lastName, &member.avatarURL, &member.localUserID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return member, errMemberNotFound
	}
	return member, err
}

func (api *memberAPI) findMembershipByEmail(ctx context.Context, db dictionaryDB, organizationID, email string) (*organizationMember, error) {
	var member organizationMember
	err := db.QueryRow(ctx, `
        select m.id, m.workos_membership_id, m.role, m.created_at,
               u.workos_user_id, u.email, u.first_name, u.last_name, u.id
        from users u
        join organization_memberships m on m.user_id=u.id
        where m.organization_id=$1 and lower(u.email)=$2
        limit 1`, organizationID, email).Scan(
		&member.membershipID, &member.workosMembershipID, &member.role, &member.createdAt,
		&member.workosUserID, &member.email, &member.firstName, &member.lastName, &member.localUserID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func (api *memberAPI) updateMemberRole(ctx context.Context, organizationID string, member organizationMember, role string) (organizationMember, error) {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return member, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if member.role == "admin" && role != "admin" {
		if err := lockOrganizationAdminsAndCount(ctx, tx, organizationID); err != nil {
			return member, err
		}
	}
	err = tx.QueryRow(ctx, `
        update organization_memberships
        set role=$2
        where id=$1
        returning role, created_at`, member.membershipID, role).Scan(&member.role, &member.createdAt)
	if err != nil {
		return member, err
	}
	if err := tx.Commit(ctx); err != nil {
		return member, err
	}
	return member, nil
}

func (api *memberAPI) guardLastAdmin(ctx context.Context, organizationID string) error {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockOrganizationAdminsAndCount(ctx, tx, organizationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func lockOrganizationAdminsAndCount(ctx context.Context, tx pgx.Tx, organizationID string) error {
	if _, err := tx.Exec(ctx, `select id from organization_memberships where organization_id=$1 and role='admin' for update`, organizationID); err != nil {
		return err
	}
	var count int
	if err := tx.QueryRow(ctx, `select count(*)::int from organization_memberships where organization_id=$1 and role='admin'`, organizationID).Scan(&count); err != nil {
		return err
	}
	if count <= 1 {
		return memberFailure(409, "last_admin_protected", "The workspace must have at least one admin")
	}
	return nil
}

func decodeInviteMemberBody(r *http.Request) (inviteMemberBody, error) {
	var body inviteMemberBody
	if err := decodeMemberJSON(r, &body); err != nil {
		return body, err
	}
	if strings.TrimSpace(body.Role) == "" {
		body.Role = "member"
	}
	if !isKnownMemberRole(body.Role) {
		return body, memberFailure(400, "invalid_member_payload", "Invalid member payload")
	}
	if body.TeamID != nil {
		teamID := strings.TrimSpace(*body.TeamID)
		if teamID == "" {
			body.TeamID = nil
		} else if uuid.Validate(teamID) != nil {
			return body, memberFailure(400, "invalid_member_payload", "Invalid member payload")
		} else {
			body.TeamID = &teamID
		}
	}
	return body, nil
}

func decodeUpdateMemberBody(r *http.Request) (updateMemberBody, error) {
	var body updateMemberBody
	if err := decodeMemberJSON(r, &body); err != nil {
		return body, err
	}
	if !isKnownMemberRole(body.Role) {
		return body, memberFailure(400, "invalid_member_payload", "Invalid member payload")
	}
	return body, nil
}

func decodeMemberJSON(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		if isRequestBodyTooLarge(err) {
			return memberFailure(413, "payload_too_large", "Request body exceeds maximum allowed size")
		}
		if errors.Is(err, io.EOF) {
			return memberFailure(400, "invalid_member_payload", "Invalid member payload")
		}
		return memberFailure(400, "invalid_member_payload", "Invalid member payload")
	}
	return nil
}
