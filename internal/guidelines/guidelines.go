// Package guidelines separates canonical instructions from a rebuildable search index.
package guidelines

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// ErrInvalidInput identifies invalid or inconsistent guideline identities.
var ErrInvalidInput = errors.New("invalid guideline input")

// Scope must be authorized by the application before invoking this package.
// An empty ProjectID means organization-wide guidance only.
type Scope struct {
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId,omitempty"`
	Locale         string `json:"locale,omitempty"`
}

// Document is a canonical revision. Versions increase monotonically per ID.
// Mandatory instructions are included independently of search ranking.
type Document struct {
	ID         string `json:"id"`
	RevisionID string `json:"revisionId"`
	Version    int64  `json:"version"`
	Scope      Scope  `json:"scope"`
	Content    string `json:"content"`
	Mandatory  bool   `json:"mandatory"`
}

// Source loads current authorized documents from the primary database.
type Source interface {
	Current(context.Context, Scope) ([]Document, error)
}

// Chunk is a deterministic passage from one immutable revision.
type Chunk struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	RevisionID string `json:"revisionId"`
	Text       string `json:"text"`
}

// Query explicitly identifies the current documents the index may search.
type Query struct {
	Scope     Scope
	Text      string
	Documents []Document
	Limit     int
}

// Index owns only derived data. DeleteThrough removes a tombstoned version and
// older versions; a delayed deletion must preserve newer indexed revisions.
type Index interface {
	Upsert(context.Context, Document) error
	DeleteThrough(context.Context, Scope, string, int64) error
	Search(context.Context, Query) ([]Chunk, error)
}

// Result contains canonical text only, even when the index returns stale data.
type Result struct {
	Mandatory       []Document `json:"mandatory"`
	Passages        []Chunk    `json:"passages"`
	SearchAvailable bool       `json:"searchAvailable"`
}

// Service combines a canonical source with an optional search index.
type Service struct {
	source Source
	index  Index
}

// NewService wires dependencies without creating a new process or database.
func NewService(source Source, index Index) *Service { return &Service{source: source, index: index} }

// ValidateDocument enforces the same limits as canonical guideline content.
func ValidateDocument(doc Document) error {
	if strings.TrimSpace(doc.ID) == "" || doc.RevisionID == "" || doc.Version < 1 || strings.TrimSpace(doc.Scope.OrganizationID) == "" || !utf8.ValidString(doc.Content) || utf8.RuneCountInString(doc.Content) > 50000 {
		return ErrInvalidInput
	}
	return nil
}

// Chunks splits at paragraph boundaries, then bounds long passages by rune count.
// Hashes include revision identity so delayed writes cannot replace newer chunks.
func Chunks(doc Document) []Chunk {
	const maxChunkRunes = 1200
	chunks := make([]Chunk, 0)
	for _, paragraph := range strings.Split(strings.ReplaceAll(doc.Content, "\r\n", "\n"), "\n\n") {
		remaining := []rune(strings.TrimSpace(paragraph))
		for len(remaining) > 0 {
			count := min(len(remaining), maxChunkRunes)
			text := string(remaining[:count])
			sum := sha256.Sum256(fmt.Appendf(nil, "%s\x00%s\x00%d\x00%s", doc.ID, doc.RevisionID, len(chunks), text))
			chunks = append(chunks, Chunk{ID: hex.EncodeToString(sum[:]), DocumentID: doc.ID, RevisionID: doc.RevisionID, Text: text})
			remaining = remaining[count:]
		}
	}
	return chunks
}

func inScope(doc Document, scope Scope) bool {
	return doc.Scope.OrganizationID == scope.OrganizationID && (doc.Scope.ProjectID == "" || doc.Scope.ProjectID == scope.ProjectID) && (doc.Scope.Locale == "" || doc.Scope.Locale == scope.Locale)
}

func (s *Service) current(ctx context.Context, scope Scope) ([]Document, error) {
	if strings.TrimSpace(scope.OrganizationID) == "" {
		return nil, ErrInvalidInput
	}
	docs, err := s.source.Current(ctx, scope)
	if err != nil {
		return nil, fmt.Errorf("load guidelines: %w", err)
	}
	for _, doc := range docs {
		if err := ValidateDocument(doc); err != nil {
			return nil, err
		}
		if !inScope(doc, scope) {
			return nil, ErrInvalidInput
		}
	}
	return docs, nil
}

// Sync indexes current canonical revisions. A worker may safely retry this call.
func (s *Service) Sync(ctx context.Context, scope Scope) error {
	if s.index == nil {
		return errors.New("guideline index not configured")
	}
	docs, err := s.current(ctx, scope)
	if err != nil {
		return err
	}
	for _, doc := range docs {
		if err := s.index.Upsert(ctx, doc); err != nil {
			return fmt.Errorf("index guideline: %w", err)
		}
	}
	return nil
}

// Retrieve rechecks revision/scope after search and returns canonical passages.
// An index outage preserves mandatory instructions and marks search unavailable.
func (s *Service) Retrieve(ctx context.Context, scope Scope, text string, limit int) (Result, error) {
	result := Result{Mandatory: []Document{}, Passages: []Chunk{}}
	if limit < 1 || limit > 32 || len(text) > 16000 {
		return result, ErrInvalidInput
	}
	docs, err := s.current(ctx, scope)
	if err != nil {
		return result, err
	}
	var hits []Chunk
	if s.index != nil && strings.TrimSpace(text) != "" && len(docs) > 0 {
		hits, err = s.index.Search(ctx, Query{Scope: scope, Text: text, Documents: docs, Limit: limit})
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		result.SearchAvailable = err == nil
		// Re-read after remote I/O so an edit/revocation during search cannot
		// cause the old indexed revision to be included.
		docs, err = s.current(ctx, scope)
		if err != nil {
			return result, err
		}
	}
	canonical := make(map[string]Chunk)
	for _, doc := range docs {
		if doc.Mandatory {
			result.Mandatory = append(result.Mandatory, doc)
		}
		for _, chunk := range Chunks(doc) {
			canonical[chunk.ID] = chunk
		}
	}
	if !result.SearchAvailable {
		return result, nil
	}
	for _, hit := range hits {
		chunk, ok := canonical[hit.ID]
		if !ok || hit.DocumentID != chunk.DocumentID || hit.RevisionID != chunk.RevisionID {
			continue
		}
		result.Passages = append(result.Passages, chunk)
		delete(canonical, hit.ID)
		if len(result.Passages) == limit {
			break
		}
	}
	return result, nil
}
