package s3compat

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

// Environment configuration shared by go-svc and the public API.

var storageLocationIDPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

// RegistryFromEnv builds the object store registry from OBJECT_STORAGE_LOCATIONS and each
// location's OBJECT_STORAGE_<ID>_* variables. It returns nil until locations are configured.
// Location IDs are stable identities; the environment prefix is derived from each ID.
func RegistryFromEnv(ctx context.Context) (*objectstore.Registry, error) {
	configs, err := ConfigsFromEnv()
	if err != nil {
		return nil, err
	}
	defaultID := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_DEFAULT_LOCATION"))
	if len(configs) == 0 {
		if defaultID != "" {
			return nil, errors.New("OBJECT_STORAGE_DEFAULT_LOCATION requires OBJECT_STORAGE_LOCATIONS")
		}
		return nil, nil
	}
	if _, exists := configs[defaultID]; !exists {
		return nil, errors.New("OBJECT_STORAGE_DEFAULT_LOCATION must name a configured location")
	}
	locations := make(map[string]objectstore.Store, len(configs))
	for id, cfg := range configs {
		store, err := New(ctx, cfg)
		if err != nil {
			return nil, fmt.Errorf("invalid object storage configuration for location %s", id)
		}
		locations[id] = store
	}
	return objectstore.NewRegistry(defaultID, locations)
}

// ConfigsFromEnv reads every configured location.
func ConfigsFromEnv() (map[string]Config, error) {
	rawLocations := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_LOCATIONS"))
	configs := make(map[string]Config)
	if rawLocations == "" {
		return configs, nil
	}
	for _, entry := range strings.Split(rawLocations, ",") {
		id := strings.TrimSpace(entry)
		if len(id) > 64 || !storageLocationIDPattern.MatchString(id) {
			// Never echo the input: an old JSON configuration may contain secrets.
			return nil, errors.New("OBJECT_STORAGE_LOCATIONS must be a comma-separated list of lowercase location IDs using letters, digits and single hyphens")
		}
		if _, exists := configs[id]; exists {
			return nil, fmt.Errorf("duplicate location %s in OBJECT_STORAGE_LOCATIONS", id)
		}
		cfg, err := locationConfigFromEnv(id)
		if err != nil {
			return nil, err
		}
		configs[id] = cfg
	}
	return configs, nil
}

func locationConfigFromEnv(id string) (Config, error) {
	prefix := "OBJECT_STORAGE_" + strings.ToUpper(strings.ReplaceAll(id, "-", "_")) + "_"
	value := func(suffix string) string { return strings.TrimSpace(os.Getenv(prefix + suffix)) }
	cfg := Config{
		Provider:        value("PROVIDER"),
		Bucket:          value("BUCKET"),
		Region:          value("REGION"),
		Endpoint:        value("ENDPOINT"),
		AccessKeyID:     value("ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv(prefix + "SECRET_ACCESS_KEY"),
		SessionToken:    os.Getenv(prefix + "SESSION_TOKEN"),
	}
	if cfg.Provider != "s3" && cfg.Provider != "r2" {
		return cfg, fmt.Errorf("%sPROVIDER must be s3 or r2", prefix)
	}
	if cfg.Bucket == "" {
		return cfg, fmt.Errorf("%sBUCKET is required", prefix)
	}
	if (cfg.AccessKeyID == "") != (cfg.SecretAccessKey == "") {
		return cfg, fmt.Errorf("%sACCESS_KEY_ID and %sSECRET_ACCESS_KEY must be set together", prefix, prefix)
	}
	if cfg.SessionToken != "" && cfg.AccessKeyID == "" {
		return cfg, fmt.Errorf("%sSESSION_TOKEN requires location access keys", prefix)
	}
	if cfg.Provider == "r2" {
		if cfg.Endpoint == "" {
			return cfg, fmt.Errorf("%sENDPOINT is required for R2", prefix)
		}
		if cfg.AccessKeyID == "" {
			return cfg, fmt.Errorf("%sACCESS_KEY_ID and %sSECRET_ACCESS_KEY are required for R2", prefix, prefix)
		}
		cfg.Region = "auto"
	}
	if raw := value("USE_PATH_STYLE"); raw != "" {
		enabled, err := strconv.ParseBool(raw)
		if err != nil {
			return cfg, fmt.Errorf("%sUSE_PATH_STYLE must be a boolean", prefix)
		}
		cfg.UsePathStyle = enabled
	}
	return cfg, nil
}
