package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
)

const (
	apiKeyPlaintextPrefix = "hl_"
	apiKeySecretBytes     = 32
	apiKeyPrefixLength    = 8
)

func generateAPIKey() (string, error) {
	return generateAPIKeyFrom(rand.Reader)
}

func generateAPIKeyFrom(random io.Reader) (string, error) {
	secret := make([]byte, apiKeySecretBytes)
	if _, err := io.ReadFull(random, secret); err != nil {
		return "", fmt.Errorf("generate api key: %w", err)
	}
	return apiKeyPlaintextPrefix + base64.RawURLEncoding.EncodeToString(secret), nil
}

func apiKeyPrefix(key string) string {
	if len(key) <= apiKeyPrefixLength {
		return key
	}
	return key[:apiKeyPrefixLength]
}
