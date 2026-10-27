package main

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"regexp"
	"slices"
	"time"
)

const (
	workspaceReportsFlag = "workspace-reports"
	reportingFlagMessage = "Reports is not enabled for this workspace"
)

var (
	reportingUSDPattern  = regexp.MustCompile(`^\d{1,12}(\.\d{1,8})?$`)
	reportingStepOptions = []string{"translation", "review"}
	reportingMatchBucket = []string{"repetition", "100", "95-99", "85-94", "75-84", "50-74", "new", "unavailable"}
)

func (h *handler) registerReporting(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/reports"
	route := func(pattern string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, h.workspaceHandle(
			workspaceReportsFlag, reportingFlagMessage, "Insufficient permissions",
			func(workspaceActor) bool { return true }, fn,
		))
	}
	route("GET "+base, h.getReport)
	route("GET "+base+"/settings", h.getReportSettings)
	route("GET "+base+"/tasks/{jobId}", h.getTaskReport)
	route("POST "+base+"/rates", h.createReportingRate)
	route("PUT "+base+"/budgets", h.upsertReportingBudget)
	route("PUT "+base+"/task-rates", h.putTaskRate)
	route("POST "+base+"/expenses", h.createReportingExpense)
	route("POST "+base+"/time-entries", h.createTimeEntry)
	route("PATCH "+base+"/time-entries/{id}", h.updateTimeEntry)
	route("DELETE "+base+"/time-entries/{id}", h.deleteTimeEntry)
}

func reportingInvalid(code string) error {
	return workspaceFailure(400, code, "Request payload is invalid")
}

func reportingForbidden(code string) error {
	return workspaceFailure(403, code, "Insufficient permissions")
}

func reportingNotFound(code string) error {
	return workspaceFailure(404, code, "Resource not found")
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
	if isJSONNull(raw) || json.Unmarshal(raw, &value) != nil {
		b.fail()
		return "", false
	}
	return value, true
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
	if !isReportingDay(value) {
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

type reportingCSV struct {
	filename string
	body     []byte
}

func writeReportingCSV(w http.ResponseWriter, status int, download reportingCSV) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+download.filename+`"`)
	w.WriteHeader(status)
	_, _ = w.Write(download.body)
}
