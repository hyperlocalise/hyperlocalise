package secretsmanager

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

const (
	SecretARNEnv     = "DATABASE_URL_SECRET_ARN"
	SecretKeyEnv     = "DATABASE_SECRET_KEY"
	SecretTTLSeconds = "DATABASE_URL_SECRET_CACHE_TTL_SECONDS"
	DefaultCacheTTL  = 5 * time.Minute
)

type API interface {
	GetSecretValue(context.Context, *awssecretsmanager.GetSecretValueInput, ...func(*awssecretsmanager.Options)) (*awssecretsmanager.GetSecretValueOutput, error)
}

type Config struct {
	ARN      string
	Key      string
	CacheTTL time.Duration
}

func ConfigFromEnv() (Config, error) {
	config := Config{
		ARN:      strings.TrimSpace(os.Getenv(SecretARNEnv)),
		Key:      strings.TrimSpace(os.Getenv(SecretKeyEnv)),
		CacheTTL: DefaultCacheTTL,
	}
	if config.ARN == "" {
		return Config{}, errors.New("DATABASE_URL_SECRET_ARN is required")
	}
	if config.Key == "" {
		return Config{}, errors.New("DATABASE_SECRET_KEY is required")
	}

	ttlValue := strings.TrimSpace(os.Getenv(SecretTTLSeconds))
	if ttlValue == "" {
		return config, nil
	}
	ttlSeconds, err := strconv.ParseInt(ttlValue, 10, 64)
	if err != nil || ttlSeconds < 0 {
		return Config{}, fmt.Errorf("%s must be a non-negative integer", SecretTTLSeconds)
	}
	config.CacheTTL = time.Duration(ttlSeconds) * time.Second
	return config, nil
}

type Loader struct {
	client API
	config Config

	mu         sync.Mutex
	cachedURL  string
	cacheUntil time.Time
}

func NewLoader(client API, config Config) (*Loader, error) {
	if client == nil {
		return nil, errors.New("secrets manager client is required")
	}
	if strings.TrimSpace(config.ARN) == "" {
		return nil, errors.New("secret ARN is required")
	}
	if strings.TrimSpace(config.Key) == "" {
		return nil, errors.New("secret key is required")
	}
	if config.CacheTTL < 0 {
		return nil, errors.New("secret cache TTL must be non-negative")
	}
	return &Loader{client: client, config: config}, nil
}

func (l *Loader) Load(ctx context.Context) (string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	if l.cachedURL != "" && now.Before(l.cacheUntil) {
		return l.cachedURL, nil
	}

	output, err := l.client.GetSecretValue(ctx, &awssecretsmanager.GetSecretValueInput{
		SecretId: awssdk.String(l.config.ARN),
	})
	if err != nil {
		return l.cachedValueOrError(now, fmt.Errorf("get secret value: %w", err))
	}
	if output == nil || output.SecretString == nil {
		return l.cachedValueOrError(now, errors.New("secret does not contain SecretString"))
	}

	values := map[string]json.RawMessage{}
	if err := json.Unmarshal([]byte(*output.SecretString), &values); err != nil {
		return l.cachedValueOrError(now, fmt.Errorf("parse secret JSON: %w", err))
	}
	value, ok := values[l.config.Key]
	if !ok {
		return l.cachedValueOrError(now, fmt.Errorf("secret field %q is missing", l.config.Key))
	}
	var secretValue string
	if err := json.Unmarshal(value, &secretValue); err != nil {
		return l.cachedValueOrError(now, fmt.Errorf("secret field %q is not a string", l.config.Key))
	}
	if strings.TrimSpace(secretValue) == "" {
		return l.cachedValueOrError(now, fmt.Errorf("secret field %q is empty", l.config.Key))
	}

	l.cachedURL = secretValue
	l.cacheUntil = now.Add(l.config.CacheTTL)
	return secretValue, nil
}

func (l *Loader) cachedValueOrError(now time.Time, err error) (string, error) {
	if l.cachedURL == "" {
		return "", err
	}

	// Keep the last known-good value usable during a transient refresh failure.
	// Retry after another cache interval so an outage does not cause a Secrets
	// Manager request and SQS batch failure on every invocation.
	l.cacheUntil = now.Add(l.config.CacheTTL)
	return l.cachedURL, nil
}
