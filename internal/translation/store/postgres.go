package store

import (
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
)

// OpenPostgres opens a Bun database using the pgx PostgreSQL driver.
func OpenPostgres(databaseURL string) (*bun.DB, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("database url is required")
	}

	config, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse postgres config: %w", err)
	}

	sqlDB := stdlib.OpenDB(*config)
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return bun.NewDB(sqlDB, pgdialect.New()), nil
}

// Close closes the Bun database and its underlying pgx-backed sql.DB.
func Close(db *bun.DB) error {
	if db == nil {
		return nil
	}

	if closeErr := db.DB.Close(); closeErr != nil {
		return fmt.Errorf("close postgres db: %w", closeErr)
	}

	return nil
}
