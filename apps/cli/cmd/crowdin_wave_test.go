package cmd

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
)

func writeMinimalCrowdinConfig(t *testing.T, dir string) {
	t.Helper()
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")
	if err := os.MkdirAll(filepath.Join(dir, "src"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "src", "messages.json"), []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id_env: CROWDIN_PROJECT_ID
api_token_env: CROWDIN_PERSONAL_TOKEN
files:
  - source: /src/messages.json
    translation: /locales/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}
}

func TestCrowdinConfigSourcesAndTranslations(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	oldResolver := newCrowdinLocaleResolver
	t.Cleanup(func() { newCrowdinLocaleResolver = oldResolver })
	newCrowdinLocaleResolver = func(crowdinstorage.Config) (crowdinLocaleResolver, error) {
		return fakeCrowdinLocaleResolver{}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "config", "sources"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("config sources: %v", err)
	}
	if !strings.Contains(out.String(), "messages.json") {
		t.Fatalf("sources output = %q", out.String())
	}

	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "config", "translations", "--language", "fr"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("config translations: %v", err)
	}
	if !strings.Contains(out.String(), "language=fr") || !strings.Contains(out.String(), filepath.Join("locales", "fr-FR", "messages.json")) {
		t.Fatalf("translations output = %q", out.String())
	}
}

func TestCrowdinBranchListAndAdd(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	oldList := newCrowdinBranchLister
	oldAdd := newCrowdinBranchAdder
	t.Cleanup(func() {
		newCrowdinBranchLister = oldList
		newCrowdinBranchAdder = oldAdd
	})
	newCrowdinBranchLister = func(crowdinstorage.Config) (crowdinBranchLister, error) {
		return fakeCrowdinBranchClient{branches: []crowdinstorage.Branch{{ID: 7, Name: "main"}}}, nil
	}
	newCrowdinBranchAdder = func(crowdinstorage.Config) (crowdinBranchAdder, error) {
		return fakeCrowdinBranchClient{}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "branch", "list"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("branch list: %v", err)
	}
	if got, want := out.String(), "id=7 name=main\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}

	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "branch", "add", "--name", "feature/login"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("branch add: %v", err)
	}
	if got, want := out.String(), "id=11 name=feature/login\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestCrowdinFileAndLanguageList(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	oldFiles := newCrowdinFileLister
	oldLangs := newCrowdinLanguageLister
	t.Cleanup(func() {
		newCrowdinFileLister = oldFiles
		newCrowdinLanguageLister = oldLangs
	})
	newCrowdinFileLister = func(crowdinstorage.Config) (crowdinFileLister, error) {
		return fakeCrowdinDiscoveryClient{}, nil
	}
	newCrowdinLanguageLister = func(crowdinstorage.Config) (crowdinLanguageLister, error) {
		return fakeCrowdinDiscoveryClient{}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "file", "list"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("file list: %v", err)
	}
	if got, want := out.String(), "id=17 name=messages.json path=/messages.json\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}

	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "language", "list"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("language list: %v", err)
	}
	if got, want := out.String(), "id=vi name=Vietnamese locale=vi-VN\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestCrowdinGlossaryAndTMUpload(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)
	tmxPath := filepath.Join(dir, "memory.tmx")
	tbxPath := filepath.Join(dir, "terms.tbx")
	if err := os.WriteFile(tmxPath, []byte("<tmx></tmx>"), 0o644); err != nil {
		t.Fatalf("write tmx: %v", err)
	}
	if err := os.WriteFile(tbxPath, []byte("<tbx></tbx>"), 0o644); err != nil {
		t.Fatalf("write tbx: %v", err)
	}

	oldTM := newCrowdinTranslationMemoryImporter
	oldGlossary := newCrowdinGlossaryImporter
	t.Cleanup(func() {
		newCrowdinTranslationMemoryImporter = oldTM
		newCrowdinGlossaryImporter = oldGlossary
	})
	newCrowdinTranslationMemoryImporter = func(crowdinstorage.Config) (crowdinTranslationMemoryImporter, error) {
		return fakeCrowdinImporter{}, nil
	}
	newCrowdinGlossaryImporter = func(crowdinstorage.Config) (crowdinGlossaryImporter, error) {
		return fakeCrowdinImporter{}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "tm", "upload", "--tm-id", "4", "--input", tmxPath})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("tm upload: %v", err)
	}
	if !strings.Contains(out.String(), "imported tm_id=4 status=finished") {
		t.Fatalf("output = %q", out.String())
	}

	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "glossary", "upload", "--glossary-id", "77", "--input", tbxPath})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("glossary upload: %v", err)
	}
	if !strings.Contains(out.String(), "imported glossary_id=77 status=finished") {
		t.Fatalf("output = %q", out.String())
	}
}

type fakeCrowdinLocaleResolver struct{}

func (fakeCrowdinLocaleResolver) ResolveLocales(_ context.Context, _ string, requested []string) ([]crowdinstorage.ResolvedLocale, error) {
	if len(requested) == 0 {
		return []crowdinstorage.ResolvedLocale{{LanguageID: "fr", Locale: "fr-FR"}}, nil
	}
	out := make([]crowdinstorage.ResolvedLocale, 0, len(requested))
	for _, language := range requested {
		locale := language
		if language == "fr" {
			locale = "fr-FR"
		}
		out = append(out, crowdinstorage.ResolvedLocale{LanguageID: language, Locale: locale})
	}
	return out, nil
}

type fakeCrowdinBranchClient struct {
	branches []crowdinstorage.Branch
}

func (f fakeCrowdinBranchClient) ListBranches(context.Context, string) ([]crowdinstorage.Branch, error) {
	return f.branches, nil
}

func (fakeCrowdinBranchClient) AddBranch(_ context.Context, _ string, name string) (crowdinstorage.Branch, error) {
	return crowdinstorage.Branch{ID: 11, Name: name}, nil
}

type fakeCrowdinDiscoveryClient struct{}

func (fakeCrowdinDiscoveryClient) ListProjectFiles(context.Context, string, string) ([]crowdinstorage.ProjectFile, error) {
	return []crowdinstorage.ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}}, nil
}

func (fakeCrowdinDiscoveryClient) ListProjectLanguages(context.Context, string) ([]crowdinstorage.ProjectLanguage, error) {
	return []crowdinstorage.ProjectLanguage{{ID: "vi", Name: "Vietnamese", Locale: "vi-VN"}}, nil
}

func (fakeCrowdinDiscoveryClient) ListAllLanguages(context.Context) ([]crowdinstorage.ProjectLanguage, error) {
	return []crowdinstorage.ProjectLanguage{{ID: "en", Name: "English", Locale: "en-US"}}, nil
}

type fakeCrowdinImporter struct{}

func (fakeCrowdinImporter) ImportTranslationMemoryFile(context.Context, int, string) (crowdinstorage.ImportResult, error) {
	return crowdinstorage.ImportResult{Identifier: "imp-1", Status: "finished", Progress: 100}, nil
}

func (fakeCrowdinImporter) ImportGlossaryFile(context.Context, int, string) (crowdinstorage.ImportResult, error) {
	return crowdinstorage.ImportResult{Identifier: "g-1", Status: "finished", Progress: 100}, nil
}
