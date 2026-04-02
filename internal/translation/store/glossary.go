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

	"github.com/hyperlocalise/rain-orm/pkg/schema"
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

func (r *Repository) InsertGlossaryTerm(ctx context.Context, db queryExecutor, term *TranslationGlossaryTermModel) error {
	if _, err := db.Insert().Table(TranslationGlossaryTerms).Model(term).Exec(ctx); err != nil {
		if isUniqueConstraintError(err) {
			return ErrAlreadyExists
		}
		return fmt.Errorf("insert translation glossary term: %w", err)
	}
	return nil
}

func (r *Repository) GetGlossaryTerm(ctx context.Context, projectID, id string) (*TranslationGlossaryTermModel, error) {
	term := &TranslationGlossaryTermModel{}
	err := r.db.Select().
		Table(TranslationGlossaryTerms).
		Where(TranslationGlossaryTerms.ProjectID.Eq(projectID)).
		Where(TranslationGlossaryTerms.ID.Eq(id)).
		Limit(1).
		Scan(ctx, term)
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

	query := r.db.Select().
		Table(TranslationGlossaryTerms).
		Where(TranslationGlossaryTerms.ProjectID.Eq(strings.TrimSpace(params.ProjectID))).
		OrderBy(TranslationGlossaryTerms.UpdatedAt.Desc(), TranslationGlossaryTerms.ID.Desc()).
		Limit(limit + 1)
	if strings.TrimSpace(params.SourceLocale) != "" {
		query = query.Where(TranslationGlossaryTerms.SourceLocale.Eq(strings.TrimSpace(params.SourceLocale)))
	}
	if strings.TrimSpace(params.TargetLocale) != "" {
		query = query.Where(TranslationGlossaryTerms.TargetLocale.Eq(strings.TrimSpace(params.TargetLocale)))
	}
	if cursor != nil {
		query = query.Where(schema.Or(
			TranslationGlossaryTerms.UpdatedAt.Lt(cursor.UpdatedAt),
			schema.And(
				TranslationGlossaryTerms.UpdatedAt.Eq(cursor.UpdatedAt),
				TranslationGlossaryTerms.ID.Lt(cursor.ID),
			),
		))
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
	update := r.db.Update().
		Table(TranslationGlossaryTerms).
		Set(TranslationGlossaryTerms.UpdatedAt, updatedAt).
		Where(TranslationGlossaryTerms.ProjectID.Eq(projectID)).
		Where(TranslationGlossaryTerms.ID.Eq(id))

	if sourceLocale != nil {
		update = update.Set(TranslationGlossaryTerms.SourceLocale, *sourceLocale)
	}
	if targetLocale != nil {
		update = update.Set(TranslationGlossaryTerms.TargetLocale, *targetLocale)
	}
	if sourceTerm != nil {
		update = update.Set(TranslationGlossaryTerms.SourceTerm, *sourceTerm)
	}
	if targetTerm != nil {
		update = update.Set(TranslationGlossaryTerms.TargetTerm, *targetTerm)
	}
	if description != nil {
		update = update.Set(TranslationGlossaryTerms.Description, *description)
	}
	if partOfSpeech != nil {
		update = update.Set(TranslationGlossaryTerms.PartOfSpeech, *partOfSpeech)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrAlreadyExists
		}
		return nil, fmt.Errorf("update translation glossary term: %w", err)
	}
	affected, err := rowsAffected(result, "glossary term update")
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, ErrNotFound
	}

	return r.GetGlossaryTerm(ctx, projectID, id)
}

func (r *Repository) DeleteGlossaryTerm(ctx context.Context, projectID, id string) error {
	result, err := r.db.Delete().
		Table(TranslationGlossaryTerms).
		Where(TranslationGlossaryTerms.ProjectID.Eq(projectID)).
		Where(TranslationGlossaryTerms.ID.Eq(id)).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete translation glossary term: %w", err)
	}
	affected, err := rowsAffected(result, "glossary term delete")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) BulkUpsertGlossaryTerms(
	ctx context.Context,
	db queryExecutor,
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

	if err := db.Insert().
		Table(TranslationGlossaryTerms).
		Models(models).
		OnConflict(
			TranslationGlossaryTerms.ProjectID,
			TranslationGlossaryTerms.SourceLocale,
			TranslationGlossaryTerms.TargetLocale,
			TranslationGlossaryTerms.SourceTerm,
		).
		DoUpdateSet(
			TranslationGlossaryTerms.TargetTerm,
			TranslationGlossaryTerms.Description,
			TranslationGlossaryTerms.PartOfSpeech,
			TranslationGlossaryTerms.UpdatedAt,
		).
		Returning(
			TranslationGlossaryTerms.ID,
			TranslationGlossaryTerms.ProjectID,
			TranslationGlossaryTerms.SourceLocale,
			TranslationGlossaryTerms.TargetLocale,
			TranslationGlossaryTerms.SourceTerm,
			TranslationGlossaryTerms.TargetTerm,
			TranslationGlossaryTerms.Description,
			TranslationGlossaryTerms.PartOfSpeech,
			TranslationGlossaryTerms.CreatedAt,
			TranslationGlossaryTerms.UpdatedAt,
		).
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

func (r *Repository) BulkDeleteGlossaryTerms(ctx context.Context, db queryExecutor, projectID string, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return []string{}, nil
	}

	values := make([]string, 0, len(ids))
	values = append(values, ids...)

	var deletedIDs []string
	if err := db.Delete().
		Table(TranslationGlossaryTerms).
		Where(TranslationGlossaryTerms.ProjectID.Eq(projectID)).
		Where(TranslationGlossaryTerms.ID.In(values...)).
		Returning(TranslationGlossaryTerms.ID).
		Scan(ctx, &deletedIDs); err != nil {
		return nil, fmt.Errorf("bulk delete translation glossary terms: %w", err)
	}
	return deletedIDs, nil
}

// SearchGlossaryTerms retrieves ranked glossary matches for a project and locale pair.
func (r *Repository) SearchGlossaryTerms(ctx context.Context, params GlossarySearchParams) ([]TranslationGlossaryTermModel, error) {
	queryText := strings.TrimSpace(params.Query)
	if queryText == "" {
		return nil, nil
	}

	if r.db.Dialect().Name() != "postgres" {
		return r.searchGlossaryTermsFallback(ctx, params, queryText)
	}

	tsQuery := buildGlossaryTSQuery(queryText)
	if tsQuery == "" {
		return nil, nil
	}

	limit := params.Limit
	if limit <= 0 {
		limit = 5
	}

	rows, err := r.db.Query(
		ctx,
		`SELECT id, project_id, source_locale, target_locale, source_term, target_term, description, part_of_speech, created_at, updated_at
		FROM translation_glossary_terms
		WHERE project_id = $1
		  AND source_locale = $2
		  AND target_locale = $3
		  AND (strpos(lower($4), lower(source_term)) > 0 OR search_vector @@ to_tsquery('simple', $5))
		ORDER BY
		  CASE WHEN strpos(lower($4), lower(source_term)) > 0 THEN 1 ELSE 0 END DESC,
		  ts_rank_cd(search_vector, to_tsquery('simple', $5)) DESC,
		  char_length(source_term) DESC,
		  source_term ASC
		LIMIT $6`,
		strings.TrimSpace(params.ProjectID),
		strings.TrimSpace(params.SourceLocale),
		strings.TrimSpace(params.TargetLocale),
		queryText,
		tsQuery,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("search translation glossary terms: %w", err)
	}
	defer func() { _ = rows.Close() }()

	terms := make([]TranslationGlossaryTermModel, 0, limit)
	for rows.Next() {
		var term TranslationGlossaryTermModel
		if err := rows.Scan(
			&term.ID,
			&term.ProjectID,
			&term.SourceLocale,
			&term.TargetLocale,
			&term.SourceTerm,
			&term.TargetTerm,
			&term.Description,
			&term.PartOfSpeech,
			&term.CreatedAt,
			&term.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan translation glossary search row: %w", err)
		}
		terms = append(terms, term)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read translation glossary search rows: %w", err)
	}

	return terms, nil
}

func (r *Repository) searchGlossaryTermsFallback(
	ctx context.Context,
	params GlossarySearchParams,
	queryText string,
) ([]TranslationGlossaryTermModel, error) {
	terms, err := r.ListGlossaryTerms(ctx, GlossaryListParams{
		ProjectID:    strings.TrimSpace(params.ProjectID),
		SourceLocale: strings.TrimSpace(params.SourceLocale),
		TargetLocale: strings.TrimSpace(params.TargetLocale),
		Limit:        500,
	})
	if err != nil {
		return nil, err
	}

	loweredQuery := strings.ToLower(queryText)
	filtered := make([]TranslationGlossaryTermModel, 0, len(terms))
	for _, term := range terms {
		if strings.Contains(loweredQuery, strings.ToLower(term.SourceTerm)) {
			filtered = append(filtered, term)
		}
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		if len(filtered[i].SourceTerm) != len(filtered[j].SourceTerm) {
			return len(filtered[i].SourceTerm) > len(filtered[j].SourceTerm)
		}
		return filtered[i].SourceTerm < filtered[j].SourceTerm
	})

	limit := params.Limit
	if limit <= 0 {
		limit = 5
	}
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}

	return filtered, nil
}

func extractGlossaryLexemes(raw string) []string {
	matches := glossaryLexemePattern.FindAllString(strings.ToLower(strings.TrimSpace(raw)), -1)
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

func buildGlossaryTSQuery(raw string) string {
	terms := extractGlossaryLexemes(raw)
	if len(terms) == 0 {
		return ""
	}
	return strings.Join(terms, " | ")
}

func glossaryNaturalKey(sourceLocale, targetLocale, sourceTerm string) string {
	return strings.ToLower(strings.TrimSpace(sourceLocale)) + "\x00" +
		strings.ToLower(strings.TrimSpace(targetLocale)) + "\x00" +
		strings.ToLower(strings.TrimSpace(sourceTerm))
}

func newGlossaryTermID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate glossary term id: %w", err)
	}
	return "term_" + hex.EncodeToString(buf), nil
}
