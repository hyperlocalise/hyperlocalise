// Package turbopuffer implements guideline indexing using turbopuffer's Go SDK.
package turbopuffer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	tp "github.com/turbopuffer/turbopuffer-go"
	"github.com/turbopuffer/turbopuffer-go/option"
)

// Index stores guideline passages in an organization-isolated namespace.
type Index struct {
	client tp.Client
	prefix string
}

var _ guidelines.Index = (*Index)(nil)

// New creates an index using an explicit API key, region, and deployment prefix.
func New(apiKey, region, prefix string) (*Index, error) {
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(region) == "" || strings.TrimSpace(prefix) == "" || len(prefix) > 40 {
		return nil, guidelines.ErrInvalidInput
	}
	return &Index{client: tp.NewClient(option.WithAPIKey(apiKey), option.WithRegion(region), option.WithMaxRetries(2)), prefix: prefix}, nil
}

func (i *Index) namespace(organizationID string) tp.Namespace {
	sum := sha256.Sum256([]byte(organizationID))
	return i.client.Namespace(i.prefix + "-" + hex.EncodeToString(sum[:]))
}

func documentFilter(id string, version int64) tp.Filter {
	return tp.NewFilterAnd([]tp.Filter{tp.NewFilterEq("document_id", id), tp.NewFilterLte("version", version)})
}

// Upsert atomically replaces this revision and removes older chunks. Revision-
// specific IDs prevent a delayed old write from overwriting newer text.
func (i *Index) Upsert(ctx context.Context, doc guidelines.Document) error {
	if err := guidelines.ValidateDocument(doc); err != nil {
		return err
	}
	chunks := guidelines.Chunks(doc)
	rows := make([]tp.RowParam, 0, len(chunks))
	for _, chunk := range chunks {
		rows = append(rows, tp.RowParam{"id": chunk.ID, "document_id": doc.ID, "revision_id": doc.RevisionID, "version": doc.Version, "project_id": doc.Scope.ProjectID, "locale": doc.Scope.Locale, "text": chunk.Text})
	}
	ns := i.namespace(doc.Scope.OrganizationID)
	_, err := ns.Write(ctx, tp.NamespaceWriteParams{
		DeleteByFilter: documentFilter(doc.ID, doc.Version),
		UpsertRows:     rows,
		Schema: map[string]tp.AttributeSchemaConfigParam{
			"document_id": {Type: "string"},
			"revision_id": {Type: "string"},
			"version":     {Type: "int"},
			"project_id":  {Type: "string"},
			"locale":      {Type: "string"},
			"text":        {Type: "string", FullTextSearch: &tp.FullTextSearchConfigParam{Stemming: tp.Bool(false), RemoveStopwords: tp.Bool(false)}},
		},
	})
	if err != nil {
		return fmt.Errorf("write guideline index: %w", err)
	}
	return nil
}

// DeleteThrough handles versioned tombstones without deleting newer revisions.
func (i *Index) DeleteThrough(ctx context.Context, scope guidelines.Scope, documentID string, version int64) error {
	if scope.OrganizationID == "" || documentID == "" || version < 1 {
		return guidelines.ErrInvalidInput
	}
	ns := i.namespace(scope.OrganizationID)
	_, err := ns.Write(ctx, tp.NamespaceWriteParams{DeleteByFilter: documentFilter(documentID, version)})
	if isNotFound(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete guideline index: %w", err)
	}
	return nil
}

// Search uses BM25 over exact current revisions. The interface leaves room for
// semantic/hybrid ranking without choosing an embedding model for the product.
func (i *Index) Search(ctx context.Context, query guidelines.Query) ([]guidelines.Chunk, error) {
	if query.Scope.OrganizationID == "" || query.Limit < 1 || query.Limit > 32 || len(query.Text) > 16000 {
		return nil, guidelines.ErrInvalidInput
	}
	if len(query.Documents) == 0 || strings.TrimSpace(query.Text) == "" {
		return []guidelines.Chunk{}, nil
	}
	revisions := make([]tp.Filter, 0, len(query.Documents))
	for _, doc := range query.Documents {
		if err := guidelines.ValidateDocument(doc); err != nil {
			return nil, err
		}
		if doc.Scope.OrganizationID != query.Scope.OrganizationID || (doc.Scope.ProjectID != "" && doc.Scope.ProjectID != query.Scope.ProjectID) || (doc.Scope.Locale != "" && doc.Scope.Locale != query.Scope.Locale) {
			return nil, guidelines.ErrInvalidInput
		}
		revisions = append(revisions, tp.NewFilterAnd([]tp.Filter{tp.NewFilterEq("document_id", doc.ID), tp.NewFilterEq("revision_id", doc.RevisionID)}))
	}
	ns := i.namespace(query.Scope.OrganizationID)
	out, err := ns.Query(ctx, tp.NamespaceQueryParams{TopK: tp.Int(int64(query.Limit)), RankBy: tp.NewRankByTextBM25("text", query.Text), Filters: tp.NewFilterOr(revisions), IncludeAttributes: tp.IncludeAttributesParam{StringArray: []string{"document_id", "revision_id"}}})
	if isNotFound(err) {
		return []guidelines.Chunk{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("search guideline index: %w", err)
	}
	chunks := make([]guidelines.Chunk, 0, len(out.Rows))
	for _, row := range out.Rows {
		id, idOK := row["id"].(string)
		docID, docOK := row["document_id"].(string)
		revID, revOK := row["revision_id"].(string)
		if !idOK || !docOK || !revOK {
			continue
		}
		chunks = append(chunks, guidelines.Chunk{ID: id, DocumentID: docID, RevisionID: revID})
	}
	return chunks, nil
}

func isNotFound(err error) bool {
	var apiErr *tp.Error
	return errors.As(err, &apiErr) && apiErr.StatusCode == 404
}
