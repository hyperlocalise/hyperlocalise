package store

import (
	"context"
	"fmt"

	"github.com/hyperlocalise/rain-orm/pkg/rain"
)

// OpenPostgres opens a Rain database using the registered postgres database/sql driver.
func OpenPostgres(databaseURL string) (*rain.DB, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("database url is required")
	}

	db, err := rain.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	var ready int
	if err := db.QueryRow(context.Background(), "SELECT 1").Scan(&ready); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return db, nil
}

// Close closes the Rain database handle.
func Close(db *rain.DB) error {
	if db == nil {
		return nil
	}

	if err := db.Close(); err != nil {
		return fmt.Errorf("close postgres db: %w", err)
	}

	return nil
}
