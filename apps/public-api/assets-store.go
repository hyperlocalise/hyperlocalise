package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	errGlossaryNotFound = fmt.Errorf("%w: glossary", errResourceNotFound)
	errMemoryNotFound   = fmt.Errorf("%w: translation memory", errResourceNotFound)
)

type glossary struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Description          string    `json:"description"`
	SourceLocale         string    `json:"sourceLocale"`
	Locales              []string  `json:"locales"`
	Status               string    `json:"status"`
	Source               string    `json:"source"`
	ControlLevel         string    `json:"controlLevel"`
	TeamID               *string   `json:"teamId"`
	ExternalProviderKind *string   `json:"externalProviderKind"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type glossaryTerm struct {
	ID                string    `json:"id"`
	ConceptID         string    `json:"conceptId"`
	Locale            string    `json:"locale"`
	Term              string    `json:"term"`
	Description       string    `json:"description"`
	Note              string    `json:"note"`
	PartOfSpeech      string    `json:"partOfSpeech"`
	Status            string    `json:"status"`
	CaseSensitive     bool      `json:"caseSensitive"`
	Forbidden         bool      `json:"forbidden"`
	ReviewStatus      string    `json:"reviewStatus"`
	ConceptDefinition string    `json:"conceptDefinition"`
	ConceptSubject    string    `json:"conceptSubject"`
	Translatable      bool      `json:"translatable"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type translationMemory struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Description          string    `json:"description"`
	Status               string    `json:"status"`
	Source               string    `json:"source"`
	ExternalProviderKind *string   `json:"externalProviderKind"`
	Locales              []string  `json:"locales"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type memoryEntry struct {
	ID           string    `json:"id"`
	SourceLocale string    `json:"sourceLocale"`
	TargetLocale string    `json:"targetLocale"`
	SourceText   string    `json:"sourceText"`
	TargetText   string    `json:"targetText"`
	MatchScore   int       `json:"matchScore"`
	Provenance   string    `json:"provenance"`
	ReviewStatus string    `json:"reviewStatus"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type glossaryTermFilters struct {
	Locale string
	Search string
	Limit  int
	Offset int
}

type memoryEntryFilters struct {
	SourceLocale string
	TargetLocale string
	Search       string
	Limit        int
	Offset       int
}

// accessibleGlossaryPredicate mirrors go-svc's glossaryAccessPredicate: org glossaries are
// visible to every member, team glossaries to their team and to teams of attached projects.
const accessibleGlossaryPredicate = `
	g.organization_id = $1
	AND (
		` + workspaceOperatorPredicate + `
		OR g.control_level = 'org'
		OR EXISTS (
			SELECT 1 FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
			WHERE tm.user_id = $2 AND t.organization_id = $1 AND t.id = g.team_id
		)
		OR EXISTS (
			SELECT 1 FROM project_glossaries pg JOIN projects p ON p.id = pg.project_id
			WHERE pg.glossary_id = g.id AND pg.organization_id = $1 AND p.organization_id = $1
				AND ` + projectTeamMemberPredicate + `
		)
	)`

// accessibleMemoryPredicate mirrors go-svc's memoryAccessPredicate: unattached memories are
// org libraries, attached ones are visible to teams of attached projects.
const accessibleMemoryPredicate = `
	m.organization_id = $1
	AND (
		` + workspaceOperatorPredicate + `
		OR NOT EXISTS (
			SELECT 1 FROM project_memories pm0 WHERE pm0.memory_id = m.id AND pm0.organization_id = $1
		)
		OR EXISTS (
			SELECT 1 FROM project_memories pm JOIN projects p ON p.id = pm.project_id
			WHERE pm.memory_id = m.id AND pm.organization_id = $1 AND p.organization_id = $1
				AND ` + projectTeamMemberPredicate + `
		)
	)`

const glossaryColumns = `
	g.id, g.name, g.description, g.source_locale, g.locale_coverage, g.status::text, g.source::text,
	g.control_level::text, g.team_id, g.external_provider_kind::text, g.created_at, g.updated_at`

func scanGlossary(row rowScanner) (glossary, error) {
	var item glossary
	var locales []byte
	if err := row.Scan(
		&item.ID, &item.Name, &item.Description, &item.SourceLocale, &locales, &item.Status, &item.Source,
		&item.ControlLevel, &item.TeamID, &item.ExternalProviderKind, &item.CreatedAt, &item.UpdatedAt,
	); err != nil {
		return glossary{}, err
	}
	var err error
	item.Locales, err = decodeLocales(locales)
	return item, err
}

func decodeLocales(raw []byte) ([]string, error) {
	var locales []string
	if err := json.Unmarshal(raw, &locales); err != nil {
		return nil, fmt.Errorf("decode locales: %w", err)
	}
	if locales == nil {
		locales = []string{}
	}
	return locales, nil
}

func (s *postgresStore) listGlossaries(ctx context.Context, actor principal, limit, offset int) ([]glossary, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM glossaries g WHERE `+accessibleGlossaryPredicate,
		actor.OrganizationID, actor.UserID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count glossaries: %w", err)
	}
	rows, err := s.pool.Query(ctx, `SELECT `+glossaryColumns+`
		FROM glossaries g
		WHERE `+accessibleGlossaryPredicate+`
		ORDER BY g.created_at DESC, g.id ASC
		LIMIT $3 OFFSET $4`, actor.OrganizationID, actor.UserID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list glossaries: %w", err)
	}
	items, err := collectRows(rows, scanGlossary)
	return items, total, err
}

func (s *postgresStore) getGlossary(ctx context.Context, actor principal, glossaryID string) (glossary, error) {
	if _, err := uuid.Parse(glossaryID); err != nil {
		return glossary{}, errGlossaryNotFound
	}
	item, err := scanGlossary(s.pool.QueryRow(ctx, `SELECT `+glossaryColumns+`
		FROM glossaries g
		WHERE `+accessibleGlossaryPredicate+` AND g.id = $3`,
		actor.OrganizationID, actor.UserID, glossaryID))
	if errors.Is(err, pgx.ErrNoRows) {
		return glossary{}, errGlossaryNotFound
	}
	return item, err
}

const glossaryTermColumns = `
	gt.id, gt.concept_id, gt.locale, gt.term, gt.description, gt.note, gt.part_of_speech, gt.status,
	gt.case_sensitive, gt.forbidden, gt.review_status, gc.definition, gc.subject, gc.translatable,
	gt.created_at, gt.updated_at`

const glossaryTermFrom = `
	FROM glossary_terms gt
	JOIN glossary_concepts gc ON gc.id = gt.concept_id`

func scanGlossaryTerm(row rowScanner) (glossaryTerm, error) {
	var item glossaryTerm
	err := row.Scan(
		&item.ID, &item.ConceptID, &item.Locale, &item.Term, &item.Description, &item.Note, &item.PartOfSpeech, &item.Status,
		&item.CaseSensitive, &item.Forbidden, &item.ReviewStatus, &item.ConceptDefinition, &item.ConceptSubject, &item.Translatable,
		&item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (s *postgresStore) listGlossaryTerms(ctx context.Context, actor principal, glossaryID string, filters glossaryTermFilters) ([]glossaryTerm, int, error) {
	item, err := s.getGlossary(ctx, actor, glossaryID)
	if err != nil {
		return nil, 0, err
	}
	where := newSQLFilter(`gt.glossary_id = $1 AND gt.archived_at IS NULL AND gc.archived_at IS NULL
		AND gt.locale IS NOT NULL AND gt.term IS NOT NULL`, item.ID)
	if filters.Locale != "" {
		where.add("gt.locale = ?", filters.Locale)
	}
	if filters.Search != "" {
		where.add("gt.term ILIKE ?", "%"+filters.Search+"%")
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+glossaryTermFrom+` WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count glossary terms: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+glossaryTermColumns+glossaryTermFrom+` WHERE `+where.sql()+`
		ORDER BY gc.primary_term ASC, gc.id ASC, gt.locale ASC, gt.term ASC`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list glossary terms: %w", err)
	}
	items, err := collectRows(rows, scanGlossaryTerm)
	return items, total, err
}

const memoryColumns = `
	m.id, m.name, m.description, m.status::text, m.source::text, m.external_provider_kind::text,
	m.locale_coverage, m.created_at, m.updated_at`

func scanMemory(row rowScanner) (translationMemory, error) {
	var item translationMemory
	var locales []byte
	if err := row.Scan(
		&item.ID, &item.Name, &item.Description, &item.Status, &item.Source, &item.ExternalProviderKind,
		&locales, &item.CreatedAt, &item.UpdatedAt,
	); err != nil {
		return translationMemory{}, err
	}
	var err error
	item.Locales, err = decodeLocales(locales)
	return item, err
}

func (s *postgresStore) listMemories(ctx context.Context, actor principal, limit, offset int) ([]translationMemory, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM memories m WHERE `+accessibleMemoryPredicate,
		actor.OrganizationID, actor.UserID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count memories: %w", err)
	}
	rows, err := s.pool.Query(ctx, `SELECT `+memoryColumns+`
		FROM memories m
		WHERE `+accessibleMemoryPredicate+`
		ORDER BY m.created_at DESC, m.id ASC
		LIMIT $3 OFFSET $4`, actor.OrganizationID, actor.UserID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list memories: %w", err)
	}
	items, err := collectRows(rows, scanMemory)
	return items, total, err
}

func (s *postgresStore) getMemory(ctx context.Context, actor principal, memoryID string) (translationMemory, error) {
	if _, err := uuid.Parse(memoryID); err != nil {
		return translationMemory{}, errMemoryNotFound
	}
	item, err := scanMemory(s.pool.QueryRow(ctx, `SELECT `+memoryColumns+`
		FROM memories m
		WHERE `+accessibleMemoryPredicate+` AND m.id = $3`,
		actor.OrganizationID, actor.UserID, memoryID))
	if errors.Is(err, pgx.ErrNoRows) {
		return translationMemory{}, errMemoryNotFound
	}
	return item, err
}

const memoryEntryColumns = `
	e.id, e.source_locale, e.target_locale, e.source_text, e.target_text, e.match_score,
	e.provenance, e.review_status, e.created_at, e.updated_at`

func scanMemoryEntry(row rowScanner) (memoryEntry, error) {
	var item memoryEntry
	err := row.Scan(
		&item.ID, &item.SourceLocale, &item.TargetLocale, &item.SourceText, &item.TargetText, &item.MatchScore,
		&item.Provenance, &item.ReviewStatus, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (s *postgresStore) listMemoryEntries(ctx context.Context, actor principal, memoryID string, filters memoryEntryFilters) ([]memoryEntry, int, error) {
	item, err := s.getMemory(ctx, actor, memoryID)
	if err != nil {
		return nil, 0, err
	}
	where := newSQLFilter("e.memory_id = $1", item.ID)
	if filters.SourceLocale != "" {
		where.add("e.source_locale = ?", filters.SourceLocale)
	}
	if filters.TargetLocale != "" {
		where.add("e.target_locale = ?", filters.TargetLocale)
	}
	if filters.Search != "" {
		where.add("(e.source_text ILIKE ? OR e.target_text ILIKE ?)", "%"+filters.Search+"%")
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM memory_entries e WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count memory entries: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+memoryEntryColumns+` FROM memory_entries e WHERE `+where.sql()+`
		ORDER BY e.updated_at DESC, e.id ASC`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list memory entries: %w", err)
	}
	items, err := collectRows(rows, scanMemoryEntry)
	return items, total, err
}
