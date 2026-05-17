package cmd

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lokalise"
)

func TestLokaliseGlossaryDownloadWritesCSVToStdout(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseGlossaryCSVWriter
	defer func() {
		newLokaliseGlossaryCSVWriter = oldFactory
	}()
	fake := &fakeLokaliseGlossaryCSVWriter{}
	var gotCfg lokalise.Config
	newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
		gotCfg = cfg
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download", "--project-id", "proj-1", "--language", "fr"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise glossary download: %v", err)
	}
	if gotCfg.ProjectID != "proj-1" || gotCfg.APIToken != "secret" {
		t.Fatalf("config = %+v, want project/token resolved", gotCfg)
	}
	if fake.req.ProjectID != "proj-1" || fake.req.APIToken != "secret" {
		t.Fatalf("request = %+v, want project/token", fake.req)
	}
	if strings.Join(fake.req.Locales, ",") != "fr" {
		t.Fatalf("locales = %v, want fr", fake.req.Locales)
	}
	if got := out.String(); got != "project_id,term_id,source_term\nproj-1,1,Checkout\n" {
		t.Fatalf("output = %q", got)
	}
}

func TestLokaliseGlossaryDownloadWritesCSVToFile(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseGlossaryCSVWriter
	defer func() {
		newLokaliseGlossaryCSVWriter = oldFactory
	}()
	newLokaliseGlossaryCSVWriter = func(lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
		return &fakeLokaliseGlossaryCSVWriter{}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "glossary.csv")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download", "--project-id", "proj-1", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise glossary download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if got := string(content); !strings.Contains(got, "proj-1,1,Checkout") {
		t.Fatalf("unexpected file content: %q", got)
	}
	if !strings.Contains(out.String(), "terms=1 rows=1") {
		t.Fatalf("unexpected summary: %q", out.String())
	}
}

func TestLokaliseGlossaryDownloadPreservesExistingFileOnError(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseGlossaryCSVWriter
	defer func() {
		newLokaliseGlossaryCSVWriter = oldFactory
	}()
	newLokaliseGlossaryCSVWriter = func(lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
		return &fakeLokaliseGlossaryCSVWriter{err: errors.New("api failed")}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "glossary.csv")
	if err := os.WriteFile(outputPath, []byte("existing glossary\n"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download", "--project-id", "proj-1", "--output", outputPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected command error")
	}
	content, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		t.Fatalf("read output file: %v", readErr)
	}
	if got, want := string(content), "existing glossary\n"; got != want {
		t.Fatalf("output file = %q, want %q", got, want)
	}
}

func TestLokaliseGlossaryDownloadRequiresProjectIDOrConfig(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing project error")
	}
	if !strings.Contains(err.Error(), "--project-id is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

type fakeLokaliseGlossaryCSVWriter struct {
	req lokalise.GlossaryDownloadInput
	err error
}

func (f *fakeLokaliseGlossaryCSVWriter) WriteGlossaryCSV(_ context.Context, req lokalise.GlossaryDownloadInput, w io.Writer) (lokalise.GlossaryDownloadResult, error) {
	f.req = req
	if f.err != nil {
		return lokalise.GlossaryDownloadResult{}, f.err
	}
	if _, err := io.WriteString(w, "project_id,term_id,source_term\n"+req.ProjectID+",1,Checkout\n"); err != nil {
		return lokalise.GlossaryDownloadResult{}, err
	}
	return lokalise.GlossaryDownloadResult{Terms: 1, Rows: 1}, nil
}
