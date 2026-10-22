package translationfileparser

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"slices"
	"strings"
	"unicode"

	"github.com/klippa-app/go-pdfium"
	"github.com/klippa-app/go-pdfium/enums"
	"github.com/klippa-app/go-pdfium/references"
	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/structs"
)

const (
	pdfMinLettersPerPage  = 16
	pdfLineBaselineTol    = 2.5
	pdfBlockLineGapFactor = 1.6
)

// PDFEntry is one translatable text block in a PDF.
type PDFEntry struct {
	Key     string
	Text    string
	Context string
}

// PDFParser parses PDF documents into keyed text blocks.
type PDFParser struct{}

func (PDFParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := PDFParser{}.ParseWithContext(content)
	return values, err
}

func (PDFParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	entries, err := ReadPDFEntries(content)
	if err != nil {
		return nil, nil, err
	}
	values := make(map[string]string, len(entries))
	ctx := map[string]string{}
	for _, entry := range entries {
		values[entry.Key] = entry.Text
		if entry.Context != "" {
			ctx[entry.Key] = entry.Context
		}
	}
	return values, ctx, nil
}

func pdfEntryKey(pageOneBased int, blockOneBased int) string {
	return fmt.Sprintf("page-%d#%d", pageOneBased, blockOneBased)
}

func pdfEntryContext(pageOneBased int, blockOneBased int) string {
	return fmt.Sprintf("Page %d, block %d", pageOneBased, blockOneBased)
}

type pdfTextSpan struct {
	text                string
	left, bottom, right float64
	top                 float64
	fontSize            float32
	fill                structs.FPDF_COLOR
	pageObject          references.FPDF_PAGEOBJECT
}

type pdfTextBlock struct {
	spans    []pdfTextSpan
	text     string
	left     float64
	bottom   float64
	right    float64
	top      float64
	fontSize float32
	fill     structs.FPDF_COLOR
}

func pageHasMeaningfulText(text string) bool {
	letters := 0
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			letters++
		}
	}
	return letters >= pdfMinLettersPerPage
}

// ReadPDFEntries extracts keyed text blocks from a PDF text layer.
func ReadPDFEntries(content []byte) ([]PDFEntry, error) {
	var entries []PDFEntry
	var scannedOnly bool
	err := withPDFiumInstance(context.Background(), func(instance pdfium.Pdfium) error {
		doc, err := openPDFDocument(instance, content)
		if err != nil {
			return err
		}
		defer closePDFDocument(instance, doc)

		pageCount, err := instance.FPDF_GetPageCount(&requests.FPDF_GetPageCount{Document: doc})
		if err != nil {
			return ErrPDFMalformed
		}
		anyText := false
		for page := 0; page < pageCount.PageCount; page++ {
			blocks, pageText, pageScanned, err := readPDFPageBlocks(instance, doc, page)
			if err != nil {
				return err
			}
			if pageScanned {
				scannedOnly = true
			}
			if strings.TrimSpace(pageText) != "" {
				anyText = true
			}
			for i, block := range blocks {
				text := strings.TrimSpace(block.text)
				if text == "" {
					continue
				}
				pageOne := page + 1
				blockOne := i + 1
				entries = append(entries, PDFEntry{
					Key:     pdfEntryKey(pageOne, blockOne),
					Text:    text,
					Context: pdfEntryContext(pageOne, blockOne),
				})
			}
		}
		if !anyText || (scannedOnly && len(entries) == 0) {
			return ErrPDFNoTextLayer
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, ErrPDFNoTextLayer
	}
	return entries, nil
}

func openPDFDocument(instance pdfium.Pdfium, content []byte) (references.FPDF_DOCUMENT, error) {
	data := content
	loaded, err := instance.OpenDocument(&requests.OpenDocument{File: &data})
	if err != nil {
		return "", mapPDFiumOpenError(err)
	}
	return loaded.Document, nil
}

func closePDFDocument(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT) {
	_, _ = instance.FPDF_CloseDocument(&requests.FPDF_CloseDocument{Document: doc})
}

func readPDFPageBlocks(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT, pageIndex int) ([]pdfTextBlock, string, bool, error) {
	page := requests.Page{ByIndex: &requests.PageByIndex{Document: doc, Index: pageIndex}}
	textPageResp, err := instance.FPDFText_LoadPage(&requests.FPDFText_LoadPage{Page: page})
	if err != nil {
		return nil, "", false, ErrPDFMalformed
	}
	defer func() {
		_, _ = instance.FPDFText_ClosePage(&requests.FPDFText_ClosePage{TextPage: textPageResp.TextPage})
	}()

	countResp, err := instance.FPDFPage_CountObjects(&requests.FPDFPage_CountObjects{Page: page})
	if err != nil {
		return nil, "", false, ErrPDFMalformed
	}

	var spans []pdfTextSpan
	for i := 0; i < countResp.Count; i++ {
		objResp, err := instance.FPDFPage_GetObject(&requests.FPDFPage_GetObject{Page: page, Index: i})
		if err != nil || objResp.PageObject == "" {
			continue
		}
		typeResp, err := instance.FPDFPageObj_GetType(&requests.FPDFPageObj_GetType{PageObject: objResp.PageObject})
		if err != nil || typeResp.Type != enums.FPDF_PAGEOBJ_TEXT {
			continue
		}
		textResp, err := instance.FPDFTextObj_GetText(&requests.FPDFTextObj_GetText{
			PageObject: objResp.PageObject,
			TextPage:   textPageResp.TextPage,
		})
		if err != nil || strings.TrimSpace(textResp.Text) == "" {
			continue
		}
		bounds, err := instance.FPDFPageObj_GetBounds(&requests.FPDFPageObj_GetBounds{PageObject: objResp.PageObject})
		if err != nil {
			continue
		}
		fontSize := float32(12)
		if sizeResp, err := instance.FPDFTextObj_GetFontSize(&requests.FPDFTextObj_GetFontSize{PageObject: objResp.PageObject}); err == nil {
			fontSize = sizeResp.FontSize
		}
		fill := structs.FPDF_COLOR{A: 255, R: 0, G: 0, B: 0}
		if colorResp, err := instance.FPDFPageObj_GetFillColor(&requests.FPDFPageObj_GetFillColor{PageObject: objResp.PageObject}); err == nil {
			fill = colorResp.FillColor
		}
		spans = append(spans, pdfTextSpan{
			text:       textResp.Text,
			left:       float64(bounds.Left),
			bottom:     float64(bounds.Bottom),
			right:      float64(bounds.Right),
			top:        float64(bounds.Top),
			fontSize:   fontSize,
			fill:       fill,
			pageObject: objResp.PageObject,
		})
	}

	pageText := extractPagePlainText(instance, page)
	scanned := !pageHasMeaningfulText(pageText)
	blocks := groupPDFSpansIntoBlocks(spans)
	return blocks, pageText, scanned, nil
}

func extractPagePlainText(instance pdfium.Pdfium, page requests.Page) string {
	resp, err := instance.GetPageText(&requests.GetPageText{Page: page})
	if err != nil {
		return ""
	}
	return resp.Text
}

func groupPDFSpansIntoBlocks(spans []pdfTextSpan) []pdfTextBlock {
	if len(spans) == 0 {
		return nil
	}
	slices.SortFunc(spans, func(a, b pdfTextSpan) int {
		if math.Abs(a.top-b.top) > pdfLineBaselineTol {
			if a.top > b.top {
				return -1
			}
			return 1
		}
		if a.left < b.left {
			return -1
		}
		if a.left > b.left {
			return 1
		}
		return 0
	})

	type line struct {
		spans []pdfTextSpan
		top   float64
	}
	var lines []line
	for _, span := range spans {
		if len(lines) == 0 {
			lines = append(lines, line{spans: []pdfTextSpan{span}, top: span.top})
			continue
		}
		last := &lines[len(lines)-1]
		if math.Abs(span.top-last.top) <= pdfLineBaselineTol {
			last.spans = append(last.spans, span)
			continue
		}
		lines = append(lines, line{spans: []pdfTextSpan{span}, top: span.top})
	}

	for i := range lines {
		slices.SortFunc(lines[i].spans, func(a, b pdfTextSpan) int {
			if a.left < b.left {
				return -1
			}
			if a.left > b.left {
				return 1
			}
			return 0
		})
	}

	var blocks []pdfTextBlock
	for _, ln := range lines {
		block := pdfTextBlockFromSpans(ln.spans)
		if len(blocks) == 0 {
			blocks = append(blocks, block)
			continue
		}
		prev := &blocks[len(blocks)-1]
		gap := prev.bottom - block.top
		lineHeight := math.Max(float64(prev.fontSize), float64(block.fontSize))
		if gap <= lineHeight*pdfBlockLineGapFactor && math.Abs(prev.left-block.left) < 48 {
			prev.spans = append(prev.spans, block.spans...)
			merged := pdfTextBlockFromSpans(prev.spans)
			*prev = merged
			continue
		}
		blocks = append(blocks, block)
	}
	return blocks
}

func pdfTextBlockFromSpans(spans []pdfTextSpan) pdfTextBlock {
	if len(spans) == 0 {
		return pdfTextBlock{}
	}
	var b strings.Builder
	left := spans[0].left
	bottom := spans[0].bottom
	right := spans[0].right
	top := spans[0].top
	fontSize := spans[0].fontSize
	fill := spans[0].fill
	for i, span := range spans {
		if i > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(span.text)
		left = math.Min(left, span.left)
		bottom = math.Min(bottom, span.bottom)
		right = math.Max(right, span.right)
		top = math.Max(top, span.top)
		if span.fontSize > fontSize {
			fontSize = span.fontSize
		}
	}
	return pdfTextBlock{
		spans:    slices.Clone(spans),
		text:     b.String(),
		left:     left,
		bottom:   bottom,
		right:    right,
		top:      top,
		fontSize: fontSize,
		fill:     fill,
	}
}

func pdfIngestEntries(entries []PDFEntry) map[string]IngestEntry {
	out := make(map[string]IngestEntry, len(entries))
	for _, entry := range entries {
		out[entry.Key] = IngestEntry{Text: entry.Text, Context: entry.Context}
	}
	return out
}

// MarshalPDF writes translations into a copy of template. It returns overflow keys
// whose translated text could not fit the original block bounds.
func MarshalPDF(template []byte, values map[string]string, targetLocale string) ([]byte, []string, error) {
	targetLocale = strings.TrimSpace(targetLocale)
	var out []byte
	var overflow []string
	err := withPDFiumInstance(context.Background(), func(instance pdfium.Pdfium) error {
		doc, err := openPDFDocument(instance, template)
		if err != nil {
			return err
		}
		defer closePDFDocument(instance, doc)

		pageCount, err := instance.FPDF_GetPageCount(&requests.FPDF_GetPageCount{Document: doc})
		if err != nil {
			return ErrPDFMalformed
		}

		for page := 0; page < pageCount.PageCount; page++ {
			blocks, _, _, err := readPDFPageBlocks(instance, doc, page)
			if err != nil {
				return err
			}
			pageOne := page + 1
			pageReq := requests.Page{ByIndex: &requests.PageByIndex{Document: doc, Index: page}}
			for i, block := range blocks {
				key := pdfEntryKey(pageOne, i+1)
				sourceText := strings.TrimSpace(block.text)
				targetText, ok := values[key]
				if !ok || strings.TrimSpace(targetText) == sourceText {
					continue
				}
				targetText = strings.TrimSpace(targetText)
				if err := validatePDFTargetScript(targetText); err != nil {
					return err
				}
				if err := applyPDFBlockTranslation(instance, doc, pageReq, block, targetText, targetLocale); err != nil {
					if errorsIsOverflow(err) {
						overflow = append(overflow, key)
						continue
					}
					return err
				}
			}
			if _, err := instance.FPDFPage_GenerateContent(&requests.FPDFPage_GenerateContent{Page: pageReq}); err != nil {
				return ErrPDFMalformed
			}
		}

		saved, err := instance.FPDF_SaveAsCopy(&requests.FPDF_SaveAsCopy{
			Document:   doc,
			Flags:      requests.SaveFlagNoIncremental,
			FileWriter: nil,
		})
		if err != nil {
			return ErrPDFMalformed
		}
		if saved.FileBytes != nil {
			out = bytes.Clone(*saved.FileBytes)
		}
		return nil
	})
	if err != nil {
		return nil, overflow, err
	}
	return out, overflow, nil
}

type pdfOverflowError struct{}

func (pdfOverflowError) Error() string { return "pdf text overflow" }

func errorsIsOverflow(err error) bool {
	_, ok := err.(pdfOverflowError)
	return ok
}

func applyPDFBlockTranslation(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT, page requests.Page, block pdfTextBlock, text string, targetLocale string) error {
	width := block.right - block.left
	if width <= 0 {
		width = 200
	}
	fontSize := block.fontSize
	if fontSize <= 0 {
		fontSize = 12
	}
	minSize := fontSize * 0.7
	fittedSize, lines, overflow := wrapPDFText(text, width, fontSize, minSize)
	if overflow {
		return pdfOverflowError{}
	}
	_ = targetLocale

	if len(block.spans) == 1 && len(lines) == 1 {
		if _, err := instance.FPDFText_SetText(&requests.FPDFText_SetText{
			PageObject: block.spans[0].pageObject,
			Text:       lines[0],
		}); err == nil {
			if fittedSize != block.spans[0].fontSize {
				_, _ = instance.FPDFTextObj_SetFontSize(&requests.FPDFTextObj_SetFontSize{
					PageObject: block.spans[0].pageObject,
					FontSize:   fittedSize,
				})
			}
			return nil
		}
	}

	for _, span := range block.spans {
		_, _ = instance.FPDFPage_RemoveObject(&requests.FPDFPage_RemoveObject{
			Page:       page,
			PageObject: span.pageObject,
		})
		_, _ = instance.FPDFPageObj_Destroy(&requests.FPDFPageObj_Destroy{PageObject: span.pageObject})
	}

	fontResp, err := instance.FPDFText_LoadStandardFont(&requests.FPDFText_LoadStandardFont{
		Document: doc,
		Font:     "Helvetica",
	})
	if err != nil {
		return ErrPDFMalformed
	}
	defer func() {
		_, _ = instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: fontResp.Font})
	}()

	lineHeight := float64(fittedSize) * 1.2
	y := block.top - float64(fittedSize)
	for _, line := range lines {
		objResp, err := instance.FPDFPageObj_CreateTextObj(&requests.FPDFPageObj_CreateTextObj{
			Document: doc,
			Font:     fontResp.Font,
			FontSize: fittedSize,
		})
		if err != nil {
			return ErrPDFMalformed
		}
		_, _ = instance.FPDFText_SetText(&requests.FPDFText_SetText{PageObject: objResp.PageObject, Text: line})
		_, _ = instance.FPDFPageObj_SetFillColor(&requests.FPDFPageObj_SetFillColor{
			PageObject: objResp.PageObject,
			FillColor:  block.fill,
		})
		matrix := structs.FPDF_FS_MATRIX{A: 1, D: 1, E: float32(block.left), F: float32(y)}
		_, _ = instance.FPDFPageObj_SetMatrix(&requests.FPDFPageObj_SetMatrix{
			PageObject: objResp.PageObject,
			Transform:  matrix,
		})
		if _, err := instance.FPDFPage_InsertObject(&requests.FPDFPage_InsertObject{
			Page:       page,
			PageObject: objResp.PageObject,
		}); err != nil {
			return ErrPDFMalformed
		}
		y -= lineHeight
	}
	return nil
}

func wrapPDFText(text string, width float64, fontSize float32, minSize float32) (float32, []string, bool) {
	size := fontSize
	for {
		lines := wrapPDFLines(text, width, size)
		height := float64(len(lines)) * float64(size) * 1.2
		blockHeight := float64(size) * 3
		if height <= blockHeight || size <= minSize {
			if height > blockHeight*2 && size <= minSize {
				return size, lines, true
			}
			return size, lines, false
		}
		size -= 0.5
		if size < minSize {
			lines := wrapPDFLines(text, width, minSize)
			return minSize, lines, true
		}
	}
}

func wrapPDFLines(text string, width float64, fontSize float32) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}
	charWidth := float64(fontSize) * 0.5
	maxChars := int(math.Max(8, width/charWidth))
	var lines []string
	var current strings.Builder
	for _, word := range words {
		nextLen := current.Len()
		if nextLen > 0 {
			nextLen++
		}
		nextLen += len(word)
		if nextLen > maxChars && current.Len() > 0 {
			lines = append(lines, strings.TrimSpace(current.String()))
			current.Reset()
		}
		if current.Len() > 0 {
			current.WriteByte(' ')
		}
		current.WriteString(word)
	}
	if current.Len() > 0 {
		lines = append(lines, current.String())
	}
	return lines
}

func validatePDFTargetScript(text string) error {
	for _, r := range text {
		if requiresPDFShaping(r) {
			return ErrPDFScriptUnsupported
		}
	}
	return nil
}

func requiresPDFShaping(r rune) bool {
	switch {
	case r >= 0x0600 && r <= 0x06FF:
		return true
	case r >= 0x0590 && r <= 0x05FF:
		return true
	case r >= 0x0900 && r <= 0x097F:
		return true
	case r >= 0x0980 && r <= 0x09FF:
		return true
	case r >= 0x0A00 && r <= 0x0A7F:
		return true
	case r >= 0x0A80 && r <= 0x0AFF:
		return true
	case r >= 0x0B00 && r <= 0x0B7F:
		return true
	case r >= 0x0B80 && r <= 0x0BFF:
		return true
	case r >= 0x0C00 && r <= 0x0C7F:
		return true
	case r >= 0x0C80 && r <= 0x0CFF:
		return true
	case r >= 0x0D00 && r <= 0x0D7F:
		return true
	default:
		return false
	}
}

// buildTestPDFDocument creates a single-page PDF with the given lines (test helper).
func buildTestPDFDocument(lines []string) ([]byte, error) {
	var out []byte
	err := withPDFiumInstance(context.Background(), func(instance pdfium.Pdfium) error {
		newDoc, err := instance.FPDF_CreateNewDocument(&requests.FPDF_CreateNewDocument{})
		if err != nil {
			return err
		}
		doc := newDoc.Document
		defer closePDFDocument(instance, doc)

		pageResp, err := instance.FPDFPage_New(&requests.FPDFPage_New{
			Document:  doc,
			PageIndex: 0,
			Width:     612,
			Height:    792,
		})
		if err != nil {
			return err
		}
		defer func() {
			_, _ = instance.FPDF_ClosePage(&requests.FPDF_ClosePage{Page: pageResp.Page})
		}()

		page := requests.Page{ByReference: &pageResp.Page}
		fontResp, err := instance.FPDFText_LoadStandardFont(&requests.FPDFText_LoadStandardFont{
			Document: doc,
			Font:     "Helvetica",
		})
		if err != nil {
			return err
		}
		defer func() {
			_, _ = instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: fontResp.Font})
		}()

		y := float32(720)
		for _, line := range lines {
			objResp, err := instance.FPDFPageObj_CreateTextObj(&requests.FPDFPageObj_CreateTextObj{
				Document: doc,
				Font:     fontResp.Font,
				FontSize: 14,
			})
			if err != nil {
				return err
			}
			_, _ = instance.FPDFText_SetText(&requests.FPDFText_SetText{PageObject: objResp.PageObject, Text: line})
			_, _ = instance.FPDFPageObj_SetMatrix(&requests.FPDFPageObj_SetMatrix{
				PageObject: objResp.PageObject,
				Transform:  structs.FPDF_FS_MATRIX{A: 1, D: 1, E: 72, F: y},
			})
			if _, err := instance.FPDFPage_InsertObject(&requests.FPDFPage_InsertObject{
				Page:       page,
				PageObject: objResp.PageObject,
			}); err != nil {
				return err
			}
			y -= 24
		}
		if _, err := instance.FPDFPage_GenerateContent(&requests.FPDFPage_GenerateContent{Page: page}); err != nil {
			return err
		}

		saved, err := instance.FPDF_SaveAsCopy(&requests.FPDF_SaveAsCopy{
			Document: doc,
			Flags:    requests.SaveFlagNoIncremental,
		})
		if err != nil {
			return err
		}
		if saved.FileBytes != nil {
			out = bytes.Clone(*saved.FileBytes)
		}
		return nil
	})
	return out, err
}
