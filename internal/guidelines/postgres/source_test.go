package postgres

import (
	"context"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
)

func TestCurrentRejectsEmptyOrganization(t *testing.T) {
	_, err := (&Source{}).Current(t.Context(), guidelines.Scope{ProjectID: "proj"})
	require.ErrorIs(t, err, guidelines.ErrInvalidInput)
}

func TestNewRejectsInvalidURL(t *testing.T) {
	_, err := New(t.Context(), "not a database url")
	require.Error(t, err)
	require.ErrorContains(t, err, "configure guideline database")
}

func TestNewPingFailureClosesPool(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	_, err := New(ctx, "postgres://hyperlocalise:hyperlocalise@127.0.0.1:1/hyperlocalise?connect_timeout=1")
	require.Error(t, err)
	require.ErrorContains(t, err, "connect guideline database")
}
