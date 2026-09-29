package postgres

import (
	"context"
	"testing"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

func TestNewPoolPreservesParsedConnectionSettings(t *testing.T) {
	pool, err := NewPool(context.Background(), "postgres://dbuser:dbpassword@example.com:5433/app?sslmode=disable&pool_max_conns=7")
	require.NoError(t, err)
	require.NotNil(t, pool)
	t.Cleanup(pool.Close)

	config := pool.Config()
	require.Equal(t, "example.com", config.ConnConfig.Host)
	require.Equal(t, uint16(5433), config.ConnConfig.Port)
	require.Equal(t, "dbuser", config.ConnConfig.User)
	require.Equal(t, "app", config.ConnConfig.Database)
	require.EqualValues(t, 7, config.MaxConns)
	require.NotNil(t, config.ConnConfig.Tracer)
}

func TestNewPoolRejectsInvalidURL(t *testing.T) {
	pool, err := NewPool(context.Background(), "not a postgres URL")
	require.Error(t, err)
	require.Nil(t, pool)
}

func TestInspectQueryNormalizesSafeParameterizedSQL(t *testing.T) {
	details := inspectQuery("\n SELECT  id, term FROM glossary_terms WHERE id = $1 \n")

	require.Equal(t, "SELECT", details.operation)
	require.Equal(t, "SELECT glossary_terms", details.summary)
	require.Equal(t, "SELECT id, term FROM glossary_terms WHERE id = $1", details.normalized)
}

func TestInspectQueryFallsBackForUnsafeSQL(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want string
	}{
		{name: "literal", sql: "SELECT id FROM glossary_terms WHERE term = 'secret'", want: "SELECT glossary_terms"},
		{name: "comment", sql: "SELECT id FROM glossary_terms -- secret", want: "SELECT glossary_terms"},
		{name: "multiple statements", sql: "SELECT id FROM glossary_terms; DELETE FROM users", want: "SELECT"},
		{name: "dynamic operation", sql: "WITH terms AS (SELECT id FROM glossary_terms) SELECT id FROM terms", want: "UNKNOWN"},
		{name: "leading comment", sql: "/*tenant=customer-secret*/ SELECT id FROM glossary_terms WHERE id = $1", want: "UNKNOWN"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			details := inspectQuery(tt.sql)
			require.Equal(t, tt.want, details.summary)
			require.Empty(t, details.normalized)
		})
	}
}

func TestInspectQueryKeepsSingleInsertTableWithColumnList(t *testing.T) {
	details := inspectQuery("INSERT INTO organization_activity_events (organization_id, actor_kind) VALUES ($1, $2)")

	require.Equal(t, "INSERT organization_activity_events", details.summary)
}

func TestQueryTracerDistinguishesSafeQueriesWithoutParameterValues(t *testing.T) {
	exporter := tracetest.NewInMemoryExporter()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	previous := otel.GetTracerProvider()
	otel.SetTracerProvider(provider)
	t.Cleanup(func() {
		otel.SetTracerProvider(previous)
		_ = provider.Shutdown(context.Background())
	})

	tracer := &queryTracer{Tracer: otelpgx.NewTracer(
		otelpgx.WithDisableAcquireTracer(),
		otelpgx.WithDisableConnectionDetailsInAttributes(),
		otelpgx.WithDisableSQLStatementInAttributes(),
		otelpgx.WithSpanNameFunc(func(sql string) string { return inspectQuery(sql).summary }),
	)}

	parentCtx, parent := otel.Tracer("test").Start(context.Background(), "HTTP GET")
	ctx := tracer.TraceQueryStart(parentCtx, nil, pgx.TraceQueryStartData{
		SQL:  "SELECT id FROM glossary_terms WHERE id = $1",
		Args: []any{"customer-secret"},
	})
	tracer.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{})

	ctx = tracer.TraceQueryStart(parentCtx, nil, pgx.TraceQueryStartData{
		SQL:  "SELECT id FROM projects WHERE id = $1",
		Args: []any{"another-secret"},
	})
	tracer.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{})
	parent.End()

	spans := exporter.GetSpans().Snapshots()
	require.Len(t, spans, 3)
	var querySpans []sdktrace.ReadOnlySpan
	for _, span := range spans {
		if span.SpanKind() == trace.SpanKindClient {
			querySpans = append(querySpans, span)
		}
	}
	require.Len(t, querySpans, 2)
	for _, span := range querySpans {
		require.Equal(t, trace.SpanKindClient, span.SpanKind())
		require.Equal(t, parent.SpanContext().SpanID(), span.Parent().SpanID())
		require.NotContains(t, span.Name(), "secret")
		require.NotContains(t, span.Name(), "$1")
		require.NotContains(t, stringAttributes(span), "customer-secret")
		require.NotContains(t, stringAttributes(span), "another-secret")
		require.NotContains(t, attributeKeys(span), "pgx.query.parameters")
	}
	require.Equal(t, "SELECT glossary_terms", querySpans[0].Name())
	require.Equal(t, "SELECT projects", querySpans[1].Name())
	require.Equal(t, "SELECT id FROM glossary_terms WHERE id = $1", stringAttribute(querySpans[0], "db.query.text"))
	require.Equal(t, "SELECT id FROM projects WHERE id = $1", stringAttribute(querySpans[1], "db.query.text"))
}

func stringAttribute(span sdktrace.ReadOnlySpan, key string) string {
	for _, attr := range span.Attributes() {
		if string(attr.Key) == key {
			return attr.Value.AsString()
		}
	}
	return ""
}

func stringAttributes(span sdktrace.ReadOnlySpan) string {
	var out string
	for _, attr := range span.Attributes() {
		out += attr.Value.AsString()
	}
	return out
}

func attributeKeys(span sdktrace.ReadOnlySpan) []string {
	keys := make([]string, 0, len(span.Attributes()))
	for _, attr := range span.Attributes() {
		keys = append(keys, string(attr.Key))
	}
	return keys
}
