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
	SecretEnvPrefix  = "HYPERLOCALISE_SECRET_"
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

// ConfigsFromEnv reads non-sensitive secret references from environment
// metadata. Values remain in Secrets Manager and are loaded only when the
// caller asks for them.
//
// Each reference uses the following variables, where NAME is an uppercase
// logical name containing letters, numbers, and underscores:
//   - HYPERLOCALISE_SECRET_NAME_ARN
//   - HYPERLOCALISE_SECRET_NAME_KEY
//   - HYPERLOCALISE_SECRET_NAME_CACHE_TTL_SECONDS (optional)
func ConfigsFromEnv() (map[string]Config, error) {
	arns := make(map[string]string)
	for _, entry := range os.Environ() {
		key, value, ok := strings.Cut(entry, "=")
		if !ok || !strings.HasPrefix(key, SecretEnvPrefix) || !strings.HasSuffix(key, "_ARN") {
			continue
		}
		name := strings.TrimSuffix(strings.TrimPrefix(key, SecretEnvPrefix), "_ARN")
		if name != "" {
			arns[name] = strings.TrimSpace(value)
		}
	}

	configs := make(map[string]Config, len(arns))
	for name, arn := range arns {
		keyEnv := SecretEnvPrefix + name + "_KEY"
		ttlEnv := SecretEnvPrefix + name + "_CACHE_TTL_SECONDS"
		key := strings.TrimSpace(os.Getenv(keyEnv))
		if arn == "" {
			return nil, fmt.Errorf("%s is required", SecretEnvPrefix+name+"_ARN")
		}
		if key == "" {
			return nil, fmt.Errorf("%s is required", keyEnv)
		}
		ttl, err := parseCacheTTL(ttlEnv)
		if err != nil {
			return nil, err
		}
		configs[name] = Config{ARN: arn, Key: key, CacheTTL: ttl}
	}
	return configs, nil
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

	ttl, err := parseCacheTTL(SecretTTLSeconds)
	if err != nil {
		return Config{}, err
	}
	config.CacheTTL = ttl
	return config, nil
}

func parseCacheTTL(envName string) (time.Duration, error) {
	ttlValue := strings.TrimSpace(os.Getenv(envName))
	if ttlValue == "" {
		return DefaultCacheTTL, nil
	}
	ttlSeconds, err := strconv.ParseInt(ttlValue, 10, 64)
	if err != nil || ttlSeconds < 0 {
		return 0, fmt.Errorf("%s must be a non-negative integer", envName)
	}
	return time.Duration(ttlSeconds) * time.Second, nil
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

// Collection loads named secret fields using independent cache policies.
type Collection struct {
	loaders map[string]*Loader
}

// NewCollection creates a loader for each named secret reference.
func NewCollection(client API, configs map[string]Config) (*Collection, error) {
	if client == nil {
		return nil, errors.New("secrets manager client is required")
	}
	loaders := make(map[string]*Loader, len(configs))
	for name, config := range configs {
		if strings.TrimSpace(name) == "" {
			return nil, errors.New("secret reference name is required")
		}
		loader, err := NewLoader(client, config)
		if err != nil {
			return nil, fmt.Errorf("configure secret reference %q: %w", name, err)
		}
		loaders[name] = loader
	}
	return &Collection{loaders: loaders}, nil
}

// Load returns the configured value for a named secret reference.
func (c *Collection) Load(ctx context.Context, name string) (string, error) {
	if c == nil {
		return "", errors.New("secret collection is nil")
	}
	loader, ok := c.loaders[name]
	if !ok {
		return "", fmt.Errorf("secret reference %q is not configured", name)
	}
	return loader.Load(ctx)
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
