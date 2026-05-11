package cmd

import (
	"bytes"
	"strings"
	"testing"
)

func TestSmartlingGlossaryDownloadFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "glossary", "download"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "glossary", "download", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--account-uid") ||
		!strings.Contains(out.String(), "--glossary-uid") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingTMDownloadFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "tm", "download"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "tm", "download", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--account-uid") ||
		!strings.Contains(out.String(), "--tm-uid") ||
		!strings.Contains(out.String(), "--source-language") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingUploadSourcesFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "upload", "sources"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "upload", "sources", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--project-id") ||
		!strings.Contains(out.String(), "--file") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingUploadSourcesDryRun(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "upload", "sources",
		"--project-id", "123",
		"--file", "test.json",
		"--dry-run",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if !strings.Contains(out.String(), "dry-run action=smartling-upload-source file=test.json") {
		t.Errorf("unexpected output: %s", out.String())
	}
}
