package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/hyperlocalise/hyperlocalise/internal/textextract"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const unreachableDatabaseURL = "postgres://hyperlocalise:hyperlocalise@127.0.0.1:1/hyperlocalise?connect_timeout=1"

type stubDatabaseURLProvider struct {
	url string
	err error
}

func (s stubDatabaseURLProvider) Load(context.Context) (string, error) {
	if s.err != nil {
		return "", s.err
	}
	return s.url, nil
}

type fakeSecrets struct {
	values map[string]string
	err    error
}

func (f fakeSecrets) GetSecretValue(_ context.Context, input *awssecretsmanager.GetSecretValueInput, _ ...func(*awssecretsmanager.Options)) (*awssecretsmanager.GetSecretValueOutput, error) {
	if f.err != nil {
		return nil, f.err
	}
	value, ok := f.values[aws.ToString(input.SecretId)]
	if !ok {
		return nil, errors.New("secret not found")
	}
	return &awssecretsmanager.GetSecretValueOutput{SecretString: aws.String(value)}, nil
}

type failingStore struct {
	*fakeStore
	readyErr   error
	failedErr  error
	indexedErr error
}

func (s failingStore) MarkReady(ctx context.Context, documentID, revisionID, content string, truncated bool) (bool, error) {
	if s.readyErr != nil {
		return false, s.readyErr
	}
	return s.fakeStore.MarkReady(ctx, documentID, revisionID, content, truncated)
}

func (s failingStore) MarkFailed(ctx context.Context, documentID, revisionID, errorCode string) error {
	if s.failedErr != nil {
		return s.failedErr
	}
	return s.fakeStore.MarkFailed(ctx, documentID, revisionID, errorCode)
}

func (s failingStore) MarkIndexed(ctx context.Context, documentID, revisionID string) error {
	if s.indexedErr != nil {
		return s.indexedErr
	}
	return s.fakeStore.MarkIndexed(ctx, documentID, revisionID)
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestHandleSkipsEmptyBatchWithoutProcessor(t *testing.T) {
	handler := &guidelineIngestHandler{
		logger: discardLogger(),
		newProcessor: func(context.Context) (*processor, error) {
			t.Fatal("processor must not be created for an empty batch")
			return nil, nil
		},
	}
	response, err := handler.Handle(context.Background(), events.SQSEvent{})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
}

func TestHandlePropagatesProcessorConfigurationErrors(t *testing.T) {
	configErr := errors.New("database unavailable")
	handler := &guidelineIngestHandler{
		logger:       discardLogger(),
		newProcessor: func(context.Context) (*processor, error) { return nil, configErr },
	}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "m1", Body: `{}`}}})
	require.ErrorIs(t, err, configErr)
	require.Empty(t, response.BatchItemFailures)
}

func TestHandleRejectsMalformedAndUnknownVersionMessages(t *testing.T) {
	indexer := &fakeIndexer{}
	handler := &guidelineIngestHandler{
		logger: discardLogger(),
		newProcessor: func(context.Context) (*processor, error) {
			return &processor{store: &fakeStore{}, indexer: indexer}, nil
		},
	}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "malformed", Body: `{`},
		{MessageId: "version", Body: `{"schemaVersion":99,"operation":"sync","organizationId":"` + testOrgID + `"}`},
		{MessageId: "empty", Body: ``},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "malformed"}, {ItemIdentifier: "version"}, {ItemIdentifier: "empty"}}, response.BatchItemFailures)
	require.Empty(t, indexer.syncs)
}

func TestHandleRetriesDuplicateMessagesIndependently(t *testing.T) {
	store := &fakeStore{doc: processingDoc(), readyHit: true}
	indexer := &fakeIndexer{}
	handler := &guidelineIngestHandler{
		logger: discardLogger(),
		newProcessor: func(context.Context) (*processor, error) {
			return &processor{store: store, indexer: indexer, extractor: fakeExtractor{text: "Tone"}, objects: fakeObjects{}}, nil
		},
	}
	body, err := ingest.Encode(extractMessage())
	require.NoError(t, err)
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "first", Body: string(body)},
		{MessageId: "duplicate", Body: string(body)},
	}})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
	require.Len(t, store.ready, 2)
	require.Len(t, indexer.docs, 2)
}

func TestProcessRejectsUnknownOperation(t *testing.T) {
	p := &processor{store: &fakeStore{}, indexer: &fakeIndexer{}}
	_, err := p.process(context.Background(), ingest.Message{Operation: "rebuild"})
	require.ErrorIs(t, err, ingest.ErrInvalidMessage)
}

func TestProcessReturnsIndexerErrorsForRetry(t *testing.T) {
	indexErr := errors.New("turbopuffer unavailable")
	p := &processor{store: &fakeStore{}, indexer: &fakeIndexer{err: indexErr}}

	_, err := p.process(context.Background(), ingest.Message{SchemaVersion: 1, Operation: ingest.OperationSync, OrganizationID: testOrgID})
	require.ErrorIs(t, err, indexErr)

	_, err = p.process(context.Background(), ingest.Message{SchemaVersion: 1, Operation: ingest.OperationDelete, OrganizationID: testOrgID, DocumentID: testDocID})
	require.ErrorIs(t, err, indexErr)

	doc := processingDoc()
	doc.Status = statusReady
	p.store = &fakeStore{doc: doc}
	_, err = p.process(context.Background(), extractMessage())
	require.ErrorIs(t, err, indexErr)
}

func TestExtractIndexReturnsStoreErrorsForRetry(t *testing.T) {
	storeErr := errors.New("database write failed")
	tests := []struct {
		name      string
		store     func() documentStore
		extractor fakeExtractor
	}{
		{name: "load", store: func() documentStore { return &fakeStore{loadErr: storeErr} }},
		{name: "mark ready", store: func() documentStore {
			return failingStore{fakeStore: &fakeStore{doc: processingDoc()}, readyErr: storeErr}
		}, extractor: fakeExtractor{text: "text"}},
		{name: "mark failed", store: func() documentStore {
			return failingStore{fakeStore: &fakeStore{doc: processingDoc()}, failedErr: storeErr}
		}, extractor: fakeExtractor{err: textextract.ErrNoText}},
		{name: "mark indexed", store: func() documentStore {
			return failingStore{fakeStore: &fakeStore{doc: processingDoc(), readyHit: true}, indexedErr: storeErr}
		}, extractor: fakeExtractor{text: "text"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &processor{store: tt.store(), indexer: &fakeIndexer{}, extractor: tt.extractor, objects: fakeObjects{}}
			_, err := p.process(context.Background(), extractMessage())
			require.ErrorIs(t, err, storeErr)
		})
	}
}

func TestPermanentExtractionCodeTreatsInvalidInputAsMalformed(t *testing.T) {
	require.Equal(t, "malformed", permanentExtractionCode(textextract.ErrInvalidInput))
	require.Empty(t, permanentExtractionCode(nil))
	require.Empty(t, permanentExtractionCode(errors.New("timeout")))
}

func TestDatabaseConnectionErrors(t *testing.T) {
	loadErr := errors.New("secret unavailable")
	_, err := (&databaseConnection{provider: stubDatabaseURLProvider{err: loadErr}}).currentPool(context.Background())
	require.ErrorIs(t, err, loadErr)
	require.ErrorContains(t, err, "load database URL")

	_, err = (&databaseConnection{provider: stubDatabaseURLProvider{url: "postgres://user:secret@%zz"}}).currentPool(context.Background())
	require.EqualError(t, err, "invalid database URL")

	database := &databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}}
	_, err = database.currentPool(context.Background())
	require.ErrorContains(t, err, "database connection failed")
	require.Nil(t, database.pool)
}

func TestDatabaseConnectionReusesPoolForUnchangedURL(t *testing.T) {
	pool, err := pgxpool.New(t.Context(), unreachableDatabaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	database := &databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}, pool: pool, url: unreachableDatabaseURL}
	got, err := database.currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)
}

func isolateAWSConfig(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(dir, "config"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(dir, "credentials"))
	t.Setenv("AWS_PROFILE", "")
}

func TestNewRegistryFromEnv(t *testing.T) {
	isolateAWSConfig(t)
	t.Setenv("OBJECT_STORAGE_S3_FILES_BUCKET", "")
	_, err := newRegistry(context.Background())
	require.ErrorContains(t, err, "OBJECT_STORAGE_S3_FILES_BUCKET is required")

	t.Setenv("OBJECT_STORAGE_S3_FILES_BUCKET", "files")
	t.Setenv("OBJECT_STORAGE_S3_FILES_REGION", "")
	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "")
	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "")
	registry, err := newRegistry(context.Background())
	require.NoError(t, err)
	require.Equal(t, "s3-files", registry.DefaultLocationID())

	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "guidelines")
	registry, err = newRegistry(context.Background())
	require.NoError(t, err)
	require.Equal(t, "guidelines", registry.DefaultLocationID())

	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "http://insecure.example")
	_, err = newRegistry(context.Background())
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
}

func setSecretEnv(t *testing.T, name, arn, key string) {
	t.Helper()
	t.Setenv(name+"_ARN", arn)
	t.Setenv(name+"_KEY", key)
	t.Setenv(name+"_CACHE_TTL_SECONDS", "")
}

func TestNewVisionIsOptional(t *testing.T) {
	t.Setenv("GUIDELINE_OCR_MODEL", "")
	setSecretEnv(t, aiGatewaySecretName, "arn:ai", "apiKey")
	vision, err := newVision(context.Background(), fakeSecrets{})
	require.NoError(t, err)
	require.Nil(t, vision)

	t.Setenv("GUIDELINE_OCR_MODEL", "openai/gpt-5")
	t.Setenv(aiGatewaySecretName+"_ARN", " ")
	vision, err = newVision(context.Background(), fakeSecrets{})
	require.NoError(t, err)
	require.Nil(t, vision)
}

func TestNewVisionFromSecrets(t *testing.T) {
	t.Setenv("GUIDELINE_OCR_MODEL", "openai/gpt-5")
	t.Setenv("AI_GATEWAY_BASE_URL", "")
	setSecretEnv(t, aiGatewaySecretName, "arn:ai", "apiKey")

	vision, err := newVision(context.Background(), fakeSecrets{values: map[string]string{"arn:ai": `{"apiKey":"gateway-key"}`}})
	require.NoError(t, err)
	require.NotNil(t, vision)

	t.Setenv("AI_GATEWAY_BASE_URL", "https://gateway.example/v1")
	vision, err = newVision(context.Background(), fakeSecrets{values: map[string]string{"arn:ai": `{"apiKey":"gateway-key"}`}})
	require.NoError(t, err)
	require.NotNil(t, vision)

	_, err = newVision(context.Background(), fakeSecrets{err: errors.New("access denied")})
	require.EqualError(t, err, "load AI Gateway secret")

	_, err = newVision(context.Background(), nil)
	require.ErrorContains(t, err, "secrets manager client is required")

	t.Setenv(aiGatewaySecretName+"_KEY", "")
	_, err = newVision(context.Background(), fakeSecrets{})
	require.ErrorContains(t, err, aiGatewaySecretName+"_KEY is required")
}

func TestNewIndexFromSecrets(t *testing.T) {
	secrets := fakeSecrets{values: map[string]string{"arn:tp": `{"apiKey":"tp-key"}`}}
	setSecretEnv(t, turbopufferSecretName, "arn:tp", "apiKey")
	t.Setenv("TURBOPUFFER_REGION", "gcp-us-central1")
	t.Setenv("TURBOPUFFER_GUIDELINES_PREFIX", "guidelines")

	index, err := newIndex(context.Background(), secrets)
	require.NoError(t, err)
	require.NotNil(t, index)

	t.Setenv("TURBOPUFFER_REGION", "")
	_, err = newIndex(context.Background(), secrets)
	require.EqualError(t, err, "invalid turbopuffer configuration")

	_, err = newIndex(context.Background(), fakeSecrets{err: errors.New("throttled")})
	require.EqualError(t, err, "load turbopuffer secret")

	_, err = newIndex(context.Background(), nil)
	require.ErrorContains(t, err, "secrets manager client is required")

	t.Setenv(turbopufferSecretName+"_ARN", "")
	_, err = newIndex(context.Background(), secrets)
	require.ErrorContains(t, err, turbopufferSecretName+"_ARN is required")
}

func TestRegistryObjectReader(t *testing.T) {
	store := memory.New()
	_, err := store.Put(t.Context(), objectstore.PutInput{Key: "guidelines/doc.txt", Body: strings.NewReader("formal"), Size: 6, ContentType: "text/plain"})
	require.NoError(t, err)
	registry, err := objectstore.NewRegistry("local", map[string]objectstore.Store{"local": store})
	require.NoError(t, err)
	reader := registryObjectReader{registry: registry}

	body, err := reader.Open(t.Context(), "local", "guidelines/doc.txt")
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, err)
	require.NoError(t, body.Close())
	require.Equal(t, "formal", string(content))

	_, err = reader.Open(t.Context(), "retired", "guidelines/doc.txt")
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)

	_, err = reader.Open(t.Context(), "local", "guidelines/missing.txt")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
}

func TestExtractWrapsObjectErrors(t *testing.T) {
	p := &processor{store: &fakeStore{doc: processingDoc()}, indexer: &fakeIndexer{}, extractor: fakeExtractor{}, objects: fakeObjects{err: objectstore.ErrNotFound}}
	_, err := p.process(context.Background(), extractMessage())
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	require.ErrorContains(t, err, "open guideline object")
}

func TestDeleteUsesUploadedDocumentScope(t *testing.T) {
	indexer := &fakeIndexer{}
	p := &processor{store: &fakeStore{}, indexer: indexer}
	_, err := p.process(context.Background(), ingest.Message{SchemaVersion: 1, Operation: ingest.OperationDelete, OrganizationID: testOrgID, ProjectID: "project_1", DocumentID: testDocID})
	require.NoError(t, err)
	require.Equal(t, []string{testOrgID + "/doc:" + testDocID}, indexer.deletes)
	require.Empty(t, indexer.syncs)
	require.Empty(t, indexer.docs)
}
