package evalset

import (
	"fmt"
	"strings"
)

// Dataset defines a translation evaluation dataset.
type Dataset struct {
	Version     string            `yaml:"version,omitempty" json:"version,omitempty"`
	Metadata    map[string]string `yaml:"metadata,omitempty" json:"metadata,omitempty"`
	Experiments []Experiment      `yaml:"experiments,omitempty" json:"experiments,omitempty"`
	Judge       Judge             `yaml:"judge,omitempty" json:"judge,omitempty"`
	Tests       []Test            `yaml:"tests" json:"tests"`
	Cases       []Case            `yaml:"-" json:"-"`
}

// Experiment defines one model/provider/prompt variant in the eval set itself.
type Experiment struct {
	ID       string `yaml:"id,omitempty" json:"id,omitempty"`
	Profile  string `yaml:"profile,omitempty" json:"profile,omitempty"`
	Provider string `yaml:"provider,omitempty" json:"provider,omitempty"`
	Model    string `yaml:"model,omitempty" json:"model,omitempty"`
	Prompt   string `yaml:"prompt,omitempty" json:"prompt,omitempty"`
}

// Judge defines the dataset-level judge configuration for eval scoring.
type Judge struct {
	Provider   string   `yaml:"provider,omitempty" json:"provider,omitempty"`
	Model      string   `yaml:"model,omitempty" json:"model,omitempty"`
	Prompt     string   `yaml:"prompt,omitempty" json:"prompt,omitempty"`
	Assertions []string `yaml:"assertions,omitempty" json:"assertions,omitempty"`
}

// Test groups one source string with one or more locale-specific variants.
type Test struct {
	ID      string         `yaml:"id" json:"id"`
	Vars    Vars           `yaml:"vars" json:"vars"`
	Assert  []Assertion    `yaml:"assert,omitempty" json:"assert,omitempty"`
	Locales []LocaleTarget `yaml:"locales" json:"locales"`
}

// Vars defines the shared source inputs for a test.
type Vars struct {
	Source    string `yaml:"source,omitempty" json:"source,omitempty"`
	Query     string `yaml:"query,omitempty" json:"query,omitempty"`
	Context   string `yaml:"context,omitempty" json:"context,omitempty"`
	Reference string `yaml:"reference,omitempty" json:"reference,omitempty"`
}

// LocaleTarget defines one locale-specific execution variant.
type LocaleTarget struct {
	Locale    string      `yaml:"locale" json:"locale"`
	Context   string      `yaml:"context,omitempty" json:"context,omitempty"`
	Reference string      `yaml:"reference,omitempty" json:"reference,omitempty"`
	Assert    []Assertion `yaml:"assert,omitempty" json:"assert,omitempty"`
}

// Assertion defines one deterministic or judge-backed expectation.
type Assertion struct {
	Type      string   `yaml:"type" json:"type"`
	Value     string   `yaml:"value,omitempty" json:"value,omitempty"`
	Threshold *float64 `yaml:"threshold,omitempty" json:"threshold,omitempty"`
}

// Case defines a single runnable evaluation sample.
type Case struct {
	ID           string
	Source       string
	TargetLocale string
	Context      string
	Reference    string
	Assertions   []Assertion
}

// Validate checks the dataset semantics and expands grouped tests into runnable cases.
func (d *Dataset) Validate() error {
	if len(d.Tests) == 0 {
		return fmt.Errorf("tests: must not be empty")
	}
	if err := validateExperiments(d.Experiments); err != nil {
		return err
	}
	if err := validateJudge(d.Judge); err != nil {
		return err
	}

	ids := make(map[string]struct{}, len(d.Tests))
	cases := make([]Case, 0)
	for i, test := range d.Tests {
		normalizedID := strings.TrimSpace(test.ID)
		if normalizedID == "" {
			return fmt.Errorf("tests[%d].id: must not be empty", i)
		}
		if _, exists := ids[normalizedID]; exists {
			return fmt.Errorf("tests[%d].id: duplicate id %q", i, test.ID)
		}
		ids[normalizedID] = struct{}{}

		source := strings.TrimSpace(test.Vars.Source)
		if source == "" {
			source = strings.TrimSpace(test.Vars.Query)
		}
		if source == "" {
			return fmt.Errorf("tests[%d].vars.source: must not be empty", i)
		}
		if len(test.Locales) == 0 {
			return fmt.Errorf("tests[%d].locales: must not be empty", i)
		}
		if err := validateAssertions(fmt.Sprintf("tests[%d].assert", i), test.Assert); err != nil {
			return err
		}

		for j, locale := range test.Locales {
			targetLocale := strings.TrimSpace(locale.Locale)
			if targetLocale == "" {
				return fmt.Errorf("tests[%d].locales[%d].locale: must not be empty", i, j)
			}
			if err := validateAssertions(fmt.Sprintf("tests[%d].locales[%d].assert", i, j), locale.Assert); err != nil {
				return err
			}

			context := firstNonEmpty(locale.Context, test.Vars.Context)
			reference := firstNonEmpty(locale.Reference, test.Vars.Reference)
			assertions := append([]Assertion(nil), test.Assert...)
			assertions = append(assertions, locale.Assert...)

			cases = append(cases, Case{
				ID:           fmt.Sprintf("%s::%s", normalizedID, targetLocale),
				Source:       source,
				TargetLocale: targetLocale,
				Context:      strings.TrimSpace(context),
				Reference:    strings.TrimSpace(reference),
				Assertions:   assertions,
			})
		}
	}

	d.Cases = cases
	return nil
}

func validateExperiments(experiments []Experiment) error {
	ids := map[string]struct{}{}
	for i, experiment := range experiments {
		if strings.TrimSpace(experiment.Provider) == "" {
			return fmt.Errorf("experiments[%d].provider: must not be empty", i)
		}
		if strings.TrimSpace(experiment.Model) == "" {
			return fmt.Errorf("experiments[%d].model: must not be empty", i)
		}
		if id := strings.TrimSpace(experiment.ID); id != "" {
			if _, exists := ids[id]; exists {
				return fmt.Errorf("experiments[%d].id: duplicate id %q", i, experiment.ID)
			}
			ids[id] = struct{}{}
		}
	}
	return nil
}

func validateAssertions(path string, assertions []Assertion) error {
	for i, assertion := range assertions {
		kind := normalizeAssertionType(assertion.Type)
		if kind == "" {
			return fmt.Errorf("%s[%d].type: must not be empty", path, i)
		}
		switch kind {
		case "contains", "not_contains", "equals":
			if strings.TrimSpace(assertion.Value) == "" {
				return fmt.Errorf("%s[%d].value: must not be empty", path, i)
			}
		default:
			if _, ok := judgeAssertionType(kind); !ok {
				return fmt.Errorf("%s[%d].type: unsupported assertion type %q", path, i, assertion.Type)
			}
			if assertion.Threshold == nil {
				return fmt.Errorf("%s[%d].threshold: is required for judge assertions", path, i)
			}
			if *assertion.Threshold < 0 || *assertion.Threshold > 1 {
				return fmt.Errorf("%s[%d].threshold: must be within [0,1]", path, i)
			}
		}
	}
	return nil
}

func validateJudge(judge Judge) error {
	if strings.TrimSpace(judge.Provider) == "" && strings.TrimSpace(judge.Model) == "" && strings.TrimSpace(judge.Prompt) == "" && len(judge.Assertions) == 0 {
		return nil
	}
	for i, assertion := range judge.Assertions {
		kind := normalizeAssertionType(assertion)
		if kind == "" {
			return fmt.Errorf("judge.assertions[%d]: must not be empty", i)
		}
		if _, ok := judgeAssertionType(kind); !ok {
			return fmt.Errorf("judge.assertions[%d]: unsupported assertion type %q", i, assertion)
		}
	}
	return nil
}

func judgeAssertionType(value string) (string, bool) {
	switch normalizeAssertionType(value) {
	case "judge.translation_quality", "llm-rubric":
		return "llm-rubric", true
	case "judge.factuality", "factuality":
		return "factuality", true
	case "judge.g_eval", "g-eval":
		return "g-eval", true
	case "judge.model_graded_closedqa", "model-graded-closedqa":
		return "model-graded-closedqa", true
	case "judge.answer_relevance", "answer-relevance":
		return "answer-relevance", true
	case "judge.context_faithfulness", "context-faithfulness":
		return "context-faithfulness", true
	case "judge.context_recall", "context-recall":
		return "context-recall", true
	case "judge.context_relevance", "context-relevance":
		return "answer-relevance", true
	default:
		return "", false
	}
}

func normalizeAssertionType(value string) string {
	kind := strings.ToLower(strings.TrimSpace(value))
	kind = strings.ReplaceAll(kind, "-", "_")
	if strings.HasPrefix(kind, "judge.") {
		return kind
	}
	switch kind {
	case "llm_rubric":
		return "llm-rubric"
	case "g_eval":
		return "g-eval"
	case "model_graded_closedqa":
		return "model-graded-closedqa"
	case "answer_relevance":
		return "answer-relevance"
	case "context_faithfulness":
		return "context-faithfulness"
	case "context_recall":
		return "context-recall"
	case "context_relevance":
		return "context-relevance"
	case "not_contains":
		return "not_contains"
	default:
		return kind
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
