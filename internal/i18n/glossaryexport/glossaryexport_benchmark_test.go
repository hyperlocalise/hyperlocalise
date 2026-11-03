package glossaryexport

import (
	"strconv"
	"testing"
	"time"
)

func BenchmarkSerializeCSV(b *testing.B) {
	concepts := generateConcepts(10000)

	b.ReportAllocs()
	for b.Loop() {
		_, _ = SerializeCSV(concepts)
	}
}

func BenchmarkSerializeTBX(b *testing.B) {
	concepts := generateConcepts(10000)

	b.ReportAllocs()
	for b.Loop() {
		_, _ = SerializeTBX("en", "Benchmark Glossary", concepts)
	}
}

func BenchmarkSerializeXLSX(b *testing.B) {
	concepts := generateConcepts(10000)

	b.ReportAllocs()
	for b.Loop() {
		_, _ = SerializeXLSX(concepts)
	}
}

func generateConcepts(n int) []Concept {
	ts := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	locales := []string{"en", "fr", "ja"}
	concepts := make([]Concept, n)
	for i := range concepts {
		id := strconv.Itoa(i)
		terms := make([]Term, len(locales))
		for j, locale := range locales {
			terms[j] = Term{
				ID:           "term-" + id + "-" + locale,
				ConceptID:    "concept-" + id,
				Locale:       locale,
				Term:         "term " + id + " " + locale,
				Description:  "description for term " + id,
				PartOfSpeech: "noun",
				Status:       "approved",
				Provenance:   "manual",
				ReviewStatus: "reviewed",
				CreatedAt:    ts,
				UpdatedAt:    ts,
			}
		}
		concepts[i] = Concept{
			ID:           "concept-" + id,
			PrimaryTerm:  "term " + id,
			Subject:      "Subject & <" + id + ">",
			Definition:   "=definition " + id,
			Translatable: i%2 == 0,
			CreatedAt:    ts,
			UpdatedAt:    ts,
			Terms:        terms,
		}
	}
	return concepts
}
