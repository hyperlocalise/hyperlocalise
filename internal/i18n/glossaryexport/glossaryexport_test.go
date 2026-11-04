package glossaryexport

import (
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

func strPtr(s string) *string {
	return &s
}

func TestEscapeCSVFormula(t *testing.T) {
	p := CSVFormulaEscapePrefix
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", ""},
		{"plain", "hello", "hello"},
		{"unicode", "日本語", "日本語"},
		{"equals", "=1+1", p + "=1+1"},
		{"plus", "+cmd", p + "+cmd"},
		{"minus", "-sum", p + "-sum"},
		{"at", "@evil", p + "@evil"},
		{"leading space before formula", "  =1", p + "  =1"},
		{"leading tab before formula", "\t=1", p + "\t=1"},
		{"mixed whitespace before formula", " \t @x", p + " \t @x"},
		{"only spaces", "   ", "   "},
		{"spaces then tab", " \t ", p + " \t "},
		{"tab then text", "\tabc", p + "\tabc"},
		{"carriage return then formula", "\r=1", p + "\r=1"},
		{"newline then formula", "\n=1", p + "\n=1"},
		{"space then newline", " \nx", p + " \nx"},
		{"formula char in middle", "a=b", "a=b"},
		{"already prefixed", p + "x", p + p + "x"},
		{"prefix only", p, p + p},
		{"single equals", "=", p + "="},
		{"fullwidth equals", "＝1", "＝1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := EscapeCSVFormula(tt.in); got != tt.want {
				t.Fatalf("EscapeCSVFormula(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestUnescapeCSVFormula(t *testing.T) {
	p := CSVFormulaEscapePrefix
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", ""},
		{"plain", "hello", "hello"},
		{"escaped equals", p + "=1+1", "=1+1"},
		{"escaped plus", p + "+cmd", "+cmd"},
		{"escaped minus", p + "-sum", "-sum"},
		{"escaped at", p + "@evil", "@evil"},
		{"escaped whitespace formula", p + " \t=1", " \t=1"},
		{"double prefix", p + p + "x", p + "x"},
		{"double prefix only", p + p, p},
		{"prefix with non formula", p + "abc", p + "abc"},
		{"prefix only", p, p},
		{"prefix with whitespace only", p + "  ", p + "  "},
		{"prefix not at start", "x" + p + "=1", "x" + p + "=1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := UnescapeCSVFormula(tt.in); got != tt.want {
				t.Fatalf("UnescapeCSVFormula(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

var escapeRoundTripSeeds = []string{
	"",
	"hello",
	"=1+1",
	"+cmd",
	"-sum",
	"@evil",
	" \t=1",
	"\t",
	"\r=1",
	"日本語",
	"=日本語",
	CSVFormulaEscapePrefix,
	CSVFormulaEscapePrefix + "=x",
	CSVFormulaEscapePrefix + CSVFormulaEscapePrefix,
	"\xff\xfe",
}

func TestEscapeCSVFormulaRoundTrip(t *testing.T) {
	for _, s := range escapeRoundTripSeeds {
		if got := UnescapeCSVFormula(EscapeCSVFormula(s)); got != s {
			t.Fatalf("round trip of %q = %q", s, got)
		}
	}
}

func FuzzEscapeCSVFormula(f *testing.F) {
	for _, s := range escapeRoundTripSeeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		escaped := EscapeCSVFormula(s)
		if got := UnescapeCSVFormula(escaped); got != s {
			t.Fatalf("round trip of %q = %q (escaped %q)", s, got, escaped)
		}
		if strings.HasPrefix(escaped, CSVFormulaEscapePrefix) {
			return
		}
		trimmed := strings.TrimLeft(escaped, " ")
		if trimmed != "" && strings.ContainsRune("=+-@\t\r\n", rune(trimmed[0])) {
			t.Fatalf("EscapeCSVFormula(%q) = %q starts with a formula char", s, escaped)
		}
	})
}

func sampleConcepts() []Concept {
	created := time.Date(2026, 1, 2, 3, 4, 5, 123456789, time.FixedZone("UTC+2", 2*60*60))
	updated := time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC)
	return []Concept{
		{
			ID:           "concept-1",
			PrimaryTerm:  "=SUM(A1)",
			Subject:      "Software",
			Definition:   "A <thing> & \"stuff\"",
			Translatable: true,
			Note:         "note, with comma",
			URL:          strPtr("https://example.com"),
			Figure:       strPtr("@fig"),
			Terms: []Term{
				{
					ID:            "term-1",
					Locale:        "en",
					Term:          "dashboard",
					Description:   "multi\nline",
					Note:          "-neg",
					PartOfSpeech:  "noun",
					Gender:        strPtr("neuter"),
					TermType:      strPtr("fullForm"),
					URL:           strPtr("+url"),
					Lemma:         strPtr("dashboard"),
					Status:        "approved",
					CaseSensitive: true,
					Forbidden:     false,
					Provenance:    "manual",
					ReviewStatus:  "reviewed",
					CreatedAt:     created,
					UpdatedAt:     updated,
				},
				{
					ID:        "term-2",
					Locale:    "ja",
					Term:      "ダッシュボード",
					Forbidden: true,
					CreatedAt: created,
					UpdatedAt: updated,
				},
				{
					ID:        "term-3",
					Locale:    "en",
					Term:      "panel",
					CreatedAt: created,
					UpdatedAt: updated,
				},
			},
		},
		{
			ID:          "concept-2",
			PrimaryTerm: "empty",
		},
		{
			ID:          "concept-3",
			PrimaryTerm: "café",
			Terms: []Term{
				{ID: "term-4", Locale: "fr", Term: "café"},
			},
		},
	}
}

func readCSV(t *testing.T, data []byte) [][]string {
	t.Helper()
	bom := "\ufeff"
	if !bytes.HasPrefix(data, []byte(bom)) {
		t.Fatalf("CSV output missing BOM: %q", data[:min(len(data), 10)])
	}
	r := csv.NewReader(bytes.NewReader(data[len(bom):]))
	rows, err := r.ReadAll()
	if err != nil {
		t.Fatalf("parse CSV: %v", err)
	}
	return rows
}

func TestSerializeCSVEmpty(t *testing.T) {
	for _, concepts := range [][]Concept{nil, {}, {{ID: "no-terms"}}} {
		data, err := SerializeCSV(concepts)
		if err != nil {
			t.Fatalf("SerializeCSV: %v", err)
		}
		rows := readCSV(t, data)
		if len(rows) != 1 {
			t.Fatalf("rows = %d, want 1 header row", len(rows))
		}
		if strings.Join(rows[0], ",") != strings.Join(CSVHeaders, ",") {
			t.Fatalf("header = %v, want %v", rows[0], CSVHeaders)
		}
	}
}

func TestSerializeCSV(t *testing.T) {
	data, err := SerializeCSV(sampleConcepts())
	if err != nil {
		t.Fatalf("SerializeCSV: %v", err)
	}
	if !bytes.Contains(data, []byte("\r\n")) {
		t.Fatal("CSV output does not use CRLF line endings")
	}
	rows := readCSV(t, data)
	if len(rows) != 5 {
		t.Fatalf("rows = %d, want 5", len(rows))
	}
	for i, row := range rows {
		if len(row) != len(CSVHeaders) {
			t.Fatalf("row %d has %d columns, want %d", i, len(row), len(CSVHeaders))
		}
	}

	p := CSVFormulaEscapePrefix
	want := []string{
		"concept-1", "term-1", "en", "dashboard", p + "=SUM(A1)", "Software", "A <thing> & \"stuff\"", "true",
		"note, with comma", "https://example.com", p + "@fig", "multi\nline", p + "-neg", "noun", "neuter",
		"fullForm", p + "+url", "dashboard", "approved", "true", "false", "manual", "reviewed",
		"2026-01-02T01:04:05.123456Z", "2026-02-03T04:05:06.000000Z",
	}
	for i, w := range want {
		if rows[1][i] != w {
			t.Errorf("row 1 %s = %q, want %q", CSVHeaders[i], rows[1][i], w)
		}
	}

	second := rows[2]
	if second[0] != "concept-1" || second[1] != "term-2" || second[2] != "ja" || second[3] != "ダッシュボード" {
		t.Errorf("row 2 = %v", second[:4])
	}
	if second[14] != "" || second[15] != "" || second[16] != "" || second[17] != "" {
		t.Errorf("row 2 nil pointer columns = %v, want empty", second[14:18])
	}
	if second[19] != "false" || second[20] != "true" {
		t.Errorf("row 2 caseSensitive/forbidden = %q/%q", second[19], second[20])
	}
	if rows[3][1] != "term-3" {
		t.Errorf("row 3 termId = %q, want term-3", rows[3][1])
	}
	if rows[4][0] != "concept-3" || rows[4][3] != "café" || rows[4][7] != "false" {
		t.Errorf("row 4 = %v", rows[4][:8])
	}
	if rows[4][23] != "0001-01-01T00:00:00.000000Z" {
		t.Errorf("zero time = %q", rows[4][23])
	}

	for i, row := range rows[1:] {
		for j, cell := range row {
			if got := UnescapeCSVFormula(cell); got != cell && !strings.HasPrefix(cell, p) {
				t.Errorf("row %d col %d: unexpected unescape change %q -> %q", i+1, j, cell, got)
			}
		}
	}
}

type tbxDoc struct {
	XMLName xml.Name `xml:"urn:iso:std:iso:30042:ed-2 tbx"`
	Lang    string   `xml:"lang,attr"`
	Type    string   `xml:"type,attr"`
	Title   string   `xml:"tbxHeader>fileDesc>titleStmt>title"`
	Source  string   `xml:"tbxHeader>fileDesc>sourceDesc>p"`
	Entries []struct {
		ID       string `xml:"id,attr"`
		Descrips []struct {
			Type  string `xml:"type,attr"`
			Value string `xml:",chardata"`
		} `xml:"descrip"`
		LangSecs []struct {
			Lang     string `xml:"lang,attr"`
			TermSecs []struct {
				ID   string `xml:"id,attr"`
				Term string `xml:"term"`
			} `xml:"termSec"`
		} `xml:"langSec"`
	} `xml:"text>body>conceptEntry"`
}

func parseTBX(t *testing.T, data []byte) tbxDoc {
	t.Helper()
	var doc tbxDoc
	if err := xml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("parse TBX: %v\n%s", err, data)
	}
	return doc
}

func TestSerializeTBXEmpty(t *testing.T) {
	data, err := SerializeTBX("en", "Empty", nil)
	if err != nil {
		t.Fatalf("SerializeTBX: %v", err)
	}
	if !bytes.HasPrefix(data, []byte(`<?xml version="1.0" encoding="UTF-8"?>`)) {
		t.Fatalf("missing XML declaration: %q", data)
	}
	doc := parseTBX(t, data)
	if doc.Lang != "en" || doc.Type != "TBX-Basic" || doc.Title != "Empty" {
		t.Fatalf("header = %+v", doc)
	}
	if doc.Source != "Exported from Hyperlocalise" {
		t.Fatalf("source = %q", doc.Source)
	}
	if len(doc.Entries) != 0 {
		t.Fatalf("entries = %d, want 0", len(doc.Entries))
	}
}

func TestSerializeTBX(t *testing.T) {
	data, err := SerializeTBX(`en"<`, "Glossary & <Co>\x01", sampleConcepts())
	if err != nil {
		t.Fatalf("SerializeTBX: %v", err)
	}
	doc := parseTBX(t, data)
	if doc.Lang != `en"<` {
		t.Errorf("lang = %q", doc.Lang)
	}
	if doc.Title != "Glossary & <Co>\uFFFD" {
		t.Errorf("title = %q", doc.Title)
	}
	if len(doc.Entries) != 3 {
		t.Fatalf("entries = %d, want 3", len(doc.Entries))
	}

	first := doc.Entries[0]
	if first.ID != "c-concept-1" {
		t.Errorf("entry id = %q", first.ID)
	}
	if len(first.Descrips) != 2 ||
		first.Descrips[0].Type != "subjectField" || first.Descrips[0].Value != "Software" ||
		first.Descrips[1].Type != "definition" || first.Descrips[1].Value != "A <thing> & \"stuff\"" {
		t.Errorf("descrips = %+v", first.Descrips)
	}
	if len(first.LangSecs) != 2 {
		t.Fatalf("langSecs = %d, want 2", len(first.LangSecs))
	}
	en, ja := first.LangSecs[0], first.LangSecs[1]
	if en.Lang != "en" || len(en.TermSecs) != 2 ||
		en.TermSecs[0].ID != "t-term-1" || en.TermSecs[0].Term != "dashboard" ||
		en.TermSecs[1].ID != "t-term-3" || en.TermSecs[1].Term != "panel" {
		t.Errorf("en langSec = %+v", en)
	}
	if ja.Lang != "ja" || len(ja.TermSecs) != 1 || ja.TermSecs[0].Term != "ダッシュボード" {
		t.Errorf("ja langSec = %+v", ja)
	}

	if second := doc.Entries[1]; second.ID != "c-concept-2" || len(second.Descrips) != 0 || len(second.LangSecs) != 0 {
		t.Errorf("empty concept entry = %+v", second)
	}
	if third := doc.Entries[2]; len(third.LangSecs) != 1 || third.LangSecs[0].TermSecs[0].Term != "café" {
		t.Errorf("third entry = %+v", third)
	}
}

func TestSerializeTBXInvalidXMLChars(t *testing.T) {
	concepts := []Concept{{
		ID:         "a&b",
		Definition: "bell\x07 nul\x00 bad\xff",
		Terms:      []Term{{ID: "t<1>", Locale: "en", Term: "\uFFFE\x1f"}},
	}}
	data, err := SerializeTBX("en", "x", concepts)
	if err != nil {
		t.Fatalf("SerializeTBX: %v", err)
	}
	doc := parseTBX(t, data)
	entry := doc.Entries[0]
	if entry.ID != "c-a&b" {
		t.Errorf("id = %q", entry.ID)
	}
	if entry.Descrips[0].Value != "bell\uFFFD nul\uFFFD bad\uFFFD" {
		t.Errorf("definition = %q", entry.Descrips[0].Value)
	}
	ts := entry.LangSecs[0].TermSecs[0]
	if ts.ID != "t-t<1>" || ts.Term != "\uFFFD\uFFFD" {
		t.Errorf("termSec = %+v", ts)
	}
}

func TestXMLEscape(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", ""},
		{"plain", "hello world", "hello world"},
		{"unicode", "日本語 café 😀", "日本語 café 😀"},
		{"tab and newline plain", "a\tb\nc", "a\tb\nc"},
		{"lt gt amp", "<a & b>", "&lt;a &amp; b&gt;"},
		{"quotes", `'"`, "&#39;&#34;"},
		{"carriage return", "a\rb", "a&#xD;b"},
		{"newline with markup", "<\n", "&lt;&#xA;"},
		{"tab with markup", "&\t", "&amp;&#x9;"},
		{"nul", "a\x00b", "a\uFFFDb"},
		{"control char", "\x1f", "\uFFFD"},
		{"invalid utf8", "a\xffb", "a\uFFFDb"},
		{"noncharacter FFFE", "\uFFFE", "\uFFFD"},
		{"noncharacter FFFF", "\uFFFF", "\uFFFD"},
		{"private use", "\uE000", "\uE000"},
		{"supplementary", "\U0010FFFF", "\U0010FFFF"},
		{"replacement char", "\uFFFD", "\uFFFD"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := XMLEscape(tt.in); got != tt.want {
				t.Fatalf("XMLEscape(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func openXLSX(t *testing.T, data []byte) *excelize.File {
	t.Helper()
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("open XLSX: %v", err)
	}
	t.Cleanup(func() { _ = f.Close() })
	return f
}

func getRows(t *testing.T, f *excelize.File, sheet string) [][]string {
	t.Helper()
	rows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatalf("GetRows(%s): %v", sheet, err)
	}
	return rows
}

func TestSerializeXLSXEmpty(t *testing.T) {
	data, err := SerializeXLSX(nil)
	if err != nil {
		t.Fatalf("SerializeXLSX: %v", err)
	}
	f := openXLSX(t, data)
	if got := f.GetSheetList(); len(got) != 2 || got[0] != "Concepts" || got[1] != "Terms" {
		t.Fatalf("sheets = %v", got)
	}
	concepts := getRows(t, f, "Concepts")
	terms := getRows(t, f, "Terms")
	if len(concepts) != 1 || len(concepts[0]) != 8 || concepts[0][0] != "conceptId" {
		t.Fatalf("concepts rows = %v", concepts)
	}
	if len(terms) != 1 || len(terms[0]) != 14 || terms[0][13] != "reviewStatus" {
		t.Fatalf("terms rows = %v", terms)
	}
}

func TestSerializeXLSX(t *testing.T) {
	data, err := SerializeXLSX(sampleConcepts())
	if err != nil {
		t.Fatalf("SerializeXLSX: %v", err)
	}
	f := openXLSX(t, data)

	concepts := getRows(t, f, "Concepts")
	if len(concepts) != 4 {
		t.Fatalf("concept rows = %d, want 4", len(concepts))
	}
	wantConcept := []string{"concept-1", "=SUM(A1)", "Software", "A <thing> & \"stuff\"", "TRUE", "note, with comma", "https://example.com", "@fig"}
	for i, w := range wantConcept {
		if concepts[1][i] != w {
			t.Errorf("concept row 1 col %d = %q, want %q", i, concepts[1][i], w)
		}
	}
	if concepts[2][0] != "concept-2" || concepts[2][4] != "FALSE" {
		t.Errorf("concept row 2 = %v", concepts[2])
	}
	if concepts[3][1] != "café" {
		t.Errorf("concept row 3 primaryTerm = %q", concepts[3][1])
	}

	formula, err := f.GetCellFormula("Concepts", "B2")
	if err != nil {
		t.Fatalf("GetCellFormula: %v", err)
	}
	if formula != "" {
		t.Errorf("B2 stored as formula %q, want literal text", formula)
	}

	terms := getRows(t, f, "Terms")
	if len(terms) != 5 {
		t.Fatalf("term rows = %d, want 5", len(terms))
	}
	wantTerm := []string{"concept-1", "term-1", "en", "dashboard", "multi\nline", "-neg", "noun", "neuter", "fullForm", "approved", "TRUE", "FALSE", "manual", "reviewed"}
	for i, w := range wantTerm {
		if terms[1][i] != w {
			t.Errorf("term row 1 col %d = %q, want %q", i, terms[1][i], w)
		}
	}
	if terms[2][1] != "term-2" || terms[2][3] != "ダッシュボード" || terms[2][11] != "TRUE" {
		t.Errorf("term row 2 = %v", terms[2])
	}
	if terms[3][1] != "term-3" {
		t.Errorf("term row 3 = %v", terms[3])
	}
	if terms[4][0] != "concept-3" || terms[4][1] != "term-4" || terms[4][2] != "fr" {
		t.Errorf("term row 4 = %v", terms[4])
	}
}

func TestSlug(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"", "glossary"},
		{"   ", "glossary"},
		{"---", "glossary"},
		{"日本語", "glossary"},
		{"Product Glossary", "Product-Glossary"},
		{"  padded  ", "padded"},
		{"v1.2-final", "v1.2-final"},
		{"a  b", "a--b"},
		{"a/b\\c", "a-b-c"},
		{"café menu", "caf--menu"},
		{"-lead and trail-", "lead-and-trail"},
		{"tab\tname", "tab-name"},
		{"..", ".."},
	}
	for _, tt := range tests {
		if got := Slug(tt.in); got != tt.want {
			t.Fatalf("Slug(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
