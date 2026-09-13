// Package postgres reads existing canonical workspace and project guidelines.
package postgres

import (
	"context"
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Source uses the application's existing guideline tables and owns its pool.
type Source struct{ pool *pgxpool.Pool }

// New connects to the canonical database. It does not create or migrate tables.
func New(ctx context.Context, databaseURL string) (*Source, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("configure guideline database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect guideline database: %w", err)
	}
	return &Source{pool: pool}, nil
}

// Close releases database connections.
func (s *Source) Close() { s.pool.Close() }

// Current checks project ownership within the supplied organization. The caller
// must first authorize the user. Existing guideline documents are mandatory:
// ranked retrieval cannot silently remove any of their rules.
func (s *Source) Current(ctx context.Context, scope guidelines.Scope) ([]guidelines.Document, error) {
	if scope.OrganizationID == "" {
		return nil, guidelines.ErrInvalidInput
	}
	rows, err := s.pool.Query(ctx, `
        SELECT 'workspace:' || organization_id::text, revision_id::text, version, content, '' AS project_id
        FROM knowledge_memories WHERE organization_id::text = $1
        UNION ALL
        SELECT 'project:' || m.project_id, m.revision_id::text, m.version, m.content, m.project_id
        FROM project_knowledge_memories m JOIN projects p ON p.id = m.project_id
        WHERE p.organization_id::text = $1 AND m.project_id = $2
        ORDER BY project_id`, scope.OrganizationID, scope.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("query canonical guidelines: %w", err)
	}
	defer rows.Close()
	docs := make([]guidelines.Document, 0, 2)
	for rows.Next() {
		doc := guidelines.Document{Scope: guidelines.Scope{OrganizationID: scope.OrganizationID}, Mandatory: true}
		if err := rows.Scan(&doc.ID, &doc.RevisionID, &doc.Version, &doc.Content, &doc.Scope.ProjectID); err != nil {
			return nil, fmt.Errorf("read canonical guideline: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read canonical guidelines: %w", err)
	}
	return docs, nil
}
