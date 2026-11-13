package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

const (
	overviewRequestTimeout     = 30 * time.Second
	overviewLookbackDays       = 7
	overviewActivityLimit      = 4
	overviewProjectLimit       = 2
	overviewBoardLimit         = 3
	overviewAutomationLimit    = 3
	overviewRecentJobsLimit    = 8
	overviewRecentRunsLimit    = 8
	workspaceAutomationsFlag   = "workspace-automations"
	overviewOpenJobStatusesSQL = `'queued', 'running', 'waiting_for_review'`
)

type overviewAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	flags      workspaceFlagChecker
}

type overviewActor struct {
	userID, organizationID, organizationSlug, role string
	workosUserID, workosOrganizationID             string
}

func (a overviewActor) canReadAllTeams() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

func (a overviewActor) canReadAutomations() bool {
	return a.canReadAllTeams()
}

type overviewError struct {
	status        int
	code, message string
}

func (e *overviewError) Error() string { return e.code }

func overviewFailure(status int, code, message string) error {
	return &overviewError{status: status, code: code, message: message}
}

func overviewJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "overview_response_write_failed")
	}
}

func writeOverviewError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *overviewError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "overview_request_failed", phase, err)
		failure = &overviewError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "overview_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	overviewJSON(r.Context(), w, failure.status, map[string]string{
		"error":   failure.code,
		"message": failure.message,
	})
}

func (api *overviewAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/overview"
	route := func(pattern string, fn func(*http.Request, overviewActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+base+"/metrics", bindActor(api, (*overviewAPI).metricsHandler))
	route("GET "+base+"/activity", bindActor(api, (*overviewAPI).activityHandler))
	route("GET "+base+"/projects", bindActor(api, (*overviewAPI).projectsHandler))
	route("GET "+base+"/board", bindActor(api, (*overviewAPI).boardHandler))
	route("GET "+base+"/automations", bindActor(api, (*overviewAPI).automationsHandler))
}

func (api *overviewAPI) actor(ctx context.Context, claims AuthClaims, slug string) (overviewActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return overviewActor{}, mapOrganizationAccessError(err, overviewFailure)
	}
	var organizationSlug, workosOrg string
	if err := api.pool.QueryRow(ctx, `select slug, workos_organization_id from organizations where id=$1`, resolved.organizationID).
		Scan(&organizationSlug, &workosOrg); err != nil {
		return overviewActor{}, err
	}
	return overviewActor{
		userID:               resolved.userID,
		organizationID:       resolved.organizationID,
		organizationSlug:     organizationSlug,
		role:                 resolved.role,
		workosUserID:         claims.UserID,
		workosOrganizationID: workosOrg,
	}, nil
}

func (api *overviewAPI) handle(fn func(*http.Request, overviewActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeOverviewError(w, r, "origin_guard", overviewFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeOverviewError(w, r, "availability", overviewFailure(503, "overview_unavailable", "Overview service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), overviewRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeOverviewError(w, r, "auth", overviewFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeOverviewError(w, r, "resolve_actor", err)
			return
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeOverviewError(w, r, "handle", err)
			return
		}
		overviewJSON(ctx, w, status, value)
	})
}

func (api *overviewAPI) includeAutomations(ctx context.Context, actor overviewActor) bool {
	if !actor.canReadAutomations() || api.flags == nil {
		return false
	}
	enabled, err := api.flags.Enabled(ctx, actor.workosOrganizationID, actor.workosUserID, workspaceAutomationsFlag)
	return err == nil && enabled
}

func overviewPathEscape(value string) string {
	return encodeURIComponent(value)
}

func overviewSince(now time.Time) time.Time {
	return now.UTC().Add(-time.Duration(overviewLookbackDays) * 24 * time.Hour)
}

func overviewJobsVisibleSQL() string {
	return `j.organization_id = $1 and ($2 or exists (
            select 1 from projects p
            where p.id = j.project_id and p.organization_id = $1
              and ` + formatQaProjectTeamAccessSQL(2, 3, 1) + `
        ))`
}

func overviewSyncedJobVisibleSQL() string {
	return `(e.job_id is null or e.sync_state is null or e.sync_state <> 'removed')
        and (p.id is null or p.is_active is distinct from false)`
}
