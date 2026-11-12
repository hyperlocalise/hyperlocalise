package main

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseProviderCredentialsMasterKey(t *testing.T) {
	t.Parallel()
	key, err := parseProviderCredentialsMasterKey("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	require.NoError(t, err)
	require.Equal(t, []byte("0123456789abcdef0123456789abcdef"), key)

	hexKey, err := parseProviderCredentialsMasterKey("3031323334353637383961626364656630313233343536373839616263646566")
	require.NoError(t, err)
	require.Equal(t, key, hexKey)

	_, err = parseProviderCredentialsMasterKey("")
	require.ErrorIs(t, err, errWebhookSecretEncryptionFailed)
	_, err = parseProviderCredentialsMasterKey("too-short")
	require.ErrorIs(t, err, errWebhookSecretEncryptionFailed)
}

func TestGenerateWebhookSecret(t *testing.T) {
	t.Parallel()
	secret, err := generateWebhookSecret()
	require.NoError(t, err)
	require.Regexp(t, `^whsec_[A-Za-z0-9+/]+=*$`, secret)
	other, err := generateWebhookSecret()
	require.NoError(t, err)
	require.NotEqual(t, secret, other)
}

func TestEncryptWebhookSecretRoundTripShape(t *testing.T) {
	t.Setenv("PROVIDER_CREDENTIALS_MASTER_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	secret, err := generateWebhookSecret()
	require.NoError(t, err)
	raw, err := encryptWebhookSecret(secret)
	require.NoError(t, err)
	var stored encryptedProviderCredential
	require.NoError(t, json.Unmarshal(raw, &stored))
	require.Equal(t, "aes-256-gcm", stored.Algorithm)
	require.Equal(t, 1, stored.KeyVersion)
	require.NotEmpty(t, stored.Ciphertext)
	require.NotEmpty(t, stored.IV)
	require.NotEmpty(t, stored.AuthTag)
	require.NotContains(t, string(raw), secret)
	require.NotContains(t, string(raw), secret[len(webhookSecretPrefix):])

	key, err := parseProviderCredentialsMasterKey("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	require.NoError(t, err)
	block, err := aes.NewCipher(key)
	require.NoError(t, err)
	gcm, err := cipher.NewGCM(block)
	require.NoError(t, err)
	nonce, err := base64.StdEncoding.DecodeString(stored.IV)
	require.NoError(t, err)
	ciphertext, err := base64.StdEncoding.DecodeString(stored.Ciphertext)
	require.NoError(t, err)
	tag, err := base64.StdEncoding.DecodeString(stored.AuthTag)
	require.NoError(t, err)
	plain, err := gcm.Open(nil, nonce, append(ciphertext, tag...), nil)
	require.NoError(t, err)
	require.Equal(t, secret, string(plain))

	t.Setenv("PROVIDER_CREDENTIALS_MASTER_KEY", "")
	_, err = encryptWebhookSecret(secret)
	require.ErrorIs(t, err, errWebhookSecretEncryptionFailed)
}
