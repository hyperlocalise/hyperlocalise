package main

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/reporting"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	reportingRequestTimeout    = reporting.RequestTimeout
	reportingXLSXContentType   = reporting.XLSXContentType
	reportingQuoteSheet        = reporting.QuoteSheet
	reportingQueriesAtOnce     = reporting.QueriesAtOnce
	reportingTaskAnalysisStale = reporting.TaskAnalysisStale
	reportingAiPageSize        = reporting.AiPageSize
	reportingAiChildRows       = reporting.AiChildRows
)

var (
	reportingUnitOptions   = reporting.UnitOptions
	reportingStepOptions   = reporting.StepOptions
	reportingMatchBucket   = reporting.MatchBucket
	reportingTaskRunStages = reporting.TaskRunStages
)

type reportingAPI struct {
	*reporting.API
	membership organizationMembershipLookup
}

func newReportingAPI() *reportingAPI {
	return &reportingAPI{API: reporting.New()}
}

type (
	reportingActor = reporting.Actor
	reportingError = reporting.Error
	reportingCSV   = reporting.CSV
	reportingFile  = reporting.File
)

func reportingFailure(status int, code, message string) error {
	return &reporting.Error{Status: status, Code: code, Message: message}
}

func reportingInvalidQuery() error {
	return reportingFailure(400, "invalid_report_query", "Report query is invalid")
}

func (api *reportingAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/reports"
	route := func(pattern, capability, deniedCode string, fn func(*http.Request, reportingActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(capability, deniedCode, fn))
	}
	route("GET "+base+"/jobs", "", "", api.Tasks)
	route("GET "+base+"/settings", "", "", api.Settings)
	route("GET "+base+"/activity", "billing:read", "report_costs_forbidden", api.Activity)
	route("GET "+base+"/step-times", "billing:read", "report_costs_forbidden", api.StepTimes)
	route("GET "+base+"/words/series", "billing:read", "report_costs_forbidden", api.WordSeries)
	route("GET "+base+"/words", "billing:read", "report_costs_forbidden", api.Words)
	route("GET "+base+"/time", "", "", api.Time)
	route("GET "+base+"/contributors", "", "", api.Contributors)
	route("GET "+base+"/ai-usage", "billing:read", "report_costs_forbidden", api.AIUsage)
	route("GET "+base+"/costs", "billing:read", "report_costs_forbidden", api.Costs)
	route("GET "+base+"/cost-estimate", "billing:read", "report_costs_forbidden", api.CostEstimate)
	route("GET "+base+"/budgets", "billing:read", "report_costs_forbidden", api.Budgets)
	route("GET "+base+"/rate-cards", "billing:read", "report_costs_forbidden", api.RateCards)
	route("PUT "+base+"/rate-cards", "billing:write", "report_costs_forbidden", api.SaveRateCard)
	route("PUT "+base+"/budgets", "billing:write", "report_costs_forbidden", api.SaveBudget)
	route("PUT "+base+"/task-rates", "billing:write", "report_costs_forbidden", api.SaveTaskRate)
	route("POST "+base+"/time-entries", "jobs:write", "time_entry_forbidden", api.LogTime)
	route("PATCH "+base+"/time-entries/{id}", "", "", api.EditTime)
	route("DELETE "+base+"/time-entries/{id}", "", "", api.VoidTime)
	route("GET "+base+"/tasks/{jobId}/report", "", "", api.TaskReport)
	route("GET "+base+"/tasks/{jobId}/analysis", "", "", api.TaskAnalysis)
}

func (api *reportingAPI) actor(ctx context.Context, claims AuthClaims, slug string) (reportingActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.Pool, api.membership, claims, slug)
	if err != nil {
		return reportingActor{}, mapOrganizationAccessError(err, reportingFailure)
	}
	return reporting.NewActor(resolved.userID, resolved.organizationID, resolved.role, claims.UserID, ""), nil
}

func (api *reportingAPI) handle(capability, deniedCode string, fn func(*http.Request, reportingActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeReportingError(w, r, "origin_guard", reportingFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.Pool == nil {
			writeReportingError(w, r, "availability", reportingFailure(503, "reports_unavailable", "Reports service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), reportingRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeReportingError(w, r, "auth", reportingFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeReportingError(w, r, "resolve_actor", err)
			return
		}
		r = r.WithContext(reporting.WithWorkspace(ctx, actor.OrganizationID()))
		ctx = r.Context()
		if capability != "" && !actor.Can(capability) {
			writeReportingError(w, r, "capability", reportingForbidden(deniedCode))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, workspaceBodyLimit)
		value, status, err := fn(r, actor)
		if err != nil {
			writeReportingError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		if download, ok := value.(reportingCSV); ok {
			reporting.WriteCSV(ctx, w, status, download)
			return
		}
		if file, ok := value.(reportingFile); ok {
			reporting.WriteFile(ctx, w, status, file)
			return
		}
		reporting.WriteJSON(ctx, w, status, value)
	})
}

func reportingForbidden(code string) error {
	return reportingFailure(403, code, "Insufficient permissions")
}

func writeReportingError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *reportingError
	var pgErr *pgconn.PgError
	switch {
	case errors.As(err, &failure):
		logRequestFailure(r, "reporting_request_failed", phase, err, "status", failure.Status, "code", failure.Code)
	case (errors.As(err, &pgErr) && pgErr.Code == "57014") || errors.Is(err, context.DeadlineExceeded):
		logRequestFailure(r, "reporting_request_failed", phase, err, "status", 503, "code", "report_timed_out")
		failure = &reportingError{Status: 503, Code: "report_timed_out", Message: "The request took too long; try again, or choose fewer days for a report"}
	default:
		logRequestFailure(r, "reporting_request_failed", phase, err)
		failure = &reportingError{Status: 500, Code: "internal_error", Message: "Internal server error"}
	}
	reporting.WriteJSON(r.Context(), w, failure.Status, map[string]string{"error": failure.Code, "message": failure.Message})
}

func writeReportingCSV(ctx context.Context, w http.ResponseWriter, status int, download reportingCSV) {
	reporting.WriteCSV(ctx, w, status, download)
}

func reportingCSVCell(text string) string { return reporting.CSVCell(text) }

func reportingNumber(value float64) string { return reporting.Number(value) }

func reportingAudit(ctx context.Context, tx reporting.DB, actor reportingActor, resourceID, action string, before, after any) error {
	return reporting.Audit(ctx, tx, actor, resourceID, action, before, after)
}

func (api *reportingAPI) read(ctx context.Context, fn func(db reporting.DB) error) error {
	return api.Read(ctx, fn)
}

func (api *reportingAPI) saveRateCard(r *http.Request, actor reportingActor) (any, int, error) {
	return api.SaveRateCard(r, actor)
}

func (api *reportingAPI) rateCards(r *http.Request, actor reportingActor) (any, int, error) {
	return api.RateCards(r, actor)
}

const reportingWordCountPageSize = reporting.WordCountPageSize

type (
	reportingRateCard         = reporting.RateCard
	reportingRateLine         = reporting.RateLine
	reportingRateRow          = reporting.RateRow
	reportingWordCounts       = reporting.WordCounts
	reportingWordCountRow     = reporting.WordCountRow
	reportingStepTimes        = reporting.StepTimes
	reportingStepTime         = reporting.StepTime
	reportingAutomatedTime    = reporting.AutomatedTime
	reportingWorkflowStepTime = reporting.WorkflowStepTime
	reportingTaskRuns         = reporting.TaskRuns
	reportingStageTime        = reporting.StageTime
	reportingLoggedTime       = reporting.LoggedTime
	reportingLoggedTimeRow    = reporting.LoggedTimeRow
)

func reportingSamePercentages(left json.RawMessage, right map[string]int) bool {
	return reporting.SamePercentages(left, right)
}

func reportingLineKey(sourceLocale, targetLocale, step string) string {
	return reporting.LineKey(sourceLocale, targetLocale, step)
}

func reportingLiveRateRowsSQL(organizationParam string) string {
	return reporting.LiveRateRowsSQL(organizationParam)
}

func reportingBudgetStatus(budget, spent, forecast *big.Int) string {
	return reporting.BudgetStatus(budget, spent, forecast)
}

func resolveReportingRate(ctx context.Context, db reporting.DB, organizationID, projectID, jobID, sourceLocale, targetLocale, step string) (*reportingRateRow, error) {
	return reporting.ResolveRate(ctx, db, organizationID, projectID, jobID, sourceLocale, targetLocale, step)
}

func reportingWordCountsCSV(counts reportingWordCounts) reportingCSV {
	return reporting.WordCountsCSV(counts)
}

func reportingStepTimesCSV(times reportingStepTimes) reportingCSV {
	return reporting.StepTimesCSV(times)
}

func reportingLoggedTimeCSV(logged reportingLoggedTime) reportingCSV {
	return reporting.LoggedTimeCSV(logged)
}

func reportingProjectIDs(ctx context.Context, db reporting.DB, actor reportingActor) ([]string, error) {
	return reporting.ProjectIDs(ctx, db, actor)
}

func queryReportingTaskWords(ctx context.Context, db reporting.DB, organizationID, jobID, unit string) (reporting.TaskWords, error) {
	return reporting.QueryTaskWords(ctx, db, organizationID, jobID, unit)
}

func reportingAiAreaSQL(source, agentRunKind string) string {
	return reporting.AiAreaSQL(source, agentRunKind)
}

func reportingAiChannelSQL(source, viaApiKey string) string {
	return reporting.AiChannelSQL(source, viaApiKey)
}

func reportingAttributedUsageSQL(organizationParam, where string) string {
	return reporting.AttributedUsageSQL(organizationParam, where)
}

func listReportingRateCards(ctx context.Context, db reporting.DB, organizationID string) ([]reportingRateCard, error) {
	return reporting.ListRateCards(ctx, db, organizationID)
}

func compareReportingNames(a, b string) int {
	return reporting.CompareNames(a, b)
}

func usdUnits(value string) (*big.Int, error) {
	return reporting.USDUnits(value)
}

func usdString(value *big.Int) string {
	return reporting.USDString(value)
}

func wordCost(rate string, words, payablePercent int) (*big.Int, error) {
	return reporting.WordCost(rate, words, payablePercent)
}

func queryReportingLockedPricingSteps(ctx context.Context, db reporting.DB, organizationID, jobID, status string) ([]string, error) {
	return reporting.LockedPricingSteps(ctx, db, organizationID, jobID, status)
}
