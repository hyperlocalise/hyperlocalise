package textextract

import (
	"bytes"
	"errors"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
)

// extractPDF reads the text layer. The parser panics on some malformed
// inputs, so every call into it runs under recover.
func extractPDF(data []byte, maxPages int) (text string, pages int, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			text, pages, err = "", 0, fmt.Errorf("%w: %v", ErrMalformed, recovered)
		}
	}()
	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if errors.Is(err, pdf.ErrInvalidPassword) {
		return "", 0, ErrEncrypted
	}
	if err != nil {
		return "", 0, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	pages = reader.NumPage()
	if pages > maxPages {
		return "", pages, ErrTooLarge
	}
	var b strings.Builder
	for i := 1; i <= pages; i++ {
		page := reader.Page(i)
		if page.V.IsNull() {
			continue
		}
		// Font resource names are page-scoped, so the parser's per-page cache is used.
		pageText, err := page.GetPlainText(nil)
		if err != nil {
			return "", pages, fmt.Errorf("%w: page %d: %v", ErrMalformed, i, err)
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(pageText)
	}
	return b.String(), pages, nil
}
