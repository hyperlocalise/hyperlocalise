package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
)

const (
	providerCredentialAlgorithm  = "aes-256-gcm"
	providerCredentialKeyVersion = 1
	webhookSecretPrefix          = "whsec_"
	webhookSecretBytes           = 32
)

// encryptedProviderCredential is the JSON stored in webhook_endpoints.secret, matching the
// web app's EncryptedProviderCredential.
type encryptedProviderCredential struct {
	Algorithm  string `json:"algorithm"`
	KeyVersion int    `json:"keyVersion"`
	Ciphertext string `json:"ciphertext"`
	IV         string `json:"iv"`
	AuthTag    string `json:"authTag"`
}

func generateWebhookSecret() (string, error) {
	buf := make([]byte, webhookSecretBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", errWebhookSecretEncryptionFailed
	}
	return webhookSecretPrefix + base64.StdEncoding.EncodeToString(buf), nil
}

func encryptWebhookSecret(plaintext string) ([]byte, error) {
	key, err := providerCredentialsMasterKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errWebhookSecretEncryptionFailed
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, errWebhookSecretEncryptionFailed
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, errWebhookSecretEncryptionFailed
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	overhead := gcm.Overhead()
	if len(sealed) < overhead {
		return nil, errWebhookSecretEncryptionFailed
	}
	return json.Marshal(encryptedProviderCredential{
		Algorithm:  providerCredentialAlgorithm,
		KeyVersion: providerCredentialKeyVersion,
		Ciphertext: base64.StdEncoding.EncodeToString(sealed[:len(sealed)-overhead]),
		IV:         base64.StdEncoding.EncodeToString(nonce),
		AuthTag:    base64.StdEncoding.EncodeToString(sealed[len(sealed)-overhead:]),
	})
}

func providerCredentialsMasterKey() ([]byte, error) {
	return parseProviderCredentialsMasterKey(os.Getenv("PROVIDER_CREDENTIALS_MASTER_KEY"))
}

func parseProviderCredentialsMasterKey(input string) ([]byte, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, errWebhookSecretEncryptionFailed
	}
	if len(trimmed) == 64 {
		decoded, err := hex.DecodeString(trimmed)
		if err == nil && len(decoded) == 32 {
			return decoded, nil
		}
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil || len(decoded) != 32 || base64.StdEncoding.EncodeToString(decoded) != trimmed {
		return nil, errWebhookSecretEncryptionFailed
	}
	return decoded, nil
}
