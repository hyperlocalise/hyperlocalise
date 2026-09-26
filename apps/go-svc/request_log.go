package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func requestID(r *http.Request) string {
	if id := strings.TrimSpace(r.Header.Get("X-Vercel-Id")); id != "" {
		return id
	}
	return strings.TrimSpace(r.Header.Get("X-Request-Id"))
}

func isHealthPath(path string) bool {
	return path == "/health"
}

type requestLogStateKey struct{}

// recordedRequestFailure is the handler failure attached to the access log.
// A separate error line only repeats the status and still omits the query.
type recordedRequestFailure struct {
	event string
	phase string
	err   error
	attrs []any
}

type requestLogState struct {
	failure *recordedRequestFailure
	notes   []any
}

func requestLogStateFrom(r *http.Request) *requestLogState {
	if r == nil {
		return nil
	}
	state, _ := r.Context().Value(requestLogStateKey{}).(*requestLogState)
	return state
}

// noteRequest attaches operational facts to this request's access line.
// It records what the handler decided: filter, counts, locale, role.
// Do not pass customer text, search queries, file contents, or source paths.
func noteRequest(r *http.Request, attrs ...any) {
	state := requestLogStateFrom(r)
	if state == nil || len(attrs) == 0 {
		return
	}
	state.notes = append(state.notes, attrs...)
}

func requestLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isHealthPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		state := &requestLogState{}
		r = r.WithContext(context.WithValue(r.Context(), requestLogStateKey{}, state))
		started := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 0}
		next.ServeHTTP(rec, r)

		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		route := requestRoute(r)
		duration := time.Since(started)
		attrs := []any{
			"method", r.Method,
			"path", requestLogPath(r.URL.Path),
			"route", route,
			"status", status,
			"duration_ms", duration.Milliseconds(),
		}
		if id := requestID(r); id != "" {
			attrs = append(attrs, "request_id", id)
		}
		if state.failure != nil {
			attrs = appendNewAttrs(attrs, state.failure.attrs)
			attrs = appendNewAttrs(attrs, []any{"event", state.failure.event})
		}
		attrs = appendNewAttrs(attrs, state.notes)
		slog.Log(r.Context(), outcomeLogLevel(status), requestAccessMessage(r.Method, route, status, duration, state), attrs...)
	})
}

func requestRoute(r *http.Request) string {
	if r.Pattern != "" {
		return httpRouteFromPattern(r.Pattern)
	}
	return requestLogPath(r.URL.Path)
}

func outcomeLogLevel(status int) slog.Level {
	if status >= http.StatusInternalServerError && status != http.StatusNotImplemented {
		return slog.LevelError
	}
	if status >= http.StatusBadRequest {
		return slog.LevelWarn
	}
	return slog.LevelInfo
}

func requestAccessMessage(method, route string, status int, duration time.Duration, state *requestLogState) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s %s %d %dms", method, route, status, duration.Milliseconds())
	seen := map[string]bool{}
	if state != nil && state.failure != nil {
		b.WriteByte(' ')
		b.WriteString(state.failure.event)
		appendRequestFacts(&b, state.failure.attrs, seen)
	}
	if state != nil {
		appendRequestFacts(&b, state.notes, seen)
	}
	return b.String()
}

func appendRequestFacts(b *strings.Builder, attrs []any, seen map[string]bool) {
	for i := 0; i+1 < len(attrs); i += 2 {
		key, ok := attrs[i].(string)
		if !ok || seen[key] || !requestLogFactKey(key) {
			continue
		}
		value := fmt.Sprint(attrs[i+1])
		if key == "error" && !strings.ContainsAny(value, " :") {
			continue
		}
		seen[key] = true
		fmt.Fprintf(b, " %s=%s", key, value)
	}
}

func requestLogFactKey(key string) bool {
	switch key {
	case "phase", "code", "error", "db_caller",
		"target_locale", "queue_filter", "queue_sort", "queue_kind",
		"segments", "total", "has_more", "limit", "offset", "has_search",
		"role", "project_source", "locales", "targets_filled",
		"translation_status", "auth", "user_id", "reason":
		return true
	default:
		return false
	}
}

func appendNewAttrs(dst []any, extra []any) []any {
	seen := map[string]bool{}
	for i := 0; i+1 < len(dst); i += 2 {
		if key, ok := dst[i].(string); ok {
			seen[key] = true
		}
	}
	for i := 0; i+1 < len(extra); i += 2 {
		key, ok := extra[i].(string)
		if !ok || seen[key] {
			continue
		}
		seen[key] = true
		dst = append(dst, extra[i], extra[i+1])
	}
	return dst
}

// Dictionary paths include organization slugs and external project identifiers.
// Log route shapes instead of customer-provided path segments.
func requestLogPath(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) < 5 || parts[1] != "v1" || parts[2] != "orgs" {
		return path
	}
	if parts[4] == "dictionaries" {
		return "/v1/orgs/{organizationSlug}/dictionaries/{resource}"
	}
	if parts[4] == "glossaries" {
		return "/v1/orgs/{organizationSlug}/glossaries/{resource}"
	}
	if parts[4] == "translation-memories" {
		return "/v1/orgs/{organizationSlug}/translation-memories/{resource}"
	}
	if len(parts) >= 7 && parts[4] == "projects" && parts[6] == "dictionaries" {
		return "/v1/orgs/{organizationSlug}/projects/{projectId}/dictionaries/{resource}"
	}
	if len(parts) >= 7 && parts[4] == "projects" && parts[6] == "qa-reports" {
		return "/v1/orgs/{organizationSlug}/projects/{projectId}/qa-reports/{resource}"
	}
	if len(parts) >= 7 && parts[4] == "projects" && parts[6] == "issue-sheet" {
		return "/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{resource}"
	}
	if parts[4] == "qa-reports" {
		return "/v1/orgs/{organizationSlug}/qa-reports/{resource}"
	}
	return path
}
