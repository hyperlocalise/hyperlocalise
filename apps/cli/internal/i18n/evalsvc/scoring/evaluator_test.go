package scoring

import (
	"slices"
	"testing"
)

func TestEvaluatorDetectsPlaceholderDrop(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Hello {name}, total is %s", "Bonjour, total est %s", "", "fr-FR", nil)

	if got.PlaceholderIntegrity >= 1 {
		t.Fatalf("expected placeholder integrity penalty, got %+v", got)
	}
	if !slices.Contains(got.HardFails, HardFailPlaceholderDrop) {
		t.Fatalf("expected placeholder hard fail, got %+v", got.HardFails)
	}
	if got.WeightedAggregate != 0 {
		t.Fatalf("expected hard-failed weighted aggregate=0, got %v", got.WeightedAggregate)
	}
}

func TestEvaluatorHandlesICUPluralIntegrity(t *testing.T) {
	e := NewEvaluator()
	source := "{count, plural, one {# file} other {# files}} uploaded by {name}"
	translated := "{count, plural, one {# fichier} other {# fichiers}} téléchargés par {name}"

	got := e.Evaluate(source, translated, "", "fr-FR", nil)
	if got.PlaceholderIntegrity != 1 {
		t.Fatalf("expected full ICU placeholder integrity, got %+v", got)
	}
	if len(got.HardFails) != 0 {
		t.Fatalf("expected no hard fails, got %+v", got.HardFails)
	}
}

func TestEvaluatorDetectsMalformedICU(t *testing.T) {
	e := NewEvaluator()
	source := "{count, plural, one {One} other {Many}}"
	translated := "{count, plural, one {Uno} other {Muchos}"

	got := e.Evaluate(source, translated, "", "es-ES", nil)
	if !slices.Contains(got.HardFails, HardFailMalformedICU) {
		t.Fatalf("expected malformed ICU hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorReferenceScores(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Pay now", "Payer maintenant", "Payer maintenant!", "fr-FR", nil)

	if got.ReferenceExact == nil || *got.ReferenceExact != 0 {
		t.Fatalf("expected exact mismatch, got %+v", got.ReferenceExact)
	}
	if got.ReferenceNormalized == nil || *got.ReferenceNormalized != 1 {
		t.Fatalf("expected normalized match, got %+v", got.ReferenceNormalized)
	}
	if got.ReferenceSimilarity == nil || *got.ReferenceSimilarity < 0.9 {
		t.Fatalf("expected high similarity score, got %+v", got.ReferenceSimilarity)
	}
}

func TestEvaluatorHardFailSourceCopied(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Save", "Save", "Enregistrer", "fr-FR", nil)
	if !slices.Contains(got.HardFails, HardFailSourceCopied) {
		t.Fatalf("expected source copied hard fail, got %+v", got.HardFails)
	}
	if got.WeightedAggregate != 0 {
		t.Fatalf("expected aggregate hard fail to 0, got %v", got.WeightedAggregate)
	}
}

func TestEvaluatorDetectsTagMismatch(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Click <strong>here</strong>", "Cliquez ici", "", "fr-FR", nil)
	if !slices.Contains(got.HardFails, HardFailTagMismatch) {
		t.Fatalf("expected tag mismatch hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorLengthBoundForUITags(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Save", "Veuillez cliquer pour enregistrer vos changements immédiatement", "", "fr-FR", []string{"ui"})
	if !slices.Contains(got.HardFails, HardFailLengthOutOfBound) {
		t.Fatalf("expected length hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorForbiddenTerms(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Sign in", "Use legacy-login to enter", "", "en-US", []string{"forbidden:legacy-login"})
	if !slices.Contains(got.HardFails, HardFailForbiddenTerms) {
		t.Fatalf("expected forbidden term hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorForbiddenTermsCaseInsensitiveTag(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Sign in", "Use legacy-login to enter", "", "en-US", []string{"Forbidden:legacy-login"})
	if !slices.Contains(got.HardFails, HardFailForbiddenTerms) {
		t.Fatalf("expected forbidden term hard fail for mixed-case tag, got %+v", got.HardFails)
	}
}

func TestEvaluatorSkipsTagGatedWeightsWithoutTags(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Pay now", "Payer maintenant", "Payer maintenant!", "fr-FR", nil)
	if slices.Contains(got.HardFails, HardFailLengthOutOfBound) || slices.Contains(got.HardFails, HardFailForbiddenTerms) {
		t.Fatalf("expected tag-gated hard fails to stay disabled without tags, got %+v", got.HardFails)
	}
	if got.LengthCompliance != 1 || got.TermCompliance != 1 {
		t.Fatalf("expected raw tag-gated scores to stay neutral without tags, got %+v", got)
	}
	if got.ReferenceSimilarity == nil || got.WeightedAggregate != 0.882 {
		t.Fatalf("expected weighted aggregate to exclude tag-gated weights when tags are absent, got %+v", got)
	}
}

func TestEvaluatorDetectsDuplicateTagLoss(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Use **bold** and **more bold**", "Utilisez **gras** et plus gras", "", "fr-FR", nil)
	if !slices.Contains(got.HardFails, HardFailTagMismatch) {
		t.Fatalf("expected duplicate markdown tag loss to hard fail, got %+v", got.HardFails)
	}
}

func TestEvaluatorDetectsInvalidCyrillicLocaleScript(t *testing.T) {
	e := NewEvaluator()
	got := e.Evaluate("Hello", "Privet", "", "ru-RU", nil)
	if !slices.Contains(got.HardFails, HardFailInvalidLocale) {
		t.Fatalf("expected locale script hard fail for non-Cyrillic text, got %+v", got.HardFails)
	}
}

func TestTokenF1_EdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		reference string
		candidate string
		expected  float64
	}{
		{
			name:      "exact match",
			reference: "hello world",
			candidate: "hello world",
			expected:  1.0,
		},
		{
			name:      "empty strings",
			reference: "",
			candidate: "",
			expected:  1.0,
		},
		{
			name:      "one empty string",
			reference: "hello",
			candidate: "",
			expected:  0.0,
		},
		{
			name:      "no common tokens",
			reference: "hello world",
			candidate: "foo bar",
			expected:  0.0,
		},
		{
			name:      "partial match with duplicates in reference",
			reference: "apple apple banana",
			candidate: "apple banana",
			expected:  0.8, // precision = 2/2 = 1.0, recall = 2/3 = 0.666..., F1 = 2 * 1 * 0.666 / (1 + 0.666) = 0.8
		},
		{
			name:      "partial match with duplicates in candidate",
			reference: "apple banana",
			candidate: "apple apple banana",
			expected:  0.8, // precision = 2/3 = 0.666..., recall = 2/2 = 1.0, F1 = 0.8
		},
		{
			name:      "case-insensitivity and punctuation normalization in tokenF1",
			reference: "Hello, World!",
			candidate: "hello world",
			expected:  1.0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := tokenF1(tc.reference, tc.candidate)
			if got != tc.expected {
				t.Errorf("expected F1 score %v, got %v", tc.expected, got)
			}
		})
	}
}
