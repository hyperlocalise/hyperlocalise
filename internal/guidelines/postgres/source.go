// Package postgres reads existing canonical workspace and project guidelines.
package postgres

import (
	"context"
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	sharedpostgres "github.com/hyperlocalise/hyperlocalise/internal/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UploadedDocumentID is the guideline document ID of a guideline_documents row.
func UploadedDocumentID(rowID string) string { return "doc:" + rowID }

// Source uses the application's existing guideline tables and owns its pool.
type Source struct {
	pool   *pgxpool.Pool
	shared bool
}

// New connects to the canonical database. It does not create or migrate tables.
func New(ctx context.Context, databaseURL string) (*Source, error) {
	pool, err := sharedpostgres.NewPool(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("configure guideline database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect guideline database: %w", err)
	}
	return &Source{pool: pool}, nil
}

// NewWithPool shares an existing pool. Close does not release a shared pool.
func NewWithPool(pool *pgxpool.Pool) *Source { return &Source{pool: pool, shared: true} }

// Close releases database connections owned by this source.
func (s *Source) Close() {
	if !s.shared {
		s.pool.Close()
	}
}

// currentQuery loads the typed workspace and project notes, which are always
// mandatory, and ready uploaded documents in the same project and locale scope.
// Uploaded documents use their own mandatory flag.
const currentQuery = `
        SELECT 'workspace:' || organization_id::text, revision_id::text, version, content, '' AS project_id, '' AS locale, true AS mandatory
        FROM knowledge_memories WHERE organization_id::text = $1
        UNION ALL
        SELECT 'project:' || m.project_id, m.revision_id::text, m.version, m.content, m.project_id, '', true
        FROM project_knowledge_memories m JOIN projects p ON p.id = m.project_id
        WHERE p.organization_id::text = $1 AND m.project_id = $2
        UNION ALL
        SELECT 'doc:' || d.id::text, d.revision_id::text, d.version, d.content, coalesce(d.project_id, ''), coalesce(d.locale, ''), d.mandatory
        FROM guideline_documents d
        WHERE d.organization_id::text = $1 AND d.status = 'ready'
          AND (d.project_id IS NULL OR d.project_id = $2)
          AND (d.locale IS NULL OR d.locale = $3)
        ORDER BY 5, 1`

// Current checks project ownership within the supplied organization. The caller
// must first authorize the user and normalize the locale.
func (s *Source) Current(ctx context.Context, scope guidelines.Scope) ([]guidelines.Document, error) {
	if scope.OrganizationID == "" {
		return nil, guidelines.ErrInvalidInput
	}
	rows, err := s.pool.Query(ctx, currentQuery, scope.OrganizationID, scope.ProjectID, scope.Locale)
	if err != nil {
		return nil, fmt.Errorf("query canonical guidelines: %w", err)
	}
	defer rows.Close()
	docs := make([]guidelines.Document, 0, 2)
	for rows.Next() {
		doc := guidelines.Document{Scope: guidelines.Scope{OrganizationID: scope.OrganizationID}}
		if err := rows.Scan(&doc.ID, &doc.RevisionID, &doc.Version, &doc.Content, &doc.Scope.ProjectID, &doc.Scope.Locale, &doc.Mandatory); err != nil {
			return nil, fmt.Errorf("read canonical guideline: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read canonical guidelines: %w", err)
	}
	return docs, nil
}
