package crowdin

import (
	"cmp"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/hyperlocalise/hyperlocalise/internal/csvsafe"
)

const glossaryCSVPageLimit = 500

var glossaryCSVHeader = []string{
	"glossary_id",
	"concept_id",
	"term_id",
	"source_language",
	"source_term",
	"language",
	"term",
	"description",
	"part_of_speech",
	"type",
	"status",
	"gender",
	"note",
	"url",
	"lemma",
	"concept_subject",
	"concept_definition",
	"concept_note",
	"concept_url",
	"concept_figure",
}

// GlossaryDownloadRequest identifies the glossary terms to export.
type GlossaryDownloadRequest struct {
	GlossaryID int
	Languages  []string
}

// GlossaryDownloadResult summarizes a glossary CSV export.
type GlossaryDownloadResult struct {
	Terms int
}

// WriteGlossaryCSV downloads glossary terms and writes them as stable CSV.
func (c *HTTPClient) WriteGlossaryCSV(ctx context.Context, req GlossaryDownloadRequest, w io.Writer) (GlossaryDownloadResult, error) {
	if c == nil || c.client == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("crowdin glossary download: client is nil")
	}
	if req.GlossaryID <= 0 {
		return GlossaryDownloadResult{}, fmt.Errorf("crowdin glossary download: glossary id must be positive")
	}
	if w == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("crowdin glossary download: writer is nil")
	}

	glossary, _, err := c.client.Glossaries.GetGlossary(ctx, req.GlossaryID)
	if err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("get glossary: %w", err)
	}
	if glossary == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("get glossary: empty response")
	}

	terms, err := c.listGlossaryTerms(ctx, req.GlossaryID)
	if err != nil {
		return GlossaryDownloadResult{}, err
	}
	concepts, err := c.listGlossaryConcepts(ctx, req.GlossaryID)
	if err != nil {
		return GlossaryDownloadResult{}, err
	}

	sourceTerms := sourceTermsByConcept(terms, glossary.LanguageID)
	rows := glossaryCSVRows(req.GlossaryID, glossary.LanguageID, terms, concepts, sourceTerms, req.Languages)
	writer := csv.NewWriter(w)
	if err := writer.Write(glossaryCSVHeader); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("write glossary csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(csvsafe.EscapeRow(row)); err != nil {
			return GlossaryDownloadResult{}, fmt.Errorf("write glossary csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("flush glossary csv: %w", err)
	}

	return GlossaryDownloadResult{Terms: len(rows)}, nil
}

func (c *HTTPClient) listGlossaryTerms(ctx context.Context, glossaryID int) ([]*model.Term, error) {
	var terms []*model.Term
	offset := 0

	for {
		page, _, err := c.client.Glossaries.ListTerms(ctx, glossaryID, &model.TermsListOptions{
			OrderBy: "id",
			ListOptions: model.ListOptions{
				Limit:  glossaryCSVPageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list glossary terms: %w", err)
		}
		terms = append(terms, page...)
		if len(page) < glossaryCSVPageLimit {
			break
		}
		offset += glossaryCSVPageLimit
	}

	return terms, nil
}

func (c *HTTPClient) listGlossaryConcepts(ctx context.Context, glossaryID int) (map[int]*model.Concept, error) {
	concepts := make(map[int]*model.Concept)
	offset := 0

	for {
		page, _, err := c.client.Glossaries.ListConcepts(ctx, glossaryID, &model.ConceptsListOptions{
			OrderBy: "id",
			ListOptions: model.ListOptions{
				Limit:  glossaryCSVPageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list glossary concepts: %w", err)
		}
		for _, concept := range page {
			if concept != nil {
				concepts[concept.ID] = concept
			}
		}
		if len(page) < glossaryCSVPageLimit {
			break
		}
		offset += glossaryCSVPageLimit
	}

	return concepts, nil
}

func sourceTermsByConcept(terms []*model.Term, sourceLanguage string) map[int]string {
	sourceTerms := make(map[int]string)
	for _, term := range terms {
		if term == nil || term.ConceptID == 0 || term.LanguageID != sourceLanguage {
			continue
		}
		if _, exists := sourceTerms[term.ConceptID]; !exists {
			sourceTerms[term.ConceptID] = term.Text
		}
	}
	return sourceTerms
}

func glossaryCSVRows(
	glossaryID int,
	sourceLanguage string,
	terms []*model.Term,
	concepts map[int]*model.Concept,
	sourceTerms map[int]string,
	languages []string,
) [][]string {
	languageSet := make(map[string]struct{}, len(languages))
	for _, language := range languages {
		trimmed := strings.TrimSpace(language)
		if trimmed != "" {
			languageSet[trimmed] = struct{}{}
		}
	}

	sortedTerms := slices.Clone(terms)
	slices.SortStableFunc(sortedTerms, func(left, right *model.Term) int {
		if left == nil && right == nil {
			return 0
		}
		if left == nil {
			return 1
		}
		if right == nil {
			return -1
		}
		if left.ConceptID != right.ConceptID {
			return cmp.Compare(left.ConceptID, right.ConceptID)
		}
		if left.LanguageID != right.LanguageID {
			if left.LanguageID < right.LanguageID {
				return -1
			}
			return 1
		}
		return cmp.Compare(left.ID, right.ID)
	})

	rows := make([][]string, 0, len(sortedTerms))
	for _, term := range sortedTerms {
		if term == nil {
			continue
		}
		if len(languageSet) > 0 {
			if _, ok := languageSet[term.LanguageID]; !ok {
				continue
			}
		}
		concept := concepts[term.ConceptID]
		rows = append(rows, glossaryCSVRow(glossaryID, sourceLanguage, term, concept, sourceTerms[term.ConceptID]))
	}
	return rows
}

func glossaryCSVRow(glossaryID int, sourceLanguage string, term *model.Term, concept *model.Concept, sourceTerm string) []string {
	row := []string{
		strconv.Itoa(glossaryID),
		strconv.Itoa(term.ConceptID),
		strconv.Itoa(term.ID),
		sourceLanguage,
		sourceTerm,
		term.LanguageID,
		term.Text,
		term.Description,
		term.PartOfSpeech,
		term.Type,
		term.Status,
		term.Gender,
		term.Note,
		term.URL,
		term.Lemma,
		"",
		"",
		"",
		"",
		"",
	}
	if concept != nil {
		const (
			idxConceptSubject    = 15
			idxConceptDefinition = 16
			idxConceptNote       = 17
			idxConceptURL        = 18
			idxConceptFigure     = 19
		)
		row[idxConceptSubject] = concept.Subject
		row[idxConceptDefinition] = concept.Definition
		row[idxConceptNote] = concept.Note
		row[idxConceptURL] = concept.URL
		row[idxConceptFigure] = concept.Figure
	}
	return row
}
