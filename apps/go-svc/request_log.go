package main

import (
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
	return path == "/health" || path == publicPathPrefix+"/health"
}

func requestLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isHealthPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		started := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 0}
		next.ServeHTTP(rec, r)

		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		attrs := []any{
			"method", r.Method,
			"path", requestLogPath(r.URL.Path),
			"status", status,
			"duration_ms", time.Since(started).Milliseconds(),
		}
		if id := requestID(r); id != "" {
			attrs = append(attrs, "request_id", id)
		}
		slog.Info("request", attrs...)
	})
}

// Dictionary paths include organization slugs and external project identifiers.
// Log route shapes instead of customer-provided path segments.
func requestLogPath(path string) string {
	prefix := ""
	native := path
	if strings.HasPrefix(path, publicPathPrefix+"/") {
		prefix = publicPathPrefix
		native = strings.TrimPrefix(path, publicPathPrefix)
	}
	parts := strings.Split(native, "/")
	if len(parts) < 5 || parts[1] != "v1" || parts[2] != "orgs" {
		return path
	}
	if parts[4] == "dictionaries" {
		return prefix + "/v1/orgs/{organizationSlug}/dictionaries/{resource}"
	}
	if len(parts) >= 7 && parts[4] == "projects" && parts[6] == "dictionaries" {
		return prefix + "/v1/orgs/{organizationSlug}/projects/{projectId}/dictionaries/{resource}"
	}
	return path
}
