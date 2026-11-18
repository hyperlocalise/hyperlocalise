package publicauth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

// WorkOSProductionAPIURL is the WorkOS API origin outside the local emulator.
const WorkOSProductionAPIURL = "https://api.workos.com"

// MembershipLookup fetches a WorkOS organization membership by id.
type MembershipLookup func(context.Context, string) (*workos.UserOrganizationMembership, error)

// NewWorkOSMembershipLookup reads memberships from the WorkOS API. It returns nil without an
// API key, and every membership check then fails as unverifiable.
func NewWorkOSMembershipLookup(apiKey string) MembershipLookup {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil
	}
	client := workos.NewClient(apiKey, workos.WithBaseURL(WorkOSAPIBaseURL()))
	return func(ctx context.Context, id string) (*workos.UserOrganizationMembership, error) {
		return client.OrganizationMembership().Get(ctx, id)
	}
}

// WorkOSAPIBaseURL is the WorkOS API origin, overridden by WORKOS_API_HOSTNAME,
// WORKOS_API_HTTPS and WORKOS_API_PORT for the local emulator.
func WorkOSAPIBaseURL() string {
	host := strings.TrimSpace(os.Getenv("WORKOS_API_HOSTNAME"))
	if host == "" {
		return WorkOSProductionAPIURL
	}

	scheme := "https"
	if strings.EqualFold(strings.TrimSpace(os.Getenv("WORKOS_API_HTTPS")), "false") {
		scheme = "http"
	}

	base := scheme + "://" + host
	if port := strings.TrimSpace(os.Getenv("WORKOS_API_PORT")); port != "" {
		base += ":" + port
	}
	return strings.TrimRight(base, "/")
}

// Actor is a user acting in a workspace with the role WorkOS reports for them.
type Actor struct {
	UserID, OrganizationID, Role string
}

// AccessError is a workspace membership failure with the response it maps to.
type AccessError struct {
	Status        int
	Code, Message string
}

func (e *AccessError) Error() string { return e.Code }

// AccessDenied reports that the user is not an active member of the workspace.
func AccessDenied() error {
	return &AccessError{http.StatusForbidden, "organization_access_denied", "Organization access denied"}
}

// MembershipLookupFailed reports that WorkOS could not confirm the membership.
func MembershipLookupFailed() error {
	return &AccessError{http.StatusServiceUnavailable, "workos_membership_lookup_failed", "Organization membership could not be verified"}
}

// ResolveActorByID confirms that a local user is an active member of a local workspace, first
// in the database and then live in WorkOS, and returns the role WorkOS holds for them.
func ResolveActorByID(ctx context.Context, db DB, lookup MembershipLookup, localUserID, organizationID string) (Actor, error) {
	var actor Actor
	var workosUserID, membershipID, workosOrg string
	err := db.QueryRow(ctx, `select u.id, o.id, u.workos_user_id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.id=$1 and o.id=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')
        and m.workos_membership_id not like 'replacing:%'`,
		localUserID, organizationID).Scan(&actor.UserID, &actor.OrganizationID, &workosUserID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return Actor{}, AccessDenied()
	}
	if err != nil {
		return Actor{}, err
	}
	if strings.HasPrefix(workosUserID, "invited_user_") {
		return Actor{}, AccessDenied()
	}
	actor.Role, err = VerifyLiveMembership(ctx, lookup, membershipID, workosUserID, workosOrg)
	if err != nil {
		return Actor{}, err
	}
	return actor, nil
}

// VerifyLiveMembership checks that the WorkOS membership is active and belongs to the user and
// organization, and returns its role.
func VerifyLiveMembership(ctx context.Context, lookup MembershipLookup, membershipID, workosUserID, workosOrganizationID string) (string, error) {
	if lookup == nil {
		return "", MembershipLookupFailed()
	}
	member, err := lookup(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
			return "", AccessDenied()
		}
		return "", MembershipLookupFailed()
	}
	if member == nil || member.ID != membershipID || member.UserID != workosUserID || member.OrganizationID != workosOrganizationID || member.Status != "active" || member.Role == nil || !authz.IsKnownRole(member.Role.Slug) {
		return "", AccessDenied()
	}
	return member.Role.Slug, nil
}
