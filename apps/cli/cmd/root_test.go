package cmd

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"

	"github.com/Masterminds/semver/v3"
)

func TestRootCommandOutput(t *testing.T) {
	cmd := newRootCmd("")
	b := bytes.NewBufferString("")

	cmd.SetArgs([]string{"-h"})
	cmd.SetOut(b)

	cmdErr := cmd.Execute()
	if cmdErr != nil {
		t.Fatalf("run root help: %v", cmdErr)
	}

	if !strings.Contains(b.String(), "Usage:") {
		t.Fatalf("expected help output, got %q", b.String())
	}
}

func TestRootVersionDoesNotRequireConfigFile(t *testing.T) {
	t.Chdir(t.TempDir())
	originalFetcher := latestVersionFetcher
	latestVersionFetcher = func(context.Context) (*semver.Version, error) {
		return semver.MustParse("1.0.0"), nil
	}
	t.Cleanup(func() {
		latestVersionFetcher = originalFetcher
	})

	cmd := newRootCmd("v1.0.0")
	b := bytes.NewBufferString("")

	cmd.SetArgs([]string{"version"})
	cmd.SetOut(b)

	cmdErr := cmd.Execute()
	if cmdErr != nil {
		t.Fatalf("run version without config file: %v", cmdErr)
	}

	if got, want := b.String(), "hyperlocalise: v1.0.0\n"; got != want {
		t.Fatalf("unexpected output: got %q want %q", got, want)
	}
}

func TestRootHelpUsesAliasNameWhenInvokedAsHL(t *testing.T) {
	originalArg0 := os.Args[0]
	os.Args[0] = "hl"
	t.Cleanup(func() {
		os.Args[0] = originalArg0
	})

	cmd := newRootCmd("")
	b := bytes.NewBufferString("")

	cmd.SetArgs([]string{"-h"})
	cmd.SetOut(b)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("run root help: %v", err)
	}

	if !strings.Contains(b.String(), "Usage:\n  hl") {
		t.Fatalf("expected hl usage output, got %q", b.String())
	}
}

func TestRootHelpIncludesFixCommand(t *testing.T) {
	cmd := newRootCmd("")
	b := bytes.NewBufferString("")

	cmd.SetArgs([]string{"-h"})
	cmd.SetOut(b)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("run root help: %v", err)
	}

	if !strings.Contains(b.String(), "fix") {
		t.Fatalf("expected help to include fix command, got %q", b.String())
	}
}
