package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type glossaryExportConcept struct {
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
	Terms        []glossaryExportTerm
}

type glossaryExportTerm struct {
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

func (api *glossaryAPI) exportGlossary(r *http.Request, g glossaryRecord) (any, int, error) {
	if g.Source != "native" {
		return nil, 0, glossaryFailure(400, "glossary_export_unsupported", "Live provider glossaries cannot be exported from Cloud. Export mirrored terminology stored in Hyperlocalise instead.")
	}
	format := strings.ToLower(trimGlossaryInput(r.URL.Query().Get("format")))
	if format == "" {
		format = "tbx"
	}
	switch format {
	case "csv", "tbx", "xlsx":
	default:
		return nil, 0, invalidGlossary()
	}
	concepts, err := api.loadGlossaryExportDocument(r.Context(), g)
	if err != nil {
		return nil, 0, err
	}
	slug := glossaryExportSlug(g.Name)
	var body []byte
	var contentType, filename string
	switch format {
	case "csv":
		body, err = serializeGlossaryCSV(concepts)
		contentType = "text/csv; charset=utf-8"
		filename = slug + ".csv"
	case "tbx":
		body, err = serializeGlossaryTBX(g, concepts)
		contentType = "application/xml; charset=utf-8"
		filename = slug + ".tbx"
	case "xlsx":
		body, err = serializeGlossaryXLSX(concepts)
		contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		filename = slug + ".xlsx"
	}
	if err != nil {
		return nil, 0, glossaryFailure(400, "glossary_export_failed", err.Error())
	}
	return interchangeDownload{contentType: contentType, filename: filename, body: body}, 200, nil
}

func glossaryExportSlug(name string) string {
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

func (api *glossaryAPI) loadGlossaryExportDocument(ctx context.Context, g glossaryRecord) ([]glossaryExportConcept, error) {
	rows, err := api.pool.Query(ctx, `select c.id, c.primary_term, c.subject, c.definition, c.translatable, c.note, c.url, c.figure, c.created_at, c.updated_at from glossary_concepts c where c.glossary_id=$1 and c.archived_at is null order by c.updated_at desc, c.id desc`, g.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	concepts := []glossaryExportConcept{}
	ids := []string{}
	byID := map[string]*glossaryExportConcept{}
	for rows.Next() {
		var c glossaryExportConcept
		if err := rows.Scan(&c.ID, &c.PrimaryTerm, &c.Subject, &c.Definition, &c.Translatable, &c.Note, &c.URL, &c.Figure, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.Terms = []glossaryExportTerm{}
		concepts = append(concepts, c)
		ids = append(ids, c.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range concepts {
		byID[concepts[i].ID] = &concepts[i]
	}
	if len(ids) == 0 {
		return concepts, nil
	}
	termRows, err := api.pool.Query(ctx, `select t.id, t.concept_id, coalesce(t.locale,''), coalesce(t.term,''), coalesce(t.description,''), coalesce(t.note,''), coalesce(t.part_of_speech,''), t.gender, t.term_type, t.url, t.lemma, coalesce(t.status,'draft'), t.case_sensitive, t.forbidden, coalesce(t.provenance,'manual'), coalesce(t.review_status,'proposed'), t.created_at, t.updated_at from glossary_terms t where t.glossary_id=$1 and t.concept_id = any($2) and t.archived_at is null order by t.locale, t.term`, g.ID, ids)
	if err != nil {
		return nil, err
	}
	defer termRows.Close()
	for termRows.Next() {
		var t glossaryExportTerm
		if err := termRows.Scan(&t.ID, &t.ConceptID, &t.Locale, &t.Term, &t.Description, &t.Note, &t.PartOfSpeech, &t.Gender, &t.TermType, &t.URL, &t.Lemma, &t.Status, &t.CaseSensitive, &t.Forbidden, &t.Provenance, &t.ReviewStatus, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		if concept := byID[t.ConceptID]; concept != nil {
			concept.Terms = append(concept.Terms, t)
		}
	}
	return concepts, termRows.Err()
}

var glossaryCSVHeaders = []string{
	"conceptId", "termId", "locale", "term", "primaryTerm", "subject", "definition", "translatable",
	"conceptNote", "conceptUrl", "figure", "description", "termNote", "partOfSpeech", "gender",
	"termType", "termUrl", "lemma", "status", "caseSensitive", "forbidden", "provenance", "reviewStatus",
	"createdAt", "updatedAt",
}

const glossaryCSVFormulaEscapePrefix = "__HYPERLOCALISE_CSV_FORMULA__"

func escapeGlossaryCSVFormula(value string) string {
	if strings.HasPrefix(value, glossaryCSVFormulaEscapePrefix) {
		return glossaryCSVFormulaEscapePrefix + value
	}
	trimmed := strings.TrimLeft(value, " \t")
	if trimmed == "" {
		return value
	}
	switch trimmed[0] {
	case '=', '+', '-', '@':
		return glossaryCSVFormulaEscapePrefix + value
	default:
		return value
	}
}

func unescapeGlossaryCSVFormula(value string) string {
	if !strings.HasPrefix(value, glossaryCSVFormulaEscapePrefix) {
		return value
	}
	escaped := strings.TrimPrefix(value, glossaryCSVFormulaEscapePrefix)
	if strings.HasPrefix(value, glossaryCSVFormulaEscapePrefix+glossaryCSVFormulaEscapePrefix) {
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

func serializeGlossaryCSV(concepts []glossaryExportConcept) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString("\ufeff")
	w := csv.NewWriter(&buf)
	w.UseCRLF = true
	if err := w.Write(glossaryCSVHeaders); err != nil {
		return nil, err
	}
	for _, concept := range concepts {
		for _, term := range concept.Terms {
			row := []string{
				escapeGlossaryCSVFormula(concept.ID), escapeGlossaryCSVFormula(term.ID),
				escapeGlossaryCSVFormula(term.Locale), escapeGlossaryCSVFormula(term.Term),
				escapeGlossaryCSVFormula(concept.PrimaryTerm), escapeGlossaryCSVFormula(concept.Subject),
				escapeGlossaryCSVFormula(concept.Definition),
				fmt.Sprintf("%t", concept.Translatable), escapeGlossaryCSVFormula(concept.Note),
				escapeGlossaryCSVFormula(stringOrEmpty(concept.URL)), escapeGlossaryCSVFormula(stringOrEmpty(concept.Figure)),
				escapeGlossaryCSVFormula(term.Description), escapeGlossaryCSVFormula(term.Note),
				escapeGlossaryCSVFormula(term.PartOfSpeech), escapeGlossaryCSVFormula(stringOrEmpty(term.Gender)),
				escapeGlossaryCSVFormula(stringOrEmpty(term.TermType)), escapeGlossaryCSVFormula(stringOrEmpty(term.URL)),
				escapeGlossaryCSVFormula(stringOrEmpty(term.Lemma)), escapeGlossaryCSVFormula(term.Status),
				fmt.Sprintf("%t", term.CaseSensitive), fmt.Sprintf("%t", term.Forbidden),
				escapeGlossaryCSVFormula(term.Provenance), escapeGlossaryCSVFormula(term.ReviewStatus),
				formatGlossaryTime(term.CreatedAt), formatGlossaryTime(term.UpdatedAt),
			}
			if err := w.Write(row); err != nil {
				return nil, err
			}
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func stringOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func serializeGlossaryTBX(g glossaryRecord, concepts []glossaryExportConcept) ([]byte, error) {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<tbx xmlns="urn:iso:std:iso:30042:ed-2" style="dca" type="TBX-Basic" xml:lang="`)
	b.WriteString(xmlEscape(g.SourceLocale))
	b.WriteString(`">` + "\n")
	b.WriteString(`  <tbxHeader><fileDesc><titleStmt><title>`)
	b.WriteString(xmlEscape(g.Name))
	b.WriteString(`</title></titleStmt><sourceDesc><p>Exported from Hyperlocalise</p></sourceDesc></fileDesc></tbxHeader>` + "\n")
	b.WriteString(`  <text><body>` + "\n")
	for _, concept := range concepts {
		b.WriteString(`    <conceptEntry id="c-`)
		b.WriteString(xmlEscape(concept.ID))
		b.WriteString(`">` + "\n")
		if concept.Subject != "" {
			b.WriteString(`      <descrip type="subjectField">`)
			b.WriteString(xmlEscape(concept.Subject))
			b.WriteString(`</descrip>` + "\n")
		}
		if concept.Definition != "" {
			b.WriteString(`      <descrip type="definition">`)
			b.WriteString(xmlEscape(concept.Definition))
			b.WriteString(`</descrip>` + "\n")
		}
		byLocale := map[string][]glossaryExportTerm{}
		order := []string{}
		for _, term := range concept.Terms {
			if _, ok := byLocale[term.Locale]; !ok {
				order = append(order, term.Locale)
			}
			byLocale[term.Locale] = append(byLocale[term.Locale], term)
		}
		for _, locale := range order {
			b.WriteString(`      <langSec xml:lang="`)
			b.WriteString(xmlEscape(locale))
			b.WriteString(`">` + "\n")
			for _, term := range byLocale[locale] {
				b.WriteString(`        <termSec id="t-`)
				b.WriteString(xmlEscape(term.ID))
				b.WriteString(`"><term>`)
				b.WriteString(xmlEscape(term.Term))
				b.WriteString(`</term></termSec>` + "\n")
			}
			b.WriteString(`      </langSec>` + "\n")
		}
		b.WriteString(`    </conceptEntry>` + "\n")
	}
	b.WriteString(`  </body></text>` + "\n</tbx>\n")
	return []byte(b.String()), nil
}

func xmlEscape(s string) string {
	var b strings.Builder
	if err := xml.EscapeText(&b, []byte(s)); err != nil {
		return s
	}
	return b.String()
}

func serializeGlossaryXLSX(concepts []glossaryExportConcept) ([]byte, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	conceptsSheet := "Concepts"
	termsSheet := "Terms"
	_ = f.SetSheetName("Sheet1", conceptsSheet)
	_, _ = f.NewSheet(termsSheet)
	conceptHeaders := []string{"conceptId", "primaryTerm", "subject", "definition", "translatable", "note", "url", "figure"}
	termHeaders := []string{"conceptId", "termId", "locale", "term", "description", "note", "partOfSpeech", "gender", "termType", "status", "caseSensitive", "forbidden", "provenance", "reviewStatus"}
	for i, h := range conceptHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(conceptsSheet, cell, h)
	}
	for i, h := range termHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(termsSheet, cell, h)
	}
	termRow := 2
	for i, concept := range concepts {
		row := i + 2
		values := []any{concept.ID, concept.PrimaryTerm, concept.Subject, concept.Definition, concept.Translatable, concept.Note, stringOrEmpty(concept.URL), stringOrEmpty(concept.Figure)}
		for col, value := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(conceptsSheet, cell, value)
		}
		for _, term := range concept.Terms {
			termValues := []any{concept.ID, term.ID, term.Locale, term.Term, term.Description, term.Note, term.PartOfSpeech, stringOrEmpty(term.Gender), stringOrEmpty(term.TermType), term.Status, term.CaseSensitive, term.Forbidden, term.Provenance, term.ReviewStatus}
			for col, value := range termValues {
				cell, _ := excelize.CoordinatesToCellName(col+1, termRow)
				_ = f.SetCellValue(termsSheet, cell, value)
			}
			termRow++
		}
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
