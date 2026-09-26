//go:build !cgo_hunspell

package main

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewSpellCheckerWithoutCGO(t *testing.T) {
	checker, closeFn, err := newSpellChecker("/unused")
	require.NoError(t, err)
	require.NotNil(t, checker)
	require.NoError(t, closeFn())
	_, err = checker.Check(context.Background(), "en", []string{"hello"})
	require.ErrorIs(t, err, ErrSpellCheckUnavailable)
}
