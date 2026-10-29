package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// The MCP get_report tool's route: one of the page's reports by kind, with that tab's own fields
// and whether recent work is still being counted, for a trusted server caller (the web app's
// MCP server) acting for a member it names. The caller holds the service token; this route
// applies the member's own access: the workspace, the Reports flag and billing access.

var reportingKinds = []string{"activity", "words", "time", "ai", "costs"}

type reportingInternalPayload struct {
	OrganizationID string `json:"organizationId"`
	UserID         string `json:"userId"`
	// The report's query as the tool takes it: text, or a number or boolean written as text.
	Query map[string]json.RawMessage `json:"query"`
}

// reportingQueryText is a query value as the route reads it: a JSON string as is, a number or
// boolean as its text, anything else refused.
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

func (api *reportingAPI) internalReport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeReportingError(w, r, "availability", reportingFailure(503, "reports_unavailable", "Reports service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), reportingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	kind := r.PathValue("kind")
	if !slices.Contains(reportingKinds, kind) {
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
	if !api.flagEnabled(ctx, actor) {
		writeReportingError(w, r, "flag", reportingFailure(403, "feature_unavailable", reportingFlagMessage))
		return
	}
	// Reports are for the roles that see what work costs: admins and localization managers.
	if !actor.can("billing:read") {
		writeReportingError(w, r, "capability", reportingFailure(403, "report_forbidden", "Reports require billing access"))
		return
	}
	values := url.Values{}
	for key, raw := range payload.Query {
		value, ok := reportingQueryText(raw)
		if !ok {
			writeReportingError(w, r, "handle", reportingInvalidQuery())
			return
		}
		values.Set(key, value)
	}
	values.Set("format", "json")
	read := func(fn func(*http.Request, reportingActor) (any, int, error)) (map[string]any, error) {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, "/?"+values.Encode(), nil)
		if err != nil {
			return nil, err
		}
		value, _, err := fn(request, actor)
		if err != nil {
			return nil, err
		}
		return value.(map[string]any), nil
	}
	answer := map[string]any{"kind": kind}
	var summary reportingSummaryFreshness
	if err := api.read(ctx, func(db dictionaryDB) error {
		summary, err = reportingSummaryFreshnessOf(ctx, db, actor.organizationID)
		return err
	}); err != nil {
		writeReportingError(w, r, "handle", err)
		return
	}
	answer["summary"] = summary
	answer["stillUpdating"] = summary.PendingDays > 0
	switch kind {
	case "activity":
		err = reportingMerge(answer, read, api.activity, "activity")
	case "words":
		// In one answer, the words report carries its chart too.
		err = reportingMerge(answer, read, api.words, "wordCounts")
		if err == nil {
			var series map[string]any
			if series, err = read(api.wordSeries); err == nil {
				counts := answer["wordCounts"].(reportingWordCounts)
				answer["wordCounts"] = struct {
					reportingWordCounts
					Series any `json:"series"`
				}{counts, series["wordSeries"]}
			}
		}
	case "time":
		err = reportingMerge(answer, read, api.time, "time")
	case "ai":
		// Billing's records are read directly, so still updating does not apply.
		answer["stillUpdating"] = false
		err = reportingMerge(answer, read, api.aiUsage, "aiUsage")
	default:
		err = reportingMerge(answer, read, api.costs, "costs")
	}
	if err != nil {
		writeReportingError(w, r, "handle", err)
		return
	}
	reportingJSON(ctx, w, http.StatusOK, answer)
}

func reportingMerge(answer map[string]any, read func(func(*http.Request, reportingActor) (any, int, error)) (map[string]any, error), fn func(*http.Request, reportingActor) (any, int, error), key string) error {
	value, err := read(fn)
	if err != nil {
		return err
	}
	answer[key] = value[key]
	return nil
}

// actorByID resolves a member by the local ids a trusted server caller names.
func (api *reportingAPI) actorByID(ctx context.Context, userID, organizationID string) (reportingActor, error) {
	resolved, err := resolveOrganizationActorByID(ctx, api.pool, api.membership, userID, organizationID)
	if err != nil {
		return reportingActor{}, mapOrganizationAccessError(err, reportingFailure)
	}
	actor := reportingActor{userID: resolved.userID, organizationID: resolved.organizationID, role: resolved.role}
	err = api.pool.QueryRow(ctx, `select u.workos_user_id, o.workos_organization_id from users u, organizations o where u.id = $1 and o.id = $2`,
		userID, organizationID).Scan(&actor.workosUserID, &actor.workosOrganizationID)
	return actor, err
}
