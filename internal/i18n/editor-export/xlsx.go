package editor_export

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

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

func xlsxSheetRows(f *excelize.File) ([][]string, error) {
	if rows, err := f.GetRows(xlsxSheetName); err == nil && len(rows) > 0 {
		return rows, nil
	}
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("parse xlsx: workbook has no sheets")
	}
	return f.GetRows(sheets[0])
}

// ParseXLSX reads an Excel bilingual export with the same columns as CSV.
func ParseXLSX(body []byte) ([]Row, error) {
	f, err := excelize.OpenReader(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("parse xlsx: %w", err)
	}
	defer func() { _ = f.Close() }()

	records, err := xlsxSheetRows(f)
	if err != nil {
		return nil, fmt.Errorf("parse xlsx: %w", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	index := csvColumnIndex(records[0])
	if _, ok := index["key"]; !ok {
		return nil, fmt.Errorf("parse xlsx: missing key column")
	}
	rows := make([]Row, 0, len(records)-1)
	for _, record := range records[1:] {
		key := strings.TrimSpace(csvCell(record, index, "key"))
		if key == "" {
			continue
		}
		rows = append(rows, Row{
			Key:          key,
			SourceLocale: strings.TrimSpace(csvCell(record, index, "source_locale")),
			TargetLocale: strings.TrimSpace(csvCell(record, index, "target_locale")),
			SourceText:   csvCell(record, index, "source_text"),
			TargetText:   csvCell(record, index, "target_text"),
			SourcePath:   strings.TrimSpace(csvCell(record, index, "source_path")),
		})
	}
	return rows, nil
}
