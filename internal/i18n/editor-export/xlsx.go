package editor_export

import (
	"bytes"
	"fmt"
	"strconv"

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

	sw, err := f.NewStreamWriter(xlsxSheetName)
	if err != nil {
		return nil, err
	}

	headerRow := make([]any, len(csvHeader))
	for i, h := range csvHeader {
		headerRow[i] = h
	}
	if err := sw.SetRow("A1", headerRow); err != nil {
		return nil, err
	}

	for rowIndex, row := range rows {
		cell := "A" + strconv.Itoa(rowIndex+2)
		rowData := []any{
			row.Key,
			row.SourceLocale,
			row.TargetLocale,
			row.SourceText,
			row.TargetText,
			row.SourcePath,
		}
		if err := sw.SetRow(cell, rowData); err != nil {
			return nil, err
		}
	}

	if err := sw.Flush(); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write xlsx: %w", err)
	}
	return buf.Bytes(), nil
}
