package translationfileparser

import (
	_ "embed"
	"strings"
	"unicode"

	"github.com/klippa-app/go-pdfium"
	"github.com/klippa-app/go-pdfium/enums"
	"github.com/klippa-app/go-pdfium/references"
	"github.com/klippa-app/go-pdfium/requests"
	"golang.org/x/image/font/sfnt"
)

// pdfCJKFontData is WenQuanYi Micro Hei (see fonts/README.md), embedded so
// translated PDFs render CJK and Vietnamese glyphs that the PDF standard-14
// fonts (WinAnsi) do not contain.
//
//go:embed fonts/wqy-microhei.ttf
var pdfCJKFontData []byte

// pdfLocaleNeedsEmbeddedFont reports whether translations in targetLocale
// need the embedded Unicode font. The PDF standard-14 fonts used otherwise
// are WinAnsi-encoded: they contain no CJK glyphs and miss Vietnamese
// letters such as đ, ơ and ư, so those locales render as tofu without it.
func pdfLocaleNeedsEmbeddedFont(targetLocale string) bool {
	lang := strings.ToLower(strings.TrimSpace(targetLocale))
	if i := strings.IndexAny(lang, "-_"); i >= 0 {
		lang = lang[:i]
	}
	switch lang {
	case "zh", "ja", "ko", "vi", "yue":
		return true
	default:
		return false
	}
}

// loadPDFTranslationFont loads the font used to write one translated block.
// Locales that need it get the embedded CID TrueType font; every other
// locale keeps the previous Helvetica behavior.
func loadPDFTranslationFont(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT, targetLocale string) (references.FPDF_FONT, func(), error) {
	if !pdfLocaleNeedsEmbeddedFont(targetLocale) {
		resp, err := instance.FPDFText_LoadStandardFont(&requests.FPDFText_LoadStandardFont{
			Document: doc,
			Font:     "Helvetica",
		})
		if err != nil {
			return "", nil, err
		}
		return resp.Font, func() {
			_, _ = instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: resp.Font})
		}, nil
	}
	resp, err := instance.FPDFText_LoadFont(&requests.FPDFText_LoadFont{
		Document: doc,
		Data:     pdfCJKFontData,
		FontType: enums.FPDF_FONT_TRUETYPE,
		CID:      true,
	})
	if err != nil {
		return "", nil, err
	}
	return resp.Font, func() {
		_, _ = instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: resp.Font})
	}, nil
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
