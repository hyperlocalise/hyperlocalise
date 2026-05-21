package icuparser

import (
	"testing"
)

func BenchmarkParseLiteral(b *testing.B) {
	input := "This is a very long literal text that should be processed in chunks by the optimized parser. It contains no special characters until the very end."
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = Parse(input, nil)
	}
}

func BenchmarkParseComplex(b *testing.B) {
	input := "{gender, select, male {He has {count, plural, one {1 item} other {# items}} in his bag.} female {She has {count, plural, one {1 item} other {# items}} in her bag.} other {They have {count, plural, one {1 item} other {# items}} in their bag.}}"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = Parse(input, nil)
	}
}

func BenchmarkIsPlaceholderName(b *testing.B) {
	name := "a_very_long_placeholder_name_with_dots.and-dashes_123"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = isPlaceholderName(name)
	}
}

func BenchmarkParseInvariantComplex(b *testing.B) {
	input := "{gender, select, male {He has {count, plural, one {1 item} other {# items}} in his bag.} female {She has {count, plural, one {1 item} other {# items}} in her bag.} other {They have {count, plural, one {1 item} other {# items}} in their bag.}}"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ParseInvariant(input)
	}
}
