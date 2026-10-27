package translationfileparser

import (
	"bytes"
	"context"

	"github.com/klippa-app/go-pdfium"
	"github.com/klippa-app/go-pdfium/enums"
	"github.com/klippa-app/go-pdfium/references"
	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/structs"
)

// FixtureSingleBlockPDF returns a minimal PDF with one text block for cross-package tests.
func FixtureSingleBlockPDF() ([]byte, error) {
	return buildTestPDFDocument([]string{"Fixture PDF block"})
}

// buildTestPDFDocumentWithEmbeddedFont is buildTestPDFDocument with the
// bundled CJK font embedded, for tests where the template font already
// covers the translated script.
func buildTestPDFDocumentWithEmbeddedFont(lines []string) ([]byte, error) {
	return buildTestPDFDocumentWithFontLoader(lines, func(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT) (references.FPDF_FONT, func(), error) {
		fontResp, err := instance.FPDFText_LoadFont(&requests.FPDFText_LoadFont{
			Document: doc,
			Data:     pdfCJKFontData,
			FontType: enums.FPDF_FONT_TRUETYPE,
			CID:      true,
		})
		if err != nil {
			return "", nil, err
		}
		return fontResp.Font, func() {
			_, _ = instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: fontResp.Font})
		}, nil
	})
}

func buildTestPDFDocument(lines []string) ([]byte, error) {
	return buildTestPDFDocumentWithFontLoader(lines, func(instance pdfium.Pdfium, doc references.FPDF_DOCUMENT) (references.FPDF_FONT, func(), error) {
		fontResp, err := instance.FPDFText_LoadStandardFont(&requests.FPDFText_LoadStandardFont{
			Document: doc,
			Font:     "Helvetica",
		})
		if err != nil {
			return "", nil, err
		}
		return fontResp.Font, func() {
			_, _ = instance.FPDFFont_Close(&requests.FPDFFont_Close{Font: fontResp.Font})
		}, nil
	})
}

func buildTestPDFDocumentWithFontLoader(lines []string, loadFont func(pdfium.Pdfium, references.FPDF_DOCUMENT) (references.FPDF_FONT, func(), error)) ([]byte, error) {
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
		font, closeFont, err := loadFont(instance, doc)
		if err != nil {
			return err
		}
		defer closeFont()

		y := float32(720)
		for _, line := range lines {
			objResp, err := instance.FPDFPageObj_CreateTextObj(&requests.FPDFPageObj_CreateTextObj{
				Document: doc,
				Font:     font,
				FontSize: 14,
			})
			if err != nil {
				return err
			}
			if _, err := instance.FPDFText_SetText(&requests.FPDFText_SetText{PageObject: objResp.PageObject, Text: line}); err != nil {
				return err
			}
			if _, err := instance.FPDFPageObj_SetMatrix(&requests.FPDFPageObj_SetMatrix{
				PageObject: objResp.PageObject,
				Transform:  structs.FPDF_FS_MATRIX{A: 1, D: 1, E: 72, F: y},
			}); err != nil {
				return err
			}
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
