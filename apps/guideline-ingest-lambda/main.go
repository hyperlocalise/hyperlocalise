package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	guidelineindex "github.com/hyperlocalise/hyperlocalise/internal/guidelines/turbopuffer"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/s3compat"
	secretstore "github.com/hyperlocalise/hyperlocalise/internal/secretsmanager"
	"github.com/hyperlocalise/hyperlocalise/internal/textextract"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	databaseConnectionTimeout     = 5 * time.Second
	databaseInitializationTimeout = 10 * time.Second
	// Leaves headroom under the five-minute Lambda timeout.
	recordTimeout = 4 * time.Minute
	// Matches the go-svc upload limit.
	maxGuidelineUploadBytes = 25 << 20
	defaultAIGatewayBaseURL = "https://ai-gateway.vercel.sh/v1"
	turbopufferSecretName   = "TURBOPUFFER"
	aiGatewaySecretName     = "AI_GATEWAY"
)

type batchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

type batchResponse struct {
	BatchItemFailures []batchItemFailure `json:"batchItemFailures"`
}

type guidelineIngestHandler struct {
	logger       *slog.Logger
	newProcessor func(context.Context) (*processor, error)
}

func (h *guidelineIngestHandler) Handle(ctx context.Context, event events.SQSEvent) (batchResponse, error) {
	if len(event.Records) == 0 {
		return batchResponse{}, nil
	}
	p, err := h.newProcessor(ctx)
	if err != nil {
		return batchResponse{}, err
	}
	failed := make([]batchItemFailure, 0)
	for _, record := range event.Records {
		message, err := ingest.Decode(record.Body)
		if err != nil {
			h.logger.ErrorContext(ctx, "guideline_ingest_message_rejected", "message_id", record.MessageId)
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}
		started := time.Now()
		recordCtx, cancel := context.WithTimeout(ctx, recordTimeout)
		result, err := p.process(recordCtx, message)
		cancel()
		attrs := []any{
			"message_id", record.MessageId,
			"operation", string(message.Operation),
			"organization_id", message.OrganizationID,
			"document_id", message.DocumentID,
			"duration_ms", time.Since(started).Milliseconds(),
		}
		if err != nil {
			h.logger.ErrorContext(ctx, "guideline_ingest_failed", append(attrs, "error", err)...)
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}
		h.logger.InfoContext(ctx, "guideline_ingest_processed", append(attrs, "outcome", string(result))...)
	}
	return batchResponse{BatchItemFailures: failed}, nil
}

type databaseConnection struct {
	mu       sync.Mutex
	provider interface {
		Load(context.Context) (string, error)
	}
	pool *pgxpool.Pool
	url  string
}

func (d *databaseConnection) currentPool(ctx context.Context) (*pgxpool.Pool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	databaseURL, err := d.provider.Load(ctx)
	if err != nil {
		return nil, fmt.Errorf("load database URL: %w", err)
	}
	if d.pool != nil && databaseURL == d.url {
		return d.pool, nil
	}
	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("invalid database URL")
	}
	poolConfig.MaxConns = 2
	poolConfig.ConnConfig.ConnectTimeout = databaseConnectionTimeout
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create database connection pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, databaseConnectionTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database connection failed: %w", err)
	}
	if d.pool != nil {
		d.pool.Close()
	}
	d.pool, d.url = pool, databaseURL
	return pool, nil
}

func newRegistry(ctx context.Context) (*objectstore.Registry, error) {
	bucket := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_S3_FILES_BUCKET"))
	if bucket == "" {
		return nil, errors.New("OBJECT_STORAGE_S3_FILES_BUCKET is required")
	}
	region := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_S3_FILES_REGION"))
	if region == "" {
		region = "us-east-1"
	}
	store, err := s3compat.New(ctx, s3compat.Config{Provider: "s3", Bucket: bucket, Region: region, Endpoint: os.Getenv("OBJECT_STORAGE_S3_FILES_ENDPOINT")})
	if err != nil {
		return nil, err
	}
	location := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_DEFAULT_LOCATION"))
	if location == "" {
		location = "s3-files"
	}
	return objectstore.NewRegistry(location, map[string]objectstore.Store{location: store})
}

// newVision returns nil when OCR is not configured; scanned PDFs then keep their
// native text layer and images fail with no_text.
func newVision(ctx context.Context, secrets secretstore.API) (textextract.Recognizer, error) {
	model := strings.TrimSpace(os.Getenv("GUIDELINE_OCR_MODEL"))
	if model == "" || strings.TrimSpace(os.Getenv(aiGatewaySecretName+"_ARN")) == "" {
		return nil, nil
	}
	configs, err := secretstore.ConfigsFromEnv(aiGatewaySecretName)
	if err != nil {
		return nil, err
	}
	collection, err := secretstore.NewCollection(secrets, configs)
	if err != nil {
		return nil, err
	}
	apiKey, err := collection.Load(ctx, aiGatewaySecretName)
	if err != nil {
		return nil, errors.New("load AI Gateway secret")
	}
	baseURL := strings.TrimSpace(os.Getenv("AI_GATEWAY_BASE_URL"))
	if baseURL == "" {
		baseURL = defaultAIGatewayBaseURL
	}
	return textextract.NewOpenAIRecognizer(textextract.OpenAIRecognizerConfig{BaseURL: baseURL, APIKey: apiKey, Model: model})
}

func newIndex(ctx context.Context, secrets secretstore.API) (*guidelineindex.Index, error) {
	configs, err := secretstore.ConfigsFromEnv(turbopufferSecretName)
	if err != nil {
		return nil, err
	}
	collection, err := secretstore.NewCollection(secrets, configs)
	if err != nil {
		return nil, err
	}
	apiKey, err := collection.Load(ctx, turbopufferSecretName)
	if err != nil {
		return nil, errors.New("load turbopuffer secret")
	}
	index, err := guidelineindex.New(apiKey, os.Getenv("TURBOPUFFER_REGION"), os.Getenv("TURBOPUFFER_GUIDELINES_PREFIX"))
	if err != nil {
		return nil, errors.New("invalid turbopuffer configuration")
	}
	return index, nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, cancel := context.WithTimeout(context.Background(), databaseInitializationTimeout)
	defer cancel()
	secretConfig, err := secretstore.ConfigFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	awsConfig, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatal(err)
	}
	secrets := awssecretsmanager.NewFromConfig(awsConfig)
	loader, err := secretstore.NewLoader(secrets, secretConfig)
	if err != nil {
		log.Fatal(err)
	}
	database := &databaseConnection{provider: loader}
	if _, err := database.currentPool(ctx); err != nil {
		log.Fatalf("configure guideline ingest database: %v", err)
	}
	defer database.pool.Close()
	objects, err := newRegistry(ctx)
	if err != nil {
		log.Fatalf("configure guideline ingest object storage: %v", err)
	}
	index, err := newIndex(ctx, secrets)
	if err != nil {
		log.Fatalf("configure guideline index: %v", err)
	}
	vision, err := newVision(ctx, secrets)
	if err != nil {
		log.Fatalf("configure guideline OCR: %v", err)
	}
	extractor := textextract.New(textextract.Options{MaxBytes: maxGuidelineUploadBytes, MaxRunes: textextract.DefaultMaxRunes, PDFWorkers: 1, Vision: vision})
	defer func() { _ = extractor.Close() }()

	handler := &guidelineIngestHandler{
		logger: logger,
		newProcessor: func(ctx context.Context) (*processor, error) {
			pool, err := database.currentPool(ctx)
			if err != nil {
				return nil, err
			}
			return &processor{
				store:     postgresDocumentStore{pool: pool},
				indexer:   guidelines.NewService(guidelinepg.NewWithPool(pool), index),
				extractor: extractor,
				objects:   registryObjectReader{registry: objects},
			}, nil
		},
	}
	lambda.Start(handler.Handle)
}
