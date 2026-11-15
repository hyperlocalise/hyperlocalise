package ota

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type stubOTARow struct {
	manifest []byte
	contents []byte
	format   string
	err      error
	hashArg  string
}

func (s *stubOTARow) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	if len(args) == 1 {
		if hash, ok := args[0].(string); ok {
			s.hashArg = hash
		}
	}
	return s
}

func (s *stubOTARow) Scan(dest ...any) error {
	if s.err != nil {
		return s.err
	}
	*dest[0].(*[]byte) = s.manifest
	*dest[1].(*[]byte) = s.contents
	*dest[2].(*string) = s.format
	return nil
}

func TestPGLookupLatestUnrevoked(t *testing.T) {
	t.Run("nil lookup", func(t *testing.T) {
		_, err := (*PGLookup)(nil).LatestUnrevoked(context.Background(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
		require.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("lowercases hash", func(t *testing.T) {
		row := &stubOTARow{manifest: []byte(`{"schema_version":1}`), contents: []byte(`{}`), format: "json"}
		release, err := NewPGLookup(row).LatestUnrevoked(context.Background(), "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
		require.NoError(t, err)
		require.Equal(t, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", row.hashArg)
		require.Equal(t, json.RawMessage(`{"schema_version":1}`), release.Manifest)
		require.Empty(t, release.Contents)
		require.Equal(t, "json", release.Format)
	})

	t.Run("no rows", func(t *testing.T) {
		_, err := NewPGLookup(&stubOTARow{err: pgx.ErrNoRows}).LatestUnrevoked(context.Background(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
		require.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("query error", func(t *testing.T) {
		want := errors.New("db down")
		_, err := NewPGLookup(&stubOTARow{err: want}).LatestUnrevoked(context.Background(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
		require.ErrorIs(t, err, want)
	})

	t.Run("malformed contents", func(t *testing.T) {
		_, err := NewPGLookup(&stubOTARow{
			manifest: []byte(`{}`),
			contents: []byte(`{not-json`),
			format:   "json",
		}).LatestUnrevoked(context.Background(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
		require.Error(t, err)
	})

	t.Run("parses contents", func(t *testing.T) {
		release, err := NewPGLookup(&stubOTARow{
			manifest: []byte(`{"schema_version":1}`),
			contents: []byte(`{"fr-FR":{"messages.json":"{\"hi\":\"bonjour\"}"}}`),
			format:   "json",
		}).LatestUnrevoked(context.Background(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
		require.NoError(t, err)
		require.Equal(t, `{"hi":"bonjour"}`, release.Contents["fr-FR"]["messages.json"])
	})
}
