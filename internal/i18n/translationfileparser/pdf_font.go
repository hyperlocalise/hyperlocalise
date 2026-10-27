package translationfileparser

import (
	_ "embed"
	"unicode"

	"github.com/klippa-app/go-pdfium"
	"github.com/klippa-app/go-pdfium/enums"
	"github.com/klippa-app/go-pdfium/references"
	"github.com/klippa-app/go-pdfium/requests"
	"golang.org/x/image/font/sfnt"
)

// Bundled export fonts (see fonts/README.md). Micro Hei covers CJK, Latin,
// Vietnamese, kana and hangul; the Noto fonts cover Thai and Lao (plus
// Latin, so mixed blocks work with a single font).
//
//go:embed fonts/wqy-microhei.ttf
var pdfCJKFontData []byte

//go:embed fonts/NotoSansThai.ttf
var pdfThaiFontData []byte

//go:embed fonts/NotoSansLao.ttf
var pdfLaoFontData []byte

// pdfEmbeddedFonts is the fallback set in preference order: the widest
// coverage first so mixed blocks land on one font when possible.
func pdfEmbeddedFonts() []struct {
	name string
	data []byte
} {
	return []struct {
		name string
		data []byte
	}{
		{name: "microhei", data: pdfCJKFontData},
		{name: "noto-thai", data: pdfThaiFontData},
		{name: "noto-lao", data: pdfLaoFontData},
	}
}

// pdfEmbeddedFontForText returns the first bundled font whose cmap covers
// every rune of text, or nil when no bundled font can render it.
func pdfEmbeddedFontForText(text string) (name string, data []byte) {
	for _, font := range pdfEmbeddedFonts() {
		if pdfFontDataCoversText(font.data, text) {
			return font.name, font.data
		}
	}
	return "", nil
}

// pdfRuneIsWinAnsi reports whether r is encodable in the PDF standard-14
// fonts (Windows-1252 plus the extra WinAnsi punctuation). Text covered here
// keeps the previous Helvetica behavior.
func pdfRuneIsWinAnsi(r rune) bool {
	switch {
	case r >= 0x20 && r <= 0x7E:
		return true
	case r == 0xA0:
		return true
	case r >= 0xA1 && r <= 0xFF:
		switch r {
		case 0x81, 0x8D, 0x8F, 0x90, 0x9D:
			return false
		default:
			return true
		}
	}
	switch r {
	case 0x152, 0x153, 0x160, 0x161, 0x178, 0x17D, 0x17E, 0x192,
		0x2C6, 0x2DC, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A,
		0x201C, 0x201D, 0x201E, 0x2020, 0x2021, 0x2022, 0x2026,
		0x2030, 0x2039, 0x203A, 0x20AC, 0x2122:
		return true
	default:
		return false
	}
}

// pdfTextIsWinAnsi reports whether every rune of text renders in the PDF
// standard-14 fonts.
func pdfTextIsWinAnsi(text string) bool {
	for _, r := range text {
		if !pdfRuneIsWinAnsi(r) {
			return false
		}
	}
	return true
}

// pdfOriginalFontCoversText reports whether the template's own font for the
// given text object can render text. Only embedded fonts are trusted:
// FPDFFont_GetFontData returns substitution data for non-embedded fonts, and
// the substitute may claim glyphs the rendered output will not have. Callers
// use this to keep the template's look when possible and fall back to the
// embedded font otherwise.
func pdfOriginalFontCoversText(instance pdfium.Pdfium, pageObject references.FPDF_PAGEOBJECT, text string) bool {
	fontResp, err := instance.FPDFTextObj_GetFont(&requests.FPDFTextObj_GetFont{PageObject: pageObject})
	if err != nil {
		return false
	}
	embeddedResp, err := instance.FPDFFont_GetIsEmbedded(&requests.FPDFFont_GetIsEmbedded{Font: fontResp.Font})
	if err != nil || !embeddedResp.IsEmbedded {
		return false
	}
	dataResp, err := instance.FPDFFont_GetFontData(&requests.FPDFFont_GetFontData{Font: fontResp.Font})
	if err != nil || len(dataResp.FontData) == 0 {
		return false
	}
	return pdfFontDataCoversText(dataResp.FontData, text)
}

// pdfFontDataCoversText reports whether the sfnt font in data maps every
// non-space rune of text to a real glyph (glyph ID 0 is .notdef).
func pdfFontDataCoversText(data []byte, text string) bool {
	font, err := sfnt.Parse(data)
	if err != nil {
		return false
	}
	var buf sfnt.Buffer
	for _, r := range text {
		if unicode.IsSpace(r) {
			continue
		}
		glyph, err := font.GlyphIndex(&buf, r)
		if err != nil || glyph == 0 {
			return false
		}
	}
	return true
}

// pdfBlockWriteFont picks the recreate-path font for text: Helvetica for
// WinAnsi, else the first bundled font covering it. Block validation runs
// before any block is rewritten, so the error here is unreachable in
// practice and guards against regressions.
func pdfBlockWriteFont(fonts *pdfDocFonts, doc references.FPDF_DOCUMENT, text string) (references.FPDF_FONT, error) {
	if pdfTextIsWinAnsi(text) {
		font, err := fonts.standard(doc)
		if err != nil {
			return "", ErrPDFMalformed
		}
		return font, nil
	}
	if name, data := pdfEmbeddedFontForText(text); data != nil {
		font, err := fonts.embedded(doc, name, data)
		if err != nil {
			return "", ErrPDFMalformed
		}
		return font, nil
	}
	return "", ErrPDFScriptUnsupported
}

// pdfDocFonts loads translation fonts on demand and closes them with the
// document. Embedded fonts are only loaded when a block actually needs one,
// so Latin-only exports pay nothing for the bundled CJK/Thai/Lao data.
type pdfDocFonts struct {
	instance pdfium.Pdfium
	loaded   map[string]references.FPDF_FONT
}

func newPdfDocFonts(instance pdfium.Pdfium) *pdfDocFonts {
	return &pdfDocFonts{instance: instance, loaded: map[string]references.FPDF_FONT{}}
}

func (f *pdfDocFonts) standard(doc references.FPDF_DOCUMENT) (references.FPDF_FONT, error) {
	if font, ok := f.loaded["standard"]; ok {
		return font, nil
	}
	resp, err := f.instance.FPDFText_LoadStandardFont(&requests.FPDFText_LoadStandardFont{
		Document: doc,
		Font:     "Helvetica",
	})
	if err != nil {
		return "", err
	}
	f.loaded["standard"] = resp.Font
	return resp.Font, nil
}

// embedded returns the loaded bundled font for the named pdfEmbeddedFonts
// entry, loading it on first use.
func (f *pdfDocFonts) embedded(doc references.FPDF_DOCUMENT, name string, data []byte) (references.FPDF_FONT, error) {
	key := "embedded-" + name
	if font, ok := f.loaded[key]; ok {
		return font, nil
	}
	resp, err := f.instance.FPDFText_LoadFont(&requests.FPDFText_LoadFont{
		Document: doc,
		Data:     data,
		FontType: enums.FPDF_FONT_TRUETYPE,
		CID:      true,
	})
	if err != nil {
		return "", err
	}
	f.loaded[key] = resp.Font
	return resp.Font, nil
}

func (f *pdfDocFonts) close() {
	for _, font := range f.loaded {
		_, _ = f.instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: font})
	}
	clear(f.loaded)
}
