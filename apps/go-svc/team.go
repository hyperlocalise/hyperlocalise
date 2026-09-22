package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

const (
	teamBodyLimit      = 64 << 10
	teamRequestTimeout = 30 * time.Second
)

type teamAPI struct {
	pool       dictionaryPool
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
}

type teamActor struct {
	userID, organizationID, role string
}

func (a teamActor) canManageTeams() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

type teamError struct {
	status int
	code   string
}

func (e *teamError) Error() string { return e.code }

func teamFailure(status int, code string) error {
	return &teamError{status, code}
}

func teamJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "team_response_write_failed")
	}
}

func writeTeamError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *teamError
	if !errors.As(err, &failure) {
		slog.ErrorContext(r.Context(), "team_request_failed", "phase", phase, "path", r.URL.Path, "error", err.Error())
		failure = &teamError{500, "internal_error"}
	} else if failure.status >= 500 {
		slog.ErrorContext(r.Context(), "team_request_failed", "phase", phase, "path", r.URL.Path, "code", failure.code)
	}
	teamJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code})
}

func formatTeamTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func (api *teamAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	for _, path := range []string{
		"/v1/orgs/{organizationSlug}/teams",
		"/v1/orgs/{organizationSlug}/teams/{rest...}",
	} {
		mux.Handle(path, authMiddleware(verifier)(http.HandlerFunc(api.serveHTTP)))
	}
}

func (api *teamAPI) actor(ctx context.Context, claims AuthClaims, slug string) (teamActor, error) {
	var actor teamActor
	var membershipID, workosOrg string
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, teamFailure(403, "organization_access_denied")
	}
	err := api.pool.QueryRow(ctx, `select u.id, o.id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`,
		claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, teamFailure(403, "organization_access_denied")
	}
	if err != nil {
		return actor, err
	}
	if api.membership == nil {
		return actor, teamFailure(503, "workos_membership_lookup_failed")
	}
	member, err := api.membership(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return actor, teamFailure(403, "organization_access_denied")
		}
		return actor, teamFailure(503, "workos_membership_lookup_failed")
	}
	if member == nil || member.ID != membershipID || member.UserID != claims.UserID || member.OrganizationID != workosOrg || member.Status != "active" || member.Role == nil {
		return actor, teamFailure(403, "organization_access_denied")
	}
	switch member.Role.Slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		actor.role = member.Role.Slug
	default:
		return actor, teamFailure(403, "organization_access_denied")
	}
	return actor, nil
}

func (api *teamAPI) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeTeamError(w, r, "origin_guard", teamFailure(403, "forbidden"))
		return
	}
	if api.pool == nil {
		writeTeamError(w, r, "availability", teamFailure(503, "team_unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), teamRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeTeamError(w, r, "auth", teamFailure(401, "unauthorized"))
		return
	}
	actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeTeamError(w, r, "resolve_actor", err)
		return
	}

	rest := strings.Trim(r.PathValue("rest"), "/")
	var status int
	var value any
	switch rest {
	case "":
		switch r.Method {
		case http.MethodGet:
			value, status, err = api.listTeams(ctx, actor)
		case http.MethodPost:
			r.Body = http.MaxBytesReader(w, r.Body, teamBodyLimit)
			value, status, err = api.createTeam(ctx, actor, r)
		default:
			writeTeamError(w, r, "route", teamFailure(404, "not_found"))
			return
		}
	case "member-directory":
		if r.Method != http.MethodGet {
			writeTeamError(w, r, "route", teamFailure(404, "not_found"))
			return
		}
		value, status, err = api.listMemberDirectory(ctx, actor)
	default:
		parts := strings.Split(rest, "/")
		switch {
		case len(parts) == 1:
			teamID := parts[0]
			if !validTeamID(teamID) {
				writeTeamError(w, r, "route", teamFailure(404, "team_not_found"))
				return
			}
			switch r.Method {
			case http.MethodGet:
				value, status, err = api.getTeam(ctx, actor, teamID)
			case http.MethodPatch:
				r.Body = http.MaxBytesReader(w, r.Body, teamBodyLimit)
				value, status, err = api.updateTeam(ctx, actor, teamID, r)
			case http.MethodDelete:
				status, err = api.deleteTeam(ctx, actor, teamID)
			default:
				writeTeamError(w, r, "route", teamFailure(404, "not_found"))
				return
			}
		case len(parts) == 2 && parts[1] == "members":
			teamID := parts[0]
			if !validTeamID(teamID) || r.Method != http.MethodPost {
				writeTeamError(w, r, "route", teamFailure(404, "not_found"))
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, teamBodyLimit)
			value, status, err = api.addTeamMember(ctx, actor, teamID, r)
		case len(parts) == 3 && parts[1] == "members":
			teamID := parts[0]
			workosUserID := parts[2]
			if !validTeamID(teamID) || strings.TrimSpace(workosUserID) == "" || len(workosUserID) > 256 || r.Method != http.MethodDelete {
				writeTeamError(w, r, "route", teamFailure(404, "not_found"))
				return
			}
			status, err = api.removeTeamMember(ctx, actor, teamID, workosUserID)
		default:
			writeTeamError(w, r, "route", teamFailure(404, "not_found"))
			return
		}
	}
	if err != nil {
		writeTeamError(w, r, "handle", err)
		return
	}
	if status == 204 {
		w.WriteHeader(status)
		return
	}
	teamJSON(r.Context(), w, status, value)
}
