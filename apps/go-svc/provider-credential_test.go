package main

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestProviderCredentialCrypto(t *testing.T) {
	key, err := parseProviderCredentialMasterKey(strings.Repeat("07", 32))
	require.NoError(t, err)

	t.Run("reads what the web app encrypted", func(t *testing.T) {
		// node:crypto aes-256-gcm with this key and a fixed iv.
		plaintext, err := decryptProviderCredential(key, encryptedProviderCredential{
			algorithm:  "aes-256-gcm",
			keyVersion: 1,
			ciphertext: "VpWOdz9bKm9LcnBo",
			iv:         "AwMDAwMDAwMDAwMD",
			authTag:    "W//rzqqQkqZpHdSFSyUFJg==",
		})
		require.NoError(t, err)
		require.Equal(t, "sk-test-1234", plaintext)
	})

	t.Run("round trips with a fresh iv each time", func(t *testing.T) {
		first, err := encryptProviderCredential(key, "sk-live-abcd")
		require.NoError(t, err)
		second, err := encryptProviderCredential(key, "sk-live-abcd")
		require.NoError(t, err)
		require.NotEqual(t, first.iv, second.iv)
		require.Equal(t, "aes-256-gcm", first.algorithm)
		require.Equal(t, 1, first.keyVersion)
		plaintext, err := decryptProviderCredential(key, first)
		require.NoError(t, err)
		require.Equal(t, "sk-live-abcd", plaintext)
	})

	t.Run("rejects a tampered tag", func(t *testing.T) {
		encrypted, err := encryptProviderCredential(key, "sk-live-abcd")
		require.NoError(t, err)
		encrypted.authTag = base64.StdEncoding.EncodeToString(make([]byte, 16))
		_, err = decryptProviderCredential(key, encrypted)
		require.Error(t, err)
	})

	t.Run("master key formats", func(t *testing.T) {
		_, err := parseProviderCredentialMasterKey(base64.StdEncoding.EncodeToString(make([]byte, 32)))
		require.NoError(t, err)
		_, err = parseProviderCredentialMasterKey("too-short")
		require.Error(t, err)
	})
}

func TestMaskProviderCredentialSuffix(t *testing.T) {
	require.Equal(t, "••••wxyz", maskProviderCredentialSuffix("sk-abcdwxyz"))
	require.Equal(t, "••••••ab", maskProviderCredentialSuffix("ab"))
}

func TestProviderErrorMessage(t *testing.T) {
	require.Equal(t, "Incorrect API key", providerErrorMessage([]byte(`{"error":{"message":"Incorrect API key"}}`), 401))
	require.Equal(t, "bad key", providerErrorMessage([]byte(`{"error":"bad key"}`), 401))
	require.Equal(t, "nope", providerErrorMessage([]byte(`{"message":"nope"}`), 400))
	require.Equal(t, "provider request failed with status 500", providerErrorMessage(nil, 500))
}

func TestProviderCatalog(t *testing.T) {
	require.True(t, isSupportedProviderModel("anthropic", "claude-opus-5-5"))
	require.True(t, isSupportedProviderModel("openai", "gpt-6-sol-fast"))
	require.False(t, isSupportedProviderModel("openai", "claude-opus-5-5"))
	require.False(t, isSupportedProviderModel("unknown", "x"))
}

func providerCredentialRequest(api *providerCredentialAPI, method, slug, body string, claims AuthClaims) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: claims})
	req := httptest.NewRequest(method, "/v1/orgs/"+slug+"/provider-credential", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestProviderCredentialRoutes(t *testing.T) {
	key, err := parseProviderCredentialMasterKey(strings.Repeat("07", 32))
	require.NoError(t, err)

	t.Run("stores a validated key and reports it masked", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		var validated []string
		api := &providerCredentialAPI{
			pool:       scope.Pool,
			membership: scope.Membership("admin"),
			masterKey:  key,
			validate: func(_ context.Context, provider, apiKey, model string) error {
				validated = append(validated, provider+":"+apiKey+":"+model)
				return nil
			},
		}
		claims := AuthClaims{UserID: scope.WorkOSUserID}

		rec := providerCredentialRequest(api, http.MethodPut, scope.Slug, `{"provider":"anthropic","apiKey":" sk-ant-1234wxyz ","defaultModel":"claude-opus-5-5"}`, claims)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, []string{"anthropic:sk-ant-1234wxyz:claude-opus-5-5"}, validated)
		require.Contains(t, rec.Body.String(), `"maskedApiKeySuffix":"••••wxyz"`)
		require.NotContains(t, rec.Body.String(), "sk-ant")

		var stored encryptedProviderCredential
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            select encryption_algorithm, key_version, ciphertext, iv, auth_tag
            from organization_llm_provider_credentials where organization_id=$1`, scope.OrganizationID).
			Scan(&stored.algorithm, &stored.keyVersion, &stored.ciphertext, &stored.iv, &stored.authTag))
		plaintext, err := decryptProviderCredential(key, stored)
		require.NoError(t, err)
		require.Equal(t, "sk-ant-1234wxyz", plaintext)

		rec = providerCredentialRequest(api, http.MethodGet, scope.Slug, "", claims)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Contains(t, rec.Body.String(), `"provider":"anthropic"`)
		require.Contains(t, rec.Body.String(), `"providers":[`)
	})

	t.Run("passes the provider's refusal back on the key field", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		api := &providerCredentialAPI{
			pool:       scope.Pool,
			membership: scope.Membership("admin"),
			masterKey:  key,
			validate: func(context.Context, string, string, string) error {
				return &providerRejectedError{message: "Incorrect API key"}
			},
		}
		rec := providerCredentialRequest(api, http.MethodPut, scope.Slug, `{"provider":"openai","apiKey":"sk-bad","defaultModel":"gpt-5.5"}`, AuthClaims{UserID: scope.WorkOSUserID})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "provider_credential_rejected")
		require.Contains(t, rec.Body.String(), "Incorrect API key")
	})

	t.Run("rejects a model outside the catalog before calling the provider", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		api := &providerCredentialAPI{
			pool:       scope.Pool,
			membership: scope.Membership("admin"),
			masterKey:  key,
			validate: func(context.Context, string, string, string) error {
				t.Fatal("validated an unsupported model")
				return nil
			},
		}
		rec := providerCredentialRequest(api, http.MethodPut, scope.Slug, `{"provider":"openai","apiKey":"sk","defaultModel":"gpt-2"}`, AuthClaims{UserID: scope.WorkOSUserID})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "defaultModel")
	})

	t.Run("members cannot set the key", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "member"})
		api := &providerCredentialAPI{pool: scope.Pool, membership: scope.Membership("admin"), masterKey: key}
		rec := providerCredentialRequest(api, http.MethodPut, scope.Slug, `{"provider":"openai","apiKey":"sk","defaultModel":"gpt-5.5"}`, AuthClaims{UserID: scope.WorkOSUserID})
		require.Equal(t, http.StatusForbidden, rec.Code)
	})
}
