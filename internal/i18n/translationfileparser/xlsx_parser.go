package translationfileparser

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"

	"github.com/xuri/excelize/v2"
)

// Excel workbooks (.xlsx) are read one visible worksheet at a time, in one of
// two layouts chosen from the sheet's first row and the source locale:
//
//   - Multilingual: the first row has a column naming the source locale
//     (for example "English", "en-US", or "en"). Each later row is one entry
//     and other columns may hold its key, a translator comment, a length
//     limit, or other locales. A row's key is the value of its key column, or
//     "Sheet!N:N" when the key cell is empty or repeats an earlier key.
//   - Cell: no column names the source locale. Every text cell, including
//     the first row, is one entry keyed by its address, for example
//     "Sheet1!B3".
//
// Formulas, numbers, dates, booleans, and cells without letters are never
// entries. Hidden sheets are skipped.

const (
	xlsxSheetSeparator = "!"
	// xlsxMaxUnzipBytes caps the decompressed workbook to guard against zip bombs.
	xlsxMaxUnzipBytes = 512 << 20
)

// XLSXParser parses Excel workbooks. Without a locale every sheet uses the
// cell layout; use ParseXLSXLocale to read multilingual columns.
type XLSXParser struct{}

func (p XLSXParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p XLSXParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	return ParseXLSXLocaleWithContext(content, "", "")
}

// XLSXEntry is one translatable unit of a workbook.
type XLSXEntry struct {
	Key       string
	Text      string
	Sheet     string
	Cell      string
	Comment   string
	MaxLength int
}

// ParseXLSXLocale returns the entries stored for locale, with layouts chosen
// by sourceLocale: the locale column in multilingual sheets and every text
// cell in cell-layout sheets. An empty sourceLocale chooses layouts by locale.
func ParseXLSXLocale(content []byte, sourceLocale, locale string) (map[string]string, error) {
	values, _, err := ParseXLSXLocaleWithContext(content, sourceLocale, locale)
	return values, err
}

// ParseXLSXLocaleWithContext is ParseXLSXLocale plus each entry's comment.
func ParseXLSXLocaleWithContext(content []byte, sourceLocale, locale string) (map[string]string, map[string]string, error) {
	entries, err := ReadXLSXEntries(content, sourceLocale, locale)
	if err != nil {
		return nil, nil, err
	}
	values := make(map[string]string, len(entries))
	var entryContext map[string]string
	for _, entry := range entries {
		values[entry.Key] = entry.Text
		if entry.Comment != "" {
			if entryContext == nil {
				entryContext = map[string]string{}
			}
			entryContext[entry.Key] = entry.Comment
		}
	}
	return values, entryContext, nil
}

// ParseXLSXIngestEntries returns locale entries with their length limits.
func ParseXLSXIngestEntries(content []byte, sourceLocale, locale string) (map[string]IngestEntry, error) {
	entries, err := ReadXLSXEntries(content, sourceLocale, locale)
	if err != nil {
		return nil, err
	}
	out := make(map[string]IngestEntry, len(entries))
	for _, entry := range entries {
		out[entry.Key] = IngestEntry{Text: entry.Text, MaxLength: entry.MaxLength}
	}
	return out, nil
}

// ReadXLSXEntries lists locale entries in sheet, row, and column order. See
// ParseXLSXLocale for how sourceLocale and locale apply.
func ReadXLSXEntries(content []byte, sourceLocale, locale string) ([]XLSXEntry, error) {
	if strings.TrimSpace(sourceLocale) == "" {
		sourceLocale = locale
	}
	workbook, err := openXLSX(content)
	if err != nil {
		return nil, err
	}
	defer func() { _ = workbook.Close() }()

	sheets, err := loadXLSXSheets(workbook)
	if err != nil {
		return nil, err
	}

	var entries []XLSXEntry
	for _, sheet := range sheets {
		sourceColumn := sheet.columns.localeColumn(sourceLocale)
		if sourceColumn < 0 {
			sheetEntries, err := sheet.cellEntries(workbook)
			if err != nil {
				return nil, err
			}
			entries = append(entries, sheetEntries...)
			continue
		}
		column := sourceColumn
		if xlsxHeaderSlug(locale) != xlsxHeaderSlug(sourceLocale) {
			column = sheet.columns.localeColumn(locale, sourceColumn)
		}
		if column < 0 {
			continue
		}
		for rowIndex := 1; rowIndex < len(sheet.rows); rowIndex++ {
			cell, ok := xlsxCellName(column, rowIndex)
			if !ok {
				continue
			}
			text := xlsxRowValue(sheet.rows[rowIndex], column)
			translatable, err := xlsxIsTranslatableCell(workbook, sheet.name, cell, text)
			if err != nil {
				return nil, err
			}
			if !translatable {
				continue
			}
			entries = append(entries, XLSXEntry{
				Key:       sheet.rowKeys[rowIndex],
				Text:      text,
				Sheet:     sheet.name,
				Cell:      cell,
				Comment:   strings.TrimSpace(xlsxRowValue(sheet.rows[rowIndex], sheet.columns.comment)),
				MaxLength: parseXLSXMaxLength(xlsxRowValue(sheet.rows[rowIndex], sheet.columns.maxLength)),
			})
		}
	}
	return entries, nil
}

// MarshalXLSX writes values into a copy of template. Multilingual sheets
// receive values in the targetLocale column, which is appended after the last
// used column when the first row has none. Cell-layout sheets receive values
// in place of the source text. Empty values and unknown keys are skipped, and
// every other part of the workbook is carried over.
func MarshalXLSX(template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	workbook, err := openXLSX(template)
	if err != nil {
		return nil, err
	}
	defer func() { _ = workbook.Close() }()

	sheets, err := loadXLSXSheets(workbook)
	if err != nil {
		return nil, err
	}

	for _, sheet := range sheets {
		sourceColumn := sheet.columns.localeColumn(sourceLocale)
		if sourceColumn < 0 {
			if err := sheet.marshalCells(workbook, values); err != nil {
				return nil, err
			}
			continue
		}
		if err := sheet.marshalRows(workbook, values, sourceColumn, targetLocale); err != nil {
			return nil, err
		}
	}

	buffer, err := workbook.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("xlsx: write workbook: %w", err)
	}
	return buffer.Bytes(), nil
}

type xlsxSheet struct {
	name    string
	rows    [][]string
	columns xlsxHeaderColumns
	rowKeys map[int]string
	maxCols int
}

func openXLSX(content []byte) (*excelize.File, error) {
	workbook, err := excelize.OpenReader(bytes.NewReader(content), excelize.Options{UnzipSizeLimit: xlsxMaxUnzipBytes})
	if err != nil {
		return nil, fmt.Errorf("xlsx: open workbook: %w", err)
	}
	return workbook, nil
}

func loadXLSXSheets(workbook *excelize.File) ([]xlsxSheet, error) {
	seenKeys := map[string]struct{}{}
	var sheets []xlsxSheet
	for _, name := range workbook.GetSheetList() {
		visible, err := workbook.GetSheetVisible(name)
		if err != nil {
			return nil, fmt.Errorf("xlsx: sheet %q visibility: %w", name, err)
		}
		if !visible {
			continue
		}
		rows, err := workbook.GetRows(name, excelize.Options{RawCellValue: true})
		if err != nil {
			if errors.Is(err, excelize.ErrSheetNotExist{SheetName: name}) {
				continue
			}
			return nil, fmt.Errorf("xlsx: read sheet %q: %w", name, err)
		}
		sheet := xlsxSheet{name: name, rows: rows, rowKeys: map[int]string{}}
		if len(rows) > 0 {
			sheet.columns = resolveXLSXHeaderColumns(rows[0])
		} else {
			sheet.columns = resolveXLSXHeaderColumns(nil)
		}
		for rowIndex, row := range rows {
			sheet.maxCols = max(sheet.maxCols, len(row))
			if rowIndex == 0 {
				continue
			}
			key := strings.TrimSpace(xlsxRowValue(row, sheet.columns.key))
			if _, duplicate := seenKeys[key]; key == "" || duplicate {
				key = xlsxRowKey(name, rowIndex)
			}
			seenKeys[key] = struct{}{}
			sheet.rowKeys[rowIndex] = key
		}
		sheets = append(sheets, sheet)
	}
	return sheets, nil
}

func (s xlsxSheet) cellEntries(workbook *excelize.File) ([]XLSXEntry, error) {
	var entries []XLSXEntry
	for rowIndex, row := range s.rows {
		for columnIndex, text := range row {
			cell, ok := xlsxCellName(columnIndex, rowIndex)
			if !ok {
				continue
			}
			translatable, err := xlsxIsTranslatableCell(workbook, s.name, cell, text)
			if err != nil {
				return nil, err
			}
			if !translatable {
				continue
			}
			entries = append(entries, XLSXEntry{
				Key:   s.name + xlsxSheetSeparator + cell,
				Text:  text,
				Sheet: s.name,
				Cell:  cell,
			})
		}
	}
	return entries, nil
}

func (s xlsxSheet) marshalCells(workbook *excelize.File, values map[string]string) error {
	prefix := s.name + xlsxSheetSeparator
	for key, value := range values {
		cell, ok := strings.CutPrefix(key, prefix)
		if !ok || value == "" || strings.Contains(cell, xlsxSheetSeparator) {
			continue
		}
		column, row, err := excelize.CellNameToCoordinates(cell)
		if err != nil {
			continue
		}
		translatable, err := xlsxIsTranslatableCell(workbook, s.name, cell, xlsxRowValue(xlsxRowAt(s.rows, row-1), column-1))
		if err != nil {
			return err
		}
		if !translatable {
			continue
		}
		if err := workbook.SetCellStr(s.name, cell, value); err != nil {
			return fmt.Errorf("xlsx: write %s: %w", key, err)
		}
	}
	return nil
}

func (s xlsxSheet) marshalRows(workbook *excelize.File, values map[string]string, sourceColumn int, targetLocale string) error {
	targetColumn := s.columns.localeColumn(targetLocale, sourceColumn)
	appended := targetColumn < 0
	if appended {
		targetColumn = s.maxCols
		header, ok := xlsxCellName(targetColumn, 0)
		if !ok {
			return fmt.Errorf("xlsx: sheet %q has no free column for %q", s.name, targetLocale)
		}
		if err := workbook.SetCellStr(s.name, header, strings.TrimSpace(targetLocale)); err != nil {
			return fmt.Errorf("xlsx: write %s header: %w", s.name, err)
		}
		if err := copyXLSXCellStyle(workbook, s.name, sourceColumn, targetColumn, 0); err != nil {
			return err
		}
		if err := copyXLSXColumnWidth(workbook, s.name, sourceColumn, targetColumn); err != nil {
			return err
		}
	}

	for rowIndex := 1; rowIndex < len(s.rows); rowIndex++ {
		value, ok := values[s.rowKeys[rowIndex]]
		if !ok || value == "" {
			continue
		}
		cell, ok := xlsxCellName(targetColumn, rowIndex)
		if !ok {
			continue
		}
		formula, err := workbook.GetCellFormula(s.name, cell)
		if err != nil {
			return fmt.Errorf("xlsx: read %s!%s: %w", s.name, cell, err)
		}
		if formula != "" {
			continue
		}
		if err := workbook.SetCellStr(s.name, cell, value); err != nil {
			return fmt.Errorf("xlsx: write %s!%s: %w", s.name, cell, err)
		}
		if appended {
			if err := copyXLSXCellStyle(workbook, s.name, sourceColumn, targetColumn, rowIndex); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyXLSXCellStyle(workbook *excelize.File, sheet string, fromColumn, toColumn, rowIndex int) error {
	from, okFrom := xlsxCellName(fromColumn, rowIndex)
	to, okTo := xlsxCellName(toColumn, rowIndex)
	if !okFrom || !okTo {
		return nil
	}
	style, err := workbook.GetCellStyle(sheet, from)
	if err != nil {
		return fmt.Errorf("xlsx: read style %s!%s: %w", sheet, from, err)
	}
	if style == 0 {
		return nil
	}
	if err := workbook.SetCellStyle(sheet, to, to, style); err != nil {
		return fmt.Errorf("xlsx: write style %s!%s: %w", sheet, to, err)
	}
	return nil
}

func copyXLSXColumnWidth(workbook *excelize.File, sheet string, fromColumn, toColumn int) error {
	from, err := excelize.ColumnNumberToName(fromColumn + 1)
	if err != nil {
		return nil
	}
	to, err := excelize.ColumnNumberToName(toColumn + 1)
	if err != nil {
		return nil
	}
	width, err := workbook.GetColWidth(sheet, from)
	if err != nil {
		return fmt.Errorf("xlsx: read width %s!%s: %w", sheet, from, err)
	}
	if err := workbook.SetColWidth(sheet, to, to, width); err != nil {
		return fmt.Errorf("xlsx: write width %s!%s: %w", sheet, to, err)
	}
	return nil
}

func xlsxIsTranslatableCell(workbook *excelize.File, sheet, cell, text string) (bool, error) {
	if !xlsxHasLetter(text) {
		return false, nil
	}
	cellType, err := workbook.GetCellType(sheet, cell)
	if err != nil {
		return false, fmt.Errorf("xlsx: read %s!%s: %w", sheet, cell, err)
	}
	// Excelize reports t="str" as a formula type, but writers such as SheetJS also use it
	// for plain strings without an <f> element; the formula check below separates the two.
	switch cellType {
	case excelize.CellTypeSharedString, excelize.CellTypeInlineString, excelize.CellTypeFormula:
	default:
		return false, nil
	}
	formula, err := workbook.GetCellFormula(sheet, cell)
	if err != nil {
		return false, fmt.Errorf("xlsx: read %s!%s: %w", sheet, cell, err)
	}
	return formula == "", nil
}

func xlsxHasLetter(text string) bool {
	for _, r := range text {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

func xlsxRowKey(sheet string, rowIndex int) string {
	row := strconv.Itoa(rowIndex + 1)
	return sheet + xlsxSheetSeparator + row + ":" + row
}

func xlsxCellName(columnIndex, rowIndex int) (string, bool) {
	cell, err := excelize.CoordinatesToCellName(columnIndex+1, rowIndex+1)
	return cell, err == nil
}

func xlsxRowAt(rows [][]string, rowIndex int) []string {
	if rowIndex < 0 || rowIndex >= len(rows) {
		return nil
	}
	return rows[rowIndex]
}

func xlsxRowValue(row []string, columnIndex int) string {
	if columnIndex < 0 || columnIndex >= len(row) {
		return ""
	}
	return row[columnIndex]
}

func parseXLSXMaxLength(raw string) int {
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || value < 1 || value > math.MaxInt32 {
		return 0
	}
	return int(value)
}
