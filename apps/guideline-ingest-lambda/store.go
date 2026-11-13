package main

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type postgresDocumentStore struct{ pool *pgxpool.Pool }

func (s postgresDocumentStore) Load(ctx context.Context, organizationID, documentID string) (storedDocument, bool, error) {
	var doc storedDocument
	err := s.pool.QueryRow(ctx, `
        select id::text, organization_id::text, coalesce(project_id, ''), coalesce(locale, ''), filename, content_type,
               storage_location_id, storage_key, content, revision_id::text, version, mandatory, status
        from guideline_documents
        where id = $1 and organization_id = $2`, documentID, organizationID).Scan(
		&doc.ID, &doc.OrganizationID, &doc.ProjectID, &doc.Locale, &doc.Filename, &doc.ContentType,
		&doc.StorageLocationID, &doc.StorageKey, &doc.Content, &doc.RevisionID, &doc.Version, &doc.Mandatory, &doc.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return storedDocument{}, false, nil
	}
	if err != nil {
		return storedDocument{}, false, fmt.Errorf("load guideline document: %w", err)
	}
	return doc, true, nil
}

func (s postgresDocumentStore) MarkReady(ctx context.Context, documentID, revisionID, content string, truncated bool) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
        update guideline_documents
        set content = $3, truncated = $4, status = 'ready', error_code = null, updated_at = now()
        where id = $1 and revision_id = $2 and status = 'processing'`, documentID, revisionID, content, truncated)
	if err != nil {
		return false, fmt.Errorf("mark guideline document ready: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (s postgresDocumentStore) MarkFailed(ctx context.Context, documentID, revisionID, errorCode string) error {
	_, err := s.pool.Exec(ctx, `
        update guideline_documents
        set status = 'failed', error_code = $3, updated_at = now()
        where id = $1 and revision_id = $2 and status = 'processing'`, documentID, revisionID, errorCode)
	if err != nil {
		return fmt.Errorf("mark guideline document failed: %w", err)
	}
	return nil
}

func (s postgresDocumentStore) MarkIndexed(ctx context.Context, documentID, revisionID string) error {
	_, err := s.pool.Exec(ctx, `
        update guideline_documents set indexed_revision_id = revision_id
        where id = $1 and revision_id = $2`, documentID, revisionID)
	if err != nil {
		return fmt.Errorf("mark guideline document indexed: %w", err)
	}
	return nil
}

type registryObjectReader struct{ registry *objectstore.Registry }

func (r registryObjectReader) Open(ctx context.Context, locationID, key string) (io.ReadCloser, error) {
	store, err := r.registry.Resolve(locationID)
	if err != nil {
		return nil, err
	}
	body, _, err := store.Get(ctx, key)
	return body, err
}
