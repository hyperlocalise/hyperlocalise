package main

import (
	"strconv"
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

func TestDeriveProjectIdentifierCandidateSeparators(t *testing.T) {
	require.Equal(t, "AW", deriveProjectIdentifierCandidate("Acme/Website"))
	require.Equal(t, "AW", deriveProjectIdentifierCandidate("Acme_Website"))
	require.Equal(t, "AW", deriveProjectIdentifierCandidate("Acme-Website"))
	require.Equal(t, "ABCDEFGHIJ", deriveProjectIdentifierCandidate("Alpha Beta Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo"))
}

func TestUniquifyProjectIdentifier(t *testing.T) {
	require.Equal(t, "AP", uniquifyProjectIdentifier("AP", map[string]struct{}{}))
	require.Equal(t, "AP2", uniquifyProjectIdentifier("AP", map[string]struct{}{"AP": {}}))
	require.Equal(t, "AP3", uniquifyProjectIdentifier("AP", map[string]struct{}{"AP": {}, "AP2": {}}))

	t.Run("truncates base so suffix still fits max length", func(t *testing.T) {
		taken := map[string]struct{}{"ABCDEFGHIJ": {}}
		require.Equal(t, "ABCDEFGHI2", uniquifyProjectIdentifier("ABCDEFGHIJ", taken))
	})

	t.Run("returns empty when every numbered candidate is taken", func(t *testing.T) {
		candidate := "ABCDEFGHIJ"
		taken := map[string]struct{}{candidate: {}}
		for suffix := 2; suffix <= projectIdentifierInsertAttempts; suffix++ {
			suffixText := strconv.Itoa(suffix)
			baseMax := projectIdentifierMaxLength - len(suffixText)
			base := candidate
			if len(base) > baseMax {
				base = base[:baseMax]
			}
			taken[base+suffixText] = struct{}{}
		}
		require.Empty(t, uniquifyProjectIdentifier(candidate, taken))
	})
}

func TestNormalizeProjectIdentifierInput(t *testing.T) {
	cases := []struct {
		name   string
		raw    string
		want   string
		wantOK bool
	}{
		{name: "uppercases and trims", raw: "  ab12  ", want: "AB12", wantOK: true},
		{name: "single letter", raw: "z", want: "Z", wantOK: true},
		{name: "max length", raw: "ABCDEFGHIJ", want: "ABCDEFGHIJ", wantOK: true},
		{name: "rejects leading digit", raw: "1ABC", wantOK: false},
		{name: "rejects hyphen", raw: "AB-C", wantOK: false},
		{name: "rejects over max length", raw: "ABCDEFGHIJK", wantOK: false},
		{name: "rejects empty", raw: "   ", wantOK: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := normalizeProjectIdentifierInput(tc.raw)
			require.Equal(t, tc.wantOK, ok)
			if tc.wantOK {
				require.Equal(t, tc.want, got)
			} else {
				require.Empty(t, got)
			}
		})
	}
}
