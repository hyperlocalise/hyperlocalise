package main

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

type organizationMembershipLookup func(context.Context, string) (*workos.UserOrganizationMembership, error)

type organizationActor struct {
	userID, organizationID, role string
}

type organizationAccessError struct {
	status        int
	code, message string
}

func (e *organizationAccessError) Error() string { return e.code }

func organizationAccessDenied() error {
	return &organizationAccessError{403, "organization_access_denied", "Organization access denied"}
}

func organizationMembershipLookupFailed() error {
	return &organizationAccessError{503, "workos_membership_lookup_failed", "Organization membership could not be verified"}
}

func mapOrganizationAccessError(err error, fail func(status int, code, message string) error) error {
	var access *organizationAccessError
	if errors.As(err, &access) {
		return fail(access.status, access.code, access.message)
	}
	return err
}

func mapOrganizationAccessCode(err error, fail func(status int, code string) error) error {
	var access *organizationAccessError
	if errors.As(err, &access) {
		return fail(access.status, access.code)
	}
	return err
}

func isKnownOrganizationRole(slug string) bool {
	switch slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func resolveOrganizationActor(
	ctx context.Context,
	db dictionaryDB,
	lookup organizationMembershipLookup,
	claims AuthClaims,
	slug string,
) (organizationActor, error) {
	var actor organizationActor
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, organizationAccessDenied()
	}
	var membershipID, workosOrg string
	err := db.QueryRow(ctx, `select u.id, o.id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`,
		claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, organizationAccessDenied()
	}
	if err != nil {
		return actor, err
	}
	actor.role, err = verifyLiveOrganizationMembership(ctx, lookup, membershipID, claims.UserID, workosOrg)
	return actor, err
}

func resolveOrganizationActorByID(
	ctx context.Context,
	db dictionaryDB,
	lookup organizationMembershipLookup,
	localUserID, organizationID string,
) (organizationActor, error) {
	var actor organizationActor
	var workosUserID, membershipID, workosOrg string
	err := db.QueryRow(ctx, `select u.id, o.id, u.workos_user_id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.id=$1 and o.id=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`,
		localUserID, organizationID).Scan(&actor.userID, &actor.organizationID, &workosUserID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return organizationActor{}, organizationAccessDenied()
	}
	if err != nil {
		return organizationActor{}, err
	}
	if strings.HasPrefix(workosUserID, "invited_user_") {
		return organizationActor{}, organizationAccessDenied()
	}
	actor.role, err = verifyLiveOrganizationMembership(ctx, lookup, membershipID, workosUserID, workosOrg)
	if err != nil {
		return organizationActor{}, err
	}
	return actor, nil
}

func verifyLiveOrganizationMembership(
	ctx context.Context,
	lookup organizationMembershipLookup,
	membershipID, workosUserID, workosOrganizationID string,
) (string, error) {
	if lookup == nil {
		return "", organizationMembershipLookupFailed()
	}
	member, err := lookup(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return "", organizationAccessDenied()
		}
		return "", organizationMembershipLookupFailed()
	}
	if member == nil || member.ID != membershipID || member.UserID != workosUserID || member.OrganizationID != workosOrganizationID || member.Status != "active" || member.Role == nil || !isKnownOrganizationRole(member.Role.Slug) {
		return "", organizationAccessDenied()
	}
	return member.Role.Slug, nil
}
