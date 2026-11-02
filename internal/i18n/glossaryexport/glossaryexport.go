// Package glossaryexport serializes a glossary's concepts and terms as CSV, TBX-Basic, or XLSX.
// go-svc and the public API share it so both produce the same files.
package glossaryexport

import (
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/xuri/excelize/v2"
)

type Concept struct {
	ID           string
	PrimaryTerm  string
	Subject      string
	Definition   string
	Translatable bool
	Note         string
	URL          *string
	Figure       *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Terms        []Term
}

type Term struct {
	ID            string
	ConceptID     string
	Locale        string
	Term          string
	Description   string
	Note          string
	PartOfSpeech  string
	Gender        *string
	TermType      *string
	URL           *string
	Lemma         *string
	Status        string
	CaseSensitive bool
	Forbidden     bool
	Provenance    string
	ReviewStatus  string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

var CSVHeaders = []string{
	"conceptId", "termId", "locale", "term", "primaryTerm", "subject", "definition", "translatable",
	"conceptNote", "conceptUrl", "figure", "description", "termNote", "partOfSpeech", "gender",
	"termType", "termUrl", "lemma", "status", "caseSensitive", "forbidden", "provenance", "reviewStatus",
	"createdAt", "updatedAt",
}

const CSVFormulaEscapePrefix = "__HYPERLOCALISE_CSV_FORMULA__"

func EscapeCSVFormula(value string) string {
	if strings.HasPrefix(value, CSVFormulaEscapePrefix) {
		return CSVFormulaEscapePrefix + value
	}
	trimmed := strings.TrimLeft(value, " \t")
	if trimmed == "" {
		return value
	}
	switch trimmed[0] {
	case '=', '+', '-', '@':
		return CSVFormulaEscapePrefix + value
	default:
		return value
	}
}

func UnescapeCSVFormula(value string) string {
	if !strings.HasPrefix(value, CSVFormulaEscapePrefix) {
		return value
	}
	escaped := strings.TrimPrefix(value, CSVFormulaEscapePrefix)
	if strings.HasPrefix(value, CSVFormulaEscapePrefix+CSVFormulaEscapePrefix) {
		return escaped
	}
	trimmed := strings.TrimLeft(escaped, " \t")
	if trimmed != "" {
		switch trimmed[0] {
		case '=', '+', '-', '@':
			return escaped
		}
	}
	return value
}

func SerializeCSV(concepts []Concept) ([]byte, error) {
	termCount := 0
	for _, c := range concepts {
		termCount += len(c.Terms)
	}

	var buf bytes.Buffer
	// BOLT OPTIMIZATION: Pre-grow buffer based on estimated CSV size per term.
	buf.Grow(300 + termCount*250)
	buf.WriteString("\ufeff")

	w := csv.NewWriter(&buf)
	w.UseCRLF = true
	if err := w.Write(CSVHeaders); err != nil {
		return nil, err
	}

	// BOLT OPTIMIZATION: Reuse a single 25-element row slice and replace fmt.Sprintf
	// with boolToString to eliminate per-term slice and formatting allocations.
	row := make([]string, 25)
	for _, concept := range concepts {
		translatableStr := boolToString(concept.Translatable)
		conceptID := EscapeCSVFormula(concept.ID)
		primaryTerm := EscapeCSVFormula(concept.PrimaryTerm)
		subject := EscapeCSVFormula(concept.Subject)
		definition := EscapeCSVFormula(concept.Definition)
		conceptNote := EscapeCSVFormula(concept.Note)
		conceptURL := EscapeCSVFormula(stringOrEmpty(concept.URL))
		conceptFigure := EscapeCSVFormula(stringOrEmpty(concept.Figure))

		for _, term := range concept.Terms {
			row[0] = conceptID
			row[1] = EscapeCSVFormula(term.ID)
			row[2] = EscapeCSVFormula(term.Locale)
			row[3] = EscapeCSVFormula(term.Term)
			row[4] = primaryTerm
			row[5] = subject
			row[6] = definition
			row[7] = translatableStr
			row[8] = conceptNote
			row[9] = conceptURL
			row[10] = conceptFigure
			row[11] = EscapeCSVFormula(term.Description)
			row[12] = EscapeCSVFormula(term.Note)
			row[13] = EscapeCSVFormula(term.PartOfSpeech)
			row[14] = EscapeCSVFormula(stringOrEmpty(term.Gender))
			row[15] = EscapeCSVFormula(stringOrEmpty(term.TermType))
			row[16] = EscapeCSVFormula(stringOrEmpty(term.URL))
			row[17] = EscapeCSVFormula(stringOrEmpty(term.Lemma))
			row[18] = EscapeCSVFormula(term.Status)
			row[19] = boolToString(term.CaseSensitive)
			row[20] = boolToString(term.Forbidden)
			row[21] = EscapeCSVFormula(term.Provenance)
			row[22] = EscapeCSVFormula(term.ReviewStatus)
			row[23] = formatTime(term.CreatedAt)
			row[24] = formatTime(term.UpdatedAt)

			if err := w.Write(row); err != nil {
				return nil, err
			}
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func boolToString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func stringOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func SerializeTBX(sourceLocale, name string, concepts []Concept) ([]byte, error) {
	termCount := 0
	for _, c := range concepts {
		termCount += len(c.Terms)
	}
	var b strings.Builder
	b.Grow(len(concepts)*250 + termCount*150 + 300)

	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<tbx xmlns="urn:iso:std:iso:30042:ed-2" style="dca" type="TBX-Basic" xml:lang="`)
	b.WriteString(XMLEscape(sourceLocale))
	b.WriteString(`">` + "\n")
	b.WriteString(`  <tbxHeader><fileDesc><titleStmt><title>`)
	b.WriteString(XMLEscape(name))
	b.WriteString(`</title></titleStmt><sourceDesc><p>Exported from Hyperlocalise</p></sourceDesc></fileDesc></tbxHeader>` + "\n")
	b.WriteString(`  <text><body>` + "\n")
	for _, concept := range concepts {
		b.WriteString(`    <conceptEntry id="c-`)
		b.WriteString(XMLEscape(concept.ID))
		b.WriteString(`">` + "\n")
		if concept.Subject != "" {
			b.WriteString(`      <descrip type="subjectField">`)
			b.WriteString(XMLEscape(concept.Subject))
			b.WriteString(`</descrip>` + "\n")
		}
		if concept.Definition != "" {
			b.WriteString(`      <descrip type="definition">`)
			b.WriteString(XMLEscape(concept.Definition))
			b.WriteString(`</descrip>` + "\n")
		}
		byLocale := make(map[string][]Term, len(concept.Terms))
		order := make([]string, 0, len(concept.Terms))
		for _, term := range concept.Terms {
			terms, ok := byLocale[term.Locale]
			if !ok {
				order = append(order, term.Locale)
			}
			byLocale[term.Locale] = append(terms, term)
		}
		for _, locale := range order {
			b.WriteString(`      <langSec xml:lang="`)
			b.WriteString(XMLEscape(locale))
			b.WriteString(`">` + "\n")
			for _, term := range byLocale[locale] {
				b.WriteString(`        <termSec id="t-`)
				b.WriteString(XMLEscape(term.ID))
				b.WriteString(`"><term>`)
				b.WriteString(XMLEscape(term.Term))
				b.WriteString(`</term></termSec>` + "\n")
			}
			b.WriteString(`      </langSec>` + "\n")
		}
		b.WriteString(`    </conceptEntry>` + "\n")
	}
	b.WriteString(`  </body></text>` + "\n</tbx>\n")
	return []byte(b.String()), nil
}

func XMLEscape(s string) string {
	if isXMLPlainText(s) {
		return s
	}
	var b strings.Builder
	if err := xml.EscapeText(&b, []byte(s)); err != nil {
		return s
	}
	return b.String()
}

// isXMLPlainText reports whether s can be copied into TBX without escaping.
// Markup characters and code points outside the XML 1.0 Char production
// (including invalid UTF-8) take the xml.EscapeText path so illegal
// controls become U+FFFD.
func isXMLPlainText(s string) bool {
	if strings.ContainsAny(s, "<>&'\"\r") {
		return false
	}
	for i := 0; i < len(s); {
		size := xmlCharSize(s, i)
		if size <= 0 {
			return false
		}
		i += size
	}
	return true
}

func xmlCharSize(s string, i int) int {
	c := s[i]
	if c < utf8.RuneSelf {
		if c == '\t' || c == '\n' || c >= 0x20 {
			return 1
		}
		return 0
	}
	r, size := utf8.DecodeRuneInString(s[i:])
	if r == utf8.RuneError && size == 1 {
		return 0
	}
	if !isXMLCharacterRange(r) {
		return 0
	}
	return size
}

func isXMLCharacterRange(r rune) bool {
	return r == 0x09 ||
		r == 0x0A ||
		r == 0x0D ||
		r >= 0x20 && r <= 0xD7FF ||
		r >= 0xE000 && r <= 0xFFFD ||
		r >= 0x10000 && r <= 0x10FFFF
}

func SerializeXLSX(concepts []Concept) ([]byte, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	conceptsSheet := "Concepts"
	termsSheet := "Terms"
	_ = f.SetSheetName("Sheet1", conceptsSheet)
	if _, err := f.NewSheet(termsSheet); err != nil {
		return nil, err
	}

	conceptsWriter, err := f.NewStreamWriter(conceptsSheet)
	if err != nil {
		return nil, err
	}
	termsWriter, err := f.NewStreamWriter(termsSheet)
	if err != nil {
		return nil, err
	}

	conceptHeaders := []any{"conceptId", "primaryTerm", "subject", "definition", "translatable", "note", "url", "figure"}
	termHeaders := []any{"conceptId", "termId", "locale", "term", "description", "note", "partOfSpeech", "gender", "termType", "status", "caseSensitive", "forbidden", "provenance", "reviewStatus"}

	if err := conceptsWriter.SetRow("A1", conceptHeaders); err != nil {
		return nil, err
	}
	if err := termsWriter.SetRow("A1", termHeaders); err != nil {
		return nil, err
	}

	termRow := 2
	for i, concept := range concepts {
		row := i + 2
		conceptCell := "A" + strconv.Itoa(row)
		conceptValues := []any{concept.ID, concept.PrimaryTerm, concept.Subject, concept.Definition, concept.Translatable, concept.Note, stringOrEmpty(concept.URL), stringOrEmpty(concept.Figure)}
		if err := conceptsWriter.SetRow(conceptCell, conceptValues); err != nil {
			return nil, err
		}

		for _, term := range concept.Terms {
			termCell := "A" + strconv.Itoa(termRow)
			termValues := []any{concept.ID, term.ID, term.Locale, term.Term, term.Description, term.Note, term.PartOfSpeech, stringOrEmpty(term.Gender), stringOrEmpty(term.TermType), term.Status, term.CaseSensitive, term.Forbidden, term.Provenance, term.ReviewStatus}
			if err := termsWriter.SetRow(termCell, termValues); err != nil {
				return nil, err
			}
			termRow++
		}
	}

	if err := conceptsWriter.Flush(); err != nil {
		return nil, err
	}
	if err := termsWriter.Flush(); err != nil {
		return nil, err
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Slug turns a glossary or memory name into a download file name.
func Slug(name string) string {
	slug := strings.TrimSpace(name)
	var b strings.Builder
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-':
			b.WriteRune(r)
		case r == ' ':
			b.WriteByte('-')
		default:
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "glossary"
	}
	return out
}

// formatTime matches go-svc's formatGlossaryTime: microseconds, like PostgreSQL timestamptz.
func formatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000000Z")
}
