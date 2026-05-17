package cmd

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidatePhraseLocaleValue(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		wantErr string
	}{
		{"valid simple", "en", ""},
		{"valid with hyphen", "en-US", ""},
		{"valid with underscore", "en_US", ""},
		{"valid with space", "English (US)", ""},
		{"valid with dots", "en.US", ""},
		{"valid double dots", "en..US", ""},
		{"traversal slash", "../../.env", "contains path separator"},
		{"traversal backslash", "..\\..\\.env", "contains path separator"},
		{"dotdot only", "..", "contains directory traversal"},
		{"dotdot prefix", "../foo", "contains path separator"},
		{"dotdot infix with slash", "foo/../bar", "contains path separator"},
		{"dotdot infix with backslash", "foo\\..\\bar", "contains path separator"},
		{"embedded slash", "foo/bar", "contains path separator"},
		{"embedded backslash", "foo\\bar", "contains path separator"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePhraseLocaleValue(tc.value)
			if tc.wantErr == "" {
				assert.NoError(t, err)
			} else {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
			}
		})
	}
}

func TestPhraseLocaleNamesRejectsUnsafeLocales(t *testing.T) {
	_, err := phraseLocaleNames([]phrase.LocaleRef{
		{Name: "en"},
		{Name: "../../.env"},
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "path separator")
}

func TestPhraseLocaleNamesAcceptsSafeLocales(t *testing.T) {
	locales, err := phraseLocaleNames([]phrase.LocaleRef{
		{Name: "en"},
		{Name: "fr"},
	})
	require.NoError(t, err)
	assert.Equal(t, []string{"en", "fr"}, locales)
}

func TestDefaultPhraseLocaleRejectsUnsafeLocale(t *testing.T) {
	_, err := defaultPhraseLocale([]phrase.LocaleRef{
		{Name: "../../.env", Default: true},
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "path separator")
}

func TestDefaultPhraseLocaleAcceptsSafeLocale(t *testing.T) {
	locale, err := defaultPhraseLocale([]phrase.LocaleRef{
		{Name: "en", Default: true},
	})
	require.NoError(t, err)
	assert.Equal(t, "en", locale)
}
