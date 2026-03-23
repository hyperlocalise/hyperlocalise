package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/uptrace/bun"
)

var glossaryLexemePattern = regexp.MustCompile(`[\pL\pN_]+`)

type GlossarySearchParams struct {
	ProjectID    string
	SourceLocale string
	TargetLocale string
	Query        string
	Limit        int
}

type GlossaryListParams struct {
	ProjectID    string
	SourceLocale string
	TargetLocale string
	Limit        int
}

type GlossaryListCursor struct {
	UpdatedAt time.Time
	ID        string
}

type GlossaryListPage struct {
	Terms      []TranslationGlossaryTermModel
	NextCursor *GlossaryListCursor
}

type GlossaryTermInput struct {
	SourceLocale string
	TargetLocale string
	SourceTerm   string
	TargetTerm   string
	Description  string
	PartOfSpeech string
}

func (r *Repository) InsertGlossaryTerm(ctx context.Context, db bun.IDB, term *TranslationGlossaryTermModel) error {
	if _, err := db.NewInsert().Model(term).Exec(ctx); err != nil {
		if isUniqueConstraintError(err) {
			return ErrAlreadyExists
		}
		return fmt.Errorf("insert translation glossary term: %w", err)
	}
	return nil
}

func (r *Repository) GetGlossaryTerm(ctx context.Context, projectID, id string) (*TranslationGlossaryTermModel, error) {
	term := &TranslationGlossaryTermModel{}
	err := r.db.NewSelect().
		Model(term).
		Where("tgt.project_id = ?", projectID).
		Where("tgt.id = ?", id).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation glossary term: %w", err)
	}
	return term, nil
}

func (r *Repository) ListGlossaryTerms(ctx context.Context, params GlossaryListParams) ([]TranslationGlossaryTermModel, error) {
	page, err := r.ListGlossaryTermsPage(ctx, params, nil)
	if err != nil {
		return nil, err
	}
	return page.Terms, nil
}

func (r *Repository) ListGlossaryTermsPage(
	ctx context.Context,
	params GlossaryListParams,
	cursor *GlossaryListCursor,
) (*GlossaryListPage, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 50
	}

	query := r.db.NewSelect().
		Model((*TranslationGlossaryTermModel)(nil)).
		Where("tgt.project_id = ?", strings.TrimSpace(params.ProjectID)).
		OrderExpr("tgt.updated_at DESC").
		OrderExpr("tgt.id DESC").
		Limit(limit + 1)
	if strings.TrimSpace(params.SourceLocale) != "" {
		query = query.Where("tgt.source_locale = ?", strings.TrimSpace(params.SourceLocale))
	}
	if strings.TrimSpace(params.TargetLocale) != "" {
		query = query.Where("tgt.target_locale = ?", strings.TrimSpace(params.TargetLocale))
	}
	if cursor != nil {
		query = query.Where(
			"(tgt.updated_at < ? OR (tgt.updated_at = ? AND tgt.id < ?))",
			cursor.UpdatedAt,
			cursor.UpdatedAt,
			cursor.ID,
		)
	}

	var terms []TranslationGlossaryTermModel
	if err := query.Scan(ctx, &terms); err != nil {
		return nil, fmt.Errorf("list translation glossary terms: %w", err)
	}

	page := &GlossaryListPage{Terms: terms}
	if len(terms) > limit {
		last := terms[limit-1]
		page.NextCursor = &GlossaryListCursor{UpdatedAt: last.UpdatedAt, ID: last.ID}
		page.Terms = terms[:limit]
	}
	if page.Terms == nil {
		page.Terms = []TranslationGlossaryTermModel{}
	}
	return page, nil
}

func (r *Repository) UpdateGlossaryTerm(
	ctx context.Context,
	projectID, id string,
	sourceLocale, targetLocale, sourceTerm, targetTerm, description, partOfSpeech *string,
	updatedAt time.Time,
) (*TranslationGlossaryTermModel, error) {
	update := r.db.NewUpdate().
		Model((*TranslationGlossaryTermModel)(nil)).
		Set("updated_at = ?", updatedAt).
		Where("project_id = ?", projectID).
		Where("id = ?", id)

	if sourceLocale != nil {
		update = update.Set("source_locale = ?", *sourceLocale)
	}
	if targetLocale != nil {
		update = update.Set("target_locale = ?", *targetLocale)
	}
	if sourceTerm != nil {
		update = update.Set("source_term = ?", *sourceTerm)
	}
	if targetTerm != nil {
		update = update.Set("target_term = ?", *targetTerm)
	}
	if description != nil {
		update = update.Set("description = ?", *description)
	}
	if partOfSpeech != nil {
		update = update.Set("part_of_speech = ?", *partOfSpeech)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrAlreadyExists
		}
		return nil, fmt.Errorf("update translation glossary term: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("count glossary term update rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return nil, ErrNotFound
	}

	return r.GetGlossaryTerm(ctx, projectID, id)
}

func (r *Repository) DeleteGlossaryTerm(ctx context.Context, projectID, id string) error {
	result, err := r.db.NewDelete().
		Model((*TranslationGlossaryTermModel)(nil)).
		Where("project_id = ?", projectID).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete translation glossary term: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count glossary term delete rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) BulkUpsertGlossaryTerms(
	ctx context.Context,
	db bun.IDB,
	projectID string,
	inputs []GlossaryTermInput,
	now time.Time,
) ([]TranslationGlossaryTermModel, error) {
	if len(inputs) == 0 {
		return []TranslationGlossaryTermModel{}, nil
	}

	models := make([]TranslationGlossaryTermModel, 0, len(inputs))
	for _, input := range inputs {
		id, err := newGlossaryTermID()
		if err != nil {
			return nil, err
		}
		models = append(models, TranslationGlossaryTermModel{
			ID:           id,
			ProjectID:    projectID,
			SourceLocale: input.SourceLocale,
			TargetLocale: input.TargetLocale,
			SourceTerm:   input.SourceTerm,
			TargetTerm:   input.TargetTerm,
			Description:  input.Description,
			PartOfSpeech: input.PartOfSpeech,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
	}

	if err := db.NewInsert().
		Model(&models).
		On("CONFLICT (project_id, source_locale, target_locale, source_term) DO UPDATE").
		Set("target_term = EXCLUDED.target_term").
		Set("description = EXCLUDED.description").
		Set("part_of_speech = EXCLUDED.part_of_speech").
		Set("updated_at = EXCLUDED.updated_at").
		Returning("*").
		Scan(ctx, &models); err != nil {
		return nil, fmt.Errorf("bulk upsert translation glossary terms: %w", err)
	}

	byNaturalKey := make(map[string]TranslationGlossaryTermModel, len(models))
	for _, model := range models {
		byNaturalKey[glossaryNaturalKey(model.SourceLocale, model.TargetLocale, model.SourceTerm)] = model
	}

	ordered := make([]TranslationGlossaryTermModel, 0, len(inputs))
	for _, input := range inputs {
		model, ok := byNaturalKey[glossaryNaturalKey(input.SourceLocale, input.TargetLocale, input.SourceTerm)]
		if !ok {
			return nil, fmt.Errorf("bulk upsert translation glossary terms: missing returned row for %s/%s/%s", input.SourceLocale, input.TargetLocale, input.SourceTerm)
		}
		ordered = append(ordered, model)
	}

	return ordered, nil
}

func (r *Repository) BulkDeleteGlossaryTerms(ctx context.Context, db bun.IDB, projectID string, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return []string{}, nil
	}

	var deletedIDs []string
	if err := db.NewDelete().
		Model((*TranslationGlossaryTermModel)(nil)).
		Where("project_id = ?", projectID).
		Where("id IN (?)", bun.In(ids)).
		Returning("id").
		Scan(ctx, &deletedIDs); err != nil {
		return nil, fmt.Errorf("bulk delete translation glossary terms: %w", err)
	}
	return deletedIDs, nil
}

// SearchGlossaryTerms retrieves ranked glossary matches for a project and locale pair.
func (r *Repository) SearchGlossaryTerms(ctx context.Context, params GlossarySearchParams) ([]TranslationGlossaryTermModel, error) {
	queryText := strings.TrimSpace(params.Query)
	tsQuery := buildGlossaryTSQuery(queryText)
	if queryText == "" || tsQuery == "" {
		return nil, nil
	}

	limit := params.Limit
	if limit <= 0 {
		limit = 5
	}

	var terms []TranslationGlossaryTermModel
	if err := r.db.NewSelect().
		Model((*TranslationGlossaryTermModel)(nil)).
		Where("tgt.project_id = ?", strings.TrimSpace(params.ProjectID)).
		Where("tgt.source_locale = ?", strings.TrimSpace(params.SourceLocale)).
		Where("tgt.target_locale = ?", strings.TrimSpace(params.TargetLocale)).
		Where("(strpos(lower(?), lower(tgt.source_term)) > 0 OR tgt.search_vector @@ to_tsquery('simple', ?))", queryText, tsQuery).
		OrderExpr("CASE WHEN strpos(lower(?), lower(tgt.source_term)) > 0 THEN 1 ELSE 0 END DESC", queryText).
		OrderExpr("ts_rank_cd(tgt.search_vector, to_tsquery('simple', ?)) DESC", tsQuery).
		OrderExpr("char_length(tgt.source_term) DESC").
		OrderExpr("tgt.source_term ASC").
		Limit(limit).
		Scan(ctx, &terms); err != nil {
		return nil, fmt.Errorf("search translation glossary terms: %w", err)
	}

	return terms, nil
}

func buildGlossaryTSQuery(raw string) string {
	matches := glossaryLexemePattern.FindAllString(strings.ToLower(strings.TrimSpace(raw)), -1)
	if len(matches) == 0 {
		return ""
	}

	seen := make(map[string]struct{}, len(matches))
	terms := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		if _, ok := seen[match]; ok {
			continue
		}
		seen[match] = struct{}{}
		terms = append(terms, match)
	}
	if len(terms) == 0 {
		return ""
	}

	return strings.Join(terms, " | ")
}

func glossaryLexemes(raw string) []string {
	matches := glossaryLexemePattern.FindAllString(strings.ToLower(strings.TrimSpace(raw)), -1)
	if len(matches) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(matches))
	terms := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		if _, ok := seen[match]; ok {
			continue
		}
		seen[match] = struct{}{}
		terms = append(terms, match)
	}
	return terms
}

func RankGlossaryTerms(terms []TranslationGlossaryTermModel, query string, limit int) []TranslationGlossaryTermModel {
	queryText := strings.ToLower(strings.TrimSpace(query))
	queryLexemes := glossaryLexemes(query)
	if queryText == "" || len(queryLexemes) == 0 || len(terms) == 0 {
		return nil
	}
	if limit <= 0 {
		limit = 5
	}

	type scoredTerm struct {
		term          TranslationGlossaryTermModel
		phraseMatch   bool
		lexemeMatches int
	}

	scored := make([]scoredTerm, 0, len(terms))
	for _, term := range terms {
		sourceTerm := strings.ToLower(strings.TrimSpace(term.SourceTerm))
		if sourceTerm == "" {
			continue
		}

		phraseMatch := strings.Contains(queryText, sourceTerm)
		lexemeMatches := 0
		for _, lexeme := range queryLexemes {
			if strings.Contains(sourceTerm, lexeme) {
				lexemeMatches++
			}
		}
		if !phraseMatch && lexemeMatches == 0 {
			continue
		}
		scored = append(scored, scoredTerm{term: term, phraseMatch: phraseMatch, lexemeMatches: lexemeMatches})
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].phraseMatch != scored[j].phraseMatch {
			return scored[i].phraseMatch
		}
		if scored[i].lexemeMatches != scored[j].lexemeMatches {
			return scored[i].lexemeMatches > scored[j].lexemeMatches
		}
		if len(scored[i].term.SourceTerm) != len(scored[j].term.SourceTerm) {
			return len(scored[i].term.SourceTerm) > len(scored[j].term.SourceTerm)
		}
		return scored[i].term.SourceTerm < scored[j].term.SourceTerm
	})

	if len(scored) > limit {
		scored = scored[:limit]
	}
	out := make([]TranslationGlossaryTermModel, 0, len(scored))
	for _, item := range scored {
		out = append(out, item.term)
	}
	return out
}

func glossaryNaturalKey(sourceLocale, targetLocale, sourceTerm string) string {
	return sourceLocale + "\x00" + targetLocale + "\x00" + sourceTerm
}

func newGlossaryTermID() (string, error) {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate glossary term id: %w", err)
	}
	return "term_" + hex.EncodeToString(bytes[:]), nil
}
