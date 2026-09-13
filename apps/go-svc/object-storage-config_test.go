package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func configureStorageTestEnv(t *testing.T) {
	t.Helper()
	for key, value := range map[string]string{
		"OBJECT_STORAGE_LOCATIONS":                    "s3-files, r2-bundles",
		"OBJECT_STORAGE_DEFAULT_LOCATION":             "s3-files",
		"OBJECT_STORAGE_S3_FILES_PROVIDER":            "s3",
		"OBJECT_STORAGE_S3_FILES_BUCKET":              "s3-files-bucket",
		"OBJECT_STORAGE_S3_FILES_REGION":              "ap-southeast-2",
		"OBJECT_STORAGE_S3_FILES_ENDPOINT":            "",
		"OBJECT_STORAGE_S3_FILES_ACCESS_KEY_ID":       "s3-key",
		"OBJECT_STORAGE_S3_FILES_SECRET_ACCESS_KEY":   "s3-secret",
		"OBJECT_STORAGE_S3_FILES_SESSION_TOKEN":       "s3-session",
		"OBJECT_STORAGE_S3_FILES_USE_PATH_STYLE":      "true",
		"OBJECT_STORAGE_R2_BUNDLES_PROVIDER":          "r2",
		"OBJECT_STORAGE_R2_BUNDLES_BUCKET":            "r2-bundles-bucket",
		"OBJECT_STORAGE_R2_BUNDLES_REGION":            "",
		"OBJECT_STORAGE_R2_BUNDLES_ENDPOINT":          "https://account.r2.cloudflarestorage.com",
		"OBJECT_STORAGE_R2_BUNDLES_ACCESS_KEY_ID":     "r2-key",
		"OBJECT_STORAGE_R2_BUNDLES_SECRET_ACCESS_KEY": "r2-secret",
		"OBJECT_STORAGE_R2_BUNDLES_SESSION_TOKEN":     "",
		"OBJECT_STORAGE_R2_BUNDLES_USE_PATH_STYLE":    "",
	} {
		t.Setenv(key, value)
	}
}

func TestStorageConfigSupportsParallelProviders(t *testing.T) {
	configureStorageTestEnv(t)
	configs, err := objectStorageConfigsFromEnv()
	require.NoError(t, err)
	require.Len(t, configs, 2)
	require.Equal(t, "s3-files-bucket", configs["s3-files"].Bucket)
	require.Equal(t, "s3-key", configs["s3-files"].AccessKeyID)
	require.Equal(t, "s3-session", configs["s3-files"].SessionToken)
	require.True(t, configs["s3-files"].UsePathStyle)
	require.Equal(t, "r2-bundles-bucket", configs["r2-bundles"].Bucket)
	require.Equal(t, "r2-key", configs["r2-bundles"].AccessKeyID)
	require.Equal(t, "auto", configs["r2-bundles"].Region)
	require.False(t, configs["r2-bundles"].UsePathStyle)
	registry, err := configureObjectStorage(t.Context())
	require.NoError(t, err)
	for _, id := range []string{"s3-files", "r2-bundles"} {
		store, err := registry.Resolve(id)
		require.NoError(t, err)
		require.NotNil(t, store)
	}
	// Each location keeps its own credential source; AWS can use its default chain.
	for _, suffix := range []string{"ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "SESSION_TOKEN"} {
		t.Setenv("OBJECT_STORAGE_S3_FILES_"+suffix, "")
	}
	configs, err = objectStorageConfigsFromEnv()
	require.NoError(t, err)
	require.Empty(t, configs["s3-files"].AccessKeyID)
	require.Equal(t, "r2-key", configs["r2-bundles"].AccessKeyID)
}

func TestStorageConfigRejectsAmbiguousOrIncompleteSettings(t *testing.T) {
	for _, tc := range []struct{ name, key, value, want string }{
		{"legacy JSON", "OBJECT_STORAGE_LOCATIONS", `{"secret":"do-not-echo"}`, "comma-separated"},
		{"collision", "OBJECT_STORAGE_LOCATIONS", "s3-files,s3_files", "comma-separated"},
		{"duplicate", "OBJECT_STORAGE_LOCATIONS", "s3-files, s3-files", "duplicate location"},
		{"empty entry", "OBJECT_STORAGE_LOCATIONS", "s3-files,", "comma-separated"},
		{"uppercase", "OBJECT_STORAGE_LOCATIONS", "S3", "comma-separated"},
		{"too long", "OBJECT_STORAGE_LOCATIONS", strings.Repeat("a", 65), "comma-separated"},
		{"missing provider", "OBJECT_STORAGE_R2_BUNDLES_PROVIDER", "", "OBJECT_STORAGE_R2_BUNDLES_PROVIDER"},
		{"missing bucket", "OBJECT_STORAGE_S3_FILES_BUCKET", "", "OBJECT_STORAGE_S3_FILES_BUCKET"},
		{"partial credentials", "OBJECT_STORAGE_R2_BUNDLES_SECRET_ACCESS_KEY", "", "must be set together"},
		{"missing endpoint", "OBJECT_STORAGE_R2_BUNDLES_ENDPOINT", "", "OBJECT_STORAGE_R2_BUNDLES_ENDPOINT"},
		{"invalid boolean", "OBJECT_STORAGE_S3_FILES_USE_PATH_STYLE", "wrong", "OBJECT_STORAGE_S3_FILES_USE_PATH_STYLE"},
		{"unknown default", "OBJECT_STORAGE_DEFAULT_LOCATION", "missing", "must name a configured location"},
		{"default without locations", "OBJECT_STORAGE_LOCATIONS", "", "requires OBJECT_STORAGE_LOCATIONS"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			configureStorageTestEnv(t)
			t.Setenv(tc.key, tc.value)
			_, err := configureObjectStorage(t.Context())
			require.ErrorContains(t, err, tc.want)
			require.NotContains(t, err.Error(), "do-not-echo")
			require.NotContains(t, err.Error(), "s3-secret")
			require.NotContains(t, err.Error(), "r2-secret")
		})
	}
}
