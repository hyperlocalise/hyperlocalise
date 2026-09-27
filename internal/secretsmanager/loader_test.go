package secretsmanager

import (
	"context"
	"errors"
	"testing"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/stretchr/testify/require"
)

type fakeAPI struct {
	secret string
	calls  int
	err    error
}

func (f *fakeAPI) GetSecretValue(context.Context, *awssecretsmanager.GetSecretValueInput, ...func(*awssecretsmanager.Options)) (*awssecretsmanager.GetSecretValueOutput, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return &awssecretsmanager.GetSecretValueOutput{SecretString: awssdk.String(f.secret)}, nil
}

func TestLoaderCachesSecretValueUntilTTL(t *testing.T) {
	client := &fakeAPI{secret: `{"DATABASE_URL":"postgres://one"}`}
	loader, err := NewLoader(client, Config{ARN: "arn:secret", Key: "DATABASE_URL", CacheTTL: time.Hour})
	require.NoError(t, err)

	first, err := loader.Load(context.Background())
	require.NoError(t, err)
	second, err := loader.Load(context.Background())
	require.NoError(t, err)

	require.Equal(t, "postgres://one", first)
	require.Equal(t, first, second)
	require.Equal(t, 1, client.calls)
}

func TestLoaderRefreshesAfterTTL(t *testing.T) {
	client := &fakeAPI{secret: `{"DATABASE_URL":"postgres://one"}`}
	loader, err := NewLoader(client, Config{ARN: "arn:secret", Key: "DATABASE_URL", CacheTTL: 0})
	require.NoError(t, err)

	_, err = loader.Load(context.Background())
	require.NoError(t, err)
	client.secret = `{"DATABASE_URL":"postgres://two"}`
	value, err := loader.Load(context.Background())
	require.NoError(t, err)

	require.Equal(t, "postgres://two", value)
	require.Equal(t, 2, client.calls)
}

func TestLoaderUsesCachedSecretWhenRefreshFails(t *testing.T) {
	client := &fakeAPI{secret: `{"DATABASE_URL":"postgres://one"}`}
	loader, err := NewLoader(client, Config{ARN: "arn:secret", Key: "DATABASE_URL", CacheTTL: 0})
	require.NoError(t, err)

	value, err := loader.Load(context.Background())
	require.NoError(t, err)
	require.Equal(t, "postgres://one", value)

	client.err = errors.New("secrets manager unavailable")
	value, err = loader.Load(context.Background())
	require.NoError(t, err)
	require.Equal(t, "postgres://one", value)
	require.Equal(t, 2, client.calls)
}

func TestLoaderRejectsMissingField(t *testing.T) {
	client := &fakeAPI{secret: `{"OTHER":"value"}`}
	loader, err := NewLoader(client, Config{ARN: "arn:secret", Key: "DATABASE_URL", CacheTTL: time.Minute})
	require.NoError(t, err)

	_, err = loader.Load(context.Background())
	require.EqualError(t, err, `secret field "DATABASE_URL" is missing`)
}

func TestConfigFromEnvUsesConfiguredTTL(t *testing.T) {
	t.Setenv(SecretARNEnv, "arn:secret")
	t.Setenv(SecretKeyEnv, "DATABASE_URL")
	t.Setenv(SecretTTLSeconds, "42")

	config, err := ConfigFromEnv()
	require.NoError(t, err)
	require.Equal(t, 42*time.Second, config.CacheTTL)
}
