package textextract

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
)

type fakeRecognizer struct {
	text  string
	err   error
	calls []Media
}

func (f *fakeRecognizer) Recognize(_ context.Context, media Media) (string, error) {
	f.calls = append(f.calls, media)
	return f.text, f.err
}

// buildPDF writes a minimal PDF with one Helvetica text line per non-empty page.
func buildPDF(pages ...string) []byte {
	kids := make([]string, len(pages))
	for i := range pages {
		kids[i] = fmt.Sprintf("%d 0 R", 4+2*i)
	}
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(pages)),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	}
	for i, text := range pages {
		stream := ""
		if text != "" {
			stream = fmt.Sprintf("BT /F1 12 Tf 72 720 Td (%s) Tj ET", text)
		}
		objects = append(objects,
			fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>", 5+2*i),
			fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		)
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects))
	for i, object := range objects {
		offsets[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, offset := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return b.Bytes()
}

func buildZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	for name, content := range files {
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

const docxXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Tone of voice</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Use </w:t></w:r><w:r><w:t>formal</w:t></w:r><w:r><w:tab/><w:t>address.</w:t></w:r><w:r><w:br/><w:t>Never use slang.</w:t></w:r></w:p>
</w:body></w:document>`

var pngHeader = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00")

func extract(t *testing.T, opts Options, in Input, data []byte) (Result, error) {
	t.Helper()
	in.Body = bytes.NewReader(data)
	extractor := New(opts)
	t.Cleanup(func() { _ = extractor.Close() })
	return extractor.Extract(context.Background(), in)
}

func TestExtractTextFormats(t *testing.T) {
	cases := []struct {
		name, filename, contentType string
		want                        Format
	}{
		{"markdown extension", "Guide.MD", "", FormatMarkdown},
		{"markdown content type", "guide", "text/markdown; charset=utf-8", FormatMarkdown},
		{"plain text", "notes.txt", "text/plain", FormatText},
		{"markdown hint without name", "", "", FormatText},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := extract(t, Options{}, Input{Filename: tc.filename, ContentType: tc.contentType}, []byte("\uFEFF# Style\r\n\r\n\r\n\r\nUse   sentence case.  \r\n"))
			if err != nil {
				t.Fatal(err)
			}
			if got.Format != tc.want || got.Method != MethodNative || got.Text != "# Style\n\nUse   sentence case." {
				t.Fatalf("got %+v", got)
			}
		})
	}
}

func TestExtractRejectsDisguisedAndUnsupportedContent(t *testing.T) {
	for name, data := range map[string][]byte{
		"binary named markdown": {0x00, 0x01, 0x02, 0xff, 0xfe},
		"invalid utf8":          []byte("caf\xe9 au lait"),
		"non-docx zip":          buildZip(t, map[string]string{"readme.txt": "hello"}),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := extract(t, Options{}, Input{Filename: "guide.md", ContentType: "text/markdown"}, data)
			if !errors.Is(err, ErrUnsupportedFormat) {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

func TestExtractPDFTextLayer(t *testing.T) {
	vision := &fakeRecognizer{text: "unused"}
	got, err := extract(t, Options{Vision: vision}, Input{Filename: "brand.pdf"}, buildPDF("Always write product names in English.", "Prefer active voice in every headline."))
	if err != nil {
		t.Fatal(err)
	}
	if got.Format != FormatPDF || got.Method != MethodNative || got.Pages != 2 || len(vision.calls) != 0 {
		t.Fatalf("got %+v, vision calls %d", got, len(vision.calls))
	}
	if !strings.Contains(got.Text, "Always write product names in English.") || !strings.Contains(got.Text, "Prefer active voice in every headline.") {
		t.Fatalf("text = %q", got.Text)
	}
}

func TestExtractScannedPDFUsesVision(t *testing.T) {
	data := buildPDF("", "")
	if _, err := extract(t, Options{}, Input{Filename: "scan.pdf"}, data); !errors.Is(err, ErrNoText) {
		t.Fatalf("without vision err = %v", err)
	}
	vision := &fakeRecognizer{text: "# Scanned rules\n\nKeep it short."}
	got, err := extract(t, Options{Vision: vision}, Input{Filename: "uploads/scan.pdf"}, data)
	if err != nil {
		t.Fatal(err)
	}
	if got.Method != MethodVision || got.Pages != 2 || got.Text != "# Scanned rules\n\nKeep it short." {
		t.Fatalf("got %+v", got)
	}
	if len(vision.calls) != 1 || vision.calls[0].MediaType != "application/pdf" || vision.calls[0].Filename != "scan.pdf" {
		t.Fatalf("calls = %+v", vision.calls)
	}
}

func TestExtractPDFLimitsAndFailures(t *testing.T) {
	if _, err := extract(t, Options{MaxPages: 1}, Input{}, buildPDF("one page of text here", "two pages of text here")); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("page limit err = %v", err)
	}
	if _, err := extract(t, Options{}, Input{}, []byte("%PDF-1.4\nnot really a pdf")); !errors.Is(err, ErrMalformed) {
		t.Fatalf("malformed err = %v", err)
	}
}

func TestExtractPDFConcurrentAndCancelled(t *testing.T) {
	extractor := New(Options{PDFWorkers: 2})
	t.Cleanup(func() { _ = extractor.Close() })
	data := buildPDF("Concurrent extraction must return this sentence.")
	errs := make(chan error, 6)
	for range cap(errs) {
		go func() {
			got, err := extractor.Extract(context.Background(), Input{Body: bytes.NewReader(data)})
			if err == nil && !strings.Contains(got.Text, "Concurrent extraction") {
				err = fmt.Errorf("text = %q", got.Text)
			}
			errs <- err
		}()
	}
	for range cap(errs) {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := extractor.Extract(ctx, Input{Body: bytes.NewReader(data)}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled err = %v", err)
	}
	if err := extractor.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := extractor.Extract(context.Background(), Input{Body: bytes.NewReader(data)}); err == nil {
		t.Fatal("expected error after Close")
	}
}

func TestExtractImage(t *testing.T) {
	if _, err := extract(t, Options{}, Input{Filename: "chart.png"}, pngHeader); !errors.Is(err, ErrNoText) {
		t.Fatalf("without vision err = %v", err)
	}
	vision := &fakeRecognizer{text: "Do not translate: Hyperlocalise"}
	got, err := extract(t, Options{Vision: vision}, Input{Filename: "chart.md", ContentType: "text/markdown"}, pngHeader)
	if err != nil {
		t.Fatal(err)
	}
	if got.Format != FormatImage || got.MediaType != "image/png" || got.Method != MethodVision || got.Text != "Do not translate: Hyperlocalise" {
		t.Fatalf("got %+v", got)
	}
	vision.err = errors.New("gateway down")
	if _, err := extract(t, Options{Vision: vision}, Input{}, pngHeader); err == nil || errors.Is(err, ErrNoText) {
		t.Fatalf("vision failure err = %v", err)
	}
}

func TestExtractDOCX(t *testing.T) {
	data := buildZip(t, map[string]string{"[Content_Types].xml": "<Types/>", docxBodyPath: docxXML})
	got, err := extract(t, Options{}, Input{Filename: "guide.docx"}, data)
	if err != nil {
		t.Fatal(err)
	}
	if got.Format != FormatDOCX || got.Text != "Tone of voice\n\nUse formal\taddress.\nNever use slang." {
		t.Fatalf("got %+v", got)
	}
}

func TestExtractDOCXRejectsExpansion(t *testing.T) {
	body := `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>` + strings.Repeat("a", 64<<10) + `</w:t></w:r></w:p></w:body></w:document>`
	data := buildZip(t, map[string]string{docxBodyPath: body})
	if int64(len(body)) <= int64(len(data))*docxMaxExpansion {
		t.Fatalf("fixture compresses within %dx: archive %d xml %d", docxMaxExpansion, len(data), len(body))
	}
	// Default MaxBytes would otherwise allow 256 MiB of XML from this tiny archive.
	if _, err := extract(t, Options{}, Input{}, data); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("archive-relative limit err = %v", err)
	}
	// The archive itself is within 8× of the XML, so only the MaxBytes ceiling rejects it.
	plain := `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>`
	small := buildZip(t, map[string]string{docxBodyPath: plain})
	if int64(len(plain)) > int64(len(small))*docxMaxExpansion {
		t.Fatalf("fixture exceeds archive ratio: archive %d xml %d", len(small), len(plain))
	}
	if _, err := extractDOCX(small, 1); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("absolute cap err = %v", err)
	}
}

func TestExtractLimits(t *testing.T) {
	if _, err := extract(t, Options{MaxBytes: 4}, Input{}, []byte("hello")); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("size err = %v", err)
	}
	if _, err := extract(t, Options{}, Input{}, nil); !errors.Is(err, ErrNoText) {
		t.Fatalf("empty err = %v", err)
	}
	if _, err := extract(t, Options{}, Input{}, []byte(" \n\t\n ")); !errors.Is(err, ErrNoText) {
		t.Fatalf("blank err = %v", err)
	}
	if _, err := New(Options{}).Extract(context.Background(), Input{}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("nil body err = %v", err)
	}
	got, err := extract(t, Options{MaxRunes: 5}, Input{}, []byte("héllo wörld"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Text != "héllo" || !got.Truncated {
		t.Fatalf("got %+v", got)
	}
}

func TestTruncateRunesCutsAtRuneBoundary(t *testing.T) {
	text := "aé😊x"
	if got, truncated := truncateRunes(text, 1); got != "a" || !truncated {
		t.Fatalf("before multibyte: %q truncated=%v", got, truncated)
	}
	if got, truncated := truncateRunes(text, 2); got != "aé" || !truncated {
		t.Fatalf("after multibyte: %q truncated=%v", got, truncated)
	}
	if got, truncated := truncateRunes(text, 3); got != "aé😊" || !truncated {
		t.Fatalf("after emoji: %q truncated=%v", got, truncated)
	}
	if got, truncated := truncateRunes(text, 4); got != text || truncated {
		t.Fatalf("exact fit: %q truncated=%v", got, truncated)
	}
	if got, truncated := truncateRunes("ab  cd", 4); got != "ab" || !truncated {
		t.Fatalf("trimmed tail: %q truncated=%v", got, truncated)
	}
}
