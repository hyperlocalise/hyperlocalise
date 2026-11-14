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

// The route behind the MCP get_report tool and the public API's /v1/reports: one of the page's
// reports by kind, with that tab's own fields and whether recent work is still being counted, for
// a trusted server caller (the web app's MCP server, public-api) acting for a member it names. The
// caller holds the service token; this route applies the member's own access: the workspace, the
// Reports flag and billing access. A kind with a download can answer as CSV instead.

var reportingKinds = []string{"activity", "words", "word-series", "time", "ai", "costs", "budgets", "contributors", "task-report"}

// reportingCSVKinds are the kinds that answer with the page's own CSV when asked.
var reportingCSVKinds = []string{"activity", "words", "time", "ai", "costs", "budgets", "contributors", "task-report"}

type reportingInternalPayload struct {
	OrganizationID string `json:"organizationId"`
	UserID         string `json:"userId"`
	// The report's query as the tool takes it: text, or a number or boolean written as text.
	Query map[string]json.RawMessage `json:"query"`
	// "csv" for the kind's download; JSON otherwise.
	Format string `json:"format"`
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
	ctx = withReportingWorkspace(ctx, actor.organizationID)
	// Reports are for the roles that see what work costs: admins and localization managers.
	if !actor.can("billing:read") {
		writeReportingError(w, r, "capability", reportingFailure(403, "report_forbidden", "Reports require billing access"))
		return
	}
	if payload.Format != "" && payload.Format != "json" && payload.Format != "csv" {
		writeReportingError(w, r, "handle", reportingFailure(400, "invalid_payload", "Request payload is invalid"))
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
	jobID := values.Get("jobId")
	if kind == "task-report" {
		// The task is the path's on the page; here it is the query's, and only names the task.
		values.Del("jobId")
		if jobID == "" {
			writeReportingError(w, r, "handle", reportingInvalidQuery())
			return
		}
	}
	request := func(format string) (*http.Request, error) {
		query := url.Values{}
		for key, value := range values {
			query[key] = value
		}
		query.Set("format", format)
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, "/?"+query.Encode(), nil)
		if err == nil && kind == "task-report" {
			request.SetPathValue("jobId", jobID)
		}
		return request, err
	}
	handlers := map[string]func(*http.Request, reportingActor) (any, int, error){
		"activity": api.activity, "words": api.words, "word-series": api.wordSeries, "time": api.time,
		"ai": api.aiUsage, "costs": api.costs, "budgets": api.budgets, "contributors": api.contributors,
		"task-report": api.taskReport,
	}
	if payload.Format == "csv" {
		if !slices.Contains(reportingCSVKinds, kind) {
			writeReportingError(w, r, "handle", reportingFailure(400, "report_csv_unavailable", "This report has no CSV download"))
			return
		}
		req, err := request("csv")
		if err != nil {
			writeReportingError(w, r, "handle", err)
			return
		}
		value, status, err := handlers[kind](req, actor)
		if err != nil {
			writeReportingError(w, r, "handle", err)
			return
		}
		download, ok := value.(reportingCSV)
		if !ok {
			// A task whose words are not shown has no download.
			writeReportingError(w, r, "handle", reportingFailure(400, "report_csv_unavailable", "This report has no CSV download"))
			return
		}
		writeReportingCSV(ctx, w, status, download)
		return
	}
	read := func(fn func(*http.Request, reportingActor) (any, int, error)) (map[string]any, error) {
		req, err := request("json")
		if err != nil {
			return nil, err
		}
		value, _, err := fn(req, actor)
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
	case "word-series":
		err = reportingMerge(answer, read, api.wordSeries, "wordSeries")
	case "time":
		err = reportingMerge(answer, read, api.time, "time")
	case "ai":
		// Billing's records are read directly, so still updating does not apply.
		answer["stillUpdating"] = false
		err = reportingMerge(answer, read, api.aiUsage, "aiUsage")
	case "budgets":
		err = reportingMerge(answer, read, api.budgets, "budgets")
	case "contributors":
		err = reportingMerge(answer, read, api.contributors, "contributors")
	case "task-report":
		err = reportingMerge(answer, read, api.taskReport, "taskReport")
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
