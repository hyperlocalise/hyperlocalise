package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestConfigureGuidelineSearchIsOptIn(t *testing.T) {
	t.Setenv("TURBOPUFFER_API_KEY", "")
	search, closeSearch, err := configureGuidelineSearch(t.Context())
	require.NoError(t, err)
	require.Nil(t, search)
	closeSearch()

	t.Setenv("TURBOPUFFER_API_KEY", "test-key")
	t.Setenv("DATABASE_URL", "")
	_, _, err = configureGuidelineSearch(t.Context())
	require.ErrorContains(t, err, "DATABASE_URL")

	t.Setenv("DATABASE_URL", "postgres://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise")
	t.Setenv("AI_GATEWAY_API_KEY", "")
	_, _, err = configureGuidelineSearch(t.Context())
	require.ErrorContains(t, err, "AI_GATEWAY_API_KEY")
}
