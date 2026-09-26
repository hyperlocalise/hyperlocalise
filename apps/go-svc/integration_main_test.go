package main

import (
	"fmt"
	"os"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
)

func TestMain(m *testing.M) {
	if os.Getenv(testenv.EnvIntegration) == "1" {
		if os.Getenv(testenv.EnvDatabaseURL) == "" || os.Getenv(testenv.EnvValkeyURL) == "" {
			fmt.Fprintf(os.Stderr, "%s=1 requires %s and %s\n", testenv.EnvIntegration, testenv.EnvDatabaseURL, testenv.EnvValkeyURL)
			os.Exit(1)
		}
	}
	os.Exit(m.Run())
}
