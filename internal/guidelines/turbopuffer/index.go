// Package turbopuffer implements guideline indexing using turbopuffer's Go SDK.
package turbopuffer

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/embedding"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	tp "github.com/turbopuffer/turbopuffer-go"
	"github.com/turbopuffer/turbopuffer-go/option"
	"golang.org/x/sync/errgroup"
)

const (
	vectorAttribute  = "vector"
	textAttribute    = "text"
	rrfK             = 60
	embedConcurrency = 8
)

var vectorSchemaType = fmt.Sprintf("[%d]f32", embedding.Dimensions)

// Embedder produces Gemini Embedding 2 vectors for hybrid retrieval.
type Embedder interface {
	EmbedQuery(context.Context, string) ([]float32, error)
	EmbedDocument(context.Context, string) ([]float32, error)
}

// ClientEmbedder adapts an AI Gateway embedding client.
type ClientEmbedder struct {
	Client *embedding.Client
}

// EmbedQuery embeds a retrieval query.
func (e ClientEmbedder) EmbedQuery(ctx context.Context, text string) ([]float32, error) {
	if e.Client == nil {
		return nil, guidelines.ErrInvalidInput
	}
	result, err := e.Client.EmbedQuery(ctx, text)
	if err != nil {
		return nil, err
	}
	return result.Vector, nil
}

// EmbedDocument embeds one guideline passage.
func (e ClientEmbedder) EmbedDocument(ctx context.Context, text string) ([]float32, error) {
	if e.Client == nil {
		return nil, guidelines.ErrInvalidInput
	}
	result, err := e.Client.EmbedDocument(ctx, embedding.Document{Text: text})
	if err != nil {
		return nil, err
	}
	return result.Vector, nil
}

// Index stores guideline passages in an organization-isolated namespace.
type Index struct {
	client   tp.Client
	embedder Embedder
	prefix   string
}

var _ guidelines.Index = (*Index)(nil)

// New creates an index using an explicit API key, region, deployment prefix,
// and embedding client. Changing the embedding model or dimensions requires a
// new prefix.
func New(apiKey, region, prefix string, embedder Embedder) (*Index, error) {
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(region) == "" || strings.TrimSpace(prefix) == "" || len(prefix) > 40 || embedder == nil {
		return nil, guidelines.ErrInvalidInput
	}
	return &Index{client: tp.NewClient(option.WithAPIKey(apiKey), option.WithRegion(region), option.WithMaxRetries(2)), embedder: embedder, prefix: prefix}, nil
}

func (i *Index) namespace(organizationID string) tp.Namespace {
	sum := sha256.Sum256([]byte(organizationID))
	return i.client.Namespace(i.prefix + "-" + hex.EncodeToString(sum[:]))
}

func documentFilter(id string, version int64) tp.Filter {
	return tp.NewFilterAnd([]tp.Filter{tp.NewFilterEq("document_id", id), tp.NewFilterLte("version", version)})
}

func guidelineSchema() map[string]tp.AttributeSchemaConfigParam {
	return map[string]tp.AttributeSchemaConfigParam{
		"document_id":   {Type: "string"},
		"revision_id":   {Type: "string"},
		"version":       {Type: "int"},
		"project_id":    {Type: "string"},
		"locale":        {Type: "string"},
		textAttribute:   {Type: "string", FullTextSearch: &tp.FullTextSearchConfigParam{Stemming: tp.Bool(false), RemoveStopwords: tp.Bool(false)}},
		vectorAttribute: {Type: vectorSchemaType, Ann: tp.AttributeSchemaConfigAnnParam{DistanceMetric: tp.DistanceMetricCosineDistance}},
	}
}

func copyVector(vector []float32) ([]float32, error) {
	if len(vector) != embedding.Dimensions {
		return nil, embedding.ErrInvalidResponse
	}
	return append([]float32(nil), vector...), nil
}

func (i *Index) embedChunks(ctx context.Context, chunks []guidelines.Chunk) ([][]float32, error) {
	if i.embedder == nil {
		return nil, guidelines.ErrInvalidInput
	}
	vectors := make([][]float32, len(chunks))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(embedConcurrency)
	for idx, chunk := range chunks {
		idx, chunk := idx, chunk
		group.Go(func() error {
			vector, err := i.embedder.EmbedDocument(groupCtx, chunk.Text)
			if err != nil {
				return err
			}
			copied, err := copyVector(vector)
			if err != nil {
				return err
			}
			vectors[idx] = copied
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, fmt.Errorf("embed guideline chunk: %w", err)
	}
	return vectors, nil
}

// Upsert atomically replaces this revision and removes older chunks. Revision-
// specific IDs prevent a delayed old write from overwriting newer text.
func (i *Index) Upsert(ctx context.Context, doc guidelines.Document) error {
	if err := guidelines.ValidateDocument(doc); err != nil {
		return err
	}
	chunks := guidelines.Chunks(doc)
	rows := make([]tp.RowParam, 0, len(chunks))
	if len(chunks) > 0 {
		vectors, err := i.embedChunks(ctx, chunks)
		if err != nil {
			return err
		}
		for idx, chunk := range chunks {
			rows = append(rows, tp.RowParam{"id": chunk.ID, "document_id": doc.ID, "revision_id": doc.RevisionID, "version": doc.Version, "project_id": doc.Scope.ProjectID, "locale": doc.Scope.Locale, textAttribute: chunk.Text, vectorAttribute: vectors[idx]})
		}
	}
	ns := i.namespace(doc.Scope.OrganizationID)
	_, err := ns.Write(ctx, tp.NamespaceWriteParams{
		DeleteByFilter: documentFilter(doc.ID, doc.Version),
		UpsertRows:     rows,
		Schema:         guidelineSchema(),
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

func chunksFromRows(rows []tp.Row) []guidelines.Chunk {
	chunks := make([]guidelines.Chunk, 0, len(rows))
	for _, row := range rows {
		id, idOK := row["id"].(string)
		docID, docOK := row["document_id"].(string)
		revID, revOK := row["revision_id"].(string)
		if !idOK || !docOK || !revOK {
			continue
		}
		chunks = append(chunks, guidelines.Chunk{ID: id, DocumentID: docID, RevisionID: revID})
	}
	return chunks
}

func fuseRanks(lists [][]guidelines.Chunk, limit int) []guidelines.Chunk {
	scores := make(map[string]float64)
	byID := make(map[string]guidelines.Chunk)
	for _, list := range lists {
		for rank, chunk := range list {
			scores[chunk.ID] += 1 / float64(rrfK+rank+1)
			if _, ok := byID[chunk.ID]; !ok {
				byID[chunk.ID] = chunk
			}
		}
	}
	ids := make([]string, 0, len(scores))
	for id := range scores {
		ids = append(ids, id)
	}
	slices.SortFunc(ids, func(left, right string) int {
		if scores[left] != scores[right] {
			return cmp.Compare(scores[right], scores[left])
		}
		return strings.Compare(left, right)
	})
	if len(ids) > limit {
		ids = ids[:limit]
	}
	chunks := make([]guidelines.Chunk, 0, len(ids))
	for _, id := range ids {
		chunks = append(chunks, byID[id])
	}
	return chunks
}

// Search ranks current revisions with BM25 and cosine ANN, then fuses the lists.
func (i *Index) Search(ctx context.Context, query guidelines.Query) ([]guidelines.Chunk, error) {
	if i.embedder == nil || query.Scope.OrganizationID == "" || query.Limit < 1 || query.Limit > 32 || len(query.Text) > 16000 {
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
	vector, err := i.embedder.EmbedQuery(ctx, query.Text)
	if err != nil {
		return nil, fmt.Errorf("embed guideline query: %w", err)
	}
	copied, err := copyVector(vector)
	if err != nil {
		return nil, fmt.Errorf("embed guideline query: %w", err)
	}
	filters := tp.NewFilterOr(revisions)
	include := tp.IncludeAttributesParam{StringArray: []string{"document_id", "revision_id"}}
	topK := tp.Int(int64(query.Limit))
	ns := i.namespace(query.Scope.OrganizationID)
	out, err := ns.MultiQuery(ctx, tp.NamespaceMultiQueryParams{
		Queries: []tp.QueryParam{
			{TopK: topK, RankBy: tp.NewRankByTextBM25(textAttribute, query.Text), Filters: filters, IncludeAttributes: include},
			{TopK: topK, RankBy: tp.NewRankByVector(vectorAttribute, copied), DistanceMetric: tp.DistanceMetricCosineDistance, Filters: filters, IncludeAttributes: include},
		},
	})
	if isNotFound(err) {
		return []guidelines.Chunk{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("search guideline index: %w", err)
	}
	lists := make([][]guidelines.Chunk, 0, len(out.Results))
	for _, result := range out.Results {
		lists = append(lists, chunksFromRows(result.Rows))
	}
	return fuseRanks(lists, query.Limit), nil
}

func isNotFound(err error) bool {
	var apiErr *tp.Error
	return errors.As(err, &apiErr) && apiErr.StatusCode == 404
}
