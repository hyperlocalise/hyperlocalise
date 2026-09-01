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

func TestCrowdinStringList(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	old := newCrowdinSourceStringLister
	t.Cleanup(func() { newCrowdinSourceStringLister = old })
	newCrowdinSourceStringLister = func(crowdinstorage.Config) (crowdinSourceStringLister, error) {
		return fakeCrowdinSourceStringLister{}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "string", "list", "--file", "messages.json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("string list: %v", err)
	}
	if got, want := out.String(), "id=9 identifier=hello text=Hello context=home\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestCrowdinFileUploadDownloadDelete(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)
	inputPath := filepath.Join(dir, "local.json")
	if err := os.WriteFile(inputPath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write input: %v", err)
	}

	old := newCrowdinFileOpsClient
	t.Cleanup(func() { newCrowdinFileOpsClient = old })
	client := &fakeCrowdinFileOpsClient{content: []byte(`{"hello":"Hello"}`)}
	newCrowdinFileOpsClient = func(crowdinstorage.Config) (crowdinFileOpsClient, error) {
		return client, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "file", "upload", inputPath, "--dest", "/messages.json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("file upload: %v", err)
	}
	if !strings.Contains(out.String(), "file_id=17") {
		t.Fatalf("upload output = %q", out.String())
	}

	dest := filepath.Join(dir, "out.json")
	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "file", "download", "messages.json", "--dest", dest})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("file download: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if string(got) != `{"hello":"Hello"}` {
		t.Fatalf("downloaded = %q", got)
	}

	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "file", "delete", "messages.json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("file delete: %v", err)
	}
	if got, want := out.String(), "deleted path=messages.json\n"; got != want {
		t.Fatalf("delete output = %q, want %q", got, want)
	}
}

func TestCrowdinFileUploadUsesYAMLBranchUnlessFlagOverrides(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id_env: CROWDIN_PROJECT_ID
api_token_env: CROWDIN_PERSONAL_TOKEN
branch: feature/login
files:
  - source: /src/messages.json
    translation: /locales/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}
	inputPath := filepath.Join(dir, "local.json")
	if err := os.WriteFile(inputPath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write input: %v", err)
	}

	old := newCrowdinFileOpsClient
	t.Cleanup(func() { newCrowdinFileOpsClient = old })
	client := &fakeCrowdinFileOpsClient{}
	newCrowdinFileOpsClient = func(crowdinstorage.Config) (crowdinFileOpsClient, error) {
		return client, nil
	}

	cmd := newRootCmd("")
	cmd.SetOut(bytes.NewBuffer(nil))
	cmd.SetArgs([]string{"crowdin", "file", "upload", inputPath, "--dest", "/messages.json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("file upload: %v", err)
	}
	if client.branch != "feature/login" {
		t.Fatalf("branch = %q, want feature/login", client.branch)
	}

	cmd = newRootCmd("")
	cmd.SetOut(bytes.NewBuffer(nil))
	cmd.SetArgs([]string{"crowdin", "file", "upload", inputPath, "--dest", "/messages.json", "--branch", "hotfix"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("file upload override: %v", err)
	}
	if client.branch != "hotfix" {
		t.Fatalf("branch = %q, want hotfix", client.branch)
	}
}

func TestCrowdinAutoTranslateDirectoryIDIgnoresYAMLBranch(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id_env: CROWDIN_PROJECT_ID
api_token_env: CROWDIN_PERSONAL_TOKEN
branch: feature/login
files:
  - source: /src/messages.json
    translation: /locales/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	old := newCrowdinAutoTranslator
	t.Cleanup(func() { newCrowdinAutoTranslator = old })
	client := &fakeCrowdinAutoTranslator{}
	newCrowdinAutoTranslator = func(crowdinstorage.Config) (crowdinAutoTranslator, error) {
		return client, nil
	}

	cmd := newRootCmd("")
	cmd.SetOut(bytes.NewBuffer(nil))
	cmd.SetArgs([]string{"crowdin", "auto-translate", "--language", "fr", "--directory-id", "9"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("auto-translate directory: %v", err)
	}
	if client.in.DirectoryID != 9 {
		t.Fatalf("directory id = %d, want 9", client.in.DirectoryID)
	}
	if client.in.Branch != "" {
		t.Fatalf("branch = %q, want empty when --directory-id is the scope", client.in.Branch)
	}

	cmd = newRootCmd("")
	cmd.SetOut(bytes.NewBuffer(nil))
	cmd.SetArgs([]string{"crowdin", "auto-translate", "--language", "fr", "--file", "messages.json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("auto-translate file: %v", err)
	}
	if client.in.Branch != "feature/login" {
		t.Fatalf("branch = %q, want feature/login for file resolve", client.in.Branch)
	}
}

func TestCrowdinAutoTranslate(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	old := newCrowdinAutoTranslator
	t.Cleanup(func() { newCrowdinAutoTranslator = old })
	newCrowdinAutoTranslator = func(crowdinstorage.Config) (crowdinAutoTranslator, error) {
		return &fakeCrowdinAutoTranslator{}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "auto-translate", "--language", "fr", "--file", "messages.json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("auto-translate: %v", err)
	}
	if !strings.Contains(out.String(), "status=finished") {
		t.Fatalf("output = %q", out.String())
	}

	cmd = newRootCmd("")
	out = bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "pre-translate", "--language", "fr", "--branch", "feature/login"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("pre-translate alias: %v", err)
	}
}

func TestCrowdinAutoTranslateRejectsMT(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"crowdin", "auto-translate", "--language", "fr", "--file", "messages.json", "--method", "mt"})
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "tm only") {
		t.Fatalf("error = %v", err)
	}
}

func TestCrowdinAutoTranslateRejectsBlankLanguage(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"crowdin", "auto-translate", "--language", " ", "--file", "messages.json"})
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "at least one language is required") {
		t.Fatalf("error = %v", err)
	}
}

func TestCrowdinFileDownloadRejectsBlankLanguage(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeMinimalCrowdinConfig(t, dir)

	old := newCrowdinFileOpsClient
	t.Cleanup(func() { newCrowdinFileOpsClient = old })
	newCrowdinFileOpsClient = func(crowdinstorage.Config) (crowdinFileOpsClient, error) {
		return &fakeCrowdinFileOpsClient{content: []byte(`{"hello":"Hello"}`)}, nil
	}

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"crowdin", "file", "download", "messages.json", "--language", " "})
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "language is required") {
		t.Fatalf("error = %v", err)
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

type fakeCrowdinSourceStringLister struct{}

func (fakeCrowdinSourceStringLister) ListProjectSourceStrings(_ context.Context, _ crowdinstorage.ListSourceStringsInput) ([]crowdinstorage.SourceStringRow, error) {
	return []crowdinstorage.SourceStringRow{{
		ID:         9,
		Identifier: "hello",
		Text:       "Hello",
		Context:    "home",
		FileID:     17,
	}}, nil
}

type fakeCrowdinFileOpsClient struct {
	content []byte
	branch  string
}

func (f *fakeCrowdinFileOpsClient) UploadProjectFile(_ context.Context, _, branch, _, _ string) (int, error) {
	f.branch = branch
	return 17, nil
}

func (f *fakeCrowdinFileOpsClient) DownloadProjectFile(_ context.Context, _, branch, _, _ string) ([]byte, error) {
	f.branch = branch
	return f.content, nil
}

func (f *fakeCrowdinFileOpsClient) DeleteProjectFile(_ context.Context, _, branch, _ string) error {
	f.branch = branch
	return nil
}

type fakeCrowdinAutoTranslator struct {
	in crowdinstorage.PreTranslationInput
}

func (f *fakeCrowdinAutoTranslator) ApplyPreTranslationAndWait(_ context.Context, in crowdinstorage.PreTranslationInput) (crowdinstorage.PreTranslationResult, error) {
	f.in = in
	return crowdinstorage.PreTranslationResult{Identifier: "pre-1", Status: "finished", Progress: 100}, nil
}
