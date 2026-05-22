package icuparser

import (
	"testing"
)

func BenchmarkParse(b *testing.B) {
	benchmarks := []struct {
		name  string
		input string
	}{
		{"SimpleText", "Hello, world!"},
		{"LongText", "This is a much longer piece of text that should exercise the literal text chunking logic once it is implemented. It contains no special characters at all."},
		{"Placeholder", "Hello, {name}!"},
		{"MultiplePlaceholders", "Welcome {firstName} {lastName}, you have {count} messages."},
		{"Plural", "{count, plural, one {# item} other {# items}}"},
		{"Complex", "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>."},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_, _ = Parse(bm.input, nil)
			}
		})
	}
}

func BenchmarkParseInvariant(b *testing.B) {
	input := "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>."
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = ParseInvariant(input)
	}
}
