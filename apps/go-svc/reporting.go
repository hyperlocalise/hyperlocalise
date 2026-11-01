package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/sync/semaphore"
)

var errReportingBusy = reportingFailure(503, "reports_busy", "Reports is busy; try again shortly")

// Reports: the reads behind the Reports page under /v1/orgs/{slug}/reports. The web app records
// the work (analyses, finished strings, time, costs) and keeps the daily summary; this serves what
// the page shows from those tables. Answers match the web app's Hono routes field for field.

const (
	workspaceReportsFlag      = "workspace-reports"
	reportingFlagMessage      = "Reports is not enabled for this workspace"
	reportingRequestTimeout   = 30 * time.Second
	reportingStatementTimeout = 10 * time.Second
	// How many Reports requests may query the database at once per copy of the service, so a
	// Reports page's dozen requests cannot hold every pooled connection while the editor waits.
	reportingQueriesAtOnce = 2
)

var (
	reportingUSDPattern     = regexp.MustCompile(`^\d{1,12}(\.\d{1,8})?$`)
	reportingStepOptions    = []string{"translation", "review"}
	reportingUnitOptions    = []string{"words", "strings", "characters", "characters_with_spaces"}
	reportingMatchBucket    = []string{"repetition", "100", "95-99", "85-94", "75-84", "50-74", "new", "unavailable"}
	reportingSummarySources = []string{"memory", "ai", "person", "import", "unknown"}
)

type reportingAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	flags      workspaceFlagChecker
	now        func() time.Time
	queries    *semaphore.Weighted
}

func newReportingAPI() *reportingAPI {
	return &reportingAPI{now: time.Now, queries: semaphore.NewWeighted(reportingQueriesAtOnce)}
}

type reportingActor struct {
	userID, organizationID, role       string
	workosUserID, workosOrganizationID string
}

func (a reportingActor) can(capability string) bool {
	return hasOrganizationCapability(a.role, capability)
}

// orgWideProjectAccess mirrors the web app's hasOrganizationWideProjectAccess: the roles that
// manage teams can open every project.
func (a reportingActor) orgWideProjectAccess() bool {
	return a.can("teams:write")
}

type reportingError struct {
	status        int
	code, message string
}

func (e *reportingError) Error() string { return e.code }

func reportingFailure(status int, code, message string) error {
	return &reportingError{status: status, code: code, message: message}
}

func reportingInvalid(code string) error {
	return reportingFailure(400, code, "Request payload is invalid")
}

func reportingInvalidQuery() error {
	return reportingFailure(400, "invalid_report_query", "Report query is invalid")
}

func reportingForbidden(code string) error {
	return reportingFailure(403, code, "Insufficient permissions")
}

func (api *reportingAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/reports"
	route := func(pattern, capability, deniedCode string, fn func(*http.Request, reportingActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(capability, deniedCode, fn))
	}
	route("GET "+base+"/jobs", "", "", api.tasks)
	route("GET "+base+"/settings", "", "", api.settings)
	route("GET "+base+"/activity", "billing:read", "report_costs_forbidden", api.activity)
	route("GET "+base+"/step-times", "billing:read", "report_costs_forbidden", api.stepTimes)
	route("GET "+base+"/words/series", "billing:read", "report_costs_forbidden", api.wordSeries)
	route("GET "+base+"/words", "billing:read", "report_costs_forbidden", api.words)
	route("GET "+base+"/time", "", "", api.time)
	route("GET "+base+"/ai-usage", "billing:read", "report_costs_forbidden", api.aiUsage)
	route("GET "+base+"/costs", "billing:read", "report_costs_forbidden", api.costs)
	route("GET "+base+"/cost-estimate", "billing:read", "report_costs_forbidden", api.costEstimate)
	route("GET "+base+"/budgets", "billing:read", "report_costs_forbidden", api.budgets)
	route("GET "+base+"/rate-cards", "billing:read", "report_costs_forbidden", api.rateCards)
	route("PUT "+base+"/rate-cards", "billing:write", "report_costs_forbidden", api.saveRateCard)
	route("PUT "+base+"/budgets", "billing:write", "report_costs_forbidden", api.saveBudget)
	route("PUT "+base+"/task-rates", "billing:write", "report_costs_forbidden", api.saveTaskRate)
	route("POST "+base+"/time-entries", "jobs:write", "time_entry_forbidden", api.logTime)
	route("PATCH "+base+"/time-entries/{id}", "", "", api.editTime)
	route("DELETE "+base+"/time-entries/{id}", "", "", api.voidTime)
	route("GET "+base+"/tasks/{jobId}/report", "", "", api.taskReport)
	route("GET "+base+"/tasks/{jobId}/analysis", "", "", api.taskAnalysis)
}

func (api *reportingAPI) actor(ctx context.Context, claims AuthClaims, slug string) (reportingActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return reportingActor{}, mapOrganizationAccessError(err, reportingFailure)
	}
	var workosOrg string
	if err := api.pool.QueryRow(ctx, `select workos_organization_id from organizations where id=$1`, resolved.organizationID).Scan(&workosOrg); err != nil {
		return reportingActor{}, err
	}
	return reportingActor{
		userID:               resolved.userID,
		organizationID:       resolved.organizationID,
		role:                 resolved.role,
		workosUserID:         claims.UserID,
		workosOrganizationID: workosOrg,
	}, nil
}

// handle checks the session, the workspace, the Reports flag and the route's capability, in that
// order as the web routes do. The database admission limit is in read.
func (api *reportingAPI) handle(capability, deniedCode string, fn func(*http.Request, reportingActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeReportingError(w, r, "origin_guard", reportingFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
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
		if !api.flagEnabled(ctx, actor) {
			writeReportingError(w, r, "flag", reportingFailure(403, "feature_unavailable", reportingFlagMessage))
			return
		}
		if capability != "" && !actor.can(capability) {
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
			writeReportingCSV(ctx, w, status, download)
			return
		}
		reportingJSON(ctx, w, status, value)
	})
}

func (api *reportingAPI) flagEnabled(ctx context.Context, actor reportingActor) bool {
	if api.flags == nil {
		return false
	}
	enabled, err := api.flags.Enabled(ctx, actor.workosOrganizationID, actor.workosUserID, workspaceReportsFlag)
	return err == nil && enabled
}

func reportingJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "reporting_response_write_failed")
	}
}

func writeReportingError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *reportingError
	var pgErr *pgconn.PgError
	switch {
	case errors.As(err, &failure):
		logRequestFailure(r, "reporting_request_failed", phase, err, "status", failure.status, "code", failure.code)
	case (errors.As(err, &pgErr) && pgErr.Code == "57014") || errors.Is(err, context.DeadlineExceeded):
		// The statement or request time limit: the report is too wide, or a lock was held too long.
		logRequestFailure(r, "reporting_request_failed", phase, err, "status", 503, "code", "report_timed_out")
		failure = &reportingError{status: 503, code: "report_timed_out", message: "The request took too long; try again, or choose fewer days for a report"}
	default:
		logRequestFailure(r, "reporting_request_failed", phase, err)
		failure = &reportingError{status: 500, code: "internal_error", message: "Internal server error"}
	}
	reportingJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func formatReportingTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

type reportingBody struct {
	fields map[string]json.RawMessage
	valid  bool
}

func readReportingBody(r *http.Request, code string) (*reportingBody, error) {
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, reportingInvalid(code)
	}
	return &reportingBody{fields: fields, valid: true}, nil
}

func (b *reportingBody) fail() { b.valid = false }

func (b *reportingBody) field(key string) (json.RawMessage, bool) {
	raw, ok := b.fields[key]
	return raw, ok
}

func (b *reportingBody) decodeString(raw json.RawMessage) (string, bool) {
	var value string
	if isJSONNull(raw) || json.Unmarshal(raw, &value) != nil || !reportingValidText(value) {
		b.fail()
		return "", false
	}
	return value, true
}

// reportingValidText refuses what the database refuses in text: invalid UTF-8 and NUL bytes.
func reportingValidText(value string) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0)
}

func (b *reportingBody) checkLength(value string, minLength, maxLength int) {
	if n := utf16Length(value); n < minLength || n > maxLength {
		b.fail()
	}
}

func (b *reportingBody) text(key string, minLength, maxLength int) string {
	raw, ok := b.field(key)
	if !ok {
		b.fail()
		return ""
	}
	value, ok := b.decodeString(raw)
	if ok {
		b.checkLength(value, minLength, maxLength)
	}
	return value
}

func (b *reportingBody) trimmedText(key string, minLength, maxLength int) string {
	raw, ok := b.field(key)
	if !ok {
		b.fail()
		return ""
	}
	value, ok := b.decodeString(raw)
	if !ok {
		return ""
	}
	value = jsTrim(value)
	b.checkLength(value, minLength, maxLength)
	return value
}

func (b *reportingBody) optionalText(key string, maxLength int) *string {
	raw, ok := b.field(key)
	if !ok {
		return nil
	}
	value, ok := b.decodeString(raw)
	if !ok {
		return nil
	}
	b.checkLength(value, 0, maxLength)
	return &value
}

// nullableTrimmedText is z.string().trim().min(1).max(n).nullable().default(null): absent or
// null is null, and an empty string after trimming is invalid.
func (b *reportingBody) nullableTrimmedText(key string, maxLength int) *string {
	raw, ok := b.field(key)
	if !ok || isJSONNull(raw) {
		return nil
	}
	value := b.trimmedText(key, 1, maxLength)
	return &value
}

func (b *reportingBody) boolean(key string, fallback bool) bool {
	raw, ok := b.field(key)
	if !ok {
		return fallback
	}
	var value bool
	if isJSONNull(raw) || json.Unmarshal(raw, &value) != nil {
		b.fail()
		return fallback
	}
	return value
}

// objects is an array of at most maxItems objects, each read with its own body helpers.
func (b *reportingBody) objects(key string, maxItems int) []*reportingBody {
	raw, ok := b.field(key)
	if !ok {
		b.fail()
		return nil
	}
	var items []map[string]json.RawMessage
	if isJSONNull(raw) || json.Unmarshal(raw, &items) != nil || len(items) > maxItems {
		b.fail()
		return nil
	}
	bodies := make([]*reportingBody, 0, len(items))
	for _, item := range items {
		if item == nil {
			b.fail()
			continue
		}
		bodies = append(bodies, &reportingBody{fields: item, valid: true})
	}
	return bodies
}

func (b *reportingBody) nullableText(key string, maxLength int) *string {
	raw, ok := b.field(key)
	if !ok || isJSONNull(raw) {
		return nil
	}
	return b.optionalText(key, maxLength)
}

func (b *reportingBody) choice(key string, options ...string) string {
	value := b.text(key, 0, math.MaxInt)
	if !slices.Contains(options, value) {
		b.fail()
	}
	return value
}

func (b *reportingBody) step(key string) string {
	return b.choice(key, reportingStepOptions...)
}

func (b *reportingBody) usd(key string) string {
	value := b.text(key, 0, math.MaxInt)
	if !reportingUSDPattern.MatchString(value) {
		b.fail()
	}
	return value
}

func (b *reportingBody) nullableUSD(key string) *string {
	raw, ok := b.field(key)
	if !ok || isJSONNull(raw) {
		return nil
	}
	value := b.usd(key)
	return &value
}

// day is a calendar day from 2000 on, as the web schema takes it.
func (b *reportingBody) day(key string) string {
	value := b.text(key, 0, math.MaxInt)
	if !isReportingDay(value) || value < "2000-01-01" {
		b.fail()
	}
	return value
}

func (b *reportingBody) uuid(key string) string {
	value := b.text(key, 0, math.MaxInt)
	if !apiKeyIDPattern.MatchString(value) {
		b.fail()
	}
	return value
}

func (b *reportingBody) nullableUUID(key string) *string {
	raw, ok := b.field(key)
	if !ok || isJSONNull(raw) {
		return nil
	}
	value := b.uuid(key)
	return &value
}

func (b *reportingBody) decodeInteger(raw json.RawMessage, minValue, maxValue int) int {
	var value float64
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || (trimmed[0] != '-' && (trimmed[0] < '0' || trimmed[0] > '9')) || json.Unmarshal(trimmed, &value) != nil {
		b.fail()
		return 0
	}
	if value != math.Trunc(value) || value < float64(minValue) || value > float64(maxValue) {
		b.fail()
		return 0
	}
	return int(value)
}

func (b *reportingBody) integer(key string, minValue, maxValue int) int {
	raw, ok := b.field(key)
	if !ok {
		b.fail()
		return 0
	}
	return b.decodeInteger(raw, minValue, maxValue)
}

func (b *reportingBody) nullableInteger(key string, minValue, maxValue int) *int {
	raw, ok := b.field(key)
	if !ok || isJSONNull(raw) {
		return nil
	}
	value := b.decodeInteger(raw, minValue, maxValue)
	return &value
}

func (b *reportingBody) percentages(key string) map[string]int {
	result := map[string]int{}
	raw, ok := b.field(key)
	if !ok {
		return result
	}
	var entries map[string]json.RawMessage
	if isJSONNull(raw) || json.Unmarshal(raw, &entries) != nil {
		b.fail()
		return result
	}
	for bucket, value := range entries {
		if !slices.Contains(reportingMatchBucket, bucket) {
			b.fail()
			continue
		}
		result[bucket] = b.decodeInteger(value, 0, 100)
	}
	return result
}

// isReportingDay accepts a day as the web schema does: YYYY-MM-DD, a real calendar date.
func isReportingDay(value string) bool {
	if len(value) != len(time.DateOnly) {
		return false
	}
	_, err := time.Parse(time.DateOnly, value)
	return err == nil
}
