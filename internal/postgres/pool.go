// Package postgres contains shared PostgreSQL connection setup.
package postgres

import (
	"context"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a PostgreSQL pool with pgx query tracing enabled.
//
// Query parameters and SQL text are deliberately omitted from span
// attributes. Connection details and pool-acquire spans are also omitted so
// database spans contain no credentials or customer content and focus on SQL
// operations.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	config.ConnConfig.Tracer = otelpgx.NewTracer(
		otelpgx.WithDisableAcquireTracer(),
		otelpgx.WithDisableConnectionDetailsInAttributes(),
		otelpgx.WithDisableSQLStatementInAttributes(),
		otelpgx.WithSpanNameFunc(func(string) string { return "postgres.query" }),
	)
	return pgxpool.NewWithConfig(ctx, config)
}
