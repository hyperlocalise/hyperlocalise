package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkSubtitleParser(b *testing.B) {
	content := generateLargeSRT(1000)
	parser := SubtitleParser{Kind: SubtitleSRT}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkSubtitleMarshal(b *testing.B) {
	content := generateLargeSRT(1000)
	values := map[string]string{}
	for i := 1; i <= 1000; i++ {
		values[fmt.Sprintf("srt.%04d", i)] = fmt.Sprintf("value%d-translated", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalSubtitles(content, values, SubtitleSRT)
	}
}

func generateLargeSRT(n int) []byte {
	var sb strings.Builder
	for i := 1; i <= n; i++ {
		fmt.Fprintf(&sb, "%d\n00:00:%02d,000 --> 00:00:%02d,500\ncue %d payload\n\n", i, i%60, (i%60)+1, i)
	}
	return []byte(sb.String())
}
