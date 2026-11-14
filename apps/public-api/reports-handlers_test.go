package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type reportCall struct {
	kind   string
	query  map[string]string
	format string
	org    string
	user   string
}

type stubReports struct {
	calls  []reportCall
	answer reportAnswer
	err    error
}

func (s *stubReports) report(_ context.Context, p principal, kind string, query map[string]string, format string) (reportAnswer, error) {
	s.calls = append(s.calls, reportCall{kind: kind, query: query, format: format, org: p.OrganizationID, user: p.UserID})
	return s.answer, s.err
}

func reportsTestHandler(reports reportsReader, permissions ...string) http.Handler {
	auth := authFunc(func(_ context.Context, token string) (principal, error) {
		if token != "good" {
			return principal{}, errUnauthorized
		}
		return principal{OrganizationID: "org_1", UserID: "user_1", Permissions: permissions}, nil
	})
	return newHandlerWithOutbound(auth, nil, fakeOutboundIP{}, withReports(reports))
}

func sendReport(t *testing.T, h http.Handler, path string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-Api-Key", "good")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
	return body.Error
}

func TestReportsReadAsTheTokensMember(t *testing.T) {
	reports := &stubReports{answer: reportAnswer{status: 200, contentType: "application/json", body: []byte(`{"kind":"contributors","contributors":{"rows":[]}}`)}}
	h := reportsTestHandler(reports, "reports:read")

	rec := sendReport(t, h, "/v1/reports/contributors?from=2026-06-01&to=2026-06-30&unit=characters")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.JSONEq(t, `{"kind":"contributors","contributors":{"rows":[]}}`, rec.Body.String())
	require.Equal(t, []reportCall{{
		kind: "contributors", format: "json", org: "org_1", user: "user_1",
		query: map[string]string{"from": "2026-06-01", "to": "2026-06-30", "unit": "characters"},
	}}, reports.calls)

	// Public names map to package kinds; a job's report names its job in the path.
	sendReport(t, h, "/v1/reports/ai-usage")
	sendReport(t, h, "/v1/jobs/job_42/report?step=review")
	require.Equal(t, "ai", reports.calls[1].kind)
	require.Equal(t, "task-report", reports.calls[2].kind)
	require.Equal(t, map[string]string{"jobId": "job_42", "step": "review"}, reports.calls[2].query)

	rec = sendReport(t, h, "/v1/reports/nope")
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Len(t, reports.calls, 3, "an unknown report never reaches the reader")
}

func TestReportsPassTheCSVDownloadOn(t *testing.T) {
	reports := &stubReports{answer: reportAnswer{
		status: 200, contentType: "text/csv; charset=utf-8",
		contentDisposition: `attachment; filename="costs.csv"`, body: []byte("\"a\",\"b\""),
	}}
	h := reportsTestHandler(reports, "reports:read")
	for _, rec := range []*httptest.ResponseRecorder{
		sendReport(t, h, "/v1/reports/costs?format=csv"),
		sendReport(t, h, "/v1/reports/costs", "Accept", "text/csv"),
	} {
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "text/csv; charset=utf-8", rec.Header().Get("Content-Type"))
		require.Equal(t, `attachment; filename="costs.csv"`, rec.Header().Get("Content-Disposition"))
		require.Equal(t, "\"a\",\"b\"", rec.Body.String())
	}
	require.Equal(t, "csv", reports.calls[0].format)
	require.Equal(t, "csv", reports.calls[1].format)
	require.NotContains(t, reports.calls[0].query, "format")
}

func TestReportsNeedTheScopeAndAValidQuery(t *testing.T) {
	reports := &stubReports{answer: reportAnswer{status: 200, body: []byte(`{}`)}}
	rec := sendReport(t, reportsTestHandler(reports, "jobs:read"), "/v1/reports/activity")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "reports:read")

	h := reportsTestHandler(reports, "reports:read")
	for _, path := range []string{
		"/v1/reports/activity?from=2026-06-01&from=2026-06-02",
		"/v1/reports/activity?format=xml",
		"/v1/reports/activity?unit=" + strings.Repeat("x", reportsQueryMaxValueLen+1),
		"/v1/jobs/job_1/report?jobId=job_2",
	} {
		rec := sendReport(t, h, path)
		require.Equal(t, http.StatusBadRequest, rec.Code, path)
		require.Equal(t, "invalid_query", errorCode(t, rec), path)
	}
	require.Empty(t, reports.calls)

	req := httptest.NewRequest(http.MethodPost, "/v1/reports/activity", nil)
	req.Header.Set("X-Api-Key", "good")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	require.Equal(t, http.StatusMethodNotAllowed, rec.Code)

	rec = sendReport(t, reportsTestHandler(nil, "reports:read"), "/v1/reports/activity")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Equal(t, "reports_unavailable", errorCode(t, rec))
}

func TestReportsMapRefusalsAndFailures(t *testing.T) {
	cases := []struct {
		name       string
		answer     reportAnswer
		err        error
		status     int
		code       string
		retryAfter string
	}{
		{"flag off", reportAnswer{status: 403, body: []byte(`{"error":"feature_unavailable"}`)}, nil, 403, "reports_not_enabled", ""},
		{"no billing", reportAnswer{status: 403, body: []byte(`{"error":"report_forbidden"}`)}, nil, 403, "forbidden", ""},
		{"bad query", reportAnswer{status: 400, body: []byte(`{"error":"invalid_report_query","message":"Report query is invalid"}`)}, nil, 400, "invalid_report_query", ""},
		{"task not found", reportAnswer{status: 404, body: []byte(`{"error":"task_not_found","message":"Resource not found"}`)}, nil, 404, "task_not_found", ""},
		{"busy", reportAnswer{status: 503, body: []byte(`{"error":"reports_busy","message":"Reports is busy"}`)}, nil, 503, "reports_busy", "5"},
		{"timed out", reportAnswer{status: 503, body: []byte(`{"error":"report_timed_out","message":"too long"}`)}, nil, 503, "report_timed_out", "5"},
		{"token refused", reportAnswer{status: 401, body: []byte(`{"error":"unauthorized"}`)}, nil, 503, "reports_unavailable", ""},
		{"reader failed", reportAnswer{status: 500, body: []byte(`oops`)}, nil, 503, "reports_unavailable", ""},
		{"unreachable", reportAnswer{}, errReportsUnavailable, 503, "reports_unavailable", ""},
		{"too large", reportAnswer{}, errReportTooLarge, 422, "report_too_large", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := sendReport(t, reportsTestHandler(&stubReports{answer: tc.answer, err: tc.err}, "reports:read"), "/v1/reports/costs")
			require.Equal(t, tc.status, rec.Code)
			require.Equal(t, tc.code, errorCode(t, rec))
			require.Equal(t, tc.retryAfter, rec.Header().Get("Retry-After"))
		})
	}
}

func TestReportsAreLimitedPerWorkspace(t *testing.T) {
	limiter := newReportLimiter()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	for range reportsBurst {
		_, ok := limiter.take("org_busy", now)
		require.True(t, ok)
	}
	wait, ok := limiter.take("org_busy", now)
	require.False(t, ok)
	require.Equal(t, 2*time.Second, wait, "30 a minute is one every two seconds")
	_, ok = limiter.take("org_other", now)
	require.True(t, ok, "another workspace has its own bucket")
	_, ok = limiter.take("org_busy", now.Add(2*time.Second))
	require.True(t, ok)

	// Through the route: the eleventh request in a burst is told when to try again.
	reports := &stubReports{answer: reportAnswer{status: 200, body: []byte(`{}`)}}
	h := reportsTestHandler(reports, "reports:read")
	for range reportsBurst {
		require.Equal(t, http.StatusOK, sendReport(t, h, "/v1/reports/activity").Code)
	}
	rec := sendReport(t, h, "/v1/reports/activity")
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	require.Equal(t, "rate_limited", errorCode(t, rec))
	require.NotEmpty(t, rec.Header().Get("Retry-After"))
}
