package postgres

import (
	"context"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const unreachableDatabaseURL = "postgres://hyperlocalise:hyperlocalise@127.0.0.1:1/hyperlocalise?connect_timeout=1"

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), unreachableDatabaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func acquireError(t *testing.T, pool *pgxpool.Pool) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	conn, err := pool.Acquire(ctx)
	if conn != nil {
		conn.Release()
	}
	return err
}

func TestUploadedDocumentID(t *testing.T) {
	require.Equal(t, "doc:3f0c", UploadedDocumentID("3f0c"))
	require.Equal(t, "doc:", UploadedDocumentID(""))
}

func TestCloseReleasesOnlyOwnedPools(t *testing.T) {
	shared := unreachablePool(t)
	NewWithPool(shared).Close()
	err := acquireError(t, shared)
	require.Error(t, err)
	require.NotContains(t, err.Error(), "closed pool")

	owned := unreachablePool(t)
	(&Source{pool: owned}).Close()
	require.ErrorContains(t, acquireError(t, owned), "closed pool")
}

func TestCurrentWrapsQueryErrors(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	_, err := NewWithPool(unreachablePool(t)).Current(ctx, guidelines.Scope{OrganizationID: "org", ProjectID: "proj", Locale: "fr"})
	require.ErrorContains(t, err, "query guideline documents")
}
