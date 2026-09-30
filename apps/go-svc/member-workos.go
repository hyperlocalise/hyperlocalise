package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const memberWorkosHTTPTimeout = 20 * time.Second

type memberInvitationInput struct {
	workosOrganizationID string
	email                string
	inviterUserID        string
	roleSlug             string
}

type memberWorkos interface {
	SendInvitation(ctx context.Context, input memberInvitationInput) error
	ResendInvitation(ctx context.Context, invitationID string) error
	RevokeInvitation(ctx context.Context, invitationID string) error
	FindPendingInvitation(ctx context.Context, workosOrganizationID, email string) (string, bool, error)
	UpdateOrganizationMembershipRole(ctx context.Context, membershipID, roleSlug string) error
	DeleteOrganizationMembership(ctx context.Context, membershipID string) error
}

type workosInvitationRevokedNotDeliveredError struct {
	cause error
}

func (e *workosInvitationRevokedNotDeliveredError) Error() string {
	return "member_invite_revoked_not_delivered"
}

func (e *workosInvitationRevokedNotDeliveredError) Unwrap() error { return e.cause }

func isWorkosInvitationRevokedNotDeliveredError(err error) bool {
	var target *workosInvitationRevokedNotDeliveredError
	return errors.As(err, &target)
}

type workosHTTPError struct {
	status int
}

func (e *workosHTTPError) Error() string {
	return fmt.Sprintf("workos: HTTP %d", e.status)
}

func isWorkosNotFoundError(err error) bool {
	var httpErr *workosHTTPError
	return errors.As(err, &httpErr) && httpErr.status == http.StatusNotFound
}

type liveMemberWorkos struct {
	apiKey  string
	baseURL string
	http    *http.Client
}

func newLiveMemberWorkos(apiKey, baseURL string) *liveMemberWorkos {
	apiKey = strings.TrimSpace(apiKey)
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if apiKey == "" || baseURL == "" {
		return nil
	}
	return &liveMemberWorkos{
		apiKey:  apiKey,
		baseURL: baseURL,
		http:    &http.Client{Timeout: memberWorkosHTTPTimeout},
	}
}

func (c *liveMemberWorkos) SendInvitation(ctx context.Context, input memberInvitationInput) error {
	body := map[string]string{
		"email":           input.email,
		"organization_id": input.workosOrganizationID,
		"inviter_user_id": input.inviterUserID,
		"role_slug":       input.roleSlug,
	}
	return c.doJSON(ctx, http.MethodPost, "/user_management/invitations", body, nil)
}

func (c *liveMemberWorkos) ResendInvitation(ctx context.Context, invitationID string) error {
	return c.doJSON(ctx, http.MethodPost, "/user_management/invitations/"+url.PathEscape(invitationID)+"/resend", map[string]string{}, nil)
}

func (c *liveMemberWorkos) RevokeInvitation(ctx context.Context, invitationID string) error {
	return c.doJSON(ctx, http.MethodPost, "/user_management/invitations/"+url.PathEscape(invitationID)+"/revoke", map[string]string{}, nil)
}

func (c *liveMemberWorkos) FindPendingInvitation(ctx context.Context, workosOrganizationID, email string) (string, bool, error) {
	query := url.Values{}
	query.Set("organization_id", workosOrganizationID)
	query.Set("email", email)
	query.Set("limit", "10")
	var out struct {
		Data []struct {
			ID    string `json:"id"`
			State string `json:"state"`
		} `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/user_management/invitations?"+query.Encode(), nil, &out); err != nil {
		return "", false, err
	}
	for _, invitation := range out.Data {
		if invitation.State == "pending" && invitation.ID != "" {
			return invitation.ID, true, nil
		}
	}
	return "", false, nil
}

func (c *liveMemberWorkos) UpdateOrganizationMembershipRole(ctx context.Context, membershipID, roleSlug string) error {
	return c.doJSON(ctx, http.MethodPut, "/user_management/organization_memberships/"+url.PathEscape(membershipID), map[string]string{
		"role_slug": roleSlug,
	}, nil)
}

func (c *liveMemberWorkos) DeleteOrganizationMembership(ctx context.Context, membershipID string) error {
	return c.doJSON(ctx, http.MethodDelete, "/user_management/organization_memberships/"+url.PathEscape(membershipID), nil, nil)
}

func (c *liveMemberWorkos) doJSON(ctx context.Context, method, path string, payload any, out any) error {
	if c == nil || c.apiKey == "" {
		return memberFailure(503, "workos_server_not_configured", "WorkOS server integration is not configured")
	}
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return &workosHTTPError{status: res.StatusCode}
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("workos: decode response: %w", err)
	}
	return nil
}

func (api *memberAPI) deliverWorkosInvitation(ctx context.Context, input memberInvitationInput, localMembershipID string, replacePending bool) error {
	if api.workos == nil {
		return memberFailure(503, "workos_server_not_configured", "WorkOS server integration is not configured")
	}
	invitationID, found, err := api.workos.FindPendingInvitation(ctx, input.workosOrganizationID, input.email)
	if err != nil {
		return err
	}
	if found && replacePending {
		marked, markErr := api.markPendingMembershipReplacingInvitation(ctx, localMembershipID)
		if markErr != nil {
			return markErr
		}
		defer func() {
			if marked && localMembershipID != "" {
				_ = api.clearPendingMembershipReplacingInvitation(context.WithoutCancel(ctx), localMembershipID)
			}
		}()
		if err := api.workos.RevokeInvitation(ctx, invitationID); err != nil {
			return err
		}
		if err := api.workos.SendInvitation(ctx, input); err != nil {
			if retryErr := api.workos.SendInvitation(ctx, input); retryErr != nil {
				return &workosInvitationRevokedNotDeliveredError{cause: retryErr}
			}
		}
		return nil
	}
	if found {
		return api.workos.ResendInvitation(ctx, invitationID)
	}
	return api.workos.SendInvitation(ctx, input)
}

func (api *memberAPI) revokePendingWorkosInvitation(ctx context.Context, workosOrganizationID, email string) error {
	if api.workos == nil {
		return nil
	}
	invitationID, found, err := api.workos.FindPendingInvitation(ctx, workosOrganizationID, email)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	return api.workos.RevokeInvitation(ctx, invitationID)
}

func (api *memberAPI) markPendingMembershipReplacingInvitation(ctx context.Context, membershipID string) (bool, error) {
	if membershipID == "" {
		return false, nil
	}
	tag, err := api.pool.Exec(ctx, `
        update organization_memberships
        set workos_membership_id=$2
        where id=$1 and workos_membership_id is null`,
		membershipID, replacingWorkosMembershipID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (api *memberAPI) clearPendingMembershipReplacingInvitation(ctx context.Context, membershipID string) error {
	_, err := api.pool.Exec(ctx, `
        update organization_memberships
        set workos_membership_id=null
        where id=$1 and workos_membership_id=$2`,
		membershipID, replacingWorkosMembershipID)
	return err
}
