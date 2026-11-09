package spellcheck

import (
	"strings"
	"testing"
)

const (
	benchShortUI   = "Enregistrer les modifications"
	benchParagraph = "Bonjour {name}, vous avez <b>{count, plural, one {# nouveau message} other {# nouveaux messages}}</b> dans votre <a href=\"/inbox?folder=main&amp;sort=desc\">boîte de réception</a>. L&#39;équipe d&apos;assistance répond sous 24&nbsp;heures via https://example.com/support ou `hl sync`. Réf. %1$s, ID 123e4567-e89b-12d3-a456-426614174000."
	benchDeText    = "Bitte überprüfen Sie Ihre E-Mail-Adresse und das Passwort, bevor Sie fortfahren. Straße, Größe und Öffnungszeiten werden automatisch übernommen."
	benchJaText    = "ご注文ありがとうございます。商品は3営業日以内に発送されます。"
	benchMarkdown  = "See [the setup guide](https://example.com/docs/setup) and run `npm install` before **building** the project. ![logo](logo.png)"
)

func BenchmarkTokenize(b *testing.B) {
	benchmarks := []struct {
		name string
		text string
	}{
		{"ShortUI", benchShortUI},
		{"ParagraphICUHTMLEntities", benchParagraph},
		{"German", benchDeText},
		{"Japanese", benchJaText},
		{"Markdown", benchMarkdown},
		{"Sentinels", "Click \x1e0\x1f to open \x1e1\x1fyour profile\x1e2\x1f settings."},
		{"Long_x20", strings.Repeat(benchParagraph+" ", 20)},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = Tokenize(bm.text)
			}
		})
	}
}

func BenchmarkRejectedWords(b *testing.B) {
	accepted := NewAcceptedWords([]string{"Hyperlocalise", "boîte", "réception", "SaaS", "OAuth", "WorkOS", "Mailchimp"})
	words := Tokenize(strings.Repeat(benchParagraph+" ", 5))

	b.Run("Accepted", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			_ = RejectedWords(words, accepted)
		}
	})

	b.Run("Empty", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			_ = RejectedWords(words, AcceptedWords{})
		}
	})
}

func BenchmarkNormalizeWord(b *testing.B) {
	benchmarks := []struct {
		name string
		word string
	}{
		{"ASCII", "localisation"},
		{"Accented", "réception"},
		{"Decomposed", "re\u0301ception"},
		{"Hyphenated", "E-Mail-Adresse"},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = NormalizeWord(bm.word)
			}
		})
	}
}

func BenchmarkParseAcceptedWordsFile(b *testing.B) {
	var sb strings.Builder
	sb.WriteString("# project dictionary\n")
	for i := range 1000 {
		sb.WriteString("Hyperlocalise")
		sb.WriteString(strings.Repeat("x", i%7))
		sb.WriteString("\nréception\n\n")
	}
	content := sb.String()

	b.ReportAllocs()
	for b.Loop() {
		_ = ParseAcceptedWordsFile(content)
	}
}
