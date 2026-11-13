package main

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	"github.com/hyperlocalise/hyperlocalise/internal/textextract"
)

const (
	statusProcessing = "processing"
	statusReady      = "ready"
)

// storedDocument is the canonical guideline_documents row the worker acts on.
type storedDocument struct {
	ID                string
	OrganizationID    string
	ProjectID         string
	Locale            string
	Filename          string
	ContentType       string
	StorageLocationID string
	StorageKey        string
	Content           string
	RevisionID        string
	Version           int64
	Mandatory         bool
	Status            string
}

type documentStore interface {
	Load(ctx context.Context, organizationID, documentID string) (storedDocument, bool, error)
	// MarkReady and MarkFailed apply only while the row is still processing
	// revisionID, so a newer upload is never overwritten.
	MarkReady(ctx context.Context, documentID, revisionID, content string, truncated bool) (bool, error)
	MarkFailed(ctx context.Context, documentID, revisionID, errorCode string) error
	MarkIndexed(ctx context.Context, documentID, revisionID string) error
}

type guidelineIndexer interface {
	IndexDocument(context.Context, guidelines.Document) error
	Sync(context.Context, guidelines.Scope) error
	Delete(context.Context, guidelines.Scope, string, int64) error
}

type textExtractor interface {
	Extract(context.Context, textextract.Input) (textextract.Result, error)
}

type objectReader interface {
	Open(ctx context.Context, locationID, key string) (io.ReadCloser, error)
}

type processor struct {
	store     documentStore
	indexer   guidelineIndexer
	extractor textExtractor
	objects   objectReader
}

// outcome is a stable, content-free label for logs.
type outcome string

const (
	outcomeIndexed outcome = "indexed"
	outcomeSynced  outcome = "synced"
	outcomeDeleted outcome = "deleted"
	outcomeStale   outcome = "stale"
	outcomeMissing outcome = "missing"
	outcomeFailed  outcome = "extraction_failed"
)

// process returns an error only when SQS should retry the message.
func (p *processor) process(ctx context.Context, message ingest.Message) (outcome, error) {
	switch message.Operation {
	case ingest.OperationExtractIndex:
		return p.extractIndex(ctx, message)
	case ingest.OperationSync:
		if err := p.indexer.Sync(ctx, guidelines.Scope{OrganizationID: message.OrganizationID, ProjectID: message.ProjectID}); err != nil {
			return "", err
		}
		return outcomeSynced, nil
	case ingest.OperationDelete:
		scope := guidelines.Scope{OrganizationID: message.OrganizationID}
		if err := p.indexer.Delete(ctx, scope, guidelinepg.UploadedDocumentID(message.DocumentID), message.Version); err != nil {
			return "", err
		}
		return outcomeDeleted, nil
	default:
		return "", ingest.ErrInvalidMessage
	}
}

func (p *processor) extractIndex(ctx context.Context, message ingest.Message) (outcome, error) {
	doc, found, err := p.store.Load(ctx, message.OrganizationID, message.DocumentID)
	if err != nil {
		return "", err
	}
	if !found {
		return outcomeMissing, nil
	}
	if doc.RevisionID != message.RevisionID {
		return outcomeStale, nil
	}
	switch doc.Status {
	case statusProcessing:
		content, truncated, code, err := p.extract(ctx, doc)
		if err != nil {
			return "", err
		}
		if code != "" {
			if err := p.store.MarkFailed(ctx, doc.ID, doc.RevisionID, code); err != nil {
				return "", err
			}
			return outcomeFailed, nil
		}
		updated, err := p.store.MarkReady(ctx, doc.ID, doc.RevisionID, content, truncated)
		if err != nil {
			return "", err
		}
		if !updated {
			return outcomeStale, nil
		}
		doc.Content = content
	case statusReady:
	default:
		return outcomeStale, nil
	}
	err = p.indexer.IndexDocument(ctx, guidelines.Document{
		ID:         guidelinepg.UploadedDocumentID(doc.ID),
		RevisionID: doc.RevisionID,
		Version:    doc.Version,
		Scope:      guidelines.Scope{OrganizationID: doc.OrganizationID, ProjectID: doc.ProjectID, Locale: doc.Locale},
		Content:    doc.Content,
		Mandatory:  doc.Mandatory,
	})
	if err != nil {
		return "", err
	}
	if err := p.store.MarkIndexed(ctx, doc.ID, doc.RevisionID); err != nil {
		return "", err
	}
	return outcomeIndexed, nil
}

// extract returns a permanent error code for documents that cannot succeed on
// retry, and an error for transient failures.
func (p *processor) extract(ctx context.Context, doc storedDocument) (string, bool, string, error) {
	body, err := p.objects.Open(ctx, doc.StorageLocationID, doc.StorageKey)
	if err != nil {
		return "", false, "", fmt.Errorf("open guideline object: %w", err)
	}
	defer func() { _ = body.Close() }()
	result, err := p.extractor.Extract(ctx, textextract.Input{Filename: doc.Filename, ContentType: doc.ContentType, Body: body})
	if code := permanentExtractionCode(err); code != "" {
		return "", false, code, nil
	}
	if err != nil {
		return "", false, "", fmt.Errorf("extract guideline: %w", err)
	}
	return result.Text, result.Truncated, "", nil
}

func permanentExtractionCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, textextract.ErrNoText):
		return "no_text"
	case errors.Is(err, textextract.ErrUnsupportedFormat):
		return "unsupported_format"
	case errors.Is(err, textextract.ErrTooLarge):
		return "too_large"
	case errors.Is(err, textextract.ErrEncrypted):
		return "encrypted"
	case errors.Is(err, textextract.ErrMalformed), errors.Is(err, textextract.ErrInvalidInput):
		return "malformed"
	default:
		return ""
	}
}
