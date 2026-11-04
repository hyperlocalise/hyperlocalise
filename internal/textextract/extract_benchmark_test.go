package textextract

import (
	"archive/zip"
	"bytes"
	"context"
	"strings"
	"testing"
)

const benchGuidelineParagraph = "Tone of voice: use formal address (Sie) in German and vous in French.\r\nNever translate product names such as Hyperlocalise or WorkOS.\r\n\r\n\r\n\tKeep placeholders like {name} and %s unchanged.   \r\n"

func benchDOCX(b *testing.B, paragraphs int, method uint16) []byte {
	b.Helper()
	var body strings.Builder
	body.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`)
	for range paragraphs {
		body.WriteString(`<w:p><w:r><w:t xml:space="preserve">Use </w:t></w:r><w:r><w:t>formal</w:t></w:r><w:r><w:tab/><w:t>address in all customer-facing copy.</w:t></w:r><w:r><w:br/><w:t>Never translate product names.</w:t></w:r></w:p>`)
	}
	body.WriteString(`</w:body></w:document>`)

	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.CreateHeader(&zip.FileHeader{Name: docxBodyPath, Method: method})
	if err != nil {
		b.Fatal(err)
	}
	if _, err := f.Write([]byte(body.String())); err != nil {
		b.Fatal(err)
	}
	if err := w.Close(); err != nil {
		b.Fatal(err)
	}
	return buf.Bytes()
}

func BenchmarkExtract(b *testing.B) {
	ctx := context.Background()
	extractor := New(Options{})
	b.Cleanup(func() { _ = extractor.Close() })

	pdfPages := make([]string, 10)
	for i := range pdfPages {
		pdfPages[i] = "Use formal address in all customer facing copy and never translate product names."
	}

	benchmarks := []struct {
		name     string
		filename string
		data     []byte
	}{
		{"TextShort", "guide.txt", []byte("Use formal address.")},
		{"TextGuideline_x100", "guide.txt", []byte(strings.Repeat(benchGuidelineParagraph, 100))},
		{"Markdown_x100", "guide.md", []byte(strings.Repeat("# Rules\n\n"+benchGuidelineParagraph, 100))},
		{"DOCX_10", "guide.docx", benchDOCX(b, 10, zip.Deflate)},
		{"DOCX_500_Stored", "guide.docx", benchDOCX(b, 500, zip.Store)},
		{"PDF_1Page", "guide.pdf", buildPDF(pdfPages[0])},
		{"PDF_10Pages", "guide.pdf", buildPDF(pdfPages...)},
	}

	for _, bm := range benchmarks {
		if _, err := extractor.Extract(ctx, Input{Filename: bm.filename, Body: bytes.NewReader(bm.data)}); err != nil {
			b.Fatalf("%s: %v", bm.name, err)
		}
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = extractor.Extract(ctx, Input{Filename: bm.filename, Body: bytes.NewReader(bm.data)})
			}
		})
	}
}

func BenchmarkDetect(b *testing.B) {
	benchmarks := []struct {
		name        string
		filename    string
		contentType string
		data        []byte
	}{
		{"Text", "guide.txt", "text/plain", []byte(strings.Repeat(benchGuidelineParagraph, 100))},
		{"Markdown", "guide.md", "text/markdown; charset=utf-8", []byte(strings.Repeat(benchGuidelineParagraph, 100))},
		{"PNG", "logo.png", "image/png", pngHeader},
		{"PDF", "guide.pdf", "application/pdf", buildPDF("Use formal address.")},
		{"DOCX", "guide.docx", "", benchDOCX(b, 10, zip.Deflate)},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _, _ = Detect(bm.filename, bm.contentType, bm.data)
			}
		})
	}
}

func BenchmarkNormalize(b *testing.B) {
	benchmarks := []struct {
		name string
		text string
	}{
		{"Short", "\uFEFFUse formal address.\r\n"},
		{"Guideline_x100", strings.Repeat(benchGuidelineParagraph, 100)},
		{"Guideline_x1000", strings.Repeat(benchGuidelineParagraph, 1000)},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = normalize(bm.text)
			}
		})
	}
}

func BenchmarkTruncateRunes(b *testing.B) {
	text := normalize(strings.Repeat(benchGuidelineParagraph, 1000))
	b.Run("UnderLimit", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			_, _ = truncateRunes(text, len(text)+1)
		}
	})

	b.Run("OverLimit", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			_, _ = truncateRunes(text, DefaultMaxRunes/10)
		}
	})
}
