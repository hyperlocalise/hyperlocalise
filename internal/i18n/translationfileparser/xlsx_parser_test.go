package translationfileparser

import (
	"archive/zip"
	"bytes"
	"io"
	"reflect"
	"testing"

	"github.com/xuri/excelize/v2"
)

type xlsxTestCell struct {
	cell    string
	value   any
	formula string
}

func buildXLSX(t *testing.T, sheets map[string][]xlsxTestCell, order []string, hidden ...string) []byte {
	t.Helper()
	workbook := excelize.NewFile()
	defer func() { _ = workbook.Close() }()
	for index, name := range order {
		if index == 0 {
			if err := workbook.SetSheetName("Sheet1", name); err != nil {
				t.Fatalf("rename sheet: %v", err)
			}
		} else if _, err := workbook.NewSheet(name); err != nil {
			t.Fatalf("new sheet: %v", err)
		}
		for _, cell := range sheets[name] {
			if cell.formula != "" {
				if err := workbook.SetCellFormula(name, cell.cell, cell.formula); err != nil {
					t.Fatalf("set formula: %v", err)
				}
				continue
			}
			if err := workbook.SetCellValue(name, cell.cell, cell.value); err != nil {
				t.Fatalf("set cell: %v", err)
			}
		}
	}
	for _, name := range hidden {
		if err := workbook.SetSheetVisible(name, false); err != nil {
			t.Fatalf("hide sheet: %v", err)
		}
	}
	buffer, err := workbook.WriteToBuffer()
	if err != nil {
		t.Fatalf("write workbook: %v", err)
	}
	return buffer.Bytes()
}

func multilingualXLSX(t *testing.T) []byte {
	t.Helper()
	return buildXLSX(t, map[string][]xlsxTestCell{
		"Strings": {
			{cell: "A1", value: "Key"},
			{cell: "B1", value: "French"},
			{cell: "C1", value: "de-DE"},
			{cell: "D1", value: "English"},
			{cell: "E1", value: "Comment"},
			{cell: "F1", value: "String length"},
			{cell: "A2", value: "home.title"},
			{cell: "B2", value: "Accueil"},
			{cell: "D2", value: "Home"},
			{cell: "E2", value: "Navigation label"},
			{cell: "F2", value: 12},
			{cell: "A3", value: "home.cta"},
			{cell: "D3", value: "Start free trial"},
			{cell: "A4", value: "home.title"},
			{cell: "D4", value: "Home again"},
			{cell: "D5", value: "No key here"},
			{cell: "A6", value: "price"},
			{cell: "D6", value: 42},
			{cell: "A7", value: "total"},
			{cell: "D7", formula: `CONCAT("To","tal")`},
		},
	}, []string{"Strings"})
}

func TestReadXLSXEntriesMultilingualSource(t *testing.T) {
	entries, err := ReadXLSXEntries(multilingualXLSX(t), "en-US", "en-US")
	if err != nil {
		t.Fatalf("read entries: %v", err)
	}
	want := []XLSXEntry{
		{Key: "home.title", Text: "Home", Sheet: "Strings", Cell: "D2", Comment: "Navigation label", MaxLength: 12},
		{Key: "home.cta", Text: "Start free trial", Sheet: "Strings", Cell: "D3"},
		{Key: "Strings!4:4", Text: "Home again", Sheet: "Strings", Cell: "D4"},
		{Key: "Strings!5:5", Text: "No key here", Sheet: "Strings", Cell: "D5"},
	}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("entries mismatch\n got: %#v\nwant: %#v", entries, want)
	}
}

func TestParseXLSXLocaleReadsTargetColumnWithSourceKeys(t *testing.T) {
	values, err := ParseXLSXLocale(multilingualXLSX(t), "en", "fr-FR")
	if err != nil {
		t.Fatalf("parse locale: %v", err)
	}
	if !reflect.DeepEqual(values, map[string]string{"home.title": "Accueil"}) {
		t.Fatalf("unexpected fr values: %#v", values)
	}

	values, err = ParseXLSXLocale(multilingualXLSX(t), "en", "es")
	if err != nil {
		t.Fatalf("parse missing locale: %v", err)
	}
	if len(values) != 0 {
		t.Fatalf("expected no values for a locale without a column, got %#v", values)
	}
}

func cellLayoutXLSX(t *testing.T) []byte {
	t.Helper()
	return buildXLSX(t, map[string][]xlsxTestCell{
		"Pricing": {
			{cell: "A1", value: "Plan"},
			{cell: "B1", value: "Price"},
			{cell: "A2", value: "Starter"},
			{cell: "B2", value: 9},
			{cell: "A3", value: "—"},
			{cell: "B3", formula: "B2*2"},
			{cell: "C4", value: "Billed yearly"},
		},
		"Lookup": {{cell: "A1", value: "Hidden text"}},
	}, []string{"Pricing", "Lookup"}, "Lookup")
}

func TestReadXLSXEntriesCellLayout(t *testing.T) {
	values, err := ParseXLSXLocale(cellLayoutXLSX(t), "en", "en")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	want := map[string]string{
		"Pricing!A1": "Plan",
		"Pricing!B1": "Price",
		"Pricing!A2": "Starter",
		"Pricing!C4": "Billed yearly",
	}
	if !reflect.DeepEqual(values, want) {
		t.Fatalf("values mismatch\n got: %#v\nwant: %#v", values, want)
	}
}

func TestMarshalXLSXMultilingualFillsExistingAndAppendedColumns(t *testing.T) {
	template := multilingualXLSX(t)

	french, err := MarshalXLSX(template, map[string]string{
		"home.title":  "Accueil v2",
		"home.cta":    "Essai gratuit",
		"Strings!5:5": "Pas de clé",
		"missing":     "ignored",
	}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal fr: %v", err)
	}
	values, err := ParseXLSXLocale(french, "en", "fr")
	if err != nil {
		t.Fatalf("reparse fr: %v", err)
	}
	wantFrench := map[string]string{"home.title": "Accueil v2", "home.cta": "Essai gratuit", "Strings!5:5": "Pas de clé"}
	if !reflect.DeepEqual(values, wantFrench) {
		t.Fatalf("fr mismatch\n got: %#v\nwant: %#v", values, wantFrench)
	}
	source, err := ReadXLSXEntries(french, "en", "en")
	if err != nil {
		t.Fatalf("reparse source: %v", err)
	}
	if len(source) != 4 || source[0].Text != "Home" {
		t.Fatalf("source column changed: %#v", source)
	}

	spanish, err := MarshalXLSX(template, map[string]string{"home.cta": "Prueba gratis"}, "en", "es-419")
	if err != nil {
		t.Fatalf("marshal es: %v", err)
	}
	workbook, err := excelize.OpenReader(bytes.NewReader(spanish))
	if err != nil {
		t.Fatalf("open es: %v", err)
	}
	defer func() { _ = workbook.Close() }()
	if header, _ := workbook.GetCellValue("Strings", "G1"); header != "es-419" {
		t.Fatalf("expected appended es-419 header in G1, got %q", header)
	}
	if value, _ := workbook.GetCellValue("Strings", "G3"); value != "Prueba gratis" {
		t.Fatalf("expected appended translation in G3, got %q", value)
	}
	values, err = ParseXLSXLocale(spanish, "en", "es-419")
	if err != nil {
		t.Fatalf("reparse es: %v", err)
	}
	if !reflect.DeepEqual(values, map[string]string{"home.cta": "Prueba gratis"}) {
		t.Fatalf("unexpected es values: %#v", values)
	}
}

func TestMarshalXLSXDoesNotReuseSourceColumnForSameLanguageTarget(t *testing.T) {
	out, err := MarshalXLSX(multilingualXLSX(t), map[string]string{"home.cta": "Start your free trial"}, "en-US", "en-GB")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	source, err := ParseXLSXLocale(out, "en-US", "en-US")
	if err != nil {
		t.Fatalf("reparse source: %v", err)
	}
	if source["home.cta"] != "Start free trial" {
		t.Fatalf("source text overwritten: %q", source["home.cta"])
	}
	target, err := ParseXLSXLocale(out, "en-US", "en-GB")
	if err != nil {
		t.Fatalf("reparse target: %v", err)
	}
	if target["home.cta"] != "Start your free trial" {
		t.Fatalf("unexpected en-GB value: %#v", target)
	}
}

func TestMarshalXLSXCellLayoutReplacesTextInPlace(t *testing.T) {
	template := cellLayoutXLSX(t)
	out, err := MarshalXLSX(template, map[string]string{
		"Pricing!A2": "Débutant",
		"Pricing!B2": "should not replace a number",
		"Pricing!B3": "should not replace a formula",
		"Lookup!A1":  "should not touch hidden sheets",
		"Pricing!Z9": "should not create cells",
		"Pricing!A1": "",
	}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	workbook, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() { _ = workbook.Close() }()
	checks := map[string]string{"A1": "Plan", "A2": "Débutant", "B2": "9", "Z9": ""}
	for cell, want := range checks {
		if got, _ := workbook.GetCellValue("Pricing", cell); got != want {
			t.Fatalf("Pricing!%s = %q, want %q", cell, got, want)
		}
	}
	if formula, _ := workbook.GetCellFormula("Pricing", "B3"); formula != "B2*2" {
		t.Fatalf("formula changed: %q", formula)
	}
	if hidden, _ := workbook.GetCellValue("Lookup", "A1"); hidden != "Hidden text" {
		t.Fatalf("hidden sheet changed: %q", hidden)
	}
}

func TestMarshalXLSXCopiesSourceStyleToAppendedColumn(t *testing.T) {
	workbook := excelize.NewFile()
	style, err := workbook.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		t.Fatalf("style: %v", err)
	}
	_ = workbook.SetCellValue("Sheet1", "A1", "en")
	_ = workbook.SetCellValue("Sheet1", "A2", "Hello")
	_ = workbook.SetCellStyle("Sheet1", "A1", "A2", style)
	_ = workbook.SetColWidth("Sheet1", "A", "A", 40)
	buffer, err := workbook.WriteToBuffer()
	if err != nil {
		t.Fatalf("write: %v", err)
	}
	_ = workbook.Close()

	out, err := MarshalXLSX(buffer.Bytes(), map[string]string{"Sheet1!2:2": "Bonjour"}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	result, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() { _ = result.Close() }()
	if got, _ := result.GetCellStyle("Sheet1", "B2"); got != style {
		t.Fatalf("B2 style = %d, want %d", got, style)
	}
	if width, _ := result.GetColWidth("Sheet1", "B"); width != 40 {
		t.Fatalf("B width = %v, want 40", width)
	}
}

func replaceXLSXPart(t *testing.T, content []byte, part, body string) []byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for _, file := range reader.File {
		dst, err := writer.Create(file.Name)
		if err != nil {
			t.Fatalf("create %s: %v", file.Name, err)
		}
		if file.Name == part {
			_, _ = dst.Write([]byte(body))
			continue
		}
		src, err := file.Open()
		if err != nil {
			t.Fatalf("open %s: %v", file.Name, err)
		}
		_, _ = io.Copy(dst, src)
		_ = src.Close()
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return out.Bytes()
}

func TestReadXLSXEntriesAcceptsPlainStrCellsButNotFormulas(t *testing.T) {
	template := buildXLSX(t, map[string][]xlsxTestCell{"Sheet": {{cell: "A1", value: "placeholder"}}}, []string{"Sheet"})
	content := replaceXLSXPart(t, template, "xl/worksheets/sheet1.xml",
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
			`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`+
			`<row r="1"><c r="A1" t="str"><v>Written as str</v></c></row>`+
			`<row r="2"><c r="A2" t="str"><f>"Com"&amp;"puted"</f><v>Computed</v></c></row>`+
			`</sheetData></worksheet>`)
	values, err := ParseXLSXLocale(content, "en", "en")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !reflect.DeepEqual(values, map[string]string{"Sheet!A1": "Written as str"}) {
		t.Fatalf("unexpected values: %#v", values)
	}
}

func TestXLSXHeaderRules(t *testing.T) {
	slugs := map[string]string{
		"string length":          "string-length",
		"en####us":               "en-us",
		"en_gb":                  "en-gb",
		"  Chinese (Simplified)": "chinese-simplified",
	}
	for header, want := range slugs {
		if got := xlsxHeaderSlug(header); got != want {
			t.Fatalf("slug(%q) = %q, want %q", header, got, want)
		}
	}

	locales := map[string]string{
		"English":                "en",
		"EN-us":                  "en-us",
		"Chinese (Simplified)":   "zh-hans",
		"zh_CN":                  "zh-hans",
		"Portuguese (Brazil)":    "pt-br",
		"Comments":               "",
		"Translation notes here": "",
	}
	for header, want := range locales {
		if got := xlsxHeaderLocale(header); got != want {
			t.Fatalf("locale(%q) = %q, want %q", header, got, want)
		}
	}

	columns := resolveXLSXHeaderColumns([]string{"ID", "Chinese (Simplified)", "zh", "Max length", "notes"})
	if columns.key != 0 || columns.maxLength != 3 || columns.comment != 4 {
		t.Fatalf("unexpected role columns: %+v", columns)
	}
	if got := columns.localeColumn("zh-CN"); got != 1 {
		t.Fatalf("zh-CN column = %d, want 1", got)
	}
	if got := columns.localeColumn("zh-Hant"); got != 2 {
		t.Fatalf("zh-Hant column = %d, want 2", got)
	}
	if got := columns.localeColumn("ja"); got != -1 {
		t.Fatalf("ja column = %d, want -1", got)
	}
}

func TestStrategyXLSX(t *testing.T) {
	strategy := NewDefaultStrategy()
	content := multilingualXLSX(t)

	values, entryContext, err := strategy.ParseSource("copy/strings.xlsx", content, "en")
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	if values["home.cta"] != "Start free trial" || entryContext["home.title"] != "Navigation label" {
		t.Fatalf("unexpected source parse: %#v %#v", values, entryContext)
	}

	entries, err := strategy.ParseIngestEntries("copy/strings.xlsx", content, "en")
	if err != nil {
		t.Fatalf("ingest entries: %v", err)
	}
	if entries["home.title"].MaxLength != 12 || entries["home.title"].Text != "Home" {
		t.Fatalf("unexpected ingest entry: %#v", entries["home.title"])
	}

	plain, err := strategy.Parse("copy/strings.xlsx", content)
	if err != nil {
		t.Fatalf("parse without locale: %v", err)
	}
	if plain["Strings!D2"] != "Home" {
		t.Fatalf("expected cell layout without a locale, got %#v", plain)
	}

	if _, err := strategy.Parse("copy/broken.xlsx", []byte("not a zip")); err == nil {
		t.Fatalf("expected an error for an invalid workbook")
	}
}

func TestStrategyParseIngestEntriesWithSourceLocaleReadsTargetColumn(t *testing.T) {
	strategy := NewDefaultStrategy()
	entries, err := strategy.ParseIngestEntriesWithSourceLocale("strings.xlsx", multilingualXLSX(t), "en", "fr-FR")
	if err != nil {
		t.Fatalf("parse ingest entries: %v", err)
	}
	want := map[string]IngestEntry{
		"home.title": {Text: "Accueil", MaxLength: 12, Context: "Navigation label"},
	}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("entries mismatch\n got: %#v\nwant: %#v", entries, want)
	}
}

func TestStrategyParseIngestEntriesKeepsXLSXComments(t *testing.T) {
	strategy := NewDefaultStrategy()
	entries, err := strategy.ParseIngestEntries("strings.xlsx", multilingualXLSX(t), "en")
	if err != nil {
		t.Fatalf("parse ingest entries: %v", err)
	}
	got := EncodeEntriesCommandOutput(entries)["home.title"]
	want := map[string]any{"text": "Home", "maxLength": 12, "context": "Navigation label"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("encoded entry mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestReadXLSXEntriesKeepsFallbackRowKeysDistinctFromLiteralKeys(t *testing.T) {
	content := buildXLSX(t, map[string][]xlsxTestCell{
		"Strings": {
			{cell: "A1", value: "Key"},
			{cell: "B1", value: "English"},
			{cell: "A2", value: "Strings!3:3"},
			{cell: "B2", value: "Literal"},
			{cell: "B3", value: "Empty key"},
			{cell: "A4", value: "Strings!3:3"},
			{cell: "B4", value: "Duplicate key"},
		},
	}, []string{"Strings"})
	entries, err := ReadXLSXEntries(content, "en", "en")
	if err != nil {
		t.Fatalf("read entries: %v", err)
	}
	keys := make([]string, 0, len(entries))
	for _, entry := range entries {
		keys = append(keys, entry.Key)
	}
	want := []string{"Strings!3:3", "Strings!3:3#2", "Strings!4:4"}
	if !reflect.DeepEqual(keys, want) {
		t.Fatalf("keys mismatch\n got: %#v\nwant: %#v", keys, want)
	}
}
