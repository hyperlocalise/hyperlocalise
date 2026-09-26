package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const (
	teamBodyLimit      = 64 << 10
	teamRequestTimeout = 30 * time.Second
)

type teamAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
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
		logRequestFailure(r, "team_request_failed", phase, err)
		failure = &teamError{500, "internal_error"}
	} else {
		logRequestFailure(r, "team_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	teamJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code})
}

func formatTeamTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func (api *teamAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	t := orgRoutePrefix + "/teams"
	route := func(pattern string, fn func(*http.Request, teamActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+t, bindActor(api, (*teamAPI).listTeamsHandler))
	route("POST "+t, bindActor(api, (*teamAPI).createTeamHandler))
	route("GET "+t+"/member-directory", bindActor(api, (*teamAPI).listMemberDirectoryHandler))
	route("GET "+t+"/{teamId}", bindActor(api, (*teamAPI).getTeamHandler))
	route("PATCH "+t+"/{teamId}", bindActor(api, (*teamAPI).updateTeamHandler))
	route("DELETE "+t+"/{teamId}", bindActor(api, (*teamAPI).deleteTeamHandler))
	route("POST "+t+"/{teamId}/members", bindActor(api, (*teamAPI).addTeamMemberHandler))
	route("DELETE "+t+"/{teamId}/members/{workosUserId}", bindActor(api, (*teamAPI).removeTeamMemberHandler))
}

func (api *teamAPI) actor(ctx context.Context, claims AuthClaims, slug string) (teamActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return teamActor{}, mapOrganizationAccessCode(err, teamFailure)
	}
	return teamActor(resolved), nil
}

func (api *teamAPI) handle(fn func(*http.Request, teamActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		if r.Method == http.MethodPost || r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, teamBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeTeamError(w, r, "handle", err)
			return
		}
		if status == 204 {
			w.WriteHeader(status)
			return
		}
		teamJSON(r.Context(), w, status, value)
	})
}

func (api *teamAPI) listTeamsHandler(r *http.Request, actor teamActor) (any, int, error) {
	return api.listTeams(r.Context(), actor)
}

func (api *teamAPI) createTeamHandler(r *http.Request, actor teamActor) (any, int, error) {
	return api.createTeam(r.Context(), actor, r)
}

func (api *teamAPI) listMemberDirectoryHandler(r *http.Request, actor teamActor) (any, int, error) {
	return api.listMemberDirectory(r.Context(), actor)
}

func (api *teamAPI) requireTeamID(r *http.Request) (string, error) {
	teamID := r.PathValue("teamId")
	if !validTeamID(teamID) {
		return "", teamFailure(404, "team_not_found")
	}
	return teamID, nil
}

func (api *teamAPI) getTeamHandler(r *http.Request, actor teamActor) (any, int, error) {
	teamID, err := api.requireTeamID(r)
	if err != nil {
		return nil, 0, err
	}
	return api.getTeam(r.Context(), actor, teamID)
}

func (api *teamAPI) updateTeamHandler(r *http.Request, actor teamActor) (any, int, error) {
	teamID, err := api.requireTeamID(r)
	if err != nil {
		return nil, 0, err
	}
	return api.updateTeam(r.Context(), actor, teamID, r)
}

func (api *teamAPI) deleteTeamHandler(r *http.Request, actor teamActor) (any, int, error) {
	teamID, err := api.requireTeamID(r)
	if err != nil {
		return nil, 0, err
	}
	status, err := api.deleteTeam(r.Context(), actor, teamID)
	return nil, status, err
}

func (api *teamAPI) addTeamMemberHandler(r *http.Request, actor teamActor) (any, int, error) {
	teamID, err := api.requireTeamID(r)
	if err != nil {
		return nil, 0, err
	}
	return api.addTeamMember(r.Context(), actor, teamID, r)
}

func (api *teamAPI) removeTeamMemberHandler(r *http.Request, actor teamActor) (any, int, error) {
	teamID, err := api.requireTeamID(r)
	if err != nil {
		return nil, 0, err
	}
	workosUserID := r.PathValue("workosUserId")
	if strings.TrimSpace(workosUserID) == "" || len(workosUserID) > 256 {
		return nil, 0, teamFailure(404, "not_found")
	}
	status, err := api.removeTeamMember(r.Context(), actor, teamID, workosUserID)
	return nil, status, err
}
