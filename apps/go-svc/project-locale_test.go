package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseCanonicalLocale(t *testing.T) {
	cases := []struct {
		name   string
		raw    string
		want   string
		wantOK bool
	}{
		{name: "bcp47 hyphen", raw: "en-US", want: "en-US", wantOK: true},
		{name: "underscore normalized", raw: "en_US", want: "en-US", wantOK: true},
		{name: "case folded", raw: "EN-us", want: "en-US", wantOK: true},
		{name: "trimmed", raw: "  de-DE  ", want: "de-DE", wantOK: true},
		{name: "language only", raw: "fr", want: "fr", wantOK: true},
		{name: "empty", raw: "", wantOK: false},
		{name: "malformed", raw: "not a locale !!", wantOK: false},
		{name: "over utf16 budget", raw: strings.Repeat("a", 51), wantOK: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseCanonicalLocale(tc.raw)
			require.Equal(t, tc.wantOK, ok)
			if tc.wantOK {
				require.Equal(t, tc.want, got)
			} else {
				require.Empty(t, got)
			}
		})
	}
}

func TestCanonicalizeTargetLocales(t *testing.T) {
	t.Run("preserves order and drops case-insensitive duplicates", func(t *testing.T) {
		got, ok := canonicalizeTargetLocales([]string{"fr-FR", "de_DE", "FR-fr", "ja"})
		require.True(t, ok)
		require.Equal(t, []string{"fr-FR", "de-DE", "ja"}, got)
	})

	t.Run("rejects empty input", func(t *testing.T) {
		got, ok := canonicalizeTargetLocales(nil)
		require.False(t, ok)
		require.Nil(t, got)
	})

	t.Run("rejects over max before normalizing", func(t *testing.T) {
		raw := make([]string, maxProjectTargetLocales+1)
		for i := range raw {
			raw[i] = "fr"
		}
		got, ok := canonicalizeTargetLocales(raw)
		require.False(t, ok)
		require.Nil(t, got)
	})

	t.Run("rejects any malformed locale", func(t *testing.T) {
		got, ok := canonicalizeTargetLocales([]string{"fr-FR", "!!bad!!"})
		require.False(t, ok)
		require.Nil(t, got)
	})

	t.Run("accepts exactly max unique locales", func(t *testing.T) {
		raw := manyTestLocales(maxProjectTargetLocales)
		got, ok := canonicalizeTargetLocales(raw)
		require.True(t, ok)
		require.Len(t, got, maxProjectTargetLocales)
	})
}

func TestNormalizeProjectTargetLocales(t *testing.T) {
	got, err := normalizeProjectTargetLocales([]string{"en_US", "fr"})
	require.NoError(t, err)
	require.Equal(t, []string{"en-US", "fr"}, got)

	_, err = normalizeProjectTargetLocales([]string{})
	require.EqualError(t, err, "invalid_project_payload")
}

func TestSourceLocaleInTargets(t *testing.T) {
	require.True(t, sourceLocaleInTargets("en-US", []string{"fr-FR", "EN-us"}))
	require.False(t, sourceLocaleInTargets("en-US", []string{"fr-FR", "de-DE"}))
	require.False(t, sourceLocaleInTargets("en-US", nil))
}

func TestNormalizeProjectLocalePatch(t *testing.T) {
	ptr := func(s string) *string { return &s }

	t.Run("patches both when source stays out of targets", func(t *testing.T) {
		targets := []string{"fr_FR", "de"}
		patch, err := normalizeProjectLocalePatch("en", []string{"ja"}, ptr("en_US"), &targets)
		require.NoError(t, err)
		require.NotNil(t, patch.sourceLocale)
		require.Equal(t, "en-US", *patch.sourceLocale)
		require.NotNil(t, patch.targetLocales)
		require.Equal(t, []string{"fr-FR", "de"}, *patch.targetLocales)
	})

	t.Run("rejects both when source lands in targets", func(t *testing.T) {
		targets := []string{"en"}
		_, err := normalizeProjectLocalePatch("ja", []string{"fr"}, ptr("en"), &targets)
		require.EqualError(t, err, "source_in_targets")
	})

	t.Run("rejects source-only patch that collides with existing targets", func(t *testing.T) {
		_, err := normalizeProjectLocalePatch("en-US", []string{"fr-FR", "de-DE"}, ptr("FR-fr"), nil)
		require.EqualError(t, err, "source_in_targets")
	})

	t.Run("rejects targets-only patch that includes existing source", func(t *testing.T) {
		targets := []string{"en-US", "ja"}
		_, err := normalizeProjectLocalePatch("en-US", []string{"fr-FR"}, nil, &targets)
		require.EqualError(t, err, "source_in_targets")
	})

	t.Run("rejects invalid source locale", func(t *testing.T) {
		_, err := normalizeProjectLocalePatch("en-US", []string{"fr-FR"}, ptr("!!"), nil)
		require.EqualError(t, err, "invalid_source_locale")
	})

	t.Run("rejects invalid target locales", func(t *testing.T) {
		targets := []string{}
		_, err := normalizeProjectLocalePatch("en-US", []string{"fr-FR"}, nil, &targets)
		require.EqualError(t, err, "invalid_target_locales")
	})

	t.Run("no-op when neither field is provided", func(t *testing.T) {
		patch, err := normalizeProjectLocalePatch("en-US", []string{"fr-FR"}, nil, nil)
		require.NoError(t, err)
		require.Nil(t, patch.sourceLocale)
		require.Nil(t, patch.targetLocales)
	})
}
