package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type glossaryConceptPayload struct {
	PrimaryTerm  *string                    `json:"primaryTerm"`
	Subject      *string                    `json:"subject"`
	Definition   *string                    `json:"definition"`
	Translatable *bool                      `json:"translatable"`
	Note         *string                    `json:"note"`
	Figure       *string                    `json:"figure"`
	URL          *string                    `json:"url"`
	Terms        []glossaryConceptTermInput `json:"terms"`
}

type glossaryConceptTermInput struct {
	Locale        string  `json:"locale"`
	Term          string  `json:"term"`
	PartOfSpeech  *string `json:"partOfSpeech"`
	Note          *string `json:"note"`
	Gender        *string `json:"gender"`
	TermType      *string `json:"termType"`
	URL           *string `json:"url"`
	Lemma         *string `json:"lemma"`
	Status        *string `json:"status"`
	Description   *string `json:"description"`
	CaseSensitive *bool   `json:"caseSensitive"`
	Forbidden     *bool   `json:"forbidden"`
}

type glossaryConceptTermRecord struct {
	ID            string  `json:"id"`
	GlossaryID    string  `json:"glossaryId"`
	ConceptID     string  `json:"conceptId"`
	Locale        string  `json:"locale"`
	Term          string  `json:"term"`
	IsPrimary     bool    `json:"isPrimary"`
	Description   string  `json:"description"`
	Note          string  `json:"note"`
	PartOfSpeech  string  `json:"partOfSpeech"`
	Gender        *string `json:"gender"`
	TermType      *string `json:"termType"`
	URL           *string `json:"url,omitempty"`
	Lemma         *string `json:"lemma,omitempty"`
	Status        string  `json:"status"`
	CaseSensitive bool    `json:"caseSensitive"`
	Forbidden     bool    `json:"forbidden"`
	Provenance    string  `json:"provenance"`
	ReviewStatus  string  `json:"reviewStatus"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type glossaryConceptRecord struct {
	ID           string                      `json:"id"`
	GlossaryID   string                      `json:"glossaryId"`
	PrimaryTerm  string                      `json:"primaryTerm"`
	Subject      string                      `json:"subject"`
	Definition   string                      `json:"definition"`
	Translatable bool                        `json:"translatable"`
	Note         string                      `json:"note"`
	URL          *string                     `json:"url"`
	Figure       *string                     `json:"figure,omitempty"`
	CreatedAt    string                      `json:"createdAt"`
	UpdatedAt    string                      `json:"updatedAt"`
	Terms        []glossaryConceptTermRecord `json:"terms"`
}

const (
	glossaryConceptColumns = `c.id, c.glossary_id, c.primary_term, c.subject, c.definition, c.translatable, c.note, c.url, c.figure, c.created_at, c.updated_at`
	glossaryTermColumns    = `t.id, t.glossary_id, t.concept_id, coalesce(t.locale,''), coalesce(t.term,''), t.description, t.note, t.part_of_speech, t.gender, t.term_type, t.url, t.lemma, t.status, t.case_sensitive, t.forbidden, t.provenance, t.review_status, t.created_at, t.updated_at`
)

func scanGlossaryConcept(row pgx.Row) (glossaryConceptRecord, error) {
	var c glossaryConceptRecord
	var created, updated time.Time
	err := row.Scan(&c.ID, &c.GlossaryID, &c.PrimaryTerm, &c.Subject, &c.Definition, &c.Translatable, &c.Note, &c.URL, &c.Figure, &created, &updated)
	c.CreatedAt = formatGlossaryTime(created)
	c.UpdatedAt = formatGlossaryTime(updated)
	c.Terms = []glossaryConceptTermRecord{}
	return c, err
}

func scanGlossaryTerm(row pgx.Row, sourceLocale string) (glossaryConceptTermRecord, error) {
	var t glossaryConceptTermRecord
	var created, updated time.Time
	err := row.Scan(&t.ID, &t.GlossaryID, &t.ConceptID, &t.Locale, &t.Term, &t.Description, &t.Note, &t.PartOfSpeech, &t.Gender, &t.TermType, &t.URL, &t.Lemma, &t.Status, &t.CaseSensitive, &t.Forbidden, &t.Provenance, &t.ReviewStatus, &created, &updated)
	t.IsPrimary = t.Locale == sourceLocale
	t.CreatedAt = formatGlossaryTime(created)
	t.UpdatedAt = formatGlossaryTime(updated)
	return t, err
}

func (api *glossaryAPI) listConceptsHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.listConcepts(r.Context(), g)
}

func (api *glossaryAPI) createConceptHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.createConcept(r, actor, g)
}

func (api *glossaryAPI) pageGlossaryConceptsHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.pageGlossaryConcepts(r, g)
}

func (api *glossaryAPI) listGlossaryConceptAuthorsHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.listGlossaryConceptAuthors(r.Context(), g)
}

func (api *glossaryAPI) pageGlossaryHistoryHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.pageGlossaryHistory(r, g)
}

func (api *glossaryAPI) importGlossaryConceptsHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.importGlossaryConcepts(r, actor, g)
}

func (api *glossaryAPI) getConceptHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	conceptID := r.PathValue("conceptId")
	if !validGlossaryID(conceptID) {
		return nil, 0, missingGlossary()
	}
	return api.getConcept(r.Context(), g, conceptID)
}

func (api *glossaryAPI) patchConceptHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	conceptID := r.PathValue("conceptId")
	if !validGlossaryID(conceptID) {
		return nil, 0, missingGlossary()
	}
	return api.patchConcept(r, actor, g, conceptID)
}

func (api *glossaryAPI) deleteConceptHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	conceptID := r.PathValue("conceptId")
	if !validGlossaryID(conceptID) {
		return nil, 0, missingGlossary()
	}
	return api.deleteConcept(r.Context(), actor, g, conceptID)
}

func (api *glossaryAPI) listConceptTermsHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	conceptID := r.PathValue("conceptId")
	if !validGlossaryID(conceptID) {
		return nil, 0, missingGlossary()
	}
	terms, err := api.listConceptTerms(r.Context(), g, conceptID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"terms": terms, "total": len(terms)}, 200, nil
}

func (api *glossaryAPI) createConceptTermHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	conceptID := r.PathValue("conceptId")
	if !validGlossaryID(conceptID) {
		return nil, 0, missingGlossary()
	}
	var exists string
	err := api.pool.QueryRow(r.Context(), `select id from glossary_concepts where id=$1 and glossary_id=$2 and archived_at is null`, conceptID, g.ID).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	var payload glossaryConceptTermInput
	if err := readGlossaryBody(r, []string{"locale", "term", "partOfSpeech", "note", "gender", "termType", "url", "lemma", "status", "description", "caseSensitive", "forbidden"}, &payload); err != nil {
		return nil, 0, err
	}
	term, err := insertGlossaryTerm(r.Context(), api.pool, g, conceptID, actor.userID, payload)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"term": term}, 201, nil
}

func (api *glossaryAPI) pageConceptTermsHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	conceptID := r.PathValue("conceptId")
	if !validGlossaryID(conceptID) {
		return nil, 0, missingGlossary()
	}
	return api.pageConceptTerms(r, g, conceptID)
}

func (api *glossaryAPI) patchTermHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	conceptID := r.PathValue("conceptId")
	termID := r.PathValue("termId")
	if !validGlossaryID(conceptID) || !validGlossaryID(termID) {
		return nil, 0, missingGlossary()
	}
	return api.patchTerm(r, actor, g, conceptID, termID)
}

func (api *glossaryAPI) deleteTermHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	conceptID := r.PathValue("conceptId")
	termID := r.PathValue("termId")
	if !validGlossaryID(conceptID) || !validGlossaryID(termID) {
		return nil, 0, missingGlossary()
	}
	tag, err := api.pool.Exec(r.Context(), `delete from glossary_terms where id=$1 and concept_id=$2 and glossary_id=$3`, termID, conceptID, g.ID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, missingGlossary()
	}
	return nil, 204, nil
}

func (api *glossaryAPI) requireConceptWrite(ctx context.Context, actor glossaryActor, g glossaryRecord) error {
	if err := requireNativeGlossary(g); err != nil {
		return err
	}
	ok, err := api.canContributeGlossary(ctx, actor, g)
	if err != nil {
		return err
	}
	if !ok {
		if actor.role == "translator" && (g.ControlLevel == "org" || g.Source != "native") {
			return glossaryFailure(403, "glossary_org_controlled", "This glossary is org-controlled and cannot be edited by translators")
		}
		return glossaryFailure(403, "forbidden", "Insufficient permissions")
	}
	return nil
}

func (api *glossaryAPI) listConcepts(ctx context.Context, g glossaryRecord) (any, int, error) {
	if g.Source != "native" {
		return map[string]any{"concepts": []glossaryConceptRecord{}, "total": 0}, 200, nil
	}
	rows, err := api.pool.Query(ctx, `select `+glossaryConceptColumns+` from glossary_concepts c where c.glossary_id=$1 and c.archived_at is null order by c.updated_at desc, c.id desc limit 100`, g.ID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	concepts := []glossaryConceptRecord{}
	for rows.Next() {
		c, scanErr := scanGlossaryConcept(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		terms, termErr := api.listConceptTerms(ctx, g, c.ID)
		if termErr != nil {
			return nil, 0, termErr
		}
		c.Terms = terms
		concepts = append(concepts, c)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	err = api.pool.QueryRow(ctx, `select count(*) from glossary_concepts where glossary_id=$1 and archived_at is null`, g.ID).Scan(&total)
	return map[string]any{"concepts": concepts, "total": total}, 200, err
}

func (api *glossaryAPI) listConceptTerms(ctx context.Context, g glossaryRecord, conceptID string) ([]glossaryConceptTermRecord, error) {
	rows, err := api.pool.Query(ctx, `select `+glossaryTermColumns+` from glossary_terms t where t.glossary_id=$1 and t.concept_id=$2 and t.archived_at is null order by t.locale, t.term`, g.ID, conceptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	terms := []glossaryConceptTermRecord{}
	for rows.Next() {
		term, scanErr := scanGlossaryTerm(rows, g.SourceLocale)
		if scanErr != nil {
			return nil, scanErr
		}
		terms = append(terms, term)
	}
	return terms, rows.Err()
}

func (api *glossaryAPI) getConcept(ctx context.Context, g glossaryRecord, conceptID string) (any, int, error) {
	if g.Source != "native" {
		return nil, 0, missingGlossary()
	}
	c, err := scanGlossaryConcept(api.pool.QueryRow(ctx, `select `+glossaryConceptColumns+` from glossary_concepts c where c.id=$1 and c.glossary_id=$2 and c.archived_at is null`, conceptID, g.ID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	terms, err := api.listConceptTerms(ctx, g, c.ID)
	if err != nil {
		return nil, 0, err
	}
	c.Terms = terms
	return map[string]any{"concept": c}, 200, nil
}

func (api *glossaryAPI) createConcept(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	var payload glossaryConceptPayload
	if err := readGlossaryBody(r, []string{"primaryTerm", "subject", "definition", "translatable", "note", "figure", "url", "terms"}, &payload); err != nil {
		return nil, 0, err
	}
	if payload.PrimaryTerm == nil {
		return nil, 0, invalidGlossary()
	}
	primary := trimGlossaryInput(*payload.PrimaryTerm)
	if primary == "" || utf16Length(primary) > 1000 {
		return nil, 0, invalidGlossary()
	}
	terms := payload.Terms
	hasSource := false
	for _, term := range terms {
		if strings.ReplaceAll(trimGlossaryInput(term.Locale), "_", "-") == g.SourceLocale {
			hasSource = true
			break
		}
	}
	if !hasSource {
		status := "preferred"
		terms = append([]glossaryConceptTermInput{{Locale: g.SourceLocale, Term: primary, Status: &status}}, terms...)
	}
	subject, definition, note := "", "", ""
	if payload.Subject != nil {
		subject = *payload.Subject
	}
	if payload.Definition != nil {
		definition = *payload.Definition
	}
	if payload.Note != nil {
		note = *payload.Note
	}
	translatable := true
	if payload.Translatable != nil {
		translatable = *payload.Translatable
	}
	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	c, err := scanGlossaryConcept(tx.QueryRow(ctx, `insert into glossary_concepts as c (glossary_id, primary_term, subject, definition, translatable, note, url, figure, created_by_user_id, modified_by_user_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning `+glossaryConceptColumns, g.ID, primary, subject, definition, translatable, note, emptyToNil(payload.URL), emptyToNil(payload.Figure), actor.userID))
	if err != nil {
		return nil, 0, err
	}
	for _, term := range terms {
		if _, err := insertGlossaryTerm(ctx, tx, g, c.ID, actor.userID, term); err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	value, _, err := api.getConcept(ctx, g, c.ID)
	return value, 201, err
}

func emptyToNil(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := trimGlossaryInput(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func insertGlossaryTerm(ctx context.Context, db dictionaryDB, g glossaryRecord, conceptID, userID string, term glossaryConceptTermInput) (glossaryConceptTermRecord, error) {
	locale := strings.ReplaceAll(trimGlossaryInput(term.Locale), "_", "-")
	text := trimGlossaryInput(term.Term)
	if locale == "" || text == "" || utf16Length(text) > 1000 {
		return glossaryConceptTermRecord{}, invalidGlossary()
	}
	description, note, pos, status := "", "", "", "draft"
	if term.Description != nil {
		description = *term.Description
	}
	if term.Note != nil {
		note = *term.Note
	}
	if term.PartOfSpeech != nil {
		pos = *term.PartOfSpeech
	}
	if term.Status != nil {
		status = *term.Status
	}
	caseSensitive, forbidden := false, false
	if term.CaseSensitive != nil {
		caseSensitive = *term.CaseSensitive
	}
	if term.Forbidden != nil {
		forbidden = *term.Forbidden
	}
	return scanGlossaryTerm(db.QueryRow(ctx, `insert into glossary_terms as t (glossary_id, concept_id, locale, term, source_term, target_term, description, note, part_of_speech, gender, term_type, url, lemma, status, case_sensitive, forbidden, provenance, created_by_user_id, modified_by_user_id) values ($1,$2,$3,$4,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'manual',$15,$15) returning `+glossaryTermColumns, g.ID, conceptID, locale, text, description, note, pos, term.Gender, term.TermType, emptyToNil(term.URL), emptyToNil(term.Lemma), status, caseSensitive, forbidden, userID), g.SourceLocale)
}

func (api *glossaryAPI) patchConcept(r *http.Request, actor glossaryActor, g glossaryRecord, conceptID string) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	var payload glossaryConceptPayload
	if err := readGlossaryBody(r, []string{"primaryTerm", "subject", "definition", "translatable", "note", "figure", "url"}, &payload); err != nil {
		return nil, 0, err
	}
	if payload.PrimaryTerm == nil && payload.Subject == nil && payload.Definition == nil && payload.Translatable == nil && payload.Note == nil && payload.Figure == nil && payload.URL == nil {
		return nil, 0, invalidGlossary()
	}
	var primary *string
	if payload.PrimaryTerm != nil {
		value := trimGlossaryInput(*payload.PrimaryTerm)
		if value == "" || utf16Length(value) > 1000 {
			return nil, 0, invalidGlossary()
		}
		primary = &value
	}
	c, err := scanGlossaryConcept(api.pool.QueryRow(r.Context(), `update glossary_concepts as c set primary_term=coalesce($3,primary_term), subject=coalesce($4,subject), definition=coalesce($5,definition), translatable=coalesce($6,translatable), note=coalesce($7,note), url=coalesce($8,url), figure=coalesce($9,figure), modified_by_user_id=$10, version=version+1, updated_at=now() where id=$1 and glossary_id=$2 and archived_at is null returning `+glossaryConceptColumns, conceptID, g.ID, primary, payload.Subject, payload.Definition, payload.Translatable, payload.Note, emptyToNil(payload.URL), emptyToNil(payload.Figure), actor.userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	terms, err := api.listConceptTerms(r.Context(), g, c.ID)
	if err != nil {
		return nil, 0, err
	}
	c.Terms = terms
	return map[string]any{"concept": c}, 200, nil
}

func (api *glossaryAPI) deleteConcept(ctx context.Context, actor glossaryActor, g glossaryRecord, conceptID string) (any, int, error) {
	if err := api.requireConceptWrite(ctx, actor, g); err != nil {
		return nil, 0, err
	}
	tag, err := api.pool.Exec(ctx, `delete from glossary_concepts where id=$1 and glossary_id=$2`, conceptID, g.ID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, missingGlossary()
	}
	return nil, 204, nil
}

func (api *glossaryAPI) patchTerm(r *http.Request, actor glossaryActor, g glossaryRecord, conceptID, termID string) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	var payload glossaryConceptTermInput
	if err := readGlossaryBody(r, []string{"locale", "term", "partOfSpeech", "note", "gender", "termType", "url", "lemma", "status", "description", "caseSensitive", "forbidden"}, &payload); err != nil {
		return nil, 0, err
	}
	var locale, text *string
	if payload.Locale != "" {
		value := strings.ReplaceAll(trimGlossaryInput(payload.Locale), "_", "-")
		locale = &value
	}
	if payload.Term != "" {
		value := trimGlossaryInput(payload.Term)
		if value == "" || utf16Length(value) > 1000 {
			return nil, 0, invalidGlossary()
		}
		text = &value
	}
	term, err := scanGlossaryTerm(api.pool.QueryRow(r.Context(), `update glossary_terms as t set locale=coalesce($4,locale), term=coalesce($5,term), source_term=coalesce($5,source_term), target_term=coalesce($5,target_term), description=coalesce($6,description), note=coalesce($7,note), part_of_speech=coalesce($8,part_of_speech), gender=coalesce($9,gender), term_type=coalesce($10,term_type), url=coalesce($11,url), lemma=coalesce($12,lemma), status=coalesce($13,status), case_sensitive=coalesce($14,case_sensitive), forbidden=coalesce($15,forbidden), modified_by_user_id=$16, version=version+1, updated_at=now() where id=$1 and concept_id=$2 and glossary_id=$3 and archived_at is null returning `+glossaryTermColumns, termID, conceptID, g.ID, locale, text, payload.Description, payload.Note, payload.PartOfSpeech, payload.Gender, payload.TermType, emptyToNil(payload.URL), emptyToNil(payload.Lemma), payload.Status, payload.CaseSensitive, payload.Forbidden, actor.userID), g.SourceLocale)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"term": term}, 200, nil
}
