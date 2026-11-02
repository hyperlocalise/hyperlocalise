package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/glossaryexport"
)

var errGlossaryNotNative = errors.New("live provider glossaries cannot be exported")

// exportGlossary ports go-svc's exportGlossary: the glossary's live concepts and terms as TBX-
// Basic, CSV, or XLSX, serialized by the shared glossaryexport package.
func (s *postgresStore) exportGlossary(ctx context.Context, actor principal, glossaryID, format string) (interchangeFile, error) {
	item, err := s.getGlossary(ctx, actor, glossaryID)
	if err != nil {
		return interchangeFile{}, err
	}
	if item.Source != "native" {
		return interchangeFile{}, errGlossaryNotNative
	}
	concepts, err := s.loadGlossaryConcepts(ctx, item.ID)
	if err != nil {
		return interchangeFile{}, err
	}
	// go-svc records exports too. The export is served even if recording it fails.
	if err := insertActivity(ctx, s.pool, actor, activityEvent{
		EventType: "glossary_exported", TargetID: item.ID, TargetKind: "glossary",
		Payload: map[string]any{"resourceId": item.ID},
	}); err != nil {
		slog.ErrorContext(ctx, "activity_log_record_failed", "event_type", "glossary_exported", "error", err)
	}
	slug := glossaryexport.Slug(item.Name)
	switch format {
	case "csv":
		body, err := glossaryexport.SerializeCSV(concepts)
		return interchangeFile{ContentType: "text/csv; charset=utf-8", Filename: slug + ".csv", Body: body}, err
	case "xlsx":
		body, err := glossaryexport.SerializeXLSX(concepts)
		return interchangeFile{ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Filename: slug + ".xlsx", Body: body}, err
	default:
		body, err := glossaryexport.SerializeTBX(item.SourceLocale, item.Name, concepts)
		return interchangeFile{ContentType: "application/xml; charset=utf-8", Filename: slug + ".tbx", Body: body}, err
	}
}

// loadGlossaryConcepts matches go-svc's loadGlossaryExportDocument.
func (s *postgresStore) loadGlossaryConcepts(ctx context.Context, glossaryID string) ([]glossaryexport.Concept, error) {
	rows, err := s.pool.Query(ctx, `SELECT c.id, c.primary_term, c.subject, c.definition, c.translatable, c.note, c.url, c.figure, c.created_at, c.updated_at
		FROM glossary_concepts c
		WHERE c.glossary_id = $1 AND c.archived_at IS NULL
		ORDER BY c.updated_at DESC, c.id DESC`, glossaryID)
	if err != nil {
		return nil, fmt.Errorf("list glossary concepts: %w", err)
	}
	concepts, err := collectRows(rows, func(row rowScanner) (glossaryexport.Concept, error) {
		c := glossaryexport.Concept{Terms: []glossaryexport.Term{}}
		err := row.Scan(&c.ID, &c.PrimaryTerm, &c.Subject, &c.Definition, &c.Translatable, &c.Note, &c.URL, &c.Figure, &c.CreatedAt, &c.UpdatedAt)
		return c, err
	})
	if err != nil || len(concepts) == 0 {
		return concepts, err
	}
	ids := make([]string, len(concepts))
	byID := make(map[string]*glossaryexport.Concept, len(concepts))
	for i := range concepts {
		ids[i] = concepts[i].ID
		byID[concepts[i].ID] = &concepts[i]
	}
	termRows, err := s.pool.Query(ctx, `SELECT t.id, t.concept_id, COALESCE(t.locale, ''), COALESCE(t.term, ''), COALESCE(t.description, ''),
			COALESCE(t.note, ''), COALESCE(t.part_of_speech, ''), t.gender, t.term_type, t.url, t.lemma, COALESCE(t.status, 'draft'),
			t.case_sensitive, t.forbidden, COALESCE(t.provenance, 'manual'), COALESCE(t.review_status, 'proposed'), t.created_at, t.updated_at
		FROM glossary_terms t
		WHERE t.glossary_id = $1 AND t.concept_id = ANY($2) AND t.archived_at IS NULL
		ORDER BY t.locale, t.term`, glossaryID, ids)
	if err != nil {
		return nil, fmt.Errorf("list glossary terms: %w", err)
	}
	terms, err := collectRows(termRows, func(row rowScanner) (glossaryexport.Term, error) {
		var t glossaryexport.Term
		err := row.Scan(&t.ID, &t.ConceptID, &t.Locale, &t.Term, &t.Description, &t.Note, &t.PartOfSpeech, &t.Gender, &t.TermType,
			&t.URL, &t.Lemma, &t.Status, &t.CaseSensitive, &t.Forbidden, &t.Provenance, &t.ReviewStatus, &t.CreatedAt, &t.UpdatedAt)
		return t, err
	})
	if err != nil {
		return nil, err
	}
	for _, t := range terms {
		if concept := byID[t.ConceptID]; concept != nil {
			concept.Terms = append(concept.Terms, t)
		}
	}
	return concepts, nil
}
