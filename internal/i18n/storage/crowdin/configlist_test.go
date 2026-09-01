package crowdin

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestListConfiguredSourcesAndTranslations(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "src"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	sourcePath := filepath.Join(dir, "src", "messages.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	cfg := storage.FileWorkflowConfig{
		BasePath: dir,
		Files: []storage.FileGroupSpec{{
			Source:                  "/src/messages.json",
			Translation:             "/locales/%locale%/%original_file_name%",
			ExcludedTargetLanguages: []string{"de"},
		}},
	}

	sources, err := ListConfiguredSources(cfg)
	if err != nil {
		t.Fatalf("list sources: %v", err)
	}
	if !reflect.DeepEqual(sources, []ConfiguredSource{{Path: sourcePath}}) {
		t.Fatalf("sources = %#v", sources)
	}

	translations, err := ListConfiguredTranslationPaths(cfg, []ResolvedLocale{
		{LanguageID: "fr", Locale: "fr"},
		{LanguageID: "de", Locale: "de"},
	})
	if err != nil {
		t.Fatalf("list translations: %v", err)
	}
	want := []ConfiguredTranslation{{
		LanguageID: "fr",
		Locale:     "fr",
		Path:       filepath.Join(dir, "locales", "fr", "messages.json"),
	}}
	if !reflect.DeepEqual(translations, want) {
		t.Fatalf("translations = %#v, want %#v", translations, want)
	}

	mapped, err := ListConfiguredTranslationPaths(cfg, []ResolvedLocale{
		{LanguageID: "fr", Locale: "fr-FR"},
		{LanguageID: "de", Locale: "de-DE"},
	})
	if err != nil {
		t.Fatalf("list mapped translations: %v", err)
	}
	wantMapped := []ConfiguredTranslation{{
		LanguageID: "fr",
		Locale:     "fr-FR",
		Path:       filepath.Join(dir, "locales", "fr-FR", "messages.json"),
	}}
	if !reflect.DeepEqual(mapped, wantMapped) {
		t.Fatalf("mapped translations = %#v, want %#v", mapped, wantMapped)
	}
}

func TestListConfiguredTranslationPathsUsesLanguagesMappingAndEmptyBasePath(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(cwd)
	})

	dir := t.TempDir()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	if err := os.MkdirAll("src", 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join("src", "messages.json"), []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	cfg := storage.FileWorkflowConfig{
		BasePath: "",
		Files: []storage.FileGroupSpec{{
			Source:      "/src/messages.json",
			Translation: "/dist/%two_letters_code%/%original_file_name%",
			LanguagesMapping: map[string]map[string]string{
				"two_letters_code": {
					"fr-FR": "french",
				},
			},
		}},
	}

	sources, err := ListConfiguredSources(cfg)
	if err != nil {
		t.Fatalf("list sources: %v", err)
	}
	// Empty BasePath defaults to "."; returned paths stay relative to that root.
	if !reflect.DeepEqual(sources, []ConfiguredSource{{Path: filepath.Join("src", "messages.json")}}) {
		t.Fatalf("sources = %#v", sources)
	}

	translations, err := ListConfiguredTranslationPaths(cfg, []ResolvedLocale{
		{LanguageID: "fr", Locale: "fr-FR"},
	})
	if err != nil {
		t.Fatalf("list translations: %v", err)
	}
	want := []ConfiguredTranslation{{
		LanguageID: "fr",
		Locale:     "fr-FR",
		Path:       filepath.Join("dist", "french", "messages.json"),
	}}
	if !reflect.DeepEqual(translations, want) {
		t.Fatalf("translations = %#v, want %#v", translations, want)
	}
}

func TestListConfiguredTranslationPathsRejectsPathEscape(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "src"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	sourcePath := filepath.Join(dir, "src", "messages.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	cfg := storage.FileWorkflowConfig{
		BasePath: dir,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/messages.json",
			Translation: "/../../outside/%locale%/%original_file_name%",
		}},
	}

	_, err := ListConfiguredTranslationPaths(cfg, []ResolvedLocale{
		{LanguageID: "fr", Locale: "fr"},
	})
	if err == nil {
		t.Fatal("expected path escape error")
	}
}
