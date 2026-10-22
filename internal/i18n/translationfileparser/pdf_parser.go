package translationfileparser

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/klippa-app/go-pdfium"
	"github.com/klippa-app/go-pdfium/enums"
	"github.com/klippa-app/go-pdfium/references"
	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/structs"
)

const (
	pdfLineBaselineTol    = 2.5
	pdfBlockLineGapFactor = 1.6
	// Horizontal gap larger than this multiple of font size starts a new line
	// so table cells and columns on the same baseline stay separate blocks.
	pdfColumnGapFactor = 2.0
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

// ReadPDFEntries extracts keyed text blocks from a PDF text layer.
func ReadPDFEntries(content []byte) ([]PDFEntry, error) {
	var entries []PDFEntry
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
		for page := 0; page < pageCount.PageCount; page++ {
			blocks, err := readPDFPageBlocks(instance, doc, page)
			if err != nil {
				return err
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

func readPDFPageBlocks(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT, pageIndex int) ([]pdfTextBlock, error) {
	page := requests.Page{ByIndex: &requests.PageByIndex{Document: doc, Index: pageIndex}}
	textPageResp, err := instance.FPDFText_LoadPage(&requests.FPDFText_LoadPage{Page: page})
	if err != nil {
		return nil, ErrPDFMalformed
	}
	defer func() {
		_, _ = instance.FPDFText_ClosePage(&requests.FPDFText_ClosePage{TextPage: textPageResp.TextPage})
	}()

	countResp, err := instance.FPDFPage_CountObjects(&requests.FPDFPage_CountObjects{Page: page})
	if err != nil {
		return nil, ErrPDFMalformed
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

	return groupPDFSpansIntoBlocks(spans), nil
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
		if math.Abs(span.top-last.top) <= pdfLineBaselineTol && !pdfSpansHaveColumnGap(last.spans[len(last.spans)-1], span) {
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

func pdfSpansHaveColumnGap(prev, next pdfTextSpan) bool {
	gap := next.left - prev.right
	if gap <= 0 {
		return false
	}
	fontSize := math.Max(float64(prev.fontSize), float64(next.fontSize))
	if fontSize <= 0 {
		fontSize = 12
	}
	return gap > fontSize*pdfColumnGapFactor
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
			blocks, err := readPDFPageBlocks(instance, doc, page)
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
	blockHeight := block.top - block.bottom
	if blockHeight <= 0 {
		blockHeight = float64(fontSize) * 1.2
	}
	fittedSize, lines, overflow := wrapPDFText(text, width, blockHeight, fontSize, minSize)
	_ = targetLocale

	if len(block.spans) == 1 && len(lines) == 1 {
		if _, err := instance.FPDFText_SetText(&requests.FPDFText_SetText{
			PageObject: block.spans[0].pageObject,
			Text:       lines[0],
		}); err == nil {
			if fittedSize != block.spans[0].fontSize {
				if _, err := instance.FPDFTextObj_SetFontSize(&requests.FPDFTextObj_SetFontSize{
					PageObject: block.spans[0].pageObject,
					FontSize:   fittedSize,
				}); err != nil {
					return ErrPDFMalformed
				}
			}
			if overflow {
				return pdfOverflowError{}
			}
			return nil
		}
	}

	for _, span := range block.spans {
		if _, err := instance.FPDFPage_RemoveObject(&requests.FPDFPage_RemoveObject{
			Page:       page,
			PageObject: span.pageObject,
		}); err != nil {
			return ErrPDFMalformed
		}
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
		if _, err := instance.FPDFText_SetText(&requests.FPDFText_SetText{PageObject: objResp.PageObject, Text: line}); err != nil {
			return ErrPDFMalformed
		}
		if _, err := instance.FPDFPageObj_SetFillColor(&requests.FPDFPageObj_SetFillColor{
			PageObject: objResp.PageObject,
			FillColor:  block.fill,
		}); err != nil {
			return ErrPDFMalformed
		}
		matrix := structs.FPDF_FS_MATRIX{A: 1, D: 1, E: float32(block.left), F: float32(y)}
		if _, err := instance.FPDFPageObj_SetMatrix(&requests.FPDFPageObj_SetMatrix{
			PageObject: objResp.PageObject,
			Transform:  matrix,
		}); err != nil {
			return ErrPDFMalformed
		}
		if _, err := instance.FPDFPage_InsertObject(&requests.FPDFPage_InsertObject{
			Page:       page,
			PageObject: objResp.PageObject,
		}); err != nil {
			return ErrPDFMalformed
		}
		y -= lineHeight
	}
	if overflow {
		return pdfOverflowError{}
	}
	return nil
}

func wrapPDFText(text string, width, blockHeight float64, fontSize float32, minSize float32) (float32, []string, bool) {
	if blockHeight <= 0 {
		blockHeight = float64(fontSize) * 1.2
	}
	size := fontSize
	for {
		lines := wrapPDFLines(text, width, size)
		tooWide := pdfLinesExceedWidth(lines, width, size)
		// One replacement line uses the original glyph box. Extra wrapped lines
		// must fit the measured block height so they do not paint over neighbors.
		fitsHeight := len(lines) <= 1
		if !fitsHeight {
			height := float64(size) + float64(len(lines)-1)*float64(size)*1.2
			fitsHeight = height <= blockHeight
		}
		if fitsHeight && !tooWide {
			return size, lines, false
		}
		if size <= minSize {
			return size, lines, true
		}
		size -= 0.5
		if size < minSize {
			size = minSize
		}
	}
}

func pdfLinesExceedWidth(lines []string, width float64, fontSize float32) bool {
	charWidth := float64(fontSize) * 0.5
	if charWidth <= 0 {
		return false
	}
	maxChars := int(math.Max(1, width/charWidth))
	for _, line := range lines {
		if len([]rune(line)) > maxChars {
			return true
		}
	}
	return false
}

func wrapPDFLines(text string, width float64, fontSize float32) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}
	charWidth := float64(fontSize) * 0.5
	maxChars := int(math.Max(1, width/charWidth))
	var lines []string
	var current []rune
	flush := func() {
		if len(current) == 0 {
			return
		}
		lines = append(lines, string(current))
		current = current[:0]
	}
	for _, word := range words {
		for _, chunk := range splitPDFWord(word, maxChars) {
			chunkRunes := []rune(chunk)
			nextLen := len(current)
			if nextLen > 0 {
				nextLen++
			}
			nextLen += len(chunkRunes)
			if nextLen > maxChars && len(current) > 0 {
				flush()
			}
			if len(current) > 0 {
				current = append(current, ' ')
			}
			current = append(current, chunkRunes...)
		}
	}
	flush()
	return lines
}

func splitPDFWord(word string, maxChars int) []string {
	runes := []rune(word)
	if maxChars <= 0 || len(runes) <= maxChars {
		return []string{word}
	}
	chunks := make([]string, 0, (len(runes)+maxChars-1)/maxChars)
	for len(runes) > 0 {
		n := maxChars
		if n > len(runes) {
			n = len(runes)
		}
		chunks = append(chunks, string(runes[:n]))
		runes = runes[n:]
	}
	return chunks
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
