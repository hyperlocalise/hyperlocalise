package main

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"log/slog"
	"math/rand/v2"
	"path/filepath"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/textract"
	textracttypes "github.com/aws/aws-sdk-go-v2/service/textract/types"
	"github.com/aws/smithy-go"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const (
	unreachableDatabaseURL = "postgres://hyperlocalise:hyperlocalise@127.0.0.1:1/hyperlocalise?connect_timeout=1"
	testProcessID          = "7a0b4c1e-2d3f-4a5b-8c6d-9e0f1a2b3c4d"
)

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

type fakeTextract struct {
	output *textract.DetectDocumentTextOutput
	err    error
	input  *textract.DetectDocumentTextInput
}

func (f *fakeTextract) DetectDocumentText(_ context.Context, input *textract.DetectDocumentTextInput, _ ...func(*textract.Options)) (*textract.DetectDocumentTextOutput, error) {
	f.input = input
	return f.output, f.err
}

type failingObjectStore struct {
	objectstore.Store
	body io.ReadCloser
	err  error
}

func (s failingObjectStore) Get(context.Context, string) (io.ReadCloser, objectstore.Info, error) {
	return s.body, objectstore.Info{}, s.err
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), unreachableDatabaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func validMatchBody() string {
	return `{"schemaVersion":1,"processId":"` + testProcessID + `"}`
}

func TestDecodeVisualContextMatchMessage(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{name: "valid", body: validMatchBody()},
		{name: "malformed", body: `{`, wantErr: "invalid visual context match message"},
		{name: "unknown version", body: `{"schemaVersion":2,"processId":"` + testProcessID + `"}`, wantErr: "unsupported visual context match message"},
		{name: "missing version", body: `{"processId":"` + testProcessID + `"}`, wantErr: "unsupported visual context match message"},
		{name: "missing process", body: `{"schemaVersion":1}`, wantErr: "invalid visual context match process id"},
		{name: "invalid process", body: `{"schemaVersion":1,"processId":"proc-1"}`, wantErr: "invalid visual context match process id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			message, err := decodeVisualContextMatchMessage(tt.body)
			if tt.wantErr != "" {
				require.EqualError(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, testProcessID, message.ProcessID)
		})
	}
}

func TestHandleIgnoresEmptyBatch(t *testing.T) {
	response, err := (&visualContextMatchHandler{logger: discardLogger()}).Handle(context.Background(), events.SQSEvent{})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
}

func TestHandleRequiresDatabase(t *testing.T) {
	_, err := (&visualContextMatchHandler{logger: discardLogger()}).Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "m1", Body: validMatchBody()}}})
	require.EqualError(t, err, "database connection is not configured")
}

func TestHandlePropagatesDatabaseConfigurationErrors(t *testing.T) {
	loadErr := errors.New("rotated secret missing")
	handler := &visualContextMatchHandler{logger: discardLogger(), database: &databaseConnection{provider: stubDatabaseURLProvider{err: loadErr}}}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "m1", Body: validMatchBody()}}})
	require.ErrorIs(t, err, loadErr)
	require.Empty(t, response.BatchItemFailures)
}

func TestHandleReportsRejectedAndRetryableRecords(t *testing.T) {
	handler := &visualContextMatchHandler{logger: discardLogger(), database: &databaseConnection{pool: unreachablePool(t)}}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "malformed", Body: `nope`},
		{MessageId: "version", Body: `{"schemaVersion":3,"processId":"` + testProcessID + `"}`},
		{MessageId: "retry", Body: validMatchBody()},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "malformed"}, {ItemIdentifier: "version"}, {ItemIdentifier: "retry"}}, response.BatchItemFailures)
}

func TestDatabaseConnectionCurrentPool(t *testing.T) {
	pool := unreachablePool(t)
	got, err := (&databaseConnection{pool: pool}).currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)

	got, err = (&databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}, pool: pool, url: unreachableDatabaseURL}).currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)

	_, err = (&databaseConnection{provider: stubDatabaseURLProvider{url: "not-a-postgres-url"}}).currentPool(context.Background())
	require.ErrorContains(t, err, "invalid database URL")

	database := &databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}}
	_, err = database.currentPool(context.Background())
	require.ErrorContains(t, err, "database connection failed")
	require.Nil(t, database.pool)
}

func TestNewRegistryFromEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(dir, "config"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(dir, "credentials"))
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("OBJECT_STORAGE_S3_FILES_REGION", "")
	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "")
	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "")

	t.Setenv("OBJECT_STORAGE_S3_FILES_BUCKET", "")
	_, err := newRegistry(context.Background())
	require.EqualError(t, err, "OBJECT_STORAGE_S3_FILES_BUCKET is required")

	t.Setenv("OBJECT_STORAGE_S3_FILES_BUCKET", "screenshots")
	registry, err := newRegistry(context.Background())
	require.NoError(t, err)
	require.Equal(t, "s3-files", registry.DefaultLocationID())

	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "visual-context")
	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "https://s3.example.com")
	registry, err = newRegistry(context.Background())
	require.NoError(t, err)
	require.Equal(t, "visual-context", registry.DefaultLocationID())

	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "ftp://s3.example.com")
	_, err = newRegistry(context.Background())
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
}

func TestTextractDetectorConvertsLineBlocks(t *testing.T) {
	client := &fakeTextract{output: &textract.DetectDocumentTextOutput{Blocks: []textracttypes.Block{
		{BlockType: textracttypes.BlockTypeLine, Text: aws.String("Checkout"), Confidence: aws.Float32(98.5), Geometry: &textracttypes.Geometry{BoundingBox: &textracttypes.BoundingBox{Left: 0.1, Top: 0.2, Width: 0.3, Height: 0.05}}},
		{BlockType: textracttypes.BlockTypeWord, Text: aws.String("Checkout"), Geometry: &textracttypes.Geometry{BoundingBox: &textracttypes.BoundingBox{}}},
		{BlockType: textracttypes.BlockTypeLine, Text: aws.String("No geometry")},
		{BlockType: textracttypes.BlockTypeLine, Text: aws.String("No box"), Geometry: &textracttypes.Geometry{}},
	}}}
	lines, err := textractDetector{client: client}.DetectLines(context.Background(), []byte("image"))
	require.NoError(t, err)
	require.Equal(t, []byte("image"), client.input.Document.Bytes)
	require.Len(t, lines, 1)
	require.Equal(t, "Checkout", lines[0].Text)
	require.InDelta(t, 98.5, lines[0].Confidence, 0.001)
	require.InDelta(t, 0.1, lines[0].Box.Left, 0.0001)
	require.InDelta(t, 0.2, lines[0].Box.Top, 0.0001)
	require.InDelta(t, 0.3, lines[0].Box.Width, 0.0001)
	require.InDelta(t, 0.05, lines[0].Box.Height, 0.0001)
}

func TestTextractDetectorClassifiesErrors(t *testing.T) {
	for _, code := range []string{"InvalidParameterException", "UnsupportedDocumentException", "BadDocumentException", "DocumentTooLargeException"} {
		t.Run(code, func(t *testing.T) {
			_, err := textractDetector{client: &fakeTextract{err: &smithy.GenericAPIError{Code: code}}}.DetectLines(context.Background(), nil)
			require.ErrorIs(t, err, errUnsupportedImage)
			require.ErrorContains(t, err, code)
		})
	}
	throttled := &smithy.GenericAPIError{Code: "ThrottlingException"}
	_, err := textractDetector{client: &fakeTextract{err: throttled}}.DetectLines(context.Background(), nil)
	require.ErrorIs(t, err, throttled)
	require.NotErrorIs(t, err, errUnsupportedImage)
	require.ErrorContains(t, err, "detect document text")
}

func readyProcess(location, key, contentType string) claimedProcess {
	return claimedProcess{ID: testProcessID, Attempts: 1, ScreenshotStatus: "ready", ObjectLocation: location, ObjectKey: key, ContentType: contentType}
}

func registryWith(t *testing.T, store objectstore.Store) *objectstore.Registry {
	t.Helper()
	registry, err := objectstore.NewRegistry("local", map[string]objectstore.Store{"local": store})
	require.NoError(t, err)
	return registry
}

func TestProcessReturnsRepositoryErrorsForRetry(t *testing.T) {
	repoErr := errors.New("database unavailable")
	candidates := []matchCandidate{{KeyID: "hello", SourceText: "Hello"}}

	repo := &fakeMatchRepo{claimErr: repoErr}
	require.ErrorIs(t, testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), testProcessID), repoErr)

	repo = &fakeMatchRepo{ok: true, process: readyProcess("local", "shot.png", "image/png"), loadErr: repoErr}
	require.ErrorIs(t, testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), testProcessID), repoErr)
	require.Zero(t, repo.failCalls)

	repo = &fakeMatchRepo{ok: true, process: readyProcess("local", "shot.png", "image/png"), completeErr: repoErr}
	require.ErrorIs(t, testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), testProcessID), repoErr)

	store := memory.New()
	png := mustTestPNG(t, 2, 2)
	_, err := store.Put(context.Background(), objectstore.PutInput{Key: "shot.png", Body: bytes.NewReader(png), Size: int64(len(png)), ContentType: "image/png"})
	require.NoError(t, err)
	repo = &fakeMatchRepo{ok: true, process: readyProcess("local", "shot.png", "image/png"), candidates: candidates, completeErr: repoErr}
	require.ErrorIs(t, testWorker(t, repo, &fakeDetector{lines: []ocrLine{confidentLine("Hello", 0.1, 0.1, 0.2, 0.05)}}, registryWith(t, store)).Process(context.Background(), testProcessID), repoErr)

	repo = &fakeMatchRepo{ok: true, process: claimedProcess{ID: testProcessID, Attempts: maxMatchAttempts + 1}, failErr: repoErr}
	require.ErrorIs(t, testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), testProcessID), repoErr)
}

func TestProcessDownloadFailures(t *testing.T) {
	candidates := []matchCandidate{{KeyID: "hello", SourceText: "Hello"}}
	tests := []struct {
		name        string
		location    string
		store       objectstore.Store
		wantCode    string
		wantErrText string
	}{
		{name: "unknown location", location: "retired", store: memory.New(), wantCode: errorCodeUnsupportedImage},
		{name: "transient get", location: "local", store: failingObjectStore{err: errors.New("503 slow down")}, wantErrText: "download screenshot"},
		{name: "transient read", location: "local", store: failingObjectStore{body: io.NopCloser(failingReader{})}, wantErrText: "read screenshot"},
		{name: "oversized", location: "local", store: failingObjectStore{body: io.NopCloser(bytes.NewReader(make([]byte, maxScreenshotBytes+1)))}, wantCode: errorCodeUnsupportedImage},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeMatchRepo{ok: true, process: readyProcess(tt.location, "shot.png", "image/png"), candidates: candidates}
			detector := &fakeDetector{}
			err := testWorker(t, repo, detector, registryWith(t, tt.store)).Process(context.Background(), testProcessID)
			if tt.wantCode != "" {
				require.NoError(t, err)
				require.Equal(t, tt.wantCode, repo.failCode)
			} else {
				require.ErrorContains(t, err, tt.wantErrText)
				require.Zero(t, repo.failCalls)
			}
			require.Zero(t, detector.calls)
		})
	}
}

func TestProcessFailsPermanentlyForUnsupportedDetectorInput(t *testing.T) {
	store := memory.New()
	png := mustTestPNG(t, 2, 2)
	_, err := store.Put(context.Background(), objectstore.PutInput{Key: "shot.png", Body: bytes.NewReader(png), Size: int64(len(png)), ContentType: "image/png"})
	require.NoError(t, err)
	repo := &fakeMatchRepo{ok: true, process: readyProcess("local", "shot.png", "image/png"), candidates: []matchCandidate{{KeyID: "hello", SourceText: "Hello"}}}
	detector := textractDetector{client: &fakeTextract{err: &smithy.GenericAPIError{Code: "BadDocumentException"}}}

	require.NoError(t, testWorker(t, repo, detector, registryWith(t, store)).Process(context.Background(), testProcessID))
	require.Equal(t, errorCodeUnsupportedImage, repo.failCode)
	require.Zero(t, repo.completeCalls)
}

func TestPermanentErrorMessageIncludesCode(t *testing.T) {
	err := permanentError{code: errorCodeTooManyStrings, err: errors.New("too many")}
	require.Equal(t, "too_many_strings: too many", err.Error())
	require.Equal(t, err, asUnsupportedImage(err))
}

func TestEncodeForTextractFallsBackToJPEG(t *testing.T) {
	const side = 1900
	img := image.NewRGBA(image.Rect(0, 0, side, side))
	random := rand.New(rand.NewPCG(1, 2))
	for i := range img.Pix {
		img.Pix[i] = byte(random.UintN(256))
	}
	encoded, err := encodeForTextract(img)
	require.NoError(t, err)
	require.LessOrEqual(t, len(encoded), textractMaxBytes)
	_, err = jpeg.DecodeConfig(bytes.NewReader(encoded))
	require.NoError(t, err)
}

func TestPrepareTextractImageRejectsUnknownContentType(t *testing.T) {
	_, err := prepareTextractImage(mustTestPNG(t, 1, 1), "image/gif")
	require.ErrorIs(t, err, errUnsupportedImage)
	require.ErrorIs(t, rejectImageDimensions(0, 10), errUnsupportedImage)
}
