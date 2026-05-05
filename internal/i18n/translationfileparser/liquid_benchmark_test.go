package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkLiquidParserCanonicalCorpus(b *testing.B) {
	corpus := makeLiquidBenchmarkCorpus(50, 10)
	totalBytes := 0
	for _, content := range corpus {
		totalBytes += len(content)
	}
	if totalBytes >= 1_000_000 {
		b.Fatalf("expected benchmark corpus under 1MB, got %d bytes", totalBytes)
	}

	parser := LiquidParser{}
	b.ReportAllocs()
	b.SetBytes(int64(totalBytes))
	b.ResetTimer()

	for range b.N {
		for _, content := range corpus {
			values, err := parser.Parse(content)
			if err != nil {
				b.Fatalf("parse benchmark corpus: %v", err)
			}
			if len(values) != 10 {
				b.Fatalf("expected 10 keys per file, got %d", len(values))
			}
		}
	}
}

func makeLiquidBenchmarkCorpus(fileCount, keysPerFile int) [][]byte {
	corpus := make([][]byte, 0, fileCount)
	for fileIndex := range fileCount {
		var builder strings.Builder
		for keyIndex := range keysPerFile {
			_, _ = fmt.Fprintf(&builder, "<p>Benchmark copy %02d-%02d for {{ customer.first_name }}.</p>\n", fileIndex, keyIndex)
		}
		corpus = append(corpus, []byte(builder.String()))
	}
	return corpus
}
