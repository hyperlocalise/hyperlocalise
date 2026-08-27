package evalset

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoad_FileAndYAMLDecodeErrors(t *testing.T) {
	t.Run("missing file returns open error", func(t *testing.T) {
		_, err := Load(filepath.Join(t.TempDir(), "nonexistent.yaml"))
		if err == nil {
			t.Fatalf("expected error loading non-existent file, got nil")
		}
		if !strings.Contains(err.Error(), "open evalset:") {
			t.Fatalf("expected error to contain 'open evalset:', got %q", err.Error())
		}
	})

	t.Run("malformed yaml returns decode error", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "malformed.yaml")
		content := "tests:\n  - id: [invalid yaml syntax:"
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("failed to write malformed yaml: %v", err)
		}

		_, err := Load(path)
		if err == nil {
			t.Fatalf("expected error loading malformed yaml, got nil")
		}
		if !strings.Contains(err.Error(), "decode evalset:") {
			t.Fatalf("expected error to contain 'decode evalset:', got %q", err.Error())
		}
	})
}

func TestDataset_Validate_AssertionEdgeCases(t *testing.T) {
	tests := []struct {
		name        string
		assertion   Assertion
		errContains string
	}{
		{
			name:        "equals missing value",
			assertion:   Assertion{Type: "equals"},
			errContains: "value: must not be empty",
		},
		{
			name:        "not_contains missing value",
			assertion:   Assertion{Type: "not_contains"},
			errContains: "value: must not be empty",
		},
		{
			name:        "contains missing value",
			assertion:   Assertion{Type: "contains"},
			errContains: "value: must not be empty",
		},
		{
			name:        "judge assertion negative threshold",
			assertion:   Assertion{Type: "judge.g_eval", Threshold: float64Ptr(-0.1)},
			errContains: "threshold: must be within [0,1]",
		},
		{
			name:        "judge assertion threshold above 1",
			assertion:   Assertion{Type: "judge.translation_quality", Threshold: float64Ptr(1.05)},
			errContains: "threshold: must be within [0,1]",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ds := &Dataset{
				Tests: []Test{
					{
						ID: "test-1",
						Vars: Vars{
							Source: "Hello",
						},
						Assert: []Assertion{tc.assertion},
						Locales: []LocaleTarget{
							{Locale: "fr-FR"},
						},
					},
				},
			}

			err := ds.Validate()
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.errContains)
			}
			if !strings.Contains(err.Error(), tc.errContains) {
				t.Fatalf("expected error containing %q, got %q", tc.errContains, err.Error())
			}
		})
	}
}

func TestDataset_Validate_SupportedAssertionTypes(t *testing.T) {
	typesToTest := []string{
		"contains",
		"not_contains",
		"equals",
		"llm_rubric",
		"llm-rubric",
		"judge.translation_quality",
		"g_eval",
		"g-eval",
		"judge.g_eval",
		"factuality",
		"judge.factuality",
		"context_relevance",
		"context-relevance",
		"judge.context_relevance",
		"answer_relevance",
		"answer-relevance",
		"judge.answer_relevance",
		"context_faithfulness",
		"context-faithfulness",
		"judge.context_faithfulness",
		"context_recall",
		"context-recall",
		"judge.context_recall",
		"model_graded_closedqa",
		"model-graded-closedqa",
		"judge.model_graded_closedqa",
	}

	for _, kind := range typesToTest {
		t.Run(kind, func(t *testing.T) {
			ast := Assertion{Type: kind}
			if kind == "contains" || kind == "not_contains" || kind == "equals" {
				ast.Value = "expected"
			} else {
				ast.Threshold = float64Ptr(0.8)
			}

			ds := &Dataset{
				Tests: []Test{
					{
						ID: "valid-assertion",
						Vars: Vars{
							Source: "Save",
						},
						Assert: []Assertion{ast},
						Locales: []LocaleTarget{
							{Locale: "fr-FR"},
						},
					},
				},
			}

			if err := ds.Validate(); err != nil {
				t.Fatalf("expected valid assertion for type %q, got error: %v", kind, err)
			}
		})
	}
}

func TestDataset_Validate_ContextAndReferencePrecedence(t *testing.T) {
	ds := &Dataset{
		Tests: []Test{
			{
				ID: "checkout-button",
				Vars: Vars{
					Source:    "Submit",
					Context:   "Default button context",
					Reference: "Default reference string",
				},
				Locales: []LocaleTarget{
					{
						Locale: "fr-FR",
						// No context or reference override; should fall back to Vars
					},
					{
						Locale:    "de-DE",
						Context:   "Specific German context",
						Reference: "Absenden",
					},
				},
			},
		},
	}

	if err := ds.Validate(); err != nil {
		t.Fatalf("Validate() failed: %v", err)
	}

	if len(ds.Cases) != 2 {
		t.Fatalf("expected 2 cases, got %d", len(ds.Cases))
	}

	var frCase, deCase Case
	for _, c := range ds.Cases {
		switch c.TargetLocale {
		case "fr-FR":
			frCase = c
		case "de-DE":
			deCase = c
		}
	}

	if frCase.Context != "Default button context" {
		t.Errorf("fr-FR case expected fallback context 'Default button context', got %q", frCase.Context)
	}
	if frCase.Reference != "Default reference string" {
		t.Errorf("fr-FR case expected fallback reference 'Default reference string', got %q", frCase.Reference)
	}

	if deCase.Context != "Specific German context" {
		t.Errorf("de-DE case expected overridden context 'Specific German context', got %q", deCase.Context)
	}
	if deCase.Reference != "Absenden" {
		t.Errorf("de-DE case expected overridden reference 'Absenden', got %q", deCase.Reference)
	}
}

func TestDataset_Validate_JudgeConfigEdgeCases(t *testing.T) {
	t.Run("empty judge struct passes validation", func(t *testing.T) {
		ds := &Dataset{
			Judge: Judge{},
			Tests: []Test{
				{
					ID:   "test-1",
					Vars: Vars{Source: "Hello"},
					Locales: []LocaleTarget{
						{Locale: "fr-FR"},
					},
				},
			},
		}

		if err := ds.Validate(); err != nil {
			t.Fatalf("expected empty judge config to pass validation, got: %v", err)
		}
	})

	t.Run("empty judge assertion string fails validation", func(t *testing.T) {
		ds := &Dataset{
			Judge: Judge{
				Assertions: []string{"  "},
			},
			Tests: []Test{
				{
					ID:   "test-1",
					Vars: Vars{Source: "Hello"},
					Locales: []LocaleTarget{
						{Locale: "fr-FR"},
					},
				},
			},
		}

		err := ds.Validate()
		if err == nil {
			t.Fatalf("expected error for empty judge assertion string, got nil")
		}
		if !strings.Contains(err.Error(), "judge.assertions[0]: must not be empty") {
			t.Fatalf("expected error containing 'judge.assertions[0]: must not be empty', got %q", err.Error())
		}
	})
}

func float64Ptr(v float64) *float64 {
	return &v
}
