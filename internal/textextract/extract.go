// Package textextract converts uploaded documents into searchable plain text.
package textextract

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"
)

var (
	ErrInvalidInput      = errors.New("invalid extraction input")
	ErrTooLarge          = errors.New("document exceeds extraction size limit")
	ErrUnsupportedFormat = errors.New("unsupported document format")
	ErrNoText            = errors.New("document contains no extractable text")
	ErrEncrypted         = errors.New("document is encrypted")
	ErrMalformed         = errors.New("document is malformed")
)

// Format is the detected document type, independent of the declared MIME type.
type Format string

const (
	FormatMarkdown Format = "markdown"
	FormatText     Format = "text"
	FormatPDF      Format = "pdf"
	FormatDOCX     Format = "docx"
	FormatImage    Format = "image"
)

// Method records how text was produced so callers can surface OCR provenance.
type Method string

const (
	MethodNative Method = "native"
	MethodVision Method = "vision"
)

const (
	DefaultMaxBytes = 32 << 20
	DefaultMaxRunes = 50000
	DefaultMaxPages = 500
	// A PDF averaging fewer letters per page than this is treated as scanned.
	minNativePDFLettersPerPage = 16
	sniffBytes                 = 512
)

// Input is one uploaded file. Filename and ContentType are hints only.
type Input struct {
	Filename    string
	ContentType string
	Body        io.Reader
}

// Result is normalized UTF-8 text with LF line endings.
type Result struct {
	Text      string `json:"text"`
	Format    Format `json:"format"`
	MediaType string `json:"mediaType"`
	Method    Method `json:"method"`
	Pages     int    `json:"pages,omitempty"`
	Truncated bool   `json:"truncated"`
}

// Media is a binary document passed to a vision recognizer.
type Media struct {
	Filename  string
	MediaType string
	Data      []byte
}

// Recognizer transcribes images and scanned PDFs. Implementations must not
// retain Data after returning.
type Recognizer interface {
	Recognize(context.Context, Media) (string, error)
}

// Options bounds untrusted input. Zero values select the package defaults.
type Options struct {
	MaxBytes int64
	MaxRunes int
	MaxPages int
	// Vision is optional; without it images and scanned PDFs return ErrNoText.
	Vision Recognizer
}

// Extractor is safe for concurrent use.
type Extractor struct {
	maxBytes int64
	maxRunes int
	maxPages int
	vision   Recognizer
}

// New applies defaults and returns an extractor.
func New(opts Options) *Extractor {
	e := &Extractor{maxBytes: opts.MaxBytes, maxRunes: opts.MaxRunes, maxPages: opts.MaxPages, vision: opts.Vision}
	if e.maxBytes <= 0 {
		e.maxBytes = DefaultMaxBytes
	}
	if e.maxRunes <= 0 {
		e.maxRunes = DefaultMaxRunes
	}
	if e.maxPages <= 0 {
		e.maxPages = DefaultMaxPages
	}
	return e
}

// Extract reads at most MaxBytes from Body and returns its text.
func (e *Extractor) Extract(ctx context.Context, in Input) (Result, error) {
	if in.Body == nil {
		return Result{}, ErrInvalidInput
	}
	data, err := io.ReadAll(io.LimitReader(in.Body, e.maxBytes+1))
	if err != nil {
		return Result{}, fmt.Errorf("read document: %w", err)
	}
	if int64(len(data)) > e.maxBytes {
		return Result{}, ErrTooLarge
	}
	if len(data) == 0 {
		return Result{}, ErrNoText
	}
	format, mediaType, err := Detect(in.Filename, in.ContentType, data)
	if err != nil {
		return Result{}, err
	}
	result := Result{Format: format, MediaType: mediaType, Method: MethodNative}
	var text string
	switch format {
	case FormatMarkdown, FormatText:
		text = string(data)
	case FormatDOCX:
		text, err = extractDOCX(data, e.maxBytes)
	case FormatPDF:
		text, result.Pages, err = extractPDF(data, e.maxPages)
		if err == nil && isScanned(text, result.Pages) {
			text, err = e.recognize(ctx, in.Filename, mediaType, data)
			result.Method = MethodVision
		}
	case FormatImage:
		text, err = e.recognize(ctx, in.Filename, mediaType, data)
		result.Method = MethodVision
	}
	if err != nil {
		return Result{}, err
	}
	result.Text, result.Truncated = truncateRunes(normalize(text), e.maxRunes)
	if strings.TrimSpace(result.Text) == "" {
		return Result{}, ErrNoText
	}
	return result, nil
}

func (e *Extractor) recognize(ctx context.Context, filename, mediaType string, data []byte) (string, error) {
	if e.vision == nil {
		return "", ErrNoText
	}
	text, err := e.vision.Recognize(ctx, Media{Filename: path.Base(filename), MediaType: mediaType, Data: data})
	if err != nil {
		return "", fmt.Errorf("recognize document: %w", err)
	}
	return text, nil
}

var imageMediaTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true}

// Detect trusts content signatures over hints, so a renamed binary cannot be
// indexed as text. Hints only choose between markdown and plain text.
func Detect(filename, contentType string, data []byte) (Format, string, error) {
	if bytes.HasPrefix(data, []byte("%PDF-")) {
		return FormatPDF, "application/pdf", nil
	}
	sniffed := http.DetectContentType(data[:min(len(data), sniffBytes)])
	if imageMediaTypes[sniffed] {
		return FormatImage, sniffed, nil
	}
	if sniffed == "application/zip" {
		if isDOCX(data) {
			return FormatDOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nil
		}
		return "", "", ErrUnsupportedFormat
	}
	if !strings.HasPrefix(sniffed, "text/plain") || !utf8.Valid(data) {
		return "", "", ErrUnsupportedFormat
	}
	ext := strings.ToLower(path.Ext(filename))
	declared := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if ext == ".md" || ext == ".markdown" || declared == "text/markdown" || declared == "text/x-markdown" {
		return FormatMarkdown, "text/markdown", nil
	}
	return FormatText, "text/plain", nil
}

func isScanned(text string, pages int) bool {
	letters := 0
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			letters++
		}
	}
	return letters < max(pages, 1)*minNativePDFLettersPerPage
}

// normalize strips a BOM, NUL and non-printing controls and collapses runs of
// blank lines so chunking sees stable paragraph boundaries.
func normalize(text string) string {
	text = strings.TrimPrefix(text, "\uFEFF")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	var b strings.Builder
	b.Grow(len(text))
	newlines := 0
	for _, r := range text {
		if r == utf8.RuneError || (unicode.IsControl(r) && r != '\n' && r != '\t') {
			continue
		}
		if r == '\n' {
			newlines++
			if newlines > 2 {
				continue
			}
		} else {
			newlines = 0
		}
		b.WriteRune(r)
	}
	lines := strings.Split(b.String(), "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func truncateRunes(text string, limit int) (string, bool) {
	if utf8.RuneCountInString(text) <= limit {
		return text, false
	}
	runes := []rune(text)
	return strings.TrimSpace(string(runes[:limit])), true
}
