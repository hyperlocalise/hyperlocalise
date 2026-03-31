package cmd

import (
	"bytes"
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/spf13/cobra"
)

func TestNotifyIfUpdateAvailable(t *testing.T) {
	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return semver.MustParse("2.0.0"), nil
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	errBuffer := &bytes.Buffer{}
	command := &cobra.Command{}
	command.SetErr(errBuffer)

	notifyIfUpdateAvailable(command, "v1.0.0")

	output := errBuffer.String()
	if !strings.Contains(output, "Update available 1.0.0 → 2.0.0") {
		t.Fatalf("expected update banner in output, got %q", output)
	}

	if !strings.Contains(output, "Upgrade: hyperlocalise update") {
		t.Fatalf("expected upgrade command in output, got %q", output)
	}
}

func TestNotifyIfUpdateAvailableUsesAliasNameWhenInvokedAsHL(t *testing.T) {
	originalArg0 := os.Args[0]
	os.Args[0] = "hl"
	t.Cleanup(func() {
		os.Args[0] = originalArg0
	})

	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return semver.MustParse("2.0.0"), nil
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	errBuffer := &bytes.Buffer{}
	command := &cobra.Command{}
	command.SetErr(errBuffer)

	notifyIfUpdateAvailable(command, "v1.0.0")

	if !strings.Contains(errBuffer.String(), "Upgrade: hl update") {
		t.Fatalf("expected hl upgrade command in output, got %q", errBuffer.String())
	}
}

func TestNotifyIfUpdateAvailableSkipsWhenLookupFails(t *testing.T) {
	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return nil, errors.New("network down")
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	errBuffer := &bytes.Buffer{}
	command := &cobra.Command{}
	command.SetErr(errBuffer)

	notifyIfUpdateAvailable(command, "v1.0.0")

	if got := errBuffer.String(); got != "" {
		t.Fatalf("expected no output when update check fails, got %q", got)
	}
}

func TestNormalizeSemver(t *testing.T) {
	testCases := []struct {
		name    string
		version string
		valid   bool
		want    string
	}{
		{name: "prefixed", version: "v1.2.3", valid: true, want: "1.2.3"},
		{name: "plain", version: "1.2.3", valid: true, want: "1.2.3"},
		{name: "invalid", version: "dev", valid: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, ok := normalizeSemver(tc.version)

			if ok != tc.valid {
				t.Fatalf("valid mismatch: got %t want %t", ok, tc.valid)
			}

			if tc.valid && parsed.String() != tc.want {
				t.Fatalf("version mismatch: got %q want %q", parsed.String(), tc.want)
			}
		})
	}
}
