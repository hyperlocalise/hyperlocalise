package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// /v1/reports/{report} and /v1/jobs/{jobId}/report: the Reports page's reports for scripts, BI
// tools and payment systems, as JSON or the page's own CSV. Each reads through go-svc as the
// token's member (reports-client.go), behind the reports:read scope and a per-workspace limit.

// reportKinds maps each public report to go-svc's internal kind.
var reportKinds = map[string]string{
	"activity":     "activity",
	"words":        "words",
	"word-series":  "word-series",
	"time":         "time",
	"ai-usage":     "ai",
	"costs":        "costs",
	"budgets":      "budgets",
	"contributors": "contributors",
}

const (
	reportsQueryMaxKeys     = 30
	reportsQueryMaxKeyLen   = 40
	reportsQueryMaxValueLen = 2_000
	// How long a report's answer may take to write: go-svc's 30 s and the way back.
	reportsWriteTimeout = 45 * time.Second
	// Reports are the heaviest reads this service passes on: a workspace may ask for this many
	// a minute per copy, in bursts of up to reportsBurst.
	reportsPerMinute = 30
	reportsBurst     = 10
	// How soon to ask again when go-svc is busy.
	reportsBusyRetryAfter = "5"
)

func (s apiServer) report(w http.ResponseWriter, r *http.Request) {
	kind, ok := reportKinds[r.PathValue("report")]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return
	}
	s.serveReport(w, r, kind, "")
}

func (s apiServer) jobReport(w http.ResponseWriter, r *http.Request) {
	jobID, ok := pathID(w, r, "jobId")
	if !ok {
		return
	}
	s.serveReport(w, r, "task-report", jobID)
}

func (s apiServer) serveReport(w http.ResponseWriter, r *http.Request, kind, jobID string) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	p, ok := s.authenticate(w, r, "reports:read")
	if !ok {
		return
	}
	if s.reports == nil {
		writeError(w, http.StatusServiceUnavailable, "reports_unavailable", "Reports are temporarily unavailable")
		return
	}
	query, format, ok := reportQuery(w, r)
	if !ok {
		return
	}
	if jobID != "" {
		query["jobId"] = jobID
	}
	if wait, allowed := s.reportLimits.take(p.OrganizationID, time.Now()); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many report requests for this workspace; try again shortly")
		return
	}
	// A report can take longer than other reads to answer.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(reportsWriteTimeout))
	answer, err := s.reports.report(r.Context(), p, kind, query, format)
	switch {
	case errors.Is(err, errReportTooLarge):
		writeError(w, http.StatusUnprocessableEntity, "report_too_large", "The report is too large; choose fewer days or a narrower filter")
		return
	case err != nil:
		slog.Warn("report_read_failed", "kind", kind, "error", err)
		writeError(w, http.StatusServiceUnavailable, "reports_unavailable", "Reports are temporarily unavailable")
		return
	}
	writeReportAnswer(w, kind, answer)
}

// reportQuery reads the query go-svc is given: each key once, within length limits, and the
// format from `format` or an Accept of text/csv.
func reportQuery(w http.ResponseWriter, r *http.Request) (map[string]string, string, bool) {
	values := r.URL.Query()
	if len(values) > reportsQueryMaxKeys {
		writeError(w, http.StatusBadRequest, "invalid_query", "Too many query parameters")
		return nil, "", false
	}
	query := make(map[string]string, len(values))
	format := "json"
	if strings.Contains(r.Header.Get("Accept"), "text/csv") {
		format = "csv"
	}
	for key, list := range values {
		if len(list) != 1 || key == "" || len(key) > reportsQueryMaxKeyLen || len(list[0]) > reportsQueryMaxValueLen {
			writeError(w, http.StatusBadRequest, "invalid_query", "Each query parameter must be given once, within its length limit")
			return nil, "", false
		}
		switch key {
		case "format":
			if list[0] != "json" && list[0] != "csv" {
				writeError(w, http.StatusBadRequest, "invalid_query", "format must be json or csv")
				return nil, "", false
			}
			format = list[0]
		case "jobId":
			// A job's own report names its job in the path.
			if r.PathValue("jobId") != "" {
				writeError(w, http.StatusBadRequest, "invalid_query", "jobId is the path's on this route")
				return nil, "", false
			}
			query[key] = list[0]
		default:
			query[key] = list[0]
		}
	}
	return query, format, true
}

// writeReportAnswer passes go-svc's answer on: a report or its download as it came, its refusals
// with their codes, and its own failures as this service being unavailable.
func writeReportAnswer(w http.ResponseWriter, kind string, answer reportAnswer) {
	if answer.status >= 200 && answer.status < 300 {
		contentType := answer.contentType
		if contentType == "" {
			contentType = "application/json"
		}
		w.Header().Set("Content-Type", contentType)
		if answer.contentDisposition != "" {
			w.Header().Set("Content-Disposition", answer.contentDisposition)
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(answer.body)))
		w.WriteHeader(answer.status)
		if _, err := w.Write(answer.body); err != nil {
			slog.Warn("report_write_failed", "kind", kind)
		}
		return
	}
	var failure struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(answer.body, &failure)
	switch {
	case answer.status == http.StatusForbidden && failure.Error == "feature_unavailable":
		writeError(w, http.StatusForbidden, "reports_not_enabled", "Reports is not enabled for this workspace")
	case answer.status == http.StatusForbidden && failure.Error == "report_forbidden":
		writeError(w, http.StatusForbidden, "forbidden", "Reports require billing access: an admin or localization manager's key")
	case answer.status == http.StatusServiceUnavailable && (failure.Error == "reports_busy" || failure.Error == "report_timed_out"):
		w.Header().Set("Retry-After", reportsBusyRetryAfter)
		writeError(w, answer.status, failure.Error, failure.Message)
	case (answer.status == http.StatusBadRequest || answer.status == http.StatusNotFound || answer.status == http.StatusForbidden) && failure.Error != "":
		writeError(w, answer.status, failure.Error, failure.Message)
	default:
		// go-svc refused the service token or failed itself: not something the caller can fix.
		slog.Warn("report_upstream_failed", "kind", kind, "status", answer.status, "code", failure.Error)
		writeError(w, http.StatusServiceUnavailable, "reports_unavailable", "Reports are temporarily unavailable")
	}
}

// reportLimiter is a token bucket per workspace: reportsPerMinute a minute, reportsBurst at
// once. Buckets that have refilled are dropped as the map grows, so it holds only busy workspaces.
type reportLimiter struct {
	mu      sync.Mutex
	buckets map[string]*reportBucket
}

type reportBucket struct {
	tokens float64
	at     time.Time
}

func newReportLimiter() *reportLimiter {
	return &reportLimiter{buckets: map[string]*reportBucket{}}
}

// take spends a token for the workspace, or says how long until one is free.
func (l *reportLimiter) take(organizationID string, now time.Time) (time.Duration, bool) {
	if l == nil {
		return 0, true
	}
	const perSecond = float64(reportsPerMinute) / 60
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.buckets) > 10_000 {
		for id, bucket := range l.buckets {
			if bucket.tokens+now.Sub(bucket.at).Seconds()*perSecond >= reportsBurst {
				delete(l.buckets, id)
			}
		}
	}
	bucket, ok := l.buckets[organizationID]
	if !ok {
		bucket = &reportBucket{tokens: reportsBurst, at: now}
		l.buckets[organizationID] = bucket
	}
	bucket.tokens = math.Min(reportsBurst, bucket.tokens+now.Sub(bucket.at).Seconds()*perSecond)
	bucket.at = now
	if bucket.tokens < 1 {
		return time.Duration((1 - bucket.tokens) / perSecond * float64(time.Second)), false
	}
	bucket.tokens--
	return 0, true
}
