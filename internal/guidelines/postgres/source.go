// Package postgres reads existing guideline documents.
package postgres

import (
	"context"
	"fmt"
	"slices"
	"strings"

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
// Org rows (project_id NULL) use is_global and assignment rows. A stored
// project_id still applies only to that project and is not rewritten.
// A non-empty locales array is the only locale match. An empty array with a
// NULL locale means all locales; an empty array with locale set means that
// locale only. An empty project scope ($2 = ”) keeps org rows for org-level
// checks. An empty locale ($3 = ”) keeps only all-locale rows.
const currentQuery = `
        SELECT 'doc:' || d.id::text, d.revision_id::text, d.version, d.content, '', d.locales, d.mandatory
        FROM guideline_documents d
        WHERE d.organization_id::text = $1 AND d.status = 'ready'
          AND (
            (
              d.project_id IS NULL AND (
                $2 = '' OR d.is_global OR EXISTS (
                  SELECT 1 FROM guideline_document_projects g
                  WHERE g.document_id = d.id AND g.project_id = $2
                )
              )
            )
            OR (d.project_id IS NOT NULL AND d.project_id = $2)
          )
          AND (
            (
              coalesce(cardinality(d.locales), 0) > 0
              AND $3 <> ''
              AND $3 = ANY (d.locales)
            )
            OR (
              coalesce(cardinality(d.locales), 0) = 0
              AND (d.locale IS NULL OR ($3 <> '' AND d.locale = $3))
            )
          )
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
		var projectDummy string
		var localesArr []string
		if err := rows.Scan(&doc.ID, &doc.RevisionID, &doc.Version, &doc.Content, &projectDummy, &localesArr, &doc.Mandatory); err != nil {
			return nil, fmt.Errorf("read guideline document: %w", err)
		}
		// Multi-locale docs store an array; the caller fans out per locale, so
		// record the requested locale when this row is locale-scoped.
		if len(localesArr) == 0 {
			doc.Scope.Locale = ""
		} else if scope.Locale != "" && slices.Contains(localesArr, scope.Locale) {
			doc.Scope.Locale = scope.Locale
		} else {
			doc.Scope.Locale = strings.Join(localesArr, ",")
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read guideline documents: %w", err)
	}
	return docs, nil
}
