package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/workos/workos-go/v10"
)

const (
	qaReportBodyLimit      = 64 << 10
	qaReportRequestTimeout = 30 * time.Second
)

type qaReportAPI struct {
	pool        dictionaryPool
	membership  func(context.Context, string) (*workos.UserOrganizationMembership, error)
	activityLog activityLogPublisher
	guidelines  *guidelineCheckAPI
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
		logRequestFailure(r, "qa_report_request_failed", phase, err)
		failure = &qaReportError{500, "internal_error", "Internal server error"}
	} else {
		logRequestFailure(r, "qa_report_request_failed", phase, err, "status", failure.status, "code", failure.code)
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
	route("PATCH "+q+"/findings/{findingId}", bindActor(api, (*qaReportAPI).reviewFindingHandler))
	registerAuthenticated(mux, verifier, "POST "+q+"/findings/{findingId}/explain", api.handleWithin(guidelineCheckTimeout, bindActor(api, (*qaReportAPI).explainFindingHandler)))
	route("POST "+q+"/findings/review", bindActor(api, (*qaReportAPI).reviewFindingsHandler))
	route("POST "+q+"/findings/promote", bindActor(api, (*qaReportAPI).promoteWorkspaceFindingsHandler))
	route("GET "+p, bindActor(api, (*qaReportAPI).listProjectQaReportsHandler))
	route("POST "+p, bindActor(api, (*qaReportAPI).startProjectQaScanHandler))
	route("GET "+p+"/last-successful", bindActor(api, (*qaReportAPI).lastSuccessfulProjectQaRunHandler))
	route("PATCH "+p+"/settings", bindActor(api, (*qaReportAPI).patchProjectQaSettingsHandler))
	route("GET "+p+"/latest-findings", bindActor(api, (*qaReportAPI).listProjectLatestFindingsHandler))
	route("POST "+p+"/findings/promote", bindActor(api, (*qaReportAPI).promoteProjectFindingsHandler))
	route("GET "+p+"/{runId}", bindActor(api, (*qaReportAPI).getProjectQaRunHandler))
}

func (api *qaReportAPI) actor(ctx context.Context, claims AuthClaims, slug string) (qaReportActor, error) {
	// The shared check, which also refuses a vendor (vendor-access.go).
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return qaReportActor{}, mapOrganizationAccessError(err, qaReportFailure)
	}
	return qaReportActor{userID: resolved.userID, organizationID: resolved.organizationID, organizationSlug: slug, role: resolved.role}, nil
}

func (api *qaReportAPI) handle(fn func(*http.Request, qaReportActor) (any, int, error)) http.Handler {
	return api.handleWithin(qaReportRequestTimeout, fn)
}

func (api *qaReportAPI) handleWithin(timeout time.Duration, fn func(*http.Request, qaReportActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if timeout > qaReportRequestTimeout {
			setGuidelineCheckWriteDeadline(w)
		}
		if denyBrowserMutation(r) {
			writeQaReportError(w, r, "origin_guard", qaReportFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeQaReportError(w, r, "availability", qaReportFailure(503, "qa_report_unavailable", "QA report service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
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

func (api *qaReportAPI) lastSuccessfulProjectQaRunHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	project, err := api.withOwnedProject(r, actor)
	if err != nil {
		return nil, 0, err
	}
	beforeRunID, err := uuid.Parse(r.URL.Query().Get("beforeRunId"))
	if err != nil {
		return nil, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
	}
	run, err := api.lastSuccessfulProjectQaRun(r.Context(), actor.organizationID, project.ID, beforeRunID)
	if err != nil {
		return nil, 0, err
	}
	return run, 200, nil
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
