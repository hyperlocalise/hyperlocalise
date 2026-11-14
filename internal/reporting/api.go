package reporting

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/sync/semaphore"
)

var errReportingBusy = reportingFailure(503, "reports_busy", "Reports is busy; try again shortly")

const (
	RequestTimeout                  = 30 * time.Second
	reportingStatementTimeout       = 10 * time.Second
	reportingQueriesAtOnce          = 3
	QueriesAtOnce                   = reportingQueriesAtOnce
	reportingWorkspaceQueriesAtOnce = reportingQueriesAtOnce - 1
)

var (
	reportingUSDPattern     = regexp.MustCompile(`^\d{1,12}(\.\d{1,8})?$`)
	reportingStepOptions    = []string{"translation", "review"}
	reportingUnitOptions    = []string{"words", "strings", "characters", "characters_with_spaces"}
	reportingMatchBucket    = []string{"repetition", "100", "95-99", "85-94", "75-84", "50-74", "new", "unavailable"}
	reportingSummarySources = []string{"memory", "ai", "person", "import", "unknown"}
)

// API serves Reports reads and writes from PostgreSQL.
type API struct {
	Pool       Pool
	Now        func() time.Time
	Queries    *semaphore.Weighted
	Workspaces *reportingWorkspaceSlots
}

// New is a Reports API with admission limits and the clock. Callers set Pool.
func New() *API {
	return &API{
		Now:        time.Now,
		Queries:    semaphore.NewWeighted(reportingQueriesAtOnce),
		Workspaces: newReportingWorkspaceSlots(reportingWorkspaceQueriesAtOnce),
	}
}

// Actor is the member a report is read as.
type Actor struct {
	userID, organizationID, role       string
	workosUserID, workosOrganizationID string
}

// NewActor names the member a trusted caller (the public API, MCP) is acting as.
func NewActor(userID, organizationID, role, workosUserID, workosOrganizationID string) Actor {
	return Actor{
		userID:               userID,
		organizationID:       organizationID,
		role:                 role,
		workosUserID:         workosUserID,
		workosOrganizationID: workosOrganizationID,
	}
}

func (a Actor) can(capability string) bool {
	return hasOrganizationCapability(a.role, capability)
}

func (a Actor) orgWideProjectAccess() bool {
	return a.can("teams:write")
}

// OrganizationID is the workspace the actor belongs to.
func (a Actor) OrganizationID() string { return a.organizationID }

// UserID is the member the report is read as.
func (a Actor) UserID() string { return a.userID }

// Role is the workspace role used for billing and team access.
func (a Actor) Role() string { return a.role }

// WorkOSUserID is the WorkOS user the flag check names.
func (a Actor) WorkOSUserID() string { return a.workosUserID }

// WorkOSOrganizationID is the WorkOS organization the flag check names.
func (a Actor) WorkOSOrganizationID() string { return a.workosOrganizationID }

// Can reports whether the role has the capability.
func (a Actor) Can(capability string) bool { return a.can(capability) }

// Error is a Reports refusal with the HTTP status and code the page and public API map.
type Error struct {
	Status        int
	Code, Message string
}

func (e *Error) Error() string { return e.Code }

func reportingFailure(status int, code, message string) error {
	return &Error{Status: status, Code: code, Message: message}
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

func formatReportingTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// WriteJSON writes a Reports JSON answer.
func WriteJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "reporting_response_write_failed")
	}
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

func isReportingDay(value string) bool {
	if len(value) != len(time.DateOnly) {
		return false
	}
	_, err := time.Parse(time.DateOnly, value)
	return err == nil
}

// Audit writes a reporting_audit row for a rate-card or budget change.
func Audit(ctx context.Context, tx DB, actor Actor, resourceID, action string, before, after any) error {
	return reportingAudit(ctx, tx, actor, resourceID, action, before, after)
}

// Read runs fn on one pooled connection under the Reports admission and statement limits.
func (api *API) Read(ctx context.Context, fn func(DB) error) error {
	return api.read(ctx, fn)
}

// WithWorkspace names the workspace a request reads for, so admission is per workspace.
func WithWorkspace(ctx context.Context, organizationID string) context.Context {
	return withReportingWorkspace(ctx, organizationID)
}
