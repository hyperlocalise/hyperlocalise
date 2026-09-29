package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDeriveProjectIdentifierCandidate(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"Acme Website", "AW"},
		{"Marketing", "MAR"},
		{"", "PROJ"},
		{"123 Website", "P1W"},
		{"A", "PROJ"},
		{"  multi   word   name  ", "MWN"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, deriveProjectIdentifierCandidate(tc.name))
		})
	}
}

func TestUniquifyProjectIdentifier(t *testing.T) {
	require.Equal(t, "AP", uniquifyProjectIdentifier("AP", map[string]struct{}{}))
	require.Equal(t, "AP2", uniquifyProjectIdentifier("AP", map[string]struct{}{"AP": {}}))
	require.Equal(t, "AP3", uniquifyProjectIdentifier("AP", map[string]struct{}{"AP": {}, "AP2": {}}))
}
