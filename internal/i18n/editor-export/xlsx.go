package editor_export

import (
	"bytes"
	"fmt"

	"github.com/xuri/excelize/v2"
)

const xlsxSheetName = "Segments"

// SerializeXLSX writes an Excel workbook with the same columns as CSV export.
func SerializeXLSX(rows []Row) ([]byte, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	defaultSheet := f.GetSheetName(0)
	if err := f.SetSheetName(defaultSheet, xlsxSheetName); err != nil {
		return nil, err
	}

	for col, header := range csvHeader {
		cell, err := excelize.CoordinatesToCellName(col+1, 1)
		if err != nil {
			return nil, err
		}
		if err := f.SetCellValue(xlsxSheetName, cell, header); err != nil {
			return nil, err
		}
	}

	for rowIndex, row := range rows {
		values := []string{
			row.Key,
			row.SourceLocale,
			row.TargetLocale,
			row.SourceText,
			row.TargetText,
			row.SourcePath,
		}
		for col, value := range values {
			cell, err := excelize.CoordinatesToCellName(col+1, rowIndex+2)
			if err != nil {
				return nil, err
			}
			if err := f.SetCellValue(xlsxSheetName, cell, value); err != nil {
				return nil, err
			}
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write xlsx: %w", err)
	}
	return buf.Bytes(), nil
}
