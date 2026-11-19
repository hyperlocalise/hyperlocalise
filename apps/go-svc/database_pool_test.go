package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOpenServiceDatabaseCapsPool(t *testing.T) {
	pool, err := openServiceDatabase(t.Context(), "postgres://dbuser:dbpassword@example.com:5433/app?sslmode=disable")
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.EqualValues(t, goSvcMaxDBConns, pool.Config().MaxConns)
}

func TestOpenServiceDatabaseKeepsSmallerPoolCap(t *testing.T) {
	pool, err := openServiceDatabase(t.Context(), "postgres://dbuser:dbpassword@example.com:5433/app?sslmode=disable&pool_max_conns=2")
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.EqualValues(t, 2, pool.Config().MaxConns)
}
