package main

import (
	"context"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/glossaryexport"
)

// The serializers live in internal/i18n/glossaryexport, shared with the public API.
type (
	glossaryExportConcept = glossaryexport.Concept
	glossaryExportTerm    = glossaryexport.Term
)

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

var glossaryCSVHeaders = glossaryexport.CSVHeaders

const glossaryCSVFormulaEscapePrefix = glossaryexport.CSVFormulaEscapePrefix

func glossaryExportSlug(name string) string { return glossaryexport.Slug(name) }

func escapeGlossaryCSVFormula(value string) string { return glossaryexport.EscapeCSVFormula(value) }

func unescapeGlossaryCSVFormula(value string) string { return glossaryexport.UnescapeCSVFormula(value) }

func xmlEscape(s string) string { return glossaryexport.XMLEscape(s) }

func stringOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func serializeGlossaryCSV(concepts []glossaryExportConcept) ([]byte, error) {
	return glossaryexport.SerializeCSV(concepts)
}

func serializeGlossaryTBX(g glossaryRecord, concepts []glossaryExportConcept) ([]byte, error) {
	return glossaryexport.SerializeTBX(g.SourceLocale, g.Name, concepts)
}

func serializeGlossaryXLSX(concepts []glossaryExportConcept) ([]byte, error) {
	return glossaryexport.SerializeXLSX(concepts)
}
