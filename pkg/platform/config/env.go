package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type ServiceConfig struct {
	ServiceName       string
	Host              string
	Port              int
	ReadHeaderTimeout time.Duration
	ShutdownTimeout   time.Duration
}

func (c ServiceConfig) Address() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func LoadServiceConfig(serviceName string, defaultPort int) ServiceConfig {
	return ServiceConfig{
		ServiceName:       serviceName,
		Host:              lookupEnv("HYPERLOCALISE_HOST", "0.0.0.0"),
		Port:              lookupEnvInt("HYPERLOCALISE_PORT", defaultPort),
		ReadHeaderTimeout: 5 * time.Second,
		ShutdownTimeout:   10 * time.Second,
	}
}

func lookupEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}

	return fallback
}

func lookupEnvInt(key string, fallback int) int {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}
