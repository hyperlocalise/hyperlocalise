package main

import (
	"fmt"
	"testing"
)

func BenchmarkGlossaryParseCSV(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			var content string
			{
				concepts := sampleGlossaryExportConcepts(size)
				body, err := serializeGlossaryCSV(concepts)
				if err != nil {
					b.Fatal(err)
				}
				content = string(body)
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(content)))
			b.ResetTimer()
			for b.Loop() {
				concepts, diagnostics := parseGlossaryCSV(content)
				if len(concepts) != size || len(diagnostics) != 0 {
					b.Fatalf("concepts=%d diagnostics=%d", len(concepts), len(diagnostics))
				}
			}
		})
	}
}

func BenchmarkGlossarySerializeCSV(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			concepts := sampleGlossaryExportConcepts(size)
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				body, err := serializeGlossaryCSV(concepts)
				if err != nil || len(body) == 0 {
					b.Fatal(err)
				}
			}
		})
	}
}

func BenchmarkGlossarySerializeTBX(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			concepts := sampleGlossaryExportConcepts(size)
			g := glossaryRecord{ID: testGlossaryID, Name: "Benchmark", SourceLocale: "en-US"}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				body, err := serializeGlossaryTBX(g, concepts)
				if err != nil || len(body) == 0 {
					b.Fatal(err)
				}
			}
		})
	}
}

func BenchmarkGlossarySerializeXLSX(b *testing.B) {
	for _, size := range []int{100, 1000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			concepts := sampleGlossaryExportConcepts(size)
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				body, err := serializeGlossaryXLSX(concepts)
				if err != nil || len(body) < 100 {
					b.Fatal(err)
				}
			}
		})
	}
}

func BenchmarkGlossaryParseTBX(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			concepts := sampleGlossaryExportConcepts(size)
			g := glossaryRecord{ID: testGlossaryID, Name: "Benchmark", SourceLocale: "en-US"}
			body, err := serializeGlossaryTBX(g, concepts)
			if err != nil {
				b.Fatal(err)
			}
			content := string(body)
			b.ReportAllocs()
			b.SetBytes(int64(len(content)))
			b.ResetTimer()
			for b.Loop() {
				parsed, diagnostics := parseGlossaryTBX(content)
				if len(parsed) != size || len(diagnostics) != 0 {
					b.Fatalf("concepts=%d diagnostics=%d", len(parsed), len(diagnostics))
				}
			}
		})
	}
}

func BenchmarkGlossaryPageCursor(b *testing.B) {
	cursor := encodeGlossaryPageCursor("2026-01-01T00:00:00.000Z", testGlossaryID)
	b.ReportAllocs()
	for b.Loop() {
		updatedAt, id, err := decodeGlossaryPageCursor(cursor)
		if err != nil || updatedAt == "" || id == "" {
			b.Fatal(err)
		}
	}
}
