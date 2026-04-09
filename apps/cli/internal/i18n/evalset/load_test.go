package evalset

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadYAMLAndExpandLocales(t *testing.T) {
	path := filepath.Join(t.TempDir(), "evalset.yaml")
	content := `
version: "1"
metadata:
  owner: l10n
judge:
  provider: openai
  model: gpt-5.2
  prompt: "Score translation quality."
  assertions:
    - llm-rubric
    - factuality
experiments:
  - id: openai-mini
    provider: openai
    model: gpt-4.1-mini
tests:
  - id: checkout-cta
    vars:
      source: "Save account settings"
      context: "Primary CTA"
    assert:
      - type: judge.translation_quality
        threshold: 0.85
    locales:
      - locale: fr-FR
        reference: "Enregistrer les parametres du compte"
        assert:
          - type: contains
            value: "compte"
      - locale: de-DE
        reference: "Kontoeinstellungen speichern"
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write evalset: %v", err)
	}

	dataset, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if dataset == nil {
		t.Fatalf("Load() dataset is nil")
	} else {
		if len(dataset.Cases) != 2 {
			t.Fatalf("expected 2 expanded cases, got %d", len(dataset.Cases))
		}
		if len(dataset.Experiments) != 1 || dataset.Experiments[0].ID != "openai-mini" {
			t.Fatalf("expected dataset experiments to load, got %+v", dataset.Experiments)
		}
		if dataset.Judge.Provider != "openai" || dataset.Judge.Model != "gpt-5.2" || len(dataset.Judge.Assertions) != 2 {
			t.Fatalf("expected dataset judge config to load, got %+v", dataset.Judge)
		}
		if dataset.Cases[0].ID != "checkout-cta::de-DE" && dataset.Cases[0].ID != "checkout-cta::fr-FR" {
			t.Fatalf("unexpected expanded case id: %q", dataset.Cases[0].ID)
		}
		var fr Case
		for _, tc := range dataset.Cases {
			if tc.TargetLocale == "fr-FR" {
				fr = tc
				break
			}
		}
		if fr.Reference != "Enregistrer les parametres du compte" {
			t.Fatalf("unexpected locale reference: %+v", fr)
		}
		if len(fr.Assertions) != 2 {
			t.Fatalf("expected shared+locale assertions on fr case, got %+v", fr.Assertions)
		}
	}
}

func TestLoadSupportsQueryAlias(t *testing.T) {
	path := filepath.Join(t.TempDir(), "evalset.yaml")
	content := `
tests:
  - id: capital-france
    vars:
      query: "What is the capital of France?"
    locales:
      - locale: en-US
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write evalset: %v", err)
	}

	dataset, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if dataset.Cases[0].Source != "What is the capital of France?" {
		t.Fatalf("expected query alias to populate source, got %+v", dataset.Cases[0])
	}
}

func TestLoadValidationErrors(t *testing.T) {
	testCases := []struct {
		name        string
		content     string
		errContains string
	}{
		{
			name: "reject unsupported judge assertion",
			content: `
judge:
  assertions:
    - nope
tests:
  - id: a
    vars:
      source: "Hello"
    locales:
      - locale: fr-FR
`,
			errContains: "judge.assertions[0]: unsupported assertion type",
		},
		{
			name: "reject experiment without provider",
			content: `
experiments:
  - model: gpt-4.1-mini
tests:
  - id: a
    vars:
      source: "Hello"
    locales:
      - locale: fr-FR
`,
			errContains: "experiments[0].provider: must not be empty",
		},
		{
			name: "reject duplicate experiment ids",
			content: `
experiments:
  - id: a
    provider: openai
    model: gpt-4.1-mini
  - id: a
    provider: anthropic
    model: claude-sonnet-4-5
tests:
  - id: test-a
    vars:
      source: "Hello"
    locales:
      - locale: fr-FR
`,
			errContains: "duplicate id",
		},
		{
			name: "reject unknown fields",
			content: `
tests:
  - id: a
    vars:
      source: "Hello"
      unknown: true
    locales:
      - locale: es-ES
`,
			errContains: "field unknown not found",
		},
		{
			name: "require tests",
			content: `
tests: []
`,
			errContains: "tests: must not be empty",
		},
		{
			name: "require id",
			content: `
tests:
  - id: " "
    vars:
      source: "Hello"
    locales:
      - locale: fr-FR
`,
			errContains: "id: must not be empty",
		},
		{
			name: "require source",
			content: `
tests:
  - id: a
    vars: {}
    locales:
      - locale: fr-FR
`,
			errContains: "vars.source: must not be empty",
		},
		{
			name: "require locales",
			content: `
tests:
  - id: a
    vars:
      source: "Hello"
    locales: []
`,
			errContains: "locales: must not be empty",
		},
		{
			name: "require locale",
			content: `
tests:
  - id: a
    vars:
      source: "Hello"
    locales:
      - locale: ""
`,
			errContains: "locale: must not be empty",
		},
		{
			name: "reject unsupported assertion type",
			content: `
tests:
  - id: a
    vars:
      source: "Hello"
    assert:
      - type: nope
        threshold: 0.5
    locales:
      - locale: fr-FR
`,
			errContains: "unsupported assertion type",
		},
		{
			name: "judge assertions need threshold",
			content: `
tests:
  - id: a
    vars:
      source: "Hello"
    assert:
      - type: judge.factuality
    locales:
      - locale: fr-FR
`,
			errContains: "threshold: is required",
		},
		{
			name: "deterministic assertions need value",
			content: `
tests:
  - id: a
    vars:
      source: "Hello"
    assert:
      - type: contains
    locales:
      - locale: fr-FR
`,
			errContains: "value: must not be empty",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "evalset.yaml")
			if err := os.WriteFile(path, []byte(tc.content), 0o644); err != nil {
				t.Fatalf("write evalset: %v", err)
			}

			_, err := Load(path)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.errContains)
			}
			if !strings.Contains(err.Error(), tc.errContains) {
				t.Fatalf("expected error containing %q, got %q", tc.errContains, err.Error())
			}
		})
	}
}
