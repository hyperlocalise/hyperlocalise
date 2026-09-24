package main

import (
	"fmt"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
)

func BenchmarkMemoryParseCSV(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			content := sampleMemoryCSV(size)
			b.ReportAllocs()
			b.SetBytes(int64(len(content)))
			b.ResetTimer()
			for b.Loop() {
				candidates := parseMemoryCSV(content)
				if len(candidates) != size {
					b.Fatalf("candidates=%d", len(candidates))
				}
			}
		})
	}
}

func BenchmarkMemoryParseTMX(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			content := sampleMemoryTMX(size)
			b.ReportAllocs()
			b.SetBytes(int64(len(content)))
			b.ResetTimer()
			for b.Loop() {
				candidates, issues, _ := parseMemoryTMX(content)
				if len(candidates) != size || len(issues) != 0 {
					b.Fatalf("candidates=%d issues=%d", len(candidates), len(issues))
				}
			}
		})
	}
}

func BenchmarkMemorySerializeTMX(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			rows := make([]editor_export.Row, size)
			for i := 0; i < size; i++ {
				rows[i] = editor_export.Row{
					Key:          fmt.Sprintf("tu-%d", i),
					SourceLocale: "en-US",
					TargetLocale: "fr-FR",
					SourceText:   fmt.Sprintf("Hello %d", i),
					TargetText:   fmt.Sprintf("Bonjour %d", i),
				}
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				body := editor_export.SerializeTMX(rows)
				if len(body) == 0 {
					b.Fatal("empty tmx")
				}
			}
		})
	}
}

func BenchmarkNormalizeMemorySourceText(b *testing.B) {
	samples := []string{
		"hello world",
		"  Hello   WORLD  ",
		"CAFÉ",
		"Brand\u00a0Name\tWith\nWhitespace",
	}
	for _, sample := range samples {
		b.Run(sample, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(sample)))
			for b.Loop() {
				if normalizeMemorySourceText(sample) == "" && sample != "" {
					b.Fatal("unexpected empty normalization")
				}
			}
		})
	}
}
