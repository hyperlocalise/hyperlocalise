package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPostgresAuthenticatorRequiresPool(t *testing.T) {
	auth := newPostgresAuthenticator(nil, nil)
	_, err := auth.authenticate(t.Context(), "hl_test")
	require.ErrorIs(t, err, errAuthUnavailable)
}
