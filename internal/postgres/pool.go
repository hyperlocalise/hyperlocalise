// Package postgres contains shared PostgreSQL connection setup.
package postgres

import (
	"context"
	"strings"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

const (
	dbOperationNameKey = attribute.Key("db.operation.name")
	dbQuerySummaryKey  = attribute.Key("db.query.summary")
	dbQueryTextKey     = attribute.Key("db.query.text")
)

type queryDetails struct {
	operation  string
	summary    string
	normalized string
}

// queryTracer adds privacy-safe query details to the spans created by otelpgx.
// otelpgx remains responsible for span creation, parenting, errors, and ending.
type queryTracer struct {
	*otelpgx.Tracer
}

var _ pgx.QueryTracer = (*queryTracer)(nil)

func (t *queryTracer) TraceQueryStart(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	ctx = t.Tracer.TraceQueryStart(ctx, conn, data)
	span := trace.SpanFromContext(ctx)
	if !span.IsRecording() {
		return ctx
	}

	details := inspectQuery(data.SQL)
	span.SetName(details.summary)
	span.SetAttributes(
		dbOperationNameKey.String(details.operation),
		dbQuerySummaryKey.String(details.summary),
	)
	if details.normalized != "" {
		span.SetAttributes(dbQueryTextKey.String(details.normalized))
	}

	return ctx
}

func inspectQuery(sql string) queryDetails {
	operation, table := queryOperationAndTable(sql)
	if !isSQLOperation(operation) {
		operation = "UNKNOWN"
		table = ""
	}
	summary := operation
	if table != "" {
		summary += " " + table
	}

	normalized, ok := normalizeParameterizedSQL(sql, operation)
	if !ok {
		return queryDetails{operation: operation, summary: summary}
	}
	return queryDetails{operation: operation, summary: summary, normalized: normalized}
}

// normalizeParameterizedSQL accepts only one simple PostgreSQL statement and
// leaves all bind placeholders intact. Literal-bearing or otherwise ambiguous
// SQL is deliberately rejected and represented by the caller's summary only.
func normalizeParameterizedSQL(sql, operation string) (string, bool) {
	if !isSQLOperation(operation) {
		return "", false
	}

	trimmed := strings.TrimSpace(sql)
	if trimmed == "" || strings.Contains(trimmed, ";") {
		return "", false
	}

	for i := 0; i < len(trimmed); i++ {
		ch := trimmed[i]
		switch ch {
		case '\'', '"', '`':
			return "", false
		case '-':
			if i+1 < len(trimmed) && trimmed[i+1] == '-' {
				return "", false
			}
		case '/':
			if i+1 < len(trimmed) && trimmed[i+1] == '*' {
				return "", false
			}
		case '$':
			if i+1 >= len(trimmed) || trimmed[i+1] < '0' || trimmed[i+1] > '9' {
				return "", false
			}
			for i+1 < len(trimmed) && trimmed[i+1] >= '0' && trimmed[i+1] <= '9' {
				i++
			}
		case '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
			if i == 0 || !isSQLIdentifierPart(trimmed[i-1]) {
				return "", false
			}
		case '\n', '\r', '\t', ' ':
		default:
			if ch < 0x20 {
				return "", false
			}
		}
	}

	for _, word := range strings.Fields(trimmed) {
		word = strings.Trim(word, ",()")
		switch strings.ToUpper(word) {
		case "NULL", "TRUE", "FALSE", "DEFAULT":
			return "", false
		}
	}

	return strings.Join(strings.Fields(trimmed), " "), true
}

func queryOperationAndTable(sql string) (string, string) {
	fields := strings.Fields(sql)
	if len(fields) == 0 {
		return "", ""
	}

	operation := strings.ToUpper(strings.Trim(fields[0], "("))
	if !isSQLOperation(operation) {
		return operation, ""
	}
	if strings.Contains(sql, ";") {
		return operation, ""
	}

	keyword := ""
	switch operation {
	case "SELECT":
		keyword = "FROM"
	case "INSERT":
		keyword = "INTO"
	case "UPDATE":
		if len(fields) > 1 {
			return operation, simpleTableName(fields[1])
		}
	case "DELETE":
		keyword = "FROM"
	}

	if keyword == "" {
		return operation, ""
	}

	for i, field := range fields {
		if strings.EqualFold(strings.Trim(field, "(),"), keyword) && i+1 < len(fields) {
			table := simpleTableName(fields[i+1])
			if table == "" {
				return operation, ""
			}
			rest := strings.Join(fields[i+2:], " ")
			if hasTopLevelComma(rest) || hasSQLKeyword(rest, "JOIN") || hasSQLKeyword(rest, "USING") {
				return operation, ""
			}
			return operation, table
		}
	}

	return operation, ""
}

func hasTopLevelComma(sql string) bool {
	depth := 0
	for _, ch := range sql {
		switch ch {
		case '(':
			depth++
		case ')':
			if depth > 0 {
				depth--
			}
		case ',':
			if depth == 0 {
				return true
			}
		}
	}
	return false
}

func hasSQLKeyword(sql, keyword string) bool {
	for _, field := range strings.Fields(sql) {
		if strings.EqualFold(strings.Trim(field, "(),"), keyword) {
			return true
		}
	}
	return false
}

func isSQLOperation(operation string) bool {
	switch operation {
	case "SELECT", "INSERT", "UPDATE", "DELETE":
		return true
	default:
		return false
	}
}

func simpleTableName(raw string) string {
	raw = strings.Trim(raw, "(),")
	parts := strings.Split(raw, ".")
	if len(parts) > 2 || len(parts) == 0 {
		return ""
	}
	for _, part := range parts {
		if part == "" {
			return ""
		}
		for i, ch := range part {
			if i == 0 {
				if !isSQLIdentifierStart(byte(ch)) {
					return ""
				}
				continue
			}
			if !isSQLIdentifierPart(byte(ch)) {
				return ""
			}
		}
	}
	return raw
}

func isSQLIdentifierStart(ch byte) bool {
	return ch == '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z'
}

func isSQLIdentifierPart(ch byte) bool {
	return isSQLIdentifierStart(ch) || ch >= '0' && ch <= '9' || ch == '$'
}

// NewPool creates a PostgreSQL pool with pgx query tracing enabled.
//
// Query parameter values and unsafe SQL text are omitted from span attributes.
// Safe parameterized statements are normalized into db.query.text. Connection
// details and pool-acquire spans are also omitted so database spans contain no
// credentials or customer content.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	baseTracer := otelpgx.NewTracer(
		otelpgx.WithDisableAcquireTracer(),
		otelpgx.WithDisableConnectionDetailsInAttributes(),
		otelpgx.WithDisableSQLStatementInAttributes(),
		otelpgx.WithSpanNameFunc(func(sql string) string { return inspectQuery(sql).summary }),
	)
	config.ConnConfig.Tracer = &queryTracer{Tracer: baseTracer}
	return pgxpool.NewWithConfig(ctx, config)
}
