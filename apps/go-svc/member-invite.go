package main

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type createdTeamMembership struct {
	teamID string
	userID string
}

type invitedOrganizationMember struct {
	membershipID          string
	localUserID           string
	isNewUser             bool
	resend                bool
	roleChanged           bool
	previousRole          string
	createdTeamMembership *createdTeamMembership
	member                memberSummary
}

func normalizeMemberEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" || len(email) > memberEmailMaxLen {
		return "", memberFailure(400, "invalid_member_payload", "Invalid member payload")
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || !strings.EqualFold(addr.Address, email) || strings.Contains(email, " ") {
		return "", memberFailure(400, "invalid_member_payload", "Invalid member payload")
	}
	return email, nil
}

func (api *memberAPI) inviteOrganizationMember(ctx context.Context, db dictionaryDB, organizationID, email, role, teamID, placeholderWorkosUserID string) (invitedOrganizationMember, error) {
	var invited invitedOrganizationMember
	existing, err := api.findMembershipByEmail(ctx, db, organizationID, email)
	if err != nil {
		return invited, err
	}
	if existing != nil {
		if isActiveOrganizationMembership(existing.workosMembershipID) {
			return invited, memberFailure(409, "member_already_exists", "This user is already a workspace member")
		}
		roleChanged := existing.role != role
		if roleChanged {
			if _, err := db.Exec(ctx, `update organization_memberships set role=$2 where id=$1`, existing.membershipID, role); err != nil {
				return invited, err
			}
		}
		teamResult, err := api.ensureTeamAccessForInvitedMember(ctx, db, organizationID, existing.localUserID, role, teamID)
		if err != nil {
			return invited, err
		}
		invited = invitedOrganizationMember{
			membershipID:          existing.membershipID,
			localUserID:           existing.localUserID,
			isNewUser:             false,
			resend:                true,
			roleChanged:           roleChanged,
			previousRole:          existing.role,
			createdTeamMembership: teamResult,
			member: toMemberSummary(memberRow{
				userID:             existing.localUserID,
				workosUserID:       existing.workosUserID,
				email:              existing.email,
				firstName:          existing.firstName,
				lastName:           existing.lastName,
				role:               role,
				createdAt:          existing.createdAt,
				workosMembershipID: existing.workosMembershipID,
			}, "", nil),
		}
		return invited, nil
	}

	user, isNewUser, err := api.findOrCreateInvitedUser(ctx, db, email, placeholderWorkosUserID)
	if err != nil {
		return invited, err
	}
	var membershipID string
	var createdAt time.Time
	err = db.QueryRow(ctx, `
        insert into organization_memberships (organization_id, user_id, role, workos_membership_id)
        values ($1, $2, $3, null)
        returning id, created_at`,
		organizationID, user.id, role).Scan(&membershipID, &createdAt)
	if err != nil {
		return invited, err
	}
	teamResult, err := api.ensureTeamAccessForInvitedMember(ctx, db, organizationID, user.id, role, teamID)
	if err != nil {
		return invited, err
	}
	invited = invitedOrganizationMember{
		membershipID:          membershipID,
		localUserID:           user.id,
		isNewUser:             isNewUser,
		createdTeamMembership: teamResult,
		member: toMemberSummary(memberRow{
			userID:             user.id,
			workosUserID:       user.workosUserID,
			email:              user.email,
			firstName:          user.firstName,
			lastName:           user.lastName,
			role:               role,
			createdAt:          createdAt,
			workosMembershipID: nil,
		}, "", nil),
	}
	return invited, nil
}

type invitedUser struct {
	id, workosUserID, email string
	firstName, lastName     *string
}

func (api *memberAPI) findOrCreateInvitedUser(ctx context.Context, db dictionaryDB, email, placeholderWorkosUserID string) (invitedUser, bool, error) {
	var user invitedUser
	err := db.QueryRow(ctx, `
        select id, workos_user_id, email, first_name, last_name
        from users
        where lower(email)=$1
        limit 1`, email).Scan(&user.id, &user.workosUserID, &user.email, &user.firstName, &user.lastName)
	if err == nil {
		return user, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return user, false, err
	}
	err = db.QueryRow(ctx, `
        insert into users (workos_user_id, email)
        values ($1, $2)
        returning id, workos_user_id, email, first_name, last_name`,
		placeholderWorkosUserID, email).Scan(&user.id, &user.workosUserID, &user.email, &user.firstName, &user.lastName)
	if err != nil {
		return user, false, err
	}
	return user, true, nil
}

func (api *memberAPI) ensureTeamAccessForInvitedMember(ctx context.Context, db dictionaryDB, organizationID, userID, role, teamID string) (*createdTeamMembership, error) {
	if hasOrganizationCapability(role, "teams:write") && teamID == "" {
		return nil, nil
	}
	if teamID != "" {
		var found string
		err := db.QueryRow(ctx, `select id from teams where id=$1 and organization_id=$2`, teamID, organizationID).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, memberFailure(404, "team_not_found", "Team not found")
		}
		if err != nil {
			return nil, err
		}
		created, err := api.ensureTeamMembership(ctx, db, found, userID)
		if err != nil {
			return nil, err
		}
		if created {
			return &createdTeamMembership{teamID: found, userID: userID}, nil
		}
		return nil, nil
	}
	teamID, created, err := api.ensureDefaultWorkspaceTeamMembership(ctx, db, organizationID, userID)
	if err != nil {
		return nil, err
	}
	if created {
		return &createdTeamMembership{teamID: teamID, userID: userID}, nil
	}
	return nil, nil
}

func (api *memberAPI) ensureTeamMembership(ctx context.Context, db dictionaryDB, teamID, userID string) (bool, error) {
	var existing string
	err := db.QueryRow(ctx, `select id from team_memberships where team_id=$1 and user_id=$2`, teamID, userID).Scan(&existing)
	if err == nil {
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	_, err = db.Exec(ctx, `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member')`, teamID, userID)
	if err != nil {
		return false, err
	}
	return true, nil
}

func (api *memberAPI) ensureDefaultWorkspaceTeamMembership(ctx context.Context, db dictionaryDB, organizationID, userID string) (string, bool, error) {
	teamID, err := api.ensureDefaultWorkspaceTeam(ctx, db, organizationID)
	if err != nil {
		return "", false, err
	}
	created, err := api.ensureTeamMembership(ctx, db, teamID, userID)
	if err != nil {
		return "", false, err
	}
	return teamID, created, nil
}

func (api *memberAPI) ensureDefaultWorkspaceTeam(ctx context.Context, db dictionaryDB, organizationID string) (string, error) {
	var teamID string
	err := db.QueryRow(ctx, `select id from teams where organization_id=$1 and slug=$2`, organizationID, defaultWorkspaceTeamSlug).Scan(&teamID)
	if err == nil {
		return teamID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	err = db.QueryRow(ctx, `
        insert into teams (organization_id, slug, name)
        values ($1, $2, $3)
        on conflict (organization_id, slug) do nothing
        returning id`,
		organizationID, defaultWorkspaceTeamSlug, defaultWorkspaceTeamName).Scan(&teamID)
	if err == nil {
		return teamID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	err = db.QueryRow(ctx, `select id from teams where organization_id=$1 and slug=$2`, organizationID, defaultWorkspaceTeamSlug).Scan(&teamID)
	if err != nil {
		return "", err
	}
	return teamID, nil
}

func (api *memberAPI) rollbackFailedInvitation(ctx context.Context, pending invitedOrganizationMember) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), memberInviteRollbackTimeout)
	defer cancel()
	if !pending.resend {
		api.rollbackPendingInvite(cleanupCtx, pending)
	} else if pending.roleChanged {
		_, _ = api.pool.Exec(cleanupCtx, `update organization_memberships set role=$2 where id=$1`, pending.membershipID, pending.previousRole)
	}
	api.rollbackCreatedTeamMembership(cleanupCtx, pending.createdTeamMembership)
}

func (api *memberAPI) rollbackCreatedTeamMembership(ctx context.Context, created *createdTeamMembership) {
	if created == nil {
		return
	}
	_, _ = api.pool.Exec(ctx, `delete from team_memberships where team_id=$1 and user_id=$2`, created.teamID, created.userID)
}

func (api *memberAPI) rollbackPendingInvite(ctx context.Context, invited invitedOrganizationMember) {
	_, _ = api.pool.Exec(ctx, `delete from organization_memberships where id=$1`, invited.membershipID)
	if invited.isNewUser {
		api.cleanupInvitedPlaceholderUser(ctx, invited.localUserID)
	}
}

func (api *memberAPI) cleanupInvitedPlaceholderUser(ctx context.Context, localUserID string) {
	_, _ = api.pool.Exec(ctx, `
        delete from users
        where id=$1
          and not exists (
            select 1 from organization_memberships where user_id=users.id
          )`, localUserID)
}

func (api *memberAPI) teamExists(ctx context.Context, organizationID, teamID string) error {
	if teamID == "" {
		return nil
	}
	if uuid.Validate(teamID) != nil {
		return memberFailure(404, "team_not_found", "Team not found")
	}
	var found string
	err := api.pool.QueryRow(ctx, `select id from teams where id=$1 and organization_id=$2`, teamID, organizationID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return memberFailure(404, "team_not_found", "Team not found")
	}
	return err
}

func (api *memberAPI) existingMembershipIDForEmail(ctx context.Context, organizationID, email string) (string, bool, error) {
	var membershipID string
	err := api.pool.QueryRow(ctx, `
        select m.id
        from users u
        join organization_memberships m on m.user_id=u.id
        where m.organization_id=$1 and lower(u.email)=$2
        limit 1`, organizationID, email).Scan(&membershipID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return membershipID, true, nil
}
