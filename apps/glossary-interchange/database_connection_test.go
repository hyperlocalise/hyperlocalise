package main

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

type stubDatabaseURLProvider struct {
	url string
	err error
}

func (s stubDatabaseURLProvider) Load(context.Context) (string, error) {
	if s.err != nil {
		return "", s.err
	}
	return s.url, nil
}

func TestDatabaseConnectionWrapsProviderErrors(t *testing.T) {
	loadErr := errors.New("secret unavailable")
	database := &databaseConnection{provider: stubDatabaseURLProvider{err: loadErr}}
	_, err := database.currentPool(context.Background())
	require.ErrorIs(t, err, loadErr)
	require.ErrorContains(t, err, "load database URL")
}

func TestDatabaseConnectionRejectsInvalidURL(t *testing.T) {
	database := &databaseConnection{provider: stubDatabaseURLProvider{url: "not-a-postgres-url"}}
	_, err := database.currentPool(context.Background())
	require.ErrorContains(t, err, "invalid database URL")
}

func TestSummarizeDatabaseURLDoesNotExposeCredentials(t *testing.T) {
	require.Equal(t, "postgres://db.example:6432/hyperlocalise", summarizeDatabaseURL("postgres://user:password@db.example:6432/hyperlocalise?sslmode=verify-full"))
}
