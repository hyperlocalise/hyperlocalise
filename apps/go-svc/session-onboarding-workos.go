package main

import (
	"context"
	"net/http"
	"net/url"
)

// WorkOS calls behind account setup for a session that has no web app
// session: the desktop app signs in with WorkOS directly, so go-svc creates
// workspaces, accepts invitations and edits the profile on its behalf.

type workosSessionUser struct {
	ID                string  `json:"id"`
	Email             string  `json:"email"`
	EmailVerified     bool    `json:"email_verified"`
	FirstName         *string `json:"first_name"`
	LastName          *string `json:"last_name"`
	ProfilePictureURL *string `json:"profile_picture_url"`
}

type workosInvitation struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	State     string `json:"state"`
	CreatedAt string `json:"created_at"`
}

type sessionOnboardingWorkos interface {
	GetUser(ctx context.Context, workosUserID string) (workosSessionUser, error)
	UpdateUserName(ctx context.Context, workosUserID string, firstName, lastName string) (workosSessionUser, error)
	CreateOrganization(ctx context.Context, name, externalID string) (string, error)
	DeleteOrganization(ctx context.Context, workosOrganizationID string) error
	CreateOrganizationMembership(ctx context.Context, workosOrganizationID, workosUserID, roleSlug string) (string, error)
	ListInvitations(ctx context.Context, workosOrganizationID, email string) ([]workosInvitation, error)
	AcceptInvitation(ctx context.Context, invitationID string) error
	FindActiveOrganizationMembership(ctx context.Context, workosOrganizationID, workosUserID string) (string, bool, error)
}

func (c *liveMemberWorkos) GetUser(ctx context.Context, workosUserID string) (workosSessionUser, error) {
	var user workosSessionUser
	err := c.doJSON(ctx, http.MethodGet, "/user_management/users/"+url.PathEscape(workosUserID), nil, &user)
	return user, err
}

func (c *liveMemberWorkos) UpdateUserName(ctx context.Context, workosUserID string, firstName, lastName string) (workosSessionUser, error) {
	var user workosSessionUser
	err := c.doJSON(ctx, http.MethodPut, "/user_management/users/"+url.PathEscape(workosUserID), map[string]string{
		"first_name": firstName,
		"last_name":  lastName,
	}, &user)
	return user, err
}

func (c *liveMemberWorkos) CreateOrganization(ctx context.Context, name, externalID string) (string, error) {
	var organization struct {
		ID string `json:"id"`
	}
	err := c.doJSON(ctx, http.MethodPost, "/organizations", map[string]string{
		"name":        name,
		"external_id": externalID,
	}, &organization)
	return organization.ID, err
}

func (c *liveMemberWorkos) DeleteOrganization(ctx context.Context, workosOrganizationID string) error {
	return c.doJSON(ctx, http.MethodDelete, "/organizations/"+url.PathEscape(workosOrganizationID), nil, nil)
}

func (c *liveMemberWorkos) CreateOrganizationMembership(ctx context.Context, workosOrganizationID, workosUserID, roleSlug string) (string, error) {
	var membership struct {
		ID string `json:"id"`
	}
	err := c.doJSON(ctx, http.MethodPost, "/user_management/organization_memberships", map[string]string{
		"organization_id": workosOrganizationID,
		"user_id":         workosUserID,
		"role_slug":       roleSlug,
	}, &membership)
	return membership.ID, err
}

func (c *liveMemberWorkos) ListInvitations(ctx context.Context, workosOrganizationID, email string) ([]workosInvitation, error) {
	query := url.Values{"organization_id": {workosOrganizationID}, "email": {email}, "limit": {"100"}}
	var page struct {
		Data []workosInvitation `json:"data"`
	}
	err := c.doJSON(ctx, http.MethodGet, "/user_management/invitations?"+query.Encode(), nil, &page)
	return page.Data, err
}

func (c *liveMemberWorkos) AcceptInvitation(ctx context.Context, invitationID string) error {
	return c.doJSON(ctx, http.MethodPost, "/user_management/invitations/"+url.PathEscape(invitationID)+"/accept", nil, nil)
}

func (c *liveMemberWorkos) FindActiveOrganizationMembership(ctx context.Context, workosOrganizationID, workosUserID string) (string, bool, error) {
	query := url.Values{
		"organization_id": {workosOrganizationID},
		"user_id":         {workosUserID},
		"statuses":        {"active"},
	}
	var page struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/user_management/organization_memberships?"+query.Encode(), nil, &page); err != nil {
		return "", false, err
	}
	if len(page.Data) == 0 {
		return "", false, nil
	}
	return page.Data[0].ID, true, nil
}
