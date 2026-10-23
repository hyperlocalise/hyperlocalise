package translationfileparser

import (
	"bytes"
	"context"

	"github.com/klippa-app/go-pdfium"
	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/structs"
)

// FixtureSingleBlockPDF returns a minimal PDF with one text block for cross-package tests.
func FixtureSingleBlockPDF() ([]byte, error) {
	return buildTestPDFDocument([]string{"Fixture PDF block"})
}

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
