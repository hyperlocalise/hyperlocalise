package memoryinterchange

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
)

var memoryBenchmarkSizes = []int{1000, 10000}

func BenchmarkParseTMX(b *testing.B) {
	for _, n := range memoryBenchmarkSizes {
		b.Run(strconv.Itoa(n), func(b *testing.B) {
			content := generateBenchmarkTMX(n)
			candidates, issues, _ := ParseTMX(content)
			if len(candidates) != n*2 || len(issues) != 0 {
				b.Fatalf("fixture produced %d candidates and %d issues, want %d and 0", len(candidates), len(issues), n*2)
			}
			b.SetBytes(int64(len(content)))
			b.ReportAllocs()
			for b.Loop() {
				_, _, _ = ParseTMX(content)
			}
		})
	}
}

func BenchmarkParseCSV(b *testing.B) {
	for _, n := range memoryBenchmarkSizes {
		b.Run(strconv.Itoa(n), func(b *testing.B) {
			content := generateBenchmarkCSV(n)
			candidates, issues := ParseCSV(content)
			if len(candidates) != n || len(issues) != 0 {
				b.Fatalf("fixture produced %d candidates and %d issues, want %d and 0", len(candidates), len(issues), n)
			}
			b.SetBytes(int64(len(content)))
			b.ReportAllocs()
			for b.Loop() {
				_, _ = ParseCSV(content)
			}
		})
	}
}

func BenchmarkSerializeCSV(b *testing.B) {
	rows := generateBenchmarkCandidates(10000, false)
	b.ReportAllocs()
	for b.Loop() {
		if _, err := SerializeCSV(rows); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSerializeTMX(b *testing.B) {
	rows := generateBenchmarkCandidates(10000, true)
	b.ReportAllocs()
	for b.Loop() {
		_ = SerializeTMX(rows)
	}
}

func BenchmarkNormalizeSourceText(b *testing.B) {
	inputs := map[string]string{
		"ascii-normalized": "save your changes before leaving the page",
		"ascii-dirty":      "  Save   your Changes\tbefore leaving\nthe PAGE  ",
		"unicode":          "  Ｓａｖｅ   Änderungen speichern bevor Sie gehen  ",
	}
	for name, input := range inputs {
		b.Run(name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = NormalizeSourceText(input)
			}
		})
	}
}

// BenchmarkPlanImportActions covers the three shapes an import takes: a fresh
// memory (all creates), re-importing a TMX with tuids (all updates by external
// key), and re-importing without keys (all source-key collisions).
func BenchmarkPlanImportActions(b *testing.B) {
	for _, n := range memoryBenchmarkSizes {
		candidates := generateBenchmarkCandidates(n, true)
		byExternal, bySource := existingEntriesFor(candidates)

		b.Run(fmt.Sprintf("create/%d", n), func(b *testing.B) {
			benchmarkPlan(b, candidates, map[string]ExistingEntry{}, map[string]ExistingEntry{}, ImportActionCreate)
		})
		b.Run(fmt.Sprintf("update-by-external-key/%d", n), func(b *testing.B) {
			benchmarkPlan(b, candidates, byExternal, bySource, ImportActionUpdate)
		})
		keyless := generateBenchmarkCandidates(n, false)
		b.Run(fmt.Sprintf("skip-source-duplicate/%d", n), func(b *testing.B) {
			benchmarkPlan(b, keyless, map[string]ExistingEntry{}, bySource, ImportActionSkip)
		})
	}
}

func benchmarkPlan(b *testing.B, candidates []Candidate, byExternal, bySource map[string]ExistingEntry, want ImportAction) {
	b.Helper()
	planned := PlanImportActions(candidates, byExternal, bySource)
	for _, item := range planned {
		if item.Action != want {
			b.Fatalf("fixture planned %q for %+v, want %q", item.Action, item.Candidate, want)
		}
	}
	b.ReportAllocs()
	for b.Loop() {
		_ = PlanImportActions(candidates, byExternal, bySource)
	}
}

func existingEntriesFor(candidates []Candidate) (map[string]ExistingEntry, map[string]ExistingEntry) {
	byExternal := make(map[string]ExistingEntry, len(candidates))
	bySource := make(map[string]ExistingEntry, len(candidates))
	for i, candidate := range candidates {
		id := "entry_" + strconv.Itoa(i)
		key := *candidate.ExternalKey
		entry := ExistingEntry{ID: id, ExternalKey: &key}
		byExternal[key] = entry
		bySource[SourceLookupKey(candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText)] = entry
	}
	return byExternal, bySource
}

func generateBenchmarkCandidates(n int, withKeys bool) []Candidate {
	out := make([]Candidate, 0, n)
	for i := 0; i < n; i++ {
		candidate := Candidate{
			SourceLocale: "en",
			TargetLocale: "fr-FR",
			SourceText:   fmt.Sprintf("Save your changes before leaving page %d", i),
			TargetText:   fmt.Sprintf("Enregistrez vos modifications avant de quitter la page %d", i),
			MatchScore:   100,
			UnitIndex:    i + 1,
		}
		if withKeys {
			key := fmt.Sprintf("tmx:unit-%d:fr-FR", i)
			candidate.ExternalKey = &key
		}
		out = append(out, candidate)
	}
	return out
}

// generateBenchmarkTMX builds n translation units, each with one source and
// two target tuvs, so it yields 2n candidates.
func generateBenchmarkTMX(n int) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<tmx version="1.4"><header creationtool="bench" segtype="sentence" o-tmf="none" adminlang="en" srclang="en" datatype="plaintext"/>` + "\n<body>\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, `<tu tuid="unit-%d"><prop type="x-context">screen %d</prop>`, i, i)
		fmt.Fprintf(&sb, `<tuv xml:lang="en"><seg>Save your changes &amp; continue to step %d</seg></tuv>`, i)
		fmt.Fprintf(&sb, `<tuv xml:lang="fr-FR"><seg>Enregistrez vos modifications et passez à l'étape %d</seg></tuv>`, i)
		fmt.Fprintf(&sb, `<tuv xml:lang="de-DE"><seg>Speichern Sie Ihre Änderungen und fahren Sie mit Schritt %d fort</seg></tuv>`, i)
		sb.WriteString("</tu>\n")
	}
	sb.WriteString("</body></tmx>\n")
	return sb.String()
}

func generateBenchmarkCSV(n int) string {
	var sb strings.Builder
	sb.WriteString("\ufeffsource_locale,target_locale,source_text,target_text,match_score\r\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "en,fr-FR,\"Save your changes, then continue to step %d\",\"Enregistrez, puis passez à l'étape %d\",%d\r\n", i, i, 80+i%21)
	}
	return sb.String()
}
