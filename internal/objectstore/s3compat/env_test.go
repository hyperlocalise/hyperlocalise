package s3compat

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func isolateAWSConfig(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(dir, "config"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(dir, "credentials"))
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("AWS_REGION", "")
	t.Setenv("AWS_DEFAULT_REGION", "")
}

func setLocationEnv(t *testing.T, prefix string, values map[string]string) {
	t.Helper()
	for _, suffix := range []string{"PROVIDER", "BUCKET", "REGION", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "SESSION_TOKEN", "USE_PATH_STYLE"} {
		t.Setenv(prefix+suffix, values[suffix])
	}
}

func TestConfigsFromEnvEmpty(t *testing.T) {
	t.Setenv("OBJECT_STORAGE_LOCATIONS", "  ")
	configs, err := ConfigsFromEnv()
	require.NoError(t, err)
	require.Empty(t, configs)
}

func TestConfigsFromEnvReadsLocations(t *testing.T) {
	t.Setenv("OBJECT_STORAGE_LOCATIONS", "s3-files, r2-eu")
	setLocationEnv(t, "OBJECT_STORAGE_S3_FILES_", map[string]string{"PROVIDER": "s3", "BUCKET": " files ", "REGION": "us-west-2", "USE_PATH_STYLE": "true"})
	setLocationEnv(t, "OBJECT_STORAGE_R2_EU_", map[string]string{"PROVIDER": "r2", "BUCKET": "eu", "REGION": "ignored", "ENDPOINT": "https://account.eu.r2.cloudflarestorage.com", "ACCESS_KEY_ID": "key", "SECRET_ACCESS_KEY": " secret ", "SESSION_TOKEN": "token"})

	configs, err := ConfigsFromEnv()
	require.NoError(t, err)
	require.Equal(t, map[string]Config{
		"s3-files": {Provider: "s3", Bucket: "files", Region: "us-west-2", UsePathStyle: true},
		"r2-eu":    {Provider: "r2", Bucket: "eu", Region: "auto", Endpoint: "https://account.eu.r2.cloudflarestorage.com", AccessKeyID: "key", SecretAccessKey: " secret ", SessionToken: "token"},
	}, configs)
}

func TestConfigsFromEnvRejectsInvalidLocationIDs(t *testing.T) {
	for _, raw := range []string{"Files", ",files", "1files", "files--eu", "files-", `{"files":{"secret":"x"}}`, "a" + strings.Repeat("b", 64)} {
		t.Run(raw, func(t *testing.T) {
			t.Setenv("OBJECT_STORAGE_LOCATIONS", raw)
			_, err := ConfigsFromEnv()
			require.ErrorContains(t, err, "OBJECT_STORAGE_LOCATIONS must be a comma-separated list")
			require.NotContains(t, err.Error(), "secret")
		})
	}
}

func TestConfigsFromEnvRejectsDuplicateLocations(t *testing.T) {
	t.Setenv("OBJECT_STORAGE_LOCATIONS", "files,files")
	setLocationEnv(t, "OBJECT_STORAGE_FILES_", map[string]string{"PROVIDER": "s3", "BUCKET": "files"})
	_, err := ConfigsFromEnv()
	require.EqualError(t, err, "duplicate location files in OBJECT_STORAGE_LOCATIONS")
}

func TestLocationConfigFromEnvValidation(t *testing.T) {
	const prefix = "OBJECT_STORAGE_MAIN_"
	for _, tc := range []struct {
		name    string
		values  map[string]string
		wantErr string
	}{
		{name: "missing provider", values: map[string]string{"BUCKET": "files"}, wantErr: prefix + "PROVIDER must be s3 or r2"},
		{name: "unknown provider", values: map[string]string{"PROVIDER": "gcs", "BUCKET": "files"}, wantErr: prefix + "PROVIDER must be s3 or r2"},
		{name: "missing bucket", values: map[string]string{"PROVIDER": "s3"}, wantErr: prefix + "BUCKET is required"},
		{name: "access key without secret", values: map[string]string{"PROVIDER": "s3", "BUCKET": "files", "ACCESS_KEY_ID": "key"}, wantErr: "ACCESS_KEY_ID and " + prefix + "SECRET_ACCESS_KEY must be set together"},
		{name: "secret without access key", values: map[string]string{"PROVIDER": "s3", "BUCKET": "files", "SECRET_ACCESS_KEY": "secret"}, wantErr: "must be set together"},
		{name: "session token without keys", values: map[string]string{"PROVIDER": "s3", "BUCKET": "files", "SESSION_TOKEN": "token"}, wantErr: prefix + "SESSION_TOKEN requires location access keys"},
		{name: "r2 without endpoint", values: map[string]string{"PROVIDER": "r2", "BUCKET": "files", "ACCESS_KEY_ID": "key", "SECRET_ACCESS_KEY": "secret"}, wantErr: prefix + "ENDPOINT is required for R2"},
		{name: "r2 without keys", values: map[string]string{"PROVIDER": "r2", "BUCKET": "files", "ENDPOINT": "https://r2.example.com"}, wantErr: "SECRET_ACCESS_KEY are required for R2"},
		{name: "invalid path style", values: map[string]string{"PROVIDER": "s3", "BUCKET": "files", "USE_PATH_STYLE": "sometimes"}, wantErr: prefix + "USE_PATH_STYLE must be a boolean"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setLocationEnv(t, prefix, tc.values)
			_, err := locationConfigFromEnv("main")
			require.ErrorContains(t, err, tc.wantErr)
			require.NotContains(t, err.Error(), "secret\"")
		})
	}

	setLocationEnv(t, prefix, map[string]string{"PROVIDER": "s3", "BUCKET": "files", "USE_PATH_STYLE": "0"})
	cfg, err := locationConfigFromEnv("main")
	require.NoError(t, err)
	require.False(t, cfg.UsePathStyle)
}

func TestRegistryFromEnv(t *testing.T) {
	isolateAWSConfig(t)
	t.Setenv("OBJECT_STORAGE_LOCATIONS", "")
	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "")
	registry, err := RegistryFromEnv(t.Context())
	require.NoError(t, err)
	require.Nil(t, registry)

	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "files")
	_, err = RegistryFromEnv(t.Context())
	require.EqualError(t, err, "OBJECT_STORAGE_DEFAULT_LOCATION requires OBJECT_STORAGE_LOCATIONS")

	t.Setenv("OBJECT_STORAGE_LOCATIONS", "files,archive")
	setLocationEnv(t, "OBJECT_STORAGE_FILES_", map[string]string{"PROVIDER": "s3", "BUCKET": "files", "REGION": "us-east-1"})
	setLocationEnv(t, "OBJECT_STORAGE_ARCHIVE_", map[string]string{"PROVIDER": "r2", "BUCKET": "archive", "ENDPOINT": "https://account.r2.cloudflarestorage.com", "ACCESS_KEY_ID": "key", "SECRET_ACCESS_KEY": "secret"})
	registry, err = RegistryFromEnv(t.Context())
	require.NoError(t, err)
	require.Equal(t, "files", registry.DefaultLocationID())
	archive, err := registry.Resolve("archive")
	require.NoError(t, err)
	require.Equal(t, "auto", archive.(*Store).client.Options().Region)

	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "legacy")
	_, err = RegistryFromEnv(t.Context())
	require.EqualError(t, err, "OBJECT_STORAGE_DEFAULT_LOCATION must name a configured location")

	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "files")
	t.Setenv("OBJECT_STORAGE_FILES_REGION", "")
	_, err = RegistryFromEnv(t.Context())
	require.EqualError(t, err, "invalid object storage configuration for location files")

	t.Setenv("OBJECT_STORAGE_FILES_REGION", "us-east-1")
	t.Setenv("OBJECT_STORAGE_ARCHIVE_ENDPOINT", "https://user:pass@account.r2.cloudflarestorage.com")
	_, err = RegistryFromEnv(t.Context())
	require.EqualError(t, err, "invalid object storage configuration for location archive")
	require.NotContains(t, err.Error(), "pass")

	t.Setenv("OBJECT_STORAGE_ARCHIVE_PROVIDER", "")
	_, err = RegistryFromEnv(t.Context())
	require.ErrorContains(t, err, "OBJECT_STORAGE_ARCHIVE_PROVIDER must be s3 or r2")
}
