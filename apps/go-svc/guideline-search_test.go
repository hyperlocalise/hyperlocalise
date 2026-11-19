package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestConfigureGuidelineSearchIsOptIn(t *testing.T) {
	t.Setenv("TURBOPUFFER_API_KEY", "")
	search, closeSearch, err := configureGuidelineSearch(nil)
	require.NoError(t, err)
	require.Nil(t, search)
	closeSearch()

	t.Setenv("TURBOPUFFER_API_KEY", "test-key")
	t.Setenv("DATABASE_URL", "")
	_, _, err = configureGuidelineSearch(nil)
	require.ErrorContains(t, err, "DATABASE_URL")

	t.Setenv("DATABASE_URL", "postgres://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise")
	t.Setenv("TURBOPUFFER_REGION", "")
	t.Setenv("TURBOPUFFER_GUIDELINES_PREFIX", "prefix")
	_, _, err = configureGuidelineSearch(nil)
	require.ErrorContains(t, err, "invalid turbopuffer configuration")
}
