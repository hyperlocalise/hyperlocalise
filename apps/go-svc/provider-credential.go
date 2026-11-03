package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// The workspace's own AI provider key (bring your own key), as the web app
// stores it: src/lib/security/provider-credential-crypto.ts encrypts it and
// src/lib/providers/credentials validates it. The two must read each other's
// rows, so keep the format, catalog and checks in step.

const (
	providerCredentialAlgorithm  = "aes-256-gcm"
	providerCredentialKeyVersion = 1
	providerValidationTimeout    = 15 * time.Second
	providerAPIKeyMaxLength      = 512
)

var providerCredentialHexKey = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

type llmProviderCatalogEntry struct {
	Provider string   `json:"provider"`
	Label    string   `json:"label"`
	Models   []string `json:"models"`
}

// llmProviderCatalog ports llmProviderContentEditoralog (src/lib/providers/shared/catalog.ts).
// The first model is each provider's default.
var llmProviderCatalog = []llmProviderCatalogEntry{
	{Provider: "openai", Label: "OpenAI", Models: []string{
		"gpt-6.1-sol", "gpt-6.1-sol-fast", "gpt-6-luna", "gpt-6-luna-fast", "gpt-6-astra", "gpt-6-astra-fast",
		"gpt-6-sol", "gpt-6-sol-fast", "gpt-5.6-luna", "gpt-5.6-luna-fast", "gpt-5.6-sol", "gpt-5.6-sol-fast",
		"gpt-5.6-terra", "gpt-5.6-terra-fast", "gpt-5.5", "gpt-5.5-fast", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-fast",
		"gpt-5.4-mini", "gpt-5.4-mini-fast", "gpt-5.4-nano", "gpt-5.4-pro",
	}},
	{Provider: "anthropic", Label: "Anthropic", Models: []string{
		"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-opus-4-8",
		"claude-opus-4-7", "claude-opus-4-6", "claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5",
	}},
	{Provider: "gemini", Label: "Gemini", Models: []string{
		"gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite",
		"gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3-flash", "gemini-3-pro-preview",
		"gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite",
	}},
	{Provider: "groq", Label: "Groq", Models: []string{"llama-3.1-8b-instant", "llama-3.3-70b-versatile"}},
	{Provider: "mistral", Label: "Mistral", Models: []string{"mistral-small-latest", "mistral-large-latest"}},
}

func isSupportedProviderModel(provider, model string) bool {
	for _, entry := range llmProviderCatalog {
		if entry.Provider != provider {
			continue
		}
		for _, candidate := range entry.Models {
			if candidate == model {
				return true
			}
		}
		return false
	}
	return false
}

func isKnownLLMProvider(provider string) bool {
	for _, entry := range llmProviderCatalog {
		if entry.Provider == provider {
			return true
		}
	}
	return false
}

type encryptedProviderCredential struct {
	algorithm  string
	keyVersion int
	ciphertext string
	iv         string
	authTag    string
}

// parseProviderCredentialMasterKey takes 64 hex characters or the base64 of 32 bytes.
func parseProviderCredentialMasterKey(raw string) ([]byte, error) {
	trimmed := strings.TrimSpace(raw)
	if providerCredentialHexKey.MatchString(trimmed) {
		return hex.DecodeString(trimmed)
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err == nil && len(decoded) == 32 && base64.StdEncoding.EncodeToString(decoded) == trimmed {
		return decoded, nil
	}
	return nil, errors.New("invalid_provider_credentials_master_key")
}

func encryptProviderCredential(masterKey []byte, plaintext string) (encryptedProviderCredential, error) {
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return encryptedProviderCredential{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return encryptedProviderCredential{}, err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return encryptedProviderCredential{}, err
	}
	sealed := gcm.Seal(nil, iv, []byte(plaintext), nil)
	tagStart := len(sealed) - gcm.Overhead()
	return encryptedProviderCredential{
		algorithm:  providerCredentialAlgorithm,
		keyVersion: providerCredentialKeyVersion,
		ciphertext: base64.StdEncoding.EncodeToString(sealed[:tagStart]),
		iv:         base64.StdEncoding.EncodeToString(iv),
		authTag:    base64.StdEncoding.EncodeToString(sealed[tagStart:]),
	}, nil
}

func decryptProviderCredential(masterKey []byte, encrypted encryptedProviderCredential) (string, error) {
	if encrypted.algorithm != providerCredentialAlgorithm || encrypted.keyVersion != providerCredentialKeyVersion {
		return "", errors.New("unsupported_provider_credential_format")
	}
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv, err := base64.StdEncoding.DecodeString(encrypted.iv)
	if err != nil {
		return "", err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(encrypted.ciphertext)
	if err != nil {
		return "", err
	}
	tag, err := base64.StdEncoding.DecodeString(encrypted.authTag)
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, iv, append(ciphertext, tag...), nil)
	if err != nil {
		return "", errors.New("provider_credential_decryption_failed")
	}
	return string(plaintext), nil
}

// maskProviderCredentialSuffix keeps the last four characters, padded to eight with bullets.
func maskProviderCredentialSuffix(secret string) string {
	runes := []rune(secret)
	if len(runes) > 4 {
		runes = runes[len(runes)-4:]
	}
	return strings.Repeat("•", max(0, 8-len(runes))) + string(runes)
}

// providerCredentialValidator sends the provider a one-token request with the key.
type providerCredentialValidator func(ctx context.Context, provider, apiKey, model string) error

type providerRejectedError struct{ message string }

func (e *providerRejectedError) Error() string { return e.message }

var providerChatCompletionsURL = map[string]string{
	"openai":  "https://api.openai.com/v1/chat/completions",
	"gemini":  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
	"groq":    "https://api.groq.com/openai/v1/chat/completions",
	"mistral": "https://api.mistral.ai/v1/chat/completions",
}

func newLiveProviderCredentialValidator() providerCredentialValidator {
	client := &http.Client{
		Timeout: providerValidationTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("provider validation does not follow redirects")
		},
	}
	return func(ctx context.Context, provider, apiKey, model string) error {
		payload := map[string]any{
			"model":      model,
			"max_tokens": 1,
			"messages":   []map[string]string{{"role": "user", "content": "ping"}},
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		endpoint := providerChatCompletionsURL[provider]
		if provider == "anthropic" {
			endpoint = "https://api.anthropic.com/v1/messages"
		}
		if endpoint == "" {
			return &providerRejectedError{message: "Unsupported provider"}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		if provider == "anthropic" {
			req.Header.Set("x-api-key", apiKey)
			req.Header.Set("anthropic-version", "2023-06-01")
		} else {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
		res, err := client.Do(req)
		if err != nil {
			return &providerRejectedError{message: "Could not reach the provider to check the key"}
		}
		defer func() { _ = res.Body.Close() }()
		if res.StatusCode >= 200 && res.StatusCode < 300 {
			return nil
		}
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
		return &providerRejectedError{message: providerErrorMessage(raw, res.StatusCode)}
	}
}

func providerErrorMessage(raw []byte, status int) string {
	var parsed struct {
		Error   json.RawMessage `json:"error"`
		Message string          `json:"message"`
	}
	if json.Unmarshal(raw, &parsed) == nil {
		var text string
		if json.Unmarshal(parsed.Error, &text) == nil && text != "" {
			return text
		}
		var object struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(parsed.Error, &object) == nil && object.Message != "" {
			return object.Message
		}
		if parsed.Message != "" {
			return parsed.Message
		}
	}
	if trimmed := strings.TrimSpace(string(raw)); trimmed != "" && utf8.ValidString(trimmed) && len(trimmed) < 500 {
		return trimmed
	}
	return fmt.Sprintf("provider request failed with status %d", status)
}

type providerCredentialAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	masterKey  []byte
	validate   providerCredentialValidator
}

type providerCredentialSummary struct {
	Provider           string `json:"provider"`
	DefaultModel       string `json:"defaultModel"`
	MaskedAPIKeySuffix string `json:"maskedApiKeySuffix"`
	LastValidatedAt    string `json:"lastValidatedAt"`
	UpdatedAt          string `json:"updatedAt"`
}

func newProviderCredentialAPIFromEnv() *providerCredentialAPI {
	api := &providerCredentialAPI{validate: newLiveProviderCredentialValidator()}
	if raw := strings.TrimSpace(os.Getenv("PROVIDER_CREDENTIALS_MASTER_KEY")); raw != "" {
		if key, err := parseProviderCredentialMasterKey(raw); err == nil {
			api.masterKey = key
		}
	}
	return api
}

func (api *providerCredentialAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	path := orgRoutePrefix + "/provider-credential"
	route := func(pattern string, fn func(*http.Request, organizationActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+path, api.get)
	route("PUT "+path, api.put)
}

// handle reuses the workspace settings guards (origin, actor, errors), built
// per request so it sees the pool and lookup main sets after registration.
func (api *providerCredentialAPI) handle(fn func(*http.Request, organizationActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			r.Body = http.MaxBytesReader(w, r.Body, sessionOnboardingBodyLimit)
		}
		(&workspaceSettingsAPI{pool: api.pool, membership: api.membership}).handle(fn).ServeHTTP(w, r)
	})
}

func (api *providerCredentialAPI) get(r *http.Request, actor organizationActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "provider_credentials:read") {
		return nil, 0, workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Only workspace admins can see the AI provider")
	}
	var summary providerCredentialSummary
	var lastValidatedAt, updatedAt time.Time
	err := api.pool.QueryRow(r.Context(), `
        select provider::text, default_model, masked_api_key_suffix, last_validated_at, updated_at
        from organization_llm_provider_credentials
        where organization_id=$1
        order by updated_at desc limit 1`, actor.organizationID).
		Scan(&summary.Provider, &summary.DefaultModel, &summary.MaskedAPIKeySuffix, &lastValidatedAt, &updatedAt)
	response := map[string]any{"providers": llmProviderCatalog, "credential": nil}
	if err == nil {
		summary.LastValidatedAt = formatTeamTime(lastValidatedAt)
		summary.UpdatedAt = formatTeamTime(updatedAt)
		response["credential"] = summary
	} else if !isNoRows(err) {
		return nil, 0, err
	}
	return response, http.StatusOK, nil
}

func (api *providerCredentialAPI) put(r *http.Request, actor organizationActor) (any, int, error) {
	ctx := r.Context()
	if !hasOrganizationCapability(actor.role, "provider_credentials:write") {
		return nil, 0, workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Only workspace admins can set the AI provider")
	}
	if len(api.masterKey) != 32 || api.validate == nil {
		return nil, 0, workspaceSettingsFailure(http.StatusServiceUnavailable, "provider_credentials_unavailable", "AI provider keys cannot be stored right now")
	}
	var body struct {
		Provider     string `json:"provider"`
		APIKey       string `json:"apiKey"`
		DefaultModel string `json:"defaultModel"`
	}
	if err := readSessionOnboardingBody(r, &body); err != nil {
		return nil, 0, err
	}
	apiKey := strings.TrimSpace(body.APIKey)
	switch {
	case !isKnownLLMProvider(body.Provider):
		return nil, 0, invalidField("invalid_provider_credential_payload", "provider", "Select a supported provider")
	case apiKey == "":
		return nil, 0, invalidField("invalid_provider_credential_payload", "apiKey", "API key is required")
	case len(apiKey) > providerAPIKeyMaxLength:
		return nil, 0, invalidField("invalid_provider_credential_payload", "apiKey", "API key is too long")
	case body.DefaultModel == "":
		return nil, 0, invalidField("invalid_provider_credential_payload", "defaultModel", "Default model is required")
	case !isSupportedProviderModel(body.Provider, body.DefaultModel):
		return nil, 0, invalidField("invalid_provider_credential_payload", "defaultModel", "Choose a supported model for the selected provider")
	}
	if err := api.validate(ctx, body.Provider, apiKey, body.DefaultModel); err != nil {
		var rejected *providerRejectedError
		if errors.As(err, &rejected) {
			return nil, 0, invalidField("provider_credential_rejected", "apiKey", rejected.message)
		}
		return nil, 0, err
	}
	encrypted, err := encryptProviderCredential(api.masterKey, apiKey)
	if err != nil {
		return nil, 0, err
	}
	summary := providerCredentialSummary{Provider: body.Provider, DefaultModel: body.DefaultModel, MaskedAPIKeySuffix: maskProviderCredentialSuffix(apiKey)}
	var lastValidatedAt, updatedAt time.Time
	if err := api.pool.QueryRow(ctx, `
        insert into organization_llm_provider_credentials (
            organization_id, created_by_user_id, updated_by_user_id, provider, default_model,
            masked_api_key_suffix, encryption_algorithm, ciphertext, iv, auth_tag, key_version, last_validated_at)
        values ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        on conflict (organization_id, provider) do update set
            updated_by_user_id=excluded.updated_by_user_id,
            default_model=excluded.default_model,
            masked_api_key_suffix=excluded.masked_api_key_suffix,
            encryption_algorithm=excluded.encryption_algorithm,
            ciphertext=excluded.ciphertext,
            iv=excluded.iv,
            auth_tag=excluded.auth_tag,
            key_version=excluded.key_version,
            last_validated_at=excluded.last_validated_at,
            updated_at=now()
        returning last_validated_at, updated_at`,
		actor.organizationID, actor.userID, body.Provider, body.DefaultModel, summary.MaskedAPIKeySuffix,
		encrypted.algorithm, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyVersion,
	).Scan(&lastValidatedAt, &updatedAt); err != nil {
		return nil, 0, err
	}
	summary.LastValidatedAt = formatTeamTime(lastValidatedAt)
	summary.UpdatedAt = formatTeamTime(updatedAt)
	return map[string]any{"credential": summary}, http.StatusOK, nil
}
