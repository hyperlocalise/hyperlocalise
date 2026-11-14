package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/reporting"
)

// The route behind the MCP get_report tool: one of the page's reports by kind, with that tab's
// own fields and whether recent work is still being counted, for a trusted server caller acting
// for a member it names. The caller holds the service token; this route applies the member's own
// access: the workspace, the Reports flag and billing access. A kind with a download can answer
// as CSV instead.

func (api *reportingAPI) registerInternal(mux *http.ServeMux) {
	mux.HandleFunc("POST /internal/reports/{kind}", func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("WORKOS_COOKIE_PASSWORD") == "" {
			writeUnauthorized(w, "service authentication unavailable")
			return
		}
		if !requireServerCallToken(w, r) {
			return
		}
		api.internalReport(w, r)
	})
}

type reportingInternalPayload struct {
	OrganizationID string                     `json:"organizationId"`
	UserID         string                     `json:"userId"`
	Query          map[string]json.RawMessage `json:"query"`
	Format         string                     `json:"format"`
}

func (api *reportingAPI) internalReport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.Pool == nil {
		writeReportingError(w, r, "availability", reportingFailure(503, "reports_unavailable", "Reports service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), reportingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	kind := r.PathValue("kind")
	if !slices.Contains(reporting.Kinds, kind) {
		writeReportingError(w, r, "handle", reportingFailure(400, "invalid_report_kind", "Report kind is invalid"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, workspaceBodyLimit)
	var payload reportingInternalPayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		writeReportingError(w, r, "handle", reportingFailure(400, "invalid_payload", "Request payload is invalid"))
		return
	}
	if _, err := uuid.Parse(strings.TrimSpace(payload.OrganizationID)); err != nil {
		writeReportingError(w, r, "handle", reportingFailure(400, "invalid_payload", "Request payload is invalid"))
		return
	}
	if _, err := uuid.Parse(strings.TrimSpace(payload.UserID)); err != nil {
		writeReportingError(w, r, "handle", reportingFailure(400, "invalid_payload", "Request payload is invalid"))
		return
	}
	actor, err := api.actorByID(ctx, strings.TrimSpace(payload.UserID), strings.TrimSpace(payload.OrganizationID))
	if err != nil {
		writeReportingError(w, r, "resolve_actor", err)
		return
	}
	query := map[string]string{}
	for key, raw := range payload.Query {
		value, ok := reportingQueryText(raw)
		if !ok {
			writeReportingError(w, r, "handle", reportingInvalidQuery())
			return
		}
		query[key] = value
	}
	result, err := api.Report(ctx, actor, kind, payload.Format, query)
	if err != nil {
		writeReportingError(w, r, "handle", err)
		return
	}
	writeReportingResult(w, result)
}

func reportingQueryText(raw json.RawMessage) (string, bool) {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text, true
	}
	var number json.Number
	if json.Unmarshal(raw, &number) == nil {
		return number.String(), true
	}
	var flag bool
	if json.Unmarshal(raw, &flag) == nil {
		return strconv.FormatBool(flag), true
	}
	return "", false
}

func writeReportingResult(w http.ResponseWriter, result reporting.Result) {
	if result.ContentType != "" {
		w.Header().Set("Content-Type", result.ContentType)
	}
	if result.ContentDisposition != "" {
		w.Header().Set("Content-Disposition", result.ContentDisposition)
	}
	if strings.HasPrefix(result.ContentType, "text/csv") || strings.HasPrefix(result.ContentType, "application/vnd.openxmlformats") {
		w.Header().Set("X-Content-Type-Options", "nosniff")
	}
	w.WriteHeader(result.Status)
	if len(result.Body) > 0 {
		_, _ = w.Write(result.Body)
	}
}

func (api *reportingAPI) actorByID(ctx context.Context, userID, organizationID string) (reportingActor, error) {
	resolved, err := resolveOrganizationActorByID(ctx, api.Pool, api.membership, userID, organizationID)
	if err != nil {
		return reportingActor{}, mapOrganizationAccessError(err, reportingFailure)
	}
	var workosUser, workosOrg string
	err = api.Pool.QueryRow(ctx, `select u.workos_user_id, o.workos_organization_id from users u, organizations o where u.id = $1 and o.id = $2`,
		userID, organizationID).Scan(&workosUser, &workosOrg)
	if err != nil {
		return reportingActor{}, err
	}
	return reporting.NewActor(resolved.userID, resolved.organizationID, resolved.role, workosUser, workosOrg), nil
}
