package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

const (
	qaReportBodyLimit      = 64 << 10
	qaReportRequestTimeout = 30 * time.Second
)

type qaReportAPI struct {
	pool       dictionaryPool
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
}

type qaReportActor struct {
	userID, organizationID, organizationSlug, role string
}

func (a qaReportActor) canPromoteFindings() bool {
	switch a.role {
	case "admin", "localization_manager", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func (a qaReportActor) canJobCreate() bool {
	return a.canPromoteFindings()
}

func (a qaReportActor) canProjectWrite() bool {
	switch a.role {
	case "admin", "localization_manager", "developer":
		return true
	default:
		return false
	}
}

func (a qaReportActor) canWriteProjectTeam() bool {
	switch a.role {
	case "admin", "localization_manager":
		return true
	default:
		return false
	}
}

type qaReportError struct {
	status        int
	code, message string
}

func (e *qaReportError) Error() string { return e.code }

func qaReportFailure(status int, code, message string) error {
	return &qaReportError{status, code, message}
}

func qaReportJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "qa_report_json_encode_failed")
	}
}

func writeQaReportError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *qaReportError
	if !errors.As(err, &failure) {
		slog.ErrorContext(r.Context(), "qa_report_request_failed", "phase", phase, "path", r.URL.Path)
		failure = &qaReportError{500, "internal_error", "Internal server error"}
	} else if failure.status >= 500 {
		slog.ErrorContext(r.Context(), "qa_report_request_failed", "phase", phase, "path", r.URL.Path, "error", failure.code)
	}
	qaReportJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *qaReportAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	q := orgRoutePrefix + "/qa-reports"
	p := orgRoutePrefix + "/projects/{projectId}/qa-reports"
	route := func(pattern string, fn func(*http.Request, qaReportActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+q, bindActor(api, (*qaReportAPI).listWorkspaceReportsHandler))
	route("GET "+q+"/findings", bindActor(api, (*qaReportAPI).listWorkspaceFindingsHandler))
	route("POST "+q+"/findings/promote", bindActor(api, (*qaReportAPI).promoteWorkspaceFindingsHandler))
	route("GET "+p, bindActor(api, (*qaReportAPI).listProjectQaReportsHandler))
	route("PATCH "+p+"/settings", bindActor(api, (*qaReportAPI).patchProjectQaSettingsHandler))
	route("GET "+p+"/latest-findings", bindActor(api, (*qaReportAPI).listProjectLatestFindingsHandler))
	route("POST "+p+"/findings/promote", bindActor(api, (*qaReportAPI).promoteProjectFindingsHandler))
	route("GET "+p+"/{runId}", bindActor(api, (*qaReportAPI).getProjectQaRunHandler))
}

func (api *qaReportAPI) actor(ctx context.Context, claims AuthClaims, slug string) (qaReportActor, error) {
	var actor qaReportActor
	var membershipID, workosOrg string
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, qaReportFailure(403, "organization_access_denied", "Organization access denied")
	}
	err := api.pool.QueryRow(ctx, `select u.id, o.id, o.slug, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`,
		claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &actor.organizationSlug, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, qaReportFailure(403, "organization_access_denied", "Organization access denied")
	}
	if err != nil {
		return actor, err
	}
	if api.membership == nil {
		return actor, qaReportFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	member, err := api.membership(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return actor, qaReportFailure(403, "organization_access_denied", "Organization access denied")
		}
		return actor, qaReportFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	if member == nil || member.ID != membershipID || member.UserID != claims.UserID || member.OrganizationID != workosOrg || member.Status != "active" || member.Role == nil {
		return actor, qaReportFailure(403, "organization_access_denied", "Organization access denied")
	}
	switch member.Role.Slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		actor.role = member.Role.Slug
	default:
		return actor, qaReportFailure(403, "organization_access_denied", "Organization access denied")
	}
	return actor, nil
}

func (api *qaReportAPI) handle(fn func(*http.Request, qaReportActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeQaReportError(w, r, "origin_guard", qaReportFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeQaReportError(w, r, "availability", qaReportFailure(503, "qa_report_unavailable", "QA report service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), qaReportRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeQaReportError(w, r, "auth", qaReportFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeQaReportError(w, r, "resolve_actor", err)
			return
		}
		if r.Method == http.MethodPost || r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, qaReportBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeQaReportError(w, r, "handle", err)
			return
		}
		qaReportJSON(r.Context(), w, status, value)
	})
}

func (api *qaReportAPI) listWorkspaceReportsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	return api.listWorkspaceReports(r.Context(), actor)
}

func (api *qaReportAPI) listWorkspaceFindingsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	return api.listWorkspaceFindings(r.Context(), actor, r)
}

func (api *qaReportAPI) promoteWorkspaceFindingsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	if !actor.canPromoteFindings() {
		return nil, 0, qaReportFailure(403, "forbidden", "You do not have permission to create issues")
	}
	return api.promoteWorkspaceFindings(r.Context(), actor, r)
}

func (api *qaReportAPI) withOwnedProject(r *http.Request, actor qaReportActor) (nativeQaProject, error) {
	return api.ownedNativeProject(r.Context(), actor, r.PathValue("projectId"))
}

func (api *qaReportAPI) listProjectQaReportsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	project, err := api.withOwnedProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	return api.listProjectQaReports(r.Context(), actor, project)
}

func (api *qaReportAPI) patchProjectQaSettingsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	if !actor.canProjectWrite() {
		return nil, 0, qaReportFailure(403, "forbidden", "Forbidden")
	}
	project, err := api.withOwnedProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	return api.patchProjectQaSettings(r.Context(), actor, project, r)
}

func (api *qaReportAPI) listProjectLatestFindingsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	project, err := api.withOwnedProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	return api.listProjectLatestFindings(r.Context(), actor, project.ID, r)
}

func (api *qaReportAPI) promoteProjectFindingsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	if !actor.canPromoteFindings() {
		return nil, 0, qaReportFailure(403, "forbidden", "Forbidden")
	}
	project, err := api.withOwnedProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	return api.promoteProjectFindings(r.Context(), actor, project.ID, r)
}

func (api *qaReportAPI) getProjectQaRunHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	project, err := api.withOwnedProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	runID, parseErr := uuid.Parse(r.PathValue("runId"))
	if parseErr != nil {
		return nil, 0, qaReportFailure(404, "not_found", "Not found")
	}
	return api.getProjectQaRunDetail(r.Context(), actor, project.ID, runID, r)
}

func readQaReportBody(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		return qaReportFailure(400, "invalid_qa_findings_promote", "Invalid QA findings promote payload")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return qaReportFailure(400, "invalid_qa_findings_promote", "Invalid QA findings promote payload")
	}
	return nil
}

func formatQaReportTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	formatted := t.UTC().Format("2006-01-02T15:04:05.000Z")
	return &formatted
}
