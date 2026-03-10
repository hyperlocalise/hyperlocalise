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
