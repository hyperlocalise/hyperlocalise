package postgres

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
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
