package scoring

import "testing"

func BenchmarkEvaluatorEvaluate(b *testing.B) {
	e := NewEvaluator()
	source := "{count, plural, one {# file} other {# files}} uploaded by <strong>{name}</strong>"
	translated := "{count, plural, one {# fichier} other {# fichiers}} telecharges par <strong>{name}</strong>"
	reference := "{count, plural, one {# fichier} other {# fichiers}} telecharges par <strong>{name}</strong>"
	tags := []string{"ui", "forbidden:legacy-login"}

	b.ReportAllocs()
	for b.Loop() {
		_ = e.Evaluate(source, translated, reference, "fr-FR", tags)
	}
}

func BenchmarkPlaceholderTokens(b *testing.B) {
	input := "{count, plural, one {# file} other {# files}} uploaded by {name} with %s and {name}"

	b.ReportAllocs()
	for b.Loop() {
		_ = placeholderTokens(input)
	}
}

func BenchmarkTokenF1(b *testing.B) {
	reference := "Payer maintenant et confirmer votre abonnement annuel"
	candidate := "Payer maintenant pour confirmer votre abonnement annuel"

	b.ReportAllocs()
	for b.Loop() {
		_ = tokenF1(reference, candidate)
	}
}

func BenchmarkNormalizeText(b *testing.B) {
	input := "  Save <strong>{name}</strong> now, please.  "

	b.ReportAllocs()
	for b.Loop() {
		_ = normalizeText(input)
	}
}
