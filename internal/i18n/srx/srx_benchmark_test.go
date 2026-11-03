package srx

import (
	"strconv"
	"strings"
	"testing"
)

const (
	benchShortUI     = "Save changes"
	benchEnParagraph = "Welcome back, Dr. Smith! Your order #1234 shipped on 3.5 business days. Track it at https://example.com/orders. Questions? Contact support, e.g. via chat, etc. We are happy to help."
	benchDeParagraph = "Sehr geehrter Herr Dr. Müller, vielen Dank für Ihre Bestellung. Die Lieferung erfolgt z. B. per DHL, ggf. auch per DPD usw. Bitte beachten Sie Nr. 4 der AGB! Haben Sie Fragen? Wir helfen gern."
	benchJaParagraph = "ご注文ありがとうございます。商品は3営業日以内に発送されます。ご不明な点がございましたら、サポートまでお問い合わせください！今後ともよろしくお願いいたします。"
	benchMarkdown    = "1. Install the CLI. 2. Run `hyperlocalise init`. See [the docs](https://example.com/docs). Mr. Lee wrote v2.0 of the guide. Done!"
)

func BenchmarkSegment(b *testing.B) {
	templates := []string{TemplateDefault, TemplateHTML, TemplateMarkdown}
	docs := make(map[string]*Document, len(templates))
	for _, name := range templates {
		doc, err := LoadTemplate(name)
		if err != nil {
			b.Fatal(err)
		}
		docs[name] = doc
	}

	benchmarks := []struct {
		name     string
		text     string
		language string
	}{
		{"ShortUI", benchShortUI, "en-US"},
		{"EnParagraph", benchEnParagraph, "en-US"},
		{"DeAbbreviations", benchDeParagraph, "de-DE"},
		{"JaParagraph", benchJaParagraph, "ja-JP"},
		{"MarkdownList", benchMarkdown, "en-US"},
		{"EnLong_x20", strings.Repeat(benchEnParagraph+" ", 20), "en-US"},
		{"DeLong_x100", strings.Repeat(benchDeParagraph+" ", 100), "de_DE"},
	}

	for _, name := range templates {
		doc := docs[name]
		for _, bm := range benchmarks {
			b.Run(name+"/"+bm.name, func(b *testing.B) {
				b.ReportAllocs()
				for b.Loop() {
					_ = doc.Segment(bm.text, bm.language)
				}
			})
		}
	}
}

func BenchmarkSegmentAfterBreakScan(b *testing.B) {
	doc, err := LoadTemplate(TemplateHTML)
	if err != nil {
		b.Fatal(err)
	}
	for _, n := range []int{10, 100, 1000} {
		text := strings.Repeat("Visit www dot example dot com for help. ", n)
		b.Run("HTMLWordsWithoutColon_x"+strconv.Itoa(n), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = doc.Segment(text, "en-US")
			}
		})
	}
}

func BenchmarkSegmentCustomLanguageMaps(b *testing.B) {
	doc, err := Parse([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <header cascade="yes"/>
  <body>
    <languagerules>
      <languagerule languagename="German">
        <rule break="no">
          <beforebreak>(?i)\b(z\. B|ggf|usw|bzw|Nr|Dr|Hr|Fr|ca|vgl)\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
      <languagerule languagename="Japanese">
        <rule break="yes">
          <beforebreak>[。！？]</beforebreak>
          <afterbreak>.</afterbreak>
        </rule>
      </languagerule>
      <languagerule languagename="Default">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\.!\?]+["']?</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern="de.*" languagerulename="German"/>
      <languagemap languagepattern="ja.*" languagerulename="Japanese"/>
      <languagemap languagepattern=".*" languagerulename="Default"/>
    </maprules>
  </body>
</srx>`))
	if err != nil {
		b.Fatal(err)
	}

	benchmarks := []struct {
		name     string
		text     string
		language string
	}{
		{"En", benchEnParagraph, "en-US"},
		{"De", benchDeParagraph, "de-DE"},
		{"Ja", benchJaParagraph, "ja-JP"},
		{"DeLong_x100", strings.Repeat(benchDeParagraph+" ", 100), "de-DE"},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = doc.Segment(bm.text, bm.language)
			}
		})
	}
}

func BenchmarkShouldSkipValue(b *testing.B) {
	benchmarks := []struct {
		name string
		text string
	}{
		{"ShortUI", benchShortUI},
		{"EnParagraph", benchEnParagraph},
		{"ICUPlaceholder", "Hello {name}, you have new messages."},
		{"ICUPlural", "You have {count, plural, one {# message} other {# messages}}."},
		{"Printf", "User %1$s uploaded %d files."},
		{"HTML", "<p>Click <a href=\"/settings\">here</a> to update your <b>profile</b>.</p>"},
		{"EnLong_x20", strings.Repeat(benchEnParagraph+" ", 20)},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = ShouldSkipValue(bm.text, "")
			}
		})
	}
}

func BenchmarkJoin(b *testing.B) {
	doc, err := LoadTemplate(TemplateDefault)
	if err != nil {
		b.Fatal(err)
	}
	benchmarks := []struct {
		name string
		text string
	}{
		{"EnParagraph", benchEnParagraph},
		{"EnLong_x20", strings.Repeat(benchEnParagraph+" ", 20)},
	}

	for _, bm := range benchmarks {
		spans := doc.Segment(bm.text, "en-US")
		translations := make([]string, len(spans))
		for i, span := range spans {
			translations[i] = strings.TrimSpace(span.Text)
		}
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = Join(spans, translations)
			}
		})
	}
}

func BenchmarkLoadTemplate(b *testing.B) {
	for _, name := range []string{TemplateDefault, TemplateHTML, TemplateMarkdown} {
		b.Run(name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = LoadTemplate(name)
			}
		})
	}
}

func BenchmarkSpanKey(b *testing.B) {
	b.Run("SpanKey", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			_ = SpanKey("checkout.summary.description", 12)
		}
	})

	b.Run("SplitSpanKey", func(b *testing.B) {
		key := SpanKey("checkout.summary.description", 12)
		b.ReportAllocs()
		for b.Loop() {
			_, _, _ = SplitSpanKey(key)
		}
	})

	b.Run("ReservedSpanKeys_500", func(b *testing.B) {
		entries := make(map[string]string, 500)
		for i := range 500 {
			entries[SpanKey("screen.title", i)+".label"] = benchShortUI
		}
		b.ReportAllocs()
		for b.Loop() {
			_ = ReservedSpanKeys(entries)
		}
	})
}
