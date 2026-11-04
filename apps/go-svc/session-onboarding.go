package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Account setup for clients that sign in with WorkOS directly (the Iris
// desktop app): create a workspace, accept an invitation, set a name. The web
// app does the same through its own session (src/lib/onboarding/workspace.ts,
// src/lib/workos/pending-invitations.ts); keep the two in step.

const (
	sessionOnboardingRequestTimeout = 45 * time.Second
	sessionOnboardingBodyLimit      = 16 << 10
	sessionOnboardingCreateAttempts = 3
	workspaceNameMinLength          = 2
	profileNameMaxLength            = 100
	workspaceCreatorTeamRole        = "manager"
	workspaceIdentityBlockedMessage = "Choose a workspace name without profanity or reserved words"
)

var workspaceSlugInvalidRun = regexp.MustCompile(`[^a-z0-9]+`)

type sessionOnboardingAPI struct {
	pool   dictionaryPool
	workos sessionOnboardingWorkos
}

type sessionInvitation struct {
	OrganizationName string `json:"organizationName"`
	OrganizationSlug string `json:"organizationSlug"`
}

func (api *sessionOnboardingAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	route := func(pattern string, fn func(*http.Request, AuthClaims) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("POST /v1/organizations", api.createOrganization)
	route("PATCH /v1/me", api.updateProfile)
	route("GET /v1/invitations", api.listInvitations)
	route("POST /v1/invitations/{organizationSlug}/accept", api.acceptInvitation)
}

func (api *sessionOnboardingAPI) handle(fn func(*http.Request, AuthClaims) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeWorkspaceSettingsError(w, r, "origin_guard", workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Cross-origin request rejected"))
			return
		}
		if api.pool == nil {
			writeWorkspaceSettingsError(w, r, "availability", workspaceSettingsFailure(http.StatusServiceUnavailable, "account_unavailable", "Account setup is unavailable"))
			return
		}
		if api.workos == nil {
			writeWorkspaceSettingsError(w, r, "availability", workspaceSettingsFailure(http.StatusServiceUnavailable, "workos_server_not_configured", "WorkOS server integration is not configured"))
			return
		}
		claims, ok := r.Context().Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeWorkspaceSettingsError(w, r, "auth", workspaceSettingsFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
			return
		}
		if strings.HasPrefix(claims.UserID, invitedWorkosUserIDPrefix) {
			writeWorkspaceSettingsError(w, r, "auth", workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Sign in to set up your account"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), sessionOnboardingRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, sessionOnboardingBodyLimit)
		}
		value, status, err := fn(r, claims)
		if err != nil {
			writeWorkspaceSettingsError(w, r, "handle", err)
			return
		}
		writeWorkspaceSettingsJSON(r.Context(), w, status, value)
	})
}

func readSessionOnboardingBody(r *http.Request, out any) error {
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		if isRequestBodyTooLarge(err) {
			return workspaceSettingsFailure(http.StatusRequestEntityTooLarge, "payload_too_large", "request body exceeds maximum allowed size")
		}
		return workspaceSettingsFailure(http.StatusBadRequest, "invalid_payload", "Request body must be a JSON object")
	}
	return nil
}

func invalidField(code, field, message string) error {
	return &workspaceSettingsError{
		status:  http.StatusBadRequest,
		code:    code,
		message: message,
		details: map[string]any{"issues": []workspaceValidationIssue{{Path: []any{field}, Message: message}}},
	}
}

// syncSessionUser mirrors the WorkOS user into users, taking over the
// placeholder row an invitation made for their email, and returns the local
// user id. Someone who has only ever used the desktop app has no row until now.
func (api *sessionOnboardingAPI) syncSessionUser(ctx context.Context, db dictionaryDB, workosUserID string) (string, workosSessionUser, error) {
	user, err := api.workos.GetUser(ctx, workosUserID)
	if err != nil {
		return "", user, fmt.Errorf("workos get user: %w", err)
	}
	if user.ID != workosUserID || strings.TrimSpace(user.Email) == "" {
		return "", user, errors.New("workos get user: unexpected user")
	}
	if _, err := db.Exec(ctx, `
        update users set workos_user_id=$1, updated_at=now()
        where lower(email)=$2 and workos_user_id like $3
        and not exists (select 1 from users where workos_user_id=$1)`,
		workosUserID, strings.ToLower(strings.TrimSpace(user.Email)), invitedWorkosUserIDPrefix+"%"); err != nil {
		return "", user, err
	}
	var localUserID string
	err = db.QueryRow(ctx, `
        insert into users (workos_user_id, email, first_name, last_name, avatar_url)
        values ($1, $2, $3, $4, $5)
        on conflict (workos_user_id) do update set
            email=excluded.email,
            first_name=excluded.first_name,
            last_name=excluded.last_name,
            avatar_url=excluded.avatar_url,
            updated_at=now()
        returning id`,
		workosUserID, user.Email, user.FirstName, user.LastName, user.ProfilePictureURL).Scan(&localUserID)
	return localUserID, user, err
}

func (api *sessionOnboardingAPI) createOrganization(r *http.Request, claims AuthClaims) (any, int, error) {
	ctx := r.Context()
	var body struct {
		Name *string `json:"name"`
	}
	if err := readSessionOnboardingBody(r, &body); err != nil {
		return nil, 0, err
	}
	name := ""
	if body.Name != nil {
		name = strings.TrimSpace(*body.Name)
	}
	switch n := utf8.RuneCountInString(name); {
	case n < workspaceNameMinLength:
		return nil, 0, invalidField("invalid_workspace_payload", "name", fmt.Sprintf("Workspace name must be at least %d characters", workspaceNameMinLength))
	case n > workspaceNameMaxLength:
		return nil, 0, invalidField("invalid_workspace_payload", "name", fmt.Sprintf("Workspace name must be at most %d characters", workspaceNameMaxLength))
	case !isAllowedWorkspaceIdentity(name):
		return nil, 0, invalidField("invalid_workspace_payload", "name", workspaceIdentityBlockedMessage)
	}

	localUserID, _, err := api.syncSessionUser(ctx, api.pool, claims.UserID)
	if err != nil {
		return nil, 0, err
	}
	for attempt := 0; attempt < sessionOnboardingCreateAttempts; attempt++ {
		organization, err := api.provisionWorkspace(ctx, name, claims.UserID, localUserID)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			continue
		}
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{"organization": organization}, http.StatusCreated, nil
	}
	return nil, 0, workspaceSettingsFailure(http.StatusConflict, "workspace_slug_conflict", "Unable to create a unique workspace URL right now. Please retry.")
}

// provisionWorkspace creates the WorkOS organization and admin membership,
// then the local rows; a failure after WorkOS deletes the organization again.
func (api *sessionOnboardingAPI) provisionWorkspace(ctx context.Context, name, workosUserID, localUserID string) (sessionOrganization, error) {
	localOrganizationID := uuid.NewString()
	workosOrganizationID, err := api.workos.CreateOrganization(ctx, name, localOrganizationID)
	if err != nil {
		return sessionOrganization{}, fmt.Errorf("workos create organization: %w", err)
	}
	organization, err := api.insertWorkspace(ctx, name, localOrganizationID, workosOrganizationID, workosUserID, localUserID)
	if err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), memberInviteRollbackTimeout)
		defer cancel()
		if deleteErr := api.workos.DeleteOrganization(cleanupCtx, workosOrganizationID); deleteErr != nil {
			slog.WarnContext(ctx, "session_onboarding_workos_cleanup_failed",
				"workos_organization_id", workosOrganizationID, "error", deleteErr)
		}
		return sessionOrganization{}, err
	}
	return organization, nil
}

func (api *sessionOnboardingAPI) insertWorkspace(ctx context.Context, name, localOrganizationID, workosOrganizationID, workosUserID, localUserID string) (sessionOrganization, error) {
	membershipID, err := api.workos.CreateOrganizationMembership(ctx, workosOrganizationID, workosUserID, "admin")
	if err != nil {
		return sessionOrganization{}, fmt.Errorf("workos create membership: %w", err)
	}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return sessionOrganization{}, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	slug, err := uniqueWorkspaceSlug(ctx, tx, name)
	if err != nil {
		return sessionOrganization{}, err
	}
	organization := sessionOrganization{ID: localOrganizationID, Name: name, Slug: &slug, WorkosOrganizationID: workosOrganizationID}
	if _, err := tx.Exec(ctx, `
        insert into organizations (id, workos_organization_id, name, slug)
        values ($1, $2, $3, $4)`,
		localOrganizationID, workosOrganizationID, name, slug); err != nil {
		return sessionOrganization{}, err
	}
	if _, err := tx.Exec(ctx, `
        insert into organization_memberships (organization_id, user_id, role, workos_membership_id)
        values ($1, $2, 'admin', $3)`,
		localOrganizationID, localUserID, membershipID); err != nil {
		return sessionOrganization{}, err
	}
	teamID, err := (&memberAPI{}).ensureDefaultWorkspaceTeam(ctx, tx, localOrganizationID)
	if err != nil {
		return sessionOrganization{}, err
	}
	if _, err := tx.Exec(ctx, `insert into team_memberships (team_id, user_id, role) values ($1, $2, $3)`,
		teamID, localUserID, workspaceCreatorTeamRole); err != nil {
		return sessionOrganization{}, err
	}
	commitCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), workspaceSettingsCommitTimeout)
	defer cancel()
	if err := tx.Commit(commitCtx); err != nil {
		return sessionOrganization{}, err
	}
	return organization, nil
}

// slugifyWorkspaceName matches the web app's slugifyOrganizationName.
func slugifyWorkspaceName(name string) string {
	slug := strings.Trim(workspaceSlugInvalidRun.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-"), "-")
	if slug == "" {
		return "workspace"
	}
	return slug
}

func uniqueWorkspaceSlug(ctx context.Context, db dictionaryDB, name string) (string, error) {
	base := slugifyWorkspaceName(name)
	for attempt := 0; attempt < 100; attempt++ {
		candidate := base
		if attempt > 0 {
			candidate = fmt.Sprintf("%s-%d", base, attempt+1)
		}
		var taken bool
		if err := db.QueryRow(ctx, `select exists(select 1 from organizations where slug=$1)`, candidate).Scan(&taken); err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return base + "-" + uuid.NewString()[:8], nil
}

func (api *sessionOnboardingAPI) updateProfile(r *http.Request, claims AuthClaims) (any, int, error) {
	ctx := r.Context()
	var body struct {
		FirstName *string `json:"firstName"`
		LastName  *string `json:"lastName"`
	}
	if err := readSessionOnboardingBody(r, &body); err != nil {
		return nil, 0, err
	}
	firstName, lastName := "", ""
	if body.FirstName != nil {
		firstName = strings.TrimSpace(*body.FirstName)
	}
	if body.LastName != nil {
		lastName = strings.TrimSpace(*body.LastName)
	}
	if firstName == "" {
		return nil, 0, invalidField("invalid_profile_payload", "firstName", "First name is required")
	}
	if utf8.RuneCountInString(firstName) > profileNameMaxLength {
		return nil, 0, invalidField("invalid_profile_payload", "firstName", fmt.Sprintf("First name must be at most %d characters", profileNameMaxLength))
	}
	if utf8.RuneCountInString(lastName) > profileNameMaxLength {
		return nil, 0, invalidField("invalid_profile_payload", "lastName", fmt.Sprintf("Last name must be at most %d characters", profileNameMaxLength))
	}
	if _, err := api.workos.UpdateUserName(ctx, claims.UserID, firstName, lastName); err != nil {
		return nil, 0, fmt.Errorf("workos update user: %w", err)
	}
	if _, _, err := api.syncSessionUser(ctx, api.pool, claims.UserID); err != nil {
		return nil, 0, err
	}
	account, err := loadSessionAccount(ctx, api.pool, claims.UserID)
	if err != nil {
		return nil, 0, err
	}
	return account, http.StatusOK, nil
}

// Invitations are memberships made by an invite and not yet joined: no WorkOS membership id.
const pendingInvitationsQuery = `select m.id, o.name, o.slug, o.workos_organization_id
        from organization_memberships m
        join users u on u.id=m.user_id
        join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.lifecycle_status='active'
        and m.workos_membership_id is null and o.slug is not null`

func (api *sessionOnboardingAPI) listInvitations(r *http.Request, claims AuthClaims) (any, int, error) {
	ctx := r.Context()
	if _, _, err := api.syncSessionUser(ctx, api.pool, claims.UserID); err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(ctx, pendingInvitationsQuery+` order by o.name`, claims.UserID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	invitations := []sessionInvitation{}
	for rows.Next() {
		var membershipID, workosOrganizationID string
		var invitation sessionInvitation
		if err := rows.Scan(&membershipID, &invitation.OrganizationName, &invitation.OrganizationSlug, &workosOrganizationID); err != nil {
			return nil, 0, err
		}
		invitations = append(invitations, invitation)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"invitations": invitations}, http.StatusOK, nil
}

// acceptInvitation accepts the WorkOS invitation and activates the local
// membership. WorkOS leaves checking that the invitation is this person's to
// the app, so it must be addressed to their verified email.
func (api *sessionOnboardingAPI) acceptInvitation(r *http.Request, claims AuthClaims) (any, int, error) {
	ctx := r.Context()
	_, user, err := api.syncSessionUser(ctx, api.pool, claims.UserID)
	if err != nil {
		return nil, 0, err
	}
	if !user.EmailVerified {
		return nil, 0, workspaceSettingsFailure(http.StatusForbidden, "email_not_verified", "Verify your email address before joining a workspace")
	}
	var membershipID string
	organization := sessionOrganization{}
	var slug string
	err = api.pool.QueryRow(ctx, pendingInvitationsQuery+` and o.slug=$2 limit 1`, claims.UserID, r.PathValue("organizationSlug")).
		Scan(&membershipID, &organization.Name, &slug, &organization.WorkosOrganizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, invitationNotFound()
	}
	if err != nil {
		return nil, 0, err
	}
	organization.Slug = &slug

	email := strings.ToLower(strings.TrimSpace(user.Email))
	invitations, err := api.workos.ListInvitations(ctx, organization.WorkosOrganizationID, email)
	if err != nil {
		return nil, 0, fmt.Errorf("workos list invitations: %w", err)
	}
	latest, ok := latestInvitationFor(invitations, email)
	switch {
	case ok && latest.State == "pending":
		if err := api.workos.AcceptInvitation(ctx, latest.ID); err != nil {
			return nil, 0, fmt.Errorf("workos accept invitation: %w", err)
		}
	case ok && latest.State == "accepted":
		// Accepted already, from the email link or an earlier attempt: pick up the membership.
	default:
		return nil, 0, invitationNotFound()
	}

	workosMembershipID, found, err := api.workos.FindActiveOrganizationMembership(ctx, organization.WorkosOrganizationID, claims.UserID)
	if err != nil {
		return nil, 0, fmt.Errorf("workos find membership: %w", err)
	}
	if !found {
		return nil, 0, workspaceSettingsFailure(http.StatusConflict, "membership_not_activated", "The invitation was accepted, but the workspace is not ready yet. Try again in a moment.")
	}
	if err := api.pool.QueryRow(ctx, `
        update organization_memberships set workos_membership_id=$2
        where id=$1 and workos_membership_id is null
        returning organization_id`, membershipID, workosMembershipID).Scan(&organization.ID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, invitationNotFound()
		}
		return nil, 0, err
	}
	return map[string]any{"organization": organization}, http.StatusOK, nil
}

func invitationNotFound() error {
	return workspaceSettingsFailure(http.StatusNotFound, "invitation_not_found", "Invitation not found")
}

// latestInvitationFor picks the newest invitation to email; an older accepted
// one may be from an earlier membership. A pending one wins a tie.
func latestInvitationFor(invitations []workosInvitation, email string) (workosInvitation, bool) {
	matching := make([]workosInvitation, 0, len(invitations))
	for _, invitation := range invitations {
		if strings.ToLower(strings.TrimSpace(invitation.Email)) == email {
			matching = append(matching, invitation)
		}
	}
	if len(matching) == 0 {
		return workosInvitation{}, false
	}
	sort.SliceStable(matching, func(i, j int) bool {
		if matching[i].CreatedAt != matching[j].CreatedAt {
			return matching[i].CreatedAt > matching[j].CreatedAt
		}
		return matching[i].State == "pending" && matching[j].State != "pending"
	})
	return matching[0], true
}
