// Package postgres reads existing guideline documents.
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

// currentQuery loads ready guideline documents in the same project and
// locale scope. Documents use their own mandatory flag.
//
// Org-scoped content uses assignment tables: an org-wide document with no
// assignment rows applies to every project; when assignment rows exist the
// document applies only to listed projects. Org-wide uploads (project_id IS
// NULL) check guideline_document_projects. Project-owned uploads skip
// assignment. An empty project scope ($2 = ”) keeps all org-scoped content
// for org-level checks.
const currentQuery = `
        SELECT 'doc:' || d.id::text, d.revision_id::text, d.version, d.content, coalesce(d.project_id, ''), coalesce(d.locale, ''), d.mandatory
        FROM guideline_documents d
        WHERE d.organization_id::text = $1 AND d.status = 'ready'
          AND (
            (d.project_id IS NULL AND ($2 = '' OR NOT EXISTS (
              SELECT 1 FROM guideline_document_projects g
              WHERE g.document_id = d.id
            ) OR EXISTS (
              SELECT 1 FROM guideline_document_projects g
              WHERE g.document_id = d.id AND g.project_id = $2
            )))
            OR d.project_id = $2
          )
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
		return nil, fmt.Errorf("query guideline documents: %w", err)
	}
	defer rows.Close()
	docs := make([]guidelines.Document, 0, 2)
	for rows.Next() {
		doc := guidelines.Document{Scope: guidelines.Scope{OrganizationID: scope.OrganizationID}}
		if err := rows.Scan(&doc.ID, &doc.RevisionID, &doc.Version, &doc.Content, &doc.Scope.ProjectID, &doc.Scope.Locale, &doc.Mandatory); err != nil {
			return nil, fmt.Errorf("read guideline document: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read guideline documents: %w", err)
	}
	return docs, nil
}
