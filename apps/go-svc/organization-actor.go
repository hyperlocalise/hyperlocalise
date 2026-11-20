package main

import (
	"context"
	"errors"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
	"github.com/jackc/pgx/v5"
)

type organizationMembershipLookup = publicauth.MembershipLookup

type organizationActor struct {
	userID, organizationID, role string
}

func mapOrganizationAccessError(err error, fail func(status int, code, message string) error) error {
	var access *publicauth.AccessError
	if errors.As(err, &access) {
		return fail(access.Status, access.Code, access.Message)
	}
	return err
}

func mapOrganizationAccessCode(err error, fail func(status int, code string) error) error {
	var access *publicauth.AccessError
	if errors.As(err, &access) {
		return fail(access.Status, access.Code)
	}
	return err
}

// resolveOrganizationActor refuses a vendor (a person in a vendor team), so a route is closed to
// one unless its handler resolves the actor with resolveOrganizationActorAllowingVendorIf.
func resolveOrganizationActor(
	ctx context.Context,
	db dictionaryDB,
	lookup organizationMembershipLookup,
	claims AuthClaims,
	slug string,
) (organizationActor, error) {
	actor, _, err := resolveOrganizationActorAllowingVendorIf(ctx, db, lookup, claims, slug, false)
	return actor, err
}

// resolveOrganizationActorAllowingVendorIf is for the few handlers a vendor may call; it reports
// whether the person is one. Each handler that passes allowVendor must then limit a vendor to
// their own open tasks (vendor-access.go). A vendor keeps their role, which decides what they may
// do inside a task.
func resolveOrganizationActorAllowingVendorIf(
	ctx context.Context,
	db dictionaryDB,
	lookup organizationMembershipLookup,
	claims AuthClaims,
	slug string,
	allowVendor bool,
) (organizationActor, bool, error) {
	var actor organizationActor
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, false, publicauth.AccessDenied()
	}
	var membershipID, workosOrg string
	var vendor bool
	err := db.QueryRow(ctx, `select u.id, o.id, m.workos_membership_id, o.workos_organization_id,
            `+publicauth.VendorTeamMemberSQL+`
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')
        and m.workos_membership_id not like 'replacing:%'`,
		claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &membershipID, &workosOrg, &vendor)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, false, publicauth.AccessDenied()
	}
	if err != nil {
		return actor, false, err
	}
	if vendor && !allowVendor {
		return actor, false, publicauth.AccessDenied()
	}
	actor.role, err = publicauth.VerifyLiveMembership(ctx, lookup, membershipID, claims.UserID, workosOrg)
	return actor, vendor, err
}

func resolveOrganizationActorByID(
	ctx context.Context,
	db dictionaryDB,
	lookup organizationMembershipLookup,
	localUserID, organizationID string,
) (organizationActor, error) {
	actor, err := publicauth.ResolveActorByID(ctx, db, lookup, localUserID, organizationID)
	if err != nil {
		return organizationActor{}, err
	}
	return organizationActor{userID: actor.UserID, organizationID: actor.OrganizationID, role: actor.Role}, nil
}
