package guidelines

import (
	"context"
	"errors"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/require"
)

type fakeSource struct {
	docs []Document
	err  error
}

func (s *fakeSource) Current(context.Context, Scope) ([]Document, error) { return s.docs, s.err }

type fakeIndex struct {
	hits     []Chunk
	err      error
	onSearch func()
	writes   []Document
	deletes  []string
	limit    int
}

func (s *fakeIndex) Upsert(_ context.Context, doc Document) error {
	s.writes = append(s.writes, doc)
	return s.err
}

func (s *fakeIndex) DeleteThrough(_ context.Context, _ Scope, id string, _ int64) error {
	s.deletes = append(s.deletes, id)
	return s.err
}

func (s *fakeIndex) Search(_ context.Context, query Query) ([]Chunk, error) {
	s.limit = query.Limit
	if s.onSearch != nil {
		s.onSearch()
	}
	return s.hits, s.err
}

func fixtureDocument() Document {
	return Document{ID: "guideline", RevisionID: "rev1", Version: 1, Scope: Scope{OrganizationID: "org", ProjectID: "proj"}, Content: "Always preserve placeholders.\n\nUse a friendly voice.", Mandatory: true}
}

func TestRetrieveValidatesCanonicalHits(t *testing.T) {
	doc := fixtureDocument()
	chunks := Chunks(doc)
	tampered := chunks[0]
	tampered.Text = "untrusted content"
	other := chunks[1]
	other.RevisionID = "stale"
	index := &fakeIndex{hits: []Chunk{tampered, tampered, other, {ID: "foreign", DocumentID: "foreign", RevisionID: "rev1"}}}
	service := NewService(&fakeSource{docs: []Document{doc}}, index)
	result, err := service.Retrieve(t.Context(), doc.Scope, "voice", 5)
	require.NoError(t, err)
	require.True(t, result.SearchAvailable)
	require.Equal(t, []Document{doc}, result.Mandatory)
	require.Equal(t, []Chunk{chunks[0]}, result.Passages)
}

func TestRetrievalFailureAndRevisionChange(t *testing.T) {
	for _, mode := range []string{"outage", "edit", "delete", "foreign scope", "canonical outage"} {
		t.Run(mode, func(t *testing.T) {
			doc := fixtureDocument()
			source := &fakeSource{docs: []Document{doc}}
			index := &fakeIndex{hits: Chunks(doc)}
			switch mode {
			case "outage":
				index.err = errors.New("unavailable")
			case "edit":
				index.onSearch = func() {
					source.docs[0].RevisionID = "rev2"
					source.docs[0].Version = 2
					source.docs[0].Content = "new rules"
				}
			case "delete":
				index.onSearch = func() { source.docs = nil }
			case "foreign scope":
				source.docs[0].Scope.OrganizationID = "foreign"
			case "canonical outage":
				index.onSearch = func() { source.err = errors.New("database unavailable") }
			}
			result, err := NewService(source, index).Retrieve(t.Context(), doc.Scope, "voice", 4)
			if mode == "foreign scope" || mode == "canonical outage" {
				require.Error(t, err)
				require.Empty(t, result.Passages)
				return
			}
			require.NoError(t, err)
			require.Empty(t, result.Passages)
			if mode == "outage" {
				require.False(t, result.SearchAvailable)
				require.Equal(t, []Document{doc}, result.Mandatory)
			}
			if mode == "edit" {
				require.Equal(t, "new rules", result.Mandatory[0].Content)
			}
			if mode == "delete" {
				require.Empty(t, result.Mandatory)
			}
		})
	}
}

type fakeReranker struct {
	order    []int
	err      error
	passages []string
	topN     int
}

func (r *fakeReranker) Rerank(_ context.Context, _ string, passages []string, topN int) ([]int, error) {
	r.passages, r.topN = passages, topN
	return r.order, r.err
}

func rerankFixture() (Document, []Chunk) {
	doc := fixtureDocument()
	doc.Content = "First rule.\n\nSecond rule.\n\nThird rule."
	return doc, Chunks(doc)
}

func TestRetrieveReranksCandidates(t *testing.T) {
	doc, chunks := rerankFixture()
	index := &fakeIndex{hits: chunks}
	reranker := &fakeReranker{order: []int{2, 0}}
	result, err := NewService(&fakeSource{docs: []Document{doc}}, index, WithReranker(reranker)).Retrieve(t.Context(), doc.Scope, "rules", 2)
	require.NoError(t, err)
	require.Equal(t, rerankCandidates, index.limit)
	require.Equal(t, []string{"First rule.", "Second rule.", "Third rule."}, reranker.passages)
	require.Equal(t, 2, reranker.topN)
	require.Equal(t, []Chunk{chunks[2], chunks[0]}, result.Passages)
}

func TestRetrieveKeepsIndexOrderWhenRerankFails(t *testing.T) {
	for name, reranker := range map[string]*fakeReranker{
		"error":           {err: errors.New("unavailable")},
		"empty":           {},
		"out of range":    {order: []int{5}},
		"duplicate index": {order: []int{1, 1}},
	} {
		t.Run(name, func(t *testing.T) {
			doc, chunks := rerankFixture()
			result, err := NewService(&fakeSource{docs: []Document{doc}}, &fakeIndex{hits: chunks}, WithReranker(reranker)).Retrieve(t.Context(), doc.Scope, "rules", 2)
			require.NoError(t, err)
			require.Equal(t, chunks[:2], result.Passages)
		})
	}
}

func TestRetrieveWithoutRerankerUsesCallerLimit(t *testing.T) {
	doc, chunks := rerankFixture()
	index := &fakeIndex{hits: chunks}
	result, err := NewService(&fakeSource{docs: []Document{doc}}, index).Retrieve(t.Context(), doc.Scope, "rules", 2)
	require.NoError(t, err)
	require.Equal(t, 2, index.limit)
	require.Equal(t, chunks[:2], result.Passages)
}

func TestChunksAndSync(t *testing.T) {
	doc := fixtureDocument()
	doc.Content = strings.Repeat("日本語", 1000) + "\n\nFinal rule."
	chunks := Chunks(doc)
	require.Equal(t, chunks, Chunks(doc))
	require.Len(t, chunks, 4)
	for _, chunk := range chunks {
		require.True(t, utf8.ValidString(chunk.Text))
		require.LessOrEqual(t, utf8.RuneCountInString(chunk.Text), 1200)
	}
	source := &fakeSource{docs: []Document{doc}}
	index := &fakeIndex{}
	service := NewService(source, index)
	require.NoError(t, service.Sync(t.Context(), doc.Scope))
	require.Equal(t, []Document{doc}, index.writes)
	index.err = errors.New("unavailable")
	require.Error(t, service.Sync(t.Context(), doc.Scope))
	result, err := NewService(source, nil).Retrieve(t.Context(), doc.Scope, "anything", 4)
	require.NoError(t, err)
	require.Equal(t, []Document{doc}, result.Mandatory)
	require.False(t, result.SearchAvailable)
}

func TestIndexDocumentAndDelete(t *testing.T) {
	doc := fixtureDocument()
	doc.Scope.Locale = "fr-FR"
	index := &fakeIndex{}
	service := NewService(&fakeSource{}, index)
	require.NoError(t, service.IndexDocument(t.Context(), doc))
	require.Equal(t, []Document{doc}, index.writes)

	invalid := doc
	invalid.Version = 0
	require.ErrorIs(t, service.IndexDocument(t.Context(), invalid), ErrInvalidInput)

	require.NoError(t, service.Delete(t.Context(), doc.Scope, doc.ID, 3))
	require.Equal(t, []string{doc.ID}, index.deletes)
	require.ErrorIs(t, service.Delete(t.Context(), doc.Scope, "", 3), ErrInvalidInput)
	require.ErrorIs(t, service.Delete(t.Context(), Scope{}, doc.ID, 3), ErrInvalidInput)

	index.err = errors.New("unavailable")
	require.Error(t, service.IndexDocument(t.Context(), doc))
	require.Error(t, service.Delete(t.Context(), doc.Scope, doc.ID, 3))

	unconfigured := NewService(&fakeSource{}, nil)
	require.Error(t, unconfigured.IndexDocument(t.Context(), doc))
	require.Error(t, unconfigured.Delete(t.Context(), doc.Scope, doc.ID, 3))
}

func TestNormalizeLocale(t *testing.T) {
	for input, want := range map[string]string{"": "", "  ": "", "fr_fr": "fr-FR", "EN-us": "en-US", "zh-hans-cn": "zh-Hans-CN"} {
		got, err := NormalizeLocale(input)
		require.NoError(t, err, input)
		require.Equal(t, want, got, input)
	}
	_, err := NormalizeLocale("not a locale!")
	require.ErrorIs(t, err, ErrInvalidInput)
}
