package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	"github.com/hyperlocalise/hyperlocalise/internal/textextract"
	"github.com/stretchr/testify/require"
)

const (
	testOrgID = "6f1d3a52-6c1b-4f53-9a4c-1b6f2b0f6a11"
	testDocID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9"
	testRevID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
	otherRev  = "9f8e7d6c-5b4a-4392-8180-7f6e5d4c3b2a"
)

type fakeStore struct {
	doc      *storedDocument
	loadErr  error
	ready    []string
	failed   []string
	indexed  []string
	readyHit bool
}

func (s *fakeStore) Load(_ context.Context, organizationID, documentID string) (storedDocument, bool, error) {
	if s.loadErr != nil {
		return storedDocument{}, false, s.loadErr
	}
	if s.doc == nil || s.doc.OrganizationID != organizationID || s.doc.ID != documentID {
		return storedDocument{}, false, nil
	}
	return *s.doc, true, nil
}

func (s *fakeStore) MarkReady(_ context.Context, _, revisionID, content string, _ bool) (bool, error) {
	s.ready = append(s.ready, revisionID+":"+content)
	return s.readyHit, nil
}

func (s *fakeStore) MarkFailed(_ context.Context, _, _, errorCode string) error {
	s.failed = append(s.failed, errorCode)
	return nil
}

func (s *fakeStore) MarkIndexed(_ context.Context, _, revisionID string) error {
	s.indexed = append(s.indexed, revisionID)
	return nil
}

type fakeIndexer struct {
	docs    []guidelines.Document
	syncs   []guidelines.Scope
	deletes []string
	err     error
}

func (f *fakeIndexer) IndexDocument(_ context.Context, doc guidelines.Document) error {
	f.docs = append(f.docs, doc)
	return f.err
}

func (f *fakeIndexer) Sync(_ context.Context, scope guidelines.Scope) error {
	f.syncs = append(f.syncs, scope)
	return f.err
}

func (f *fakeIndexer) Delete(_ context.Context, scope guidelines.Scope, id string, _ int64) error {
	f.deletes = append(f.deletes, scope.OrganizationID+"/"+id)
	return f.err
}

type fakeExtractor struct {
	text string
	err  error
}

func (f fakeExtractor) Extract(context.Context, textextract.Input) (textextract.Result, error) {
	return textextract.Result{Text: f.text}, f.err
}

type fakeObjects struct{ err error }

func (f fakeObjects) Open(context.Context, string, string) (io.ReadCloser, error) {
	if f.err != nil {
		return nil, f.err
	}
	return io.NopCloser(strings.NewReader("body")), nil
}

func processingDoc() *storedDocument {
	return &storedDocument{
		ID: testDocID, OrganizationID: testOrgID, ProjectID: "project_1", Locale: "fr-FR",
		RevisionID: testRevID, Version: 3, Status: statusProcessing,
	}
}

func extractMessage() ingest.Message {
	return ingest.Message{SchemaVersion: 1, Operation: ingest.OperationExtractIndex, OrganizationID: testOrgID, DocumentID: testDocID, RevisionID: testRevID}
}

func TestExtractIndexProcessingDocument(t *testing.T) {
	store := &fakeStore{doc: processingDoc(), readyHit: true}
	indexer := &fakeIndexer{}
	p := &processor{store: store, indexer: indexer, extractor: fakeExtractor{text: "Use formal tone."}, objects: fakeObjects{}}

	result, err := p.process(context.Background(), extractMessage())
	require.NoError(t, err)
	require.Equal(t, outcomeIndexed, result)
	require.Equal(t, []string{testRevID + ":Use formal tone."}, store.ready)
	require.Equal(t, []string{testRevID}, store.indexed)
	require.Len(t, indexer.docs, 1)
	require.Equal(t, "doc:"+testDocID, indexer.docs[0].ID)
	require.Equal(t, guidelines.Scope{OrganizationID: testOrgID, ProjectID: "project_1", Locale: "fr-FR"}, indexer.docs[0].Scope)
	require.Equal(t, "Use formal tone.", indexer.docs[0].Content)
	require.EqualValues(t, 3, indexer.docs[0].Version)
}

func TestExtractIndexReadyDocumentOnlyReindexes(t *testing.T) {
	doc := processingDoc()
	doc.Status, doc.Content, doc.Mandatory = statusReady, "Existing text", true
	store := &fakeStore{doc: doc}
	indexer := &fakeIndexer{}
	p := &processor{store: store, indexer: indexer, extractor: fakeExtractor{err: errors.New("must not extract")}, objects: fakeObjects{}}

	result, err := p.process(context.Background(), extractMessage())
	require.NoError(t, err)
	require.Equal(t, outcomeIndexed, result)
	require.Empty(t, store.ready)
	require.True(t, indexer.docs[0].Mandatory)
	require.Equal(t, "Existing text", indexer.docs[0].Content)
}

func TestExtractIndexSkipsStaleAndMissing(t *testing.T) {
	doc := processingDoc()
	doc.RevisionID = otherRev
	indexer := &fakeIndexer{}
	p := &processor{store: &fakeStore{doc: doc}, indexer: indexer, extractor: fakeExtractor{}, objects: fakeObjects{}}
	result, err := p.process(context.Background(), extractMessage())
	require.NoError(t, err)
	require.Equal(t, outcomeStale, result)

	p.store = &fakeStore{}
	result, err = p.process(context.Background(), extractMessage())
	require.NoError(t, err)
	require.Equal(t, outcomeMissing, result)

	failedDoc := processingDoc()
	failedDoc.Status = "failed"
	p.store = &fakeStore{doc: failedDoc}
	result, err = p.process(context.Background(), extractMessage())
	require.NoError(t, err)
	require.Equal(t, outcomeStale, result)

	p.store = &fakeStore{doc: processingDoc(), readyHit: false}
	p.extractor = fakeExtractor{text: "text"}
	result, err = p.process(context.Background(), extractMessage())
	require.NoError(t, err)
	require.Equal(t, outcomeStale, result)
	require.Empty(t, indexer.docs)
}

func TestExtractIndexPermanentAndTransientFailures(t *testing.T) {
	cases := map[error]string{
		textextract.ErrNoText:            "no_text",
		textextract.ErrUnsupportedFormat: "unsupported_format",
		textextract.ErrTooLarge:          "too_large",
		textextract.ErrEncrypted:         "encrypted",
		textextract.ErrMalformed:         "malformed",
	}
	for extractErr, code := range cases {
		store := &fakeStore{doc: processingDoc()}
		p := &processor{store: store, indexer: &fakeIndexer{}, extractor: fakeExtractor{err: extractErr}, objects: fakeObjects{}}
		result, err := p.process(context.Background(), extractMessage())
		require.NoError(t, err)
		require.Equal(t, outcomeFailed, result)
		require.Equal(t, []string{code}, store.failed)
	}

	store := &fakeStore{doc: processingDoc()}
	p := &processor{store: store, indexer: &fakeIndexer{}, extractor: fakeExtractor{err: errors.New("vision timeout")}, objects: fakeObjects{}}
	_, err := p.process(context.Background(), extractMessage())
	require.Error(t, err)
	require.Empty(t, store.failed)

	p.objects = fakeObjects{err: errors.New("s3 unavailable")}
	_, err = p.process(context.Background(), extractMessage())
	require.Error(t, err)
}

func TestSyncAndDelete(t *testing.T) {
	indexer := &fakeIndexer{}
	p := &processor{store: &fakeStore{}, indexer: indexer}
	result, err := p.process(context.Background(), ingest.Message{SchemaVersion: 1, Operation: ingest.OperationSync, OrganizationID: testOrgID, ProjectID: "project_1"})
	require.NoError(t, err)
	require.Equal(t, outcomeSynced, result)
	require.Equal(t, []guidelines.Scope{{OrganizationID: testOrgID, ProjectID: "project_1"}}, indexer.syncs)

	result, err = p.process(context.Background(), ingest.Message{SchemaVersion: 1, Operation: ingest.OperationDelete, OrganizationID: testOrgID, DocumentID: testDocID, Version: 4})
	require.NoError(t, err)
	require.Equal(t, outcomeDeleted, result)
	require.Equal(t, []string{testOrgID + "/doc:" + testDocID}, indexer.deletes)
}

func TestHandleReportsOnlyFailedRecords(t *testing.T) {
	indexer := &fakeIndexer{}
	store := &fakeStore{loadErr: errors.New("database unavailable")}
	handler := &guidelineIngestHandler{
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		newProcessor: func(context.Context) (*processor, error) {
			return &processor{store: store, indexer: indexer}, nil
		},
	}
	syncBody, err := ingest.Encode(ingest.Message{SchemaVersion: 1, Operation: ingest.OperationSync, OrganizationID: testOrgID})
	require.NoError(t, err)
	extractBody, err := ingest.Encode(extractMessage())
	require.NoError(t, err)

	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "ok", Body: string(syncBody)},
		{MessageId: "invalid", Body: `{"schemaVersion":1}`},
		{MessageId: "retry", Body: string(extractBody)},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "invalid"}, {ItemIdentifier: "retry"}}, response.BatchItemFailures)
	require.Len(t, indexer.syncs, 1)
}
