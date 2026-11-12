package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

const testCookiePassword = "this-is-a-test-cookie-password-at-least-32-characters"

const validMintedEncrypted = `{"algorithm":"aes-256-gcm","keyVersion":1,"ciphertext":"abcd","iv":"efgh","authTag":"ijkl"}`

func TestNewWebhookSecretMintClientRequiresConfig(t *testing.T) {
	t.Parallel()
	_, err := newWebhookSecretMintClient(webhookSecretMintClientConfig{CookiePassword: testCookiePassword})
	require.Error(t, err)
	_, err = newWebhookSecretMintClient(webhookSecretMintClientConfig{BaseURL: "https://hyperlocalise.test"})
	require.Error(t, err)
}

func TestWebhookSecretMintClientSendsServiceToken(t *testing.T) {
	t.Parallel()
	var gotAuth, gotPath, gotMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get(goSvcServiceTokenHeader)
		gotPath = r.URL.Path
		gotMethod = r.Method
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"secret":"whsec_minted","encrypted":` + validMintedEncrypted + `}`))
	}))
	t.Cleanup(srv.Close)

	client, err := newWebhookSecretMintClient(webhookSecretMintClientConfig{
		BaseURL:        srv.URL,
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	require.NoError(t, err)

	minted, err := client.Mint(t.Context())
	require.NoError(t, err)
	require.Equal(t, http.MethodPost, gotMethod)
	require.Equal(t, webhookSigningSecretMintPath, gotPath)
	require.Equal(t, goSvcServiceToken(testCookiePassword), gotAuth)
	require.Equal(t, "whsec_minted", minted.Secret)
	require.JSONEq(t, validMintedEncrypted, string(minted.Encrypted))
}

func TestWebhookSecretMintClientRejectsHTTPError(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"webhook_secret_encryption_failed"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := newWebhookSecretMintClient(webhookSecretMintClientConfig{
		BaseURL:        srv.URL,
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	require.NoError(t, err)
	_, err = client.Mint(t.Context())
	require.Error(t, err)
	require.NotErrorIs(t, err, errWebhookSecretEncryptionFailed)
}

func TestWebhookSecretMintClientRejectsInvalidPayload(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"secret":"not-a-webhook-secret","encrypted":` + validMintedEncrypted + `}`))
	}))
	t.Cleanup(srv.Close)

	client, err := newWebhookSecretMintClient(webhookSecretMintClientConfig{
		BaseURL:        srv.URL,
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	require.NoError(t, err)
	_, err = client.Mint(t.Context())
	require.ErrorIs(t, err, errWebhookSecretEncryptionFailed)
}

func TestWebAppBaseURLFromEnv(t *testing.T) {
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "https://web.internal")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "https://hyperlocalise.com")
	require.Equal(t, "https://web.internal", webAppBaseURLFromEnv())

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	require.Equal(t, "https://hyperlocalise.com", webAppBaseURLFromEnv())
}

func TestNewWebhookSecretMinterFromEnv(t *testing.T) {
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "")
	require.Nil(t, newWebhookSecretMinterFromEnv())

	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "https://hyperlocalise.test")
	t.Setenv("WORKOS_COOKIE_PASSWORD", testCookiePassword)
	require.NotNil(t, newWebhookSecretMinterFromEnv())
}

func TestMintWebhookSigningSecretRequiresMinter(t *testing.T) {
	t.Parallel()
	s := &postgresStore{}
	_, err := s.mintWebhookSigningSecret(t.Context())
	require.ErrorIs(t, err, errWebhookSecretEncryptionFailed)

	s.webhookSecrets = &stubWebhookSecretMinter{err: errWebhookSecretEncryptionFailed}
	_, err = s.mintWebhookSigningSecret(t.Context())
	require.ErrorIs(t, err, errWebhookSecretEncryptionFailed)
}

func TestMintedWebhookSigningSecretValidate(t *testing.T) {
	t.Parallel()
	ok := mintedWebhookSigningSecret{Secret: "whsec_ok", Encrypted: json.RawMessage(validMintedEncrypted)}
	require.NoError(t, ok.validate())
	require.ErrorIs(t, mintedWebhookSigningSecret{Secret: "nope", Encrypted: json.RawMessage(validMintedEncrypted)}.validate(), errWebhookSecretEncryptionFailed)
	require.ErrorIs(t, mintedWebhookSigningSecret{Secret: "whsec_ok", Encrypted: json.RawMessage(`{}`)}.validate(), errWebhookSecretEncryptionFailed)
	require.ErrorIs(t, mintedWebhookSigningSecret{Secret: "whsec_ok", Encrypted: json.RawMessage(`not-json`)}.validate(), errWebhookSecretEncryptionFailed)
}
