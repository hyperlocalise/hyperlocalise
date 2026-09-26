//go:build !cgo_hunspell

package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewSpellCheckerWithoutCGO(t *testing.T) {
	checker, closeFn, err := newSpellChecker("ignored")
	require.NoError(t, err)
	require.NoError(t, closeFn())
	_, err = checker.Check(t.Context(), "en-US", []string{"colour"})
	require.ErrorIs(t, err, ErrSpellCheckUnavailable)
}
