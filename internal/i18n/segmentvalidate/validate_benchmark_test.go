package segmentvalidate

import "testing"

func BenchmarkValidateSegment(b *testing.B) {
	benchmarks := []struct {
		name       string
		sourceText string
		targetText string
		sourcePath string
		maxLength  int
	}{
		{
			name:       "PlainHTML",
			sourceText: "<p>Hello, world!</p>",
			targetText: "<p>Bonjour, le monde!</p>",
			sourcePath: "index.html",
		},
		{
			name:       "ICUComplex",
			sourceText: "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>.",
			targetText: "Cliquez sur <link>{action}</link> pour voir {count, plural, one {un message} other {# messages}} dans votre <b>{folder}</b>.",
			sourcePath: "messages.json",
		},
		{
			name:       "PrintfPlaceholders",
			sourceText: "User %s has %d new messages in group %s.",
			targetText: "L'utilisateur %s a %d nouveaux messages dans le groupe %s.",
			sourcePath: "messages.properties",
		},
		{
			name:       "PlainNoTokens",
			sourceText: "Hello, world!",
			targetText: "Bonjour, le monde!",
			sourcePath: "messages.json",
		},
		{
			name:       "PlainHTMLIdentical",
			sourceText: "<p>Hello, world!</p>",
			targetText: "<p>Hello, world!</p>",
			sourcePath: "index.html",
		},
		{
			name:       "ICUComplexIdentical",
			sourceText: "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>.",
			targetText: "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>.",
			sourcePath: "messages.json",
		},
		{
			name:       "PlainNoTokensIdentical",
			sourceText: "Hello, world!",
			targetText: "Hello, world!",
			sourcePath: "messages.json",
		},
	}

	for _, bm := range benchmarks {
		req := Request{
			SourceText: bm.sourceText,
			TargetText: bm.targetText,
			SourcePath: bm.sourcePath,
			MaxLength:  bm.maxLength,
		}
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = ValidateSegment(req)
			}
		})
	}

	b.Run("QA_AllModes_NonEmpty", func(b *testing.B) {
		req := Request{
			SourceText: "Hello, world!",
			TargetText: "Bonjour, le monde!",
			SourcePath: "messages.json",
			Modes:      []string{QAModeSameAsSource, QAModeWhitespaceOnly, QAModeNotLocalized},
		}
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_ = ValidateSegment(req)
		}
	})
}

func BenchmarkProfileEdgeWhitespace(b *testing.B) {
	b.Run("PlainASCII", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_, _ = profileEdgeWhitespace("Hello, world!")
		}
	})

	b.Run("WithWhitespace", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_, _ = profileEdgeWhitespace(" \tHello, world!\r\n")
		}
	})

	b.Run("NonASCII_NBSP", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_, _ = profileEdgeWhitespace("\u00a0Hello, world!\u00a0")
		}
	})
}
