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
}

func (s *fakeIndex) Upsert(_ context.Context, doc Document) error {
	s.writes = append(s.writes, doc)
	return s.err
}
func (s *fakeIndex) DeleteThrough(context.Context, Scope, string, int64) error { return s.err }
func (s *fakeIndex) Search(context.Context, Query) ([]Chunk, error) {
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
