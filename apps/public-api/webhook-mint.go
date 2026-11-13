package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	webhookSigningSecretMintPath = "/api/internal/webhooks/signing-secret"
	goSvcServiceTokenHeader      = "X-Go-Svc-Research-Token"
	goSvcServiceTokenMessage     = "go-svc-research"
	webhookSecretPrefix          = "whsec_"
	webhookMintTimeout           = 30 * time.Second
	webhookMintMaxBodyBytes      = 1 << 20
)

type webhookSecretMinter interface {
	Mint(context.Context) (mintedWebhookSigningSecret, error)
}

type mintedWebhookSigningSecret struct {
	Secret    string          `json:"secret"`
	Encrypted json.RawMessage `json:"encrypted"`
}

type encryptedWebhookSecret struct {
	Algorithm  string `json:"algorithm"`
	KeyVersion int    `json:"keyVersion"`
	Ciphertext string `json:"ciphertext"`
	IV         string `json:"iv"`
	AuthTag    string `json:"authTag"`
}

type webhookMintDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type webhookSecretMintClient struct {
	baseURL        string
	cookiePassword string
	http           webhookMintDoer
}

type webhookSecretMintClientConfig struct {
	BaseURL        string
	CookiePassword string
	HTTPClient     webhookMintDoer
}

func webAppBaseURLFromEnv() string {
	if value := strings.TrimSpace(os.Getenv("HYPERLOCALISE_WEB_INTERNAL_URL")); value != "" {
		return value
	}
	return strings.TrimSpace(os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL"))
}

func newWebhookSecretMinterFromEnv() webhookSecretMinter {
	client, err := newWebhookSecretMintClient(webhookSecretMintClientConfig{
		BaseURL:        webAppBaseURLFromEnv(),
		CookiePassword: os.Getenv("WORKOS_COOKIE_PASSWORD"),
	})
	if err != nil {
		slog.Warn("webhook secret mint disabled", "reason", err.Error())
		return nil
	}
	return client
}

func newWebhookSecretMintClient(cfg webhookSecretMintClientConfig) (*webhookSecretMintClient, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("missing web base URL")
	}
	password := strings.TrimSpace(cfg.CookiePassword)
	if password == "" {
		return nil, fmt.Errorf("missing cookie password")
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: webhookMintTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return &webhookSecretMintClient{
		baseURL:        baseURL,
		cookiePassword: password,
		http:           httpClient,
	}, nil
}

func (s *postgresStore) mintWebhookSigningSecret(ctx context.Context) (mintedWebhookSigningSecret, error) {
	if s == nil || s.webhookSecrets == nil {
		return mintedWebhookSigningSecret{}, errWebhookSecretEncryptionFailed
	}
	minted, err := s.webhookSecrets.Mint(ctx)
	if err != nil {
		return mintedWebhookSigningSecret{}, fmt.Errorf("%w: %w", errWebhookSecretEncryptionFailed, err)
	}
	if err := minted.validate(); err != nil {
		return mintedWebhookSigningSecret{}, err
	}
	return minted, nil
}

func (c *webhookSecretMintClient) Mint(ctx context.Context) (mintedWebhookSigningSecret, error) {
	if c == nil {
		return mintedWebhookSigningSecret{}, errWebhookSecretEncryptionFailed
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+webhookSigningSecretMintPath, http.NoBody)
	if err != nil {
		return mintedWebhookSigningSecret{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set(goSvcServiceTokenHeader, goSvcServiceToken(c.cookiePassword))

	res, err := c.http.Do(req)
	if err != nil {
		return mintedWebhookSigningSecret{}, err
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(res.Body, webhookMintMaxBodyBytes))
	if err != nil {
		return mintedWebhookSigningSecret{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return mintedWebhookSigningSecret{}, fmt.Errorf("web mint HTTP %d", res.StatusCode)
	}

	var minted mintedWebhookSigningSecret
	if err := json.Unmarshal(raw, &minted); err != nil {
		return mintedWebhookSigningSecret{}, fmt.Errorf("decode webhook secret mint: %w", err)
	}
	if err := minted.validate(); err != nil {
		return mintedWebhookSigningSecret{}, err
	}
	return minted, nil
}

func (m mintedWebhookSigningSecret) validate() error {
	if !strings.HasPrefix(m.Secret, webhookSecretPrefix) || len(m.Secret) <= len(webhookSecretPrefix) {
		return errWebhookSecretEncryptionFailed
	}
	var stored encryptedWebhookSecret
	if err := json.Unmarshal(m.Encrypted, &stored); err != nil {
		return errWebhookSecretEncryptionFailed
	}
	if stored.Algorithm != "aes-256-gcm" || stored.KeyVersion < 1 ||
		stored.Ciphertext == "" || stored.IV == "" || stored.AuthTag == "" {
		return errWebhookSecretEncryptionFailed
	}
	return nil
}

func goSvcServiceToken(cookiePassword string) string {
	mac := hmac.New(sha256.New, []byte(cookiePassword))
	_, _ = mac.Write([]byte(goSvcServiceTokenMessage))
	return hex.EncodeToString(mac.Sum(nil))
}
