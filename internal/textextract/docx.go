package textextract

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
)

const (
	docxBodyPath = "word/document.xml"
	// Bounds decompressed XML relative to the uploaded archive to reject zip bombs.
	docxMaxExpansion = 8
)

func isDOCX(data []byte) bool {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return false
	}
	for _, file := range archive.File {
		if file.Name == docxBodyPath {
			return true
		}
	}
	return false
}

// extractDOCX reads body paragraphs. Headers, footers and comments are omitted
// because they rarely carry guideline rules and often repeat on every page.
func extractDOCX(data []byte, maxBytes int64) (string, error) {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	var body *zip.File
	for _, file := range archive.File {
		if file.Name == docxBodyPath {
			body = file
			break
		}
	}
	if body == nil {
		return "", ErrUnsupportedFormat
	}
	// Scale the ratio to the uploaded archive. MaxBytes remains an absolute ceiling.
	limit := min(int64(len(data)), maxBytes) * docxMaxExpansion
	if body.UncompressedSize64 > uint64(limit) {
		return "", ErrTooLarge
	}
	rc, err := body.Open()
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	defer func() { _ = rc.Close() }()
	// The declared size is attacker-controlled, so the stream is bounded too.
	limited := &io.LimitedReader{R: rc, N: limit + 1}
	text, err := docxText(limited)
	if limited.N <= 0 {
		return "", ErrTooLarge
	}
	return text, err
}

func docxText(r io.Reader) (string, error) {
	decoder := xml.NewDecoder(r)
	var b strings.Builder
	inText := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return b.String(), nil
		}
		if err != nil {
			return "", fmt.Errorf("%w: %v", ErrMalformed, err)
		}
		switch t := token.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "t":
				inText = true
			case "tab":
				b.WriteByte('\t')
			case "br", "cr":
				b.WriteByte('\n')
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				b.WriteString("\n\n")
			}
		case xml.CharData:
			if inText {
				b.Write(t)
			}
		}
	}
}
