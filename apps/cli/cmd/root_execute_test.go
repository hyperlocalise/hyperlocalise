package cmd

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Masterminds/semver/v3"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func stubLatestVersionFetcher(t *testing.T, fetch func(context.Context) (*semver.Version, error)) {
	t.Helper()
	original := latestVersionFetcher
	latestVersionFetcher = fetch
	t.Cleanup(func() { latestVersionFetcher = original })
}

func TestRootCommandWithoutArgsPrintsHelp(t *testing.T) {
	stubLatestVersionFetcher(t, func(context.Context) (*semver.Version, error) {
		return nil, errors.New("offline")
	})

	root := newRootCmd("1.0.0")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs(nil)
	if err := root.Execute(); err != nil {
		t.Fatalf("execute root: %v", err)
	}
	if !strings.Contains(out.String(), "High-performance localization CLI written in Go") || !strings.Contains(out.String(), "Available Commands:") {
		t.Fatalf("expected help output, got %q", out.String())
	}
}

func TestRootCommandFailsWhenEnvFileIsDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, ".env"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	root := newRootCmd("test")
	root.SetOut(&bytes.Buffer{})
	root.SetErr(&bytes.Buffer{})
	root.SetArgs([]string{"version"})
	err := root.Execute()
	if err == nil || !strings.HasPrefix(err.Error(), "load env files: ") || !strings.Contains(err.Error(), "must be a file") {
		t.Fatalf("expected env loading error, got %v", err)
	}
}

func TestCommandNameUsesHLAlias(t *testing.T) {
	original := os.Args
	t.Cleanup(func() { os.Args = original })

	os.Args = []string{"/usr/local/bin/hl"}
	if got := commandName(); got != "hl" {
		t.Fatalf("commandName = %q, want hl", got)
	}
	if got := newRootCmd("test").Use; got != "hl" {
		t.Fatalf("root Use = %q, want hl", got)
	}

	os.Args = []string{"/usr/local/bin/hyperlocalise"}
	if got := commandName(); got != defaultCommandName {
		t.Fatalf("commandName = %q, want %s", got, defaultCommandName)
	}
}

func TestExecuteSetsCLIVersionAndWrapsErrors(t *testing.T) {
	originalArgs := os.Args
	originalVersion := config.CurrentCLIVersion()
	t.Cleanup(func() {
		os.Args = originalArgs
		config.SetCLIVersion(originalVersion)
	})
	stubLatestVersionFetcher(t, func(context.Context) (*semver.Version, error) {
		return nil, errors.New("offline")
	})
	t.Chdir(t.TempDir())

	os.Args = []string{"hyperlocalise", "update", "--help"}
	if err := Execute(" 9.9.9 "); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if got := config.CurrentCLIVersion(); got != "9.9.9" {
		t.Fatalf("CLI version = %q, want 9.9.9", got)
	}

	os.Args = []string{"hyperlocalise", "definitely-not-a-command"}
	err := Execute("9.9.9")
	if err == nil || !strings.HasPrefix(err.Error(), "error executing root command: ") {
		t.Fatalf("expected wrapped error, got %v", err)
	}
}
