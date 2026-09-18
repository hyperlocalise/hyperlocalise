package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

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

func qaReportJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("qa_report_json_encode_failed")
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
	qaReportJSON(w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *qaReportAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	for _, path := range []string{
		"/v1/orgs/{organizationSlug}/qa-reports",
		"/v1/orgs/{organizationSlug}/qa-reports/{rest...}",
		"/v1/orgs/{organizationSlug}/projects/{projectId}/qa-reports",
		"/v1/orgs/{organizationSlug}/projects/{projectId}/qa-reports/{rest...}",
	} {
		mux.Handle(path, authMiddleware(verifier)(http.HandlerFunc(api.serveHTTP)))
	}
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

func (api *qaReportAPI) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		origin := r.Header.Get("Origin")
		if origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Host != r.Host || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				writeQaReportError(w, r, "origin_guard", qaReportFailure(403, "forbidden", "Cross-origin request denied"))
				return
			}
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			writeQaReportError(w, r, "origin_guard", qaReportFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
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

	if projectID := strings.TrimSpace(r.PathValue("projectId")); projectID != "" {
		api.serveProjectQaReport(w, r, actor, projectID)
		return
	}

	rest := strings.Trim(r.PathValue("rest"), "/")
	var value any
	var status int
	switch {
	case rest == "" && r.Method == http.MethodGet:
		value, status, err = api.listWorkspaceReports(ctx, actor)
	case rest == "findings" && r.Method == http.MethodGet:
		value, status, err = api.listWorkspaceFindings(ctx, actor, r)
	case rest == "findings/promote" && r.Method == http.MethodPost:
		if !actor.canPromoteFindings() {
			writeQaReportError(w, r, "authorize", qaReportFailure(403, "forbidden", "You do not have permission to create issues"))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, qaReportBodyLimit)
		value, status, err = api.promoteWorkspaceFindings(ctx, actor, r)
	default:
		writeQaReportError(w, r, "route", qaReportFailure(404, "not_found", "Not found"))
		return
	}
	if err != nil {
		writeQaReportError(w, r, "handle", err)
		return
	}
	qaReportJSON(w, status, value)
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
