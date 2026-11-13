package main

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"
)

// logRequestFailure records a handled API outcome, including 4xx and deferred
// 501 responses. Inside request middleware the outcome is attached to that
// request's access line. Outside middleware it is logged on its own.
// Argument values and customer text are not logged.
func logRequestFailure(r *http.Request, event, phase string, err error, extra ...any) {
	if r == nil || err == nil {
		return
	}
	attrs := requestFailureAttrs(r, phase, err, extra...)
	if state := requestLogStateFrom(r); state != nil {
		if state.failure == nil {
			state.failure = &recordedRequestFailure{event: event, phase: phase, err: err, attrs: attrs}
		}
		return
	}
	slog.Log(r.Context(), failureLogLevel(extra), event, attrs...)
}

func requestFailureAttrs(r *http.Request, phase string, err error, extra ...any) []any {
	attrs := []any{
		"phase", phase,
		"method", r.Method,
		"path", requestLogPath(r.URL.Path),
		"error", err.Error(),
	}
	if pattern := r.Pattern; pattern != "" {
		attrs = append(attrs, "route", httpRouteFromPattern(pattern))
	}
	if id := requestID(r); id != "" {
		attrs = append(attrs, "request_id", id)
	}
	if claims, ok := r.Context().Value(authContextKey{}).(AuthClaims); ok && claims.UserID != "" {
		attrs = append(attrs, "user_id", claims.UserID)
	}
	var traced *dbError
	if errors.As(err, &traced) {
		attrs = append(attrs,
			"db_caller", traced.caller,
			"db_sql", compactSQL(traced.sql),
			"db_arg_count", traced.argCount,
			"db_placeholders", traced.placeholders,
		)
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code != "" {
			attrs = append(attrs, "pg_code", pgErr.Code)
		}
		if pgErr.Severity != "" {
			attrs = append(attrs, "pg_severity", pgErr.Severity)
		}
		if pgErr.SchemaName != "" {
			attrs = append(attrs, "pg_schema", pgErr.SchemaName)
		}
		if pgErr.TableName != "" {
			attrs = append(attrs, "pg_table", pgErr.TableName)
		}
		if pgErr.ColumnName != "" {
			attrs = append(attrs, "pg_column", pgErr.ColumnName)
		}
		if pgErr.ConstraintName != "" {
			attrs = append(attrs, "pg_constraint", pgErr.ConstraintName)
		}
	}
	return append(attrs, extra...)
}

func failureLogLevel(extra []any) slog.Level {
	for i := 0; i+1 < len(extra); i += 2 {
		key, ok := extra[i].(string)
		if !ok || key != "status" {
			continue
		}
		status, ok := extra[i+1].(int)
		if !ok {
			continue
		}
		return outcomeLogLevel(status)
	}
	return slog.LevelError
}
