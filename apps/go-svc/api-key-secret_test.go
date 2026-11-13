package main

import (
	"bytes"
	"errors"
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"
)

var apiKeyFormat = regexp.MustCompile(`^hl_[A-Za-z0-9_-]{43}$`)

func TestGenerateAPIKeyFormat(t *testing.T) {
	t.Parallel()

	seen := make(map[string]struct{}, 64)
	for range 64 {
		key, err := generateAPIKey()
		require.NoError(t, err)
		require.Len(t, key, 46)
		require.Regexp(t, apiKeyFormat, key)
		require.Equal(t, key[:8], apiKeyPrefix(key))
		_, duplicate := seen[key]
		require.False(t, duplicate)
		seen[key] = struct{}{}
	}
}

func TestAPIKeyMatchesWebImplementation(t *testing.T) {
	t.Parallel()

	secret := make([]byte, apiKeySecretBytes)
	for i := range secret {
		secret[i] = byte(i)
	}
	key, err := generateAPIKeyFrom(bytes.NewReader(secret))
	require.NoError(t, err)
	require.Equal(t, "hl_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8", key)
	require.Equal(t, "hl_AAECA", apiKeyPrefix(key))
	require.Equal(t, "61a1a08e892e2df8cdfed26086aae805fc035d0a0dfcc196f4f4928374f21553", hashAPIKey(key))
	require.Equal(t, "4a81d1296e0bb818c44cc510b17f32b8f74573c17391a5b6c2d8fbb6772ebc36", hashAPIKey("hl_test"))
}

func TestGenerateAPIKeyFailsWhenRandomnessFails(t *testing.T) {
	t.Parallel()

	_, err := generateAPIKeyFrom(bytes.NewReader(make([]byte, apiKeySecretBytes-1)))
	require.Error(t, err)

	_, err = generateAPIKeyFrom(failingReader{})
	require.ErrorIs(t, err, errRandomUnavailable)
}

var errRandomUnavailable = errors.New("random unavailable")

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errRandomUnavailable }
