// Package s3compat implements object storage with AWS S3 and Cloudflare R2.
package s3compat

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

// Config identifies a single bucket. Leave credentials empty to use AWS's chain.
// Endpoint is optional for S3 and required for R2 (including jurisdiction endpoints).
type Config struct {
	Provider        string `json:"provider"`
	Bucket          string `json:"bucket"`
	Region          string `json:"region"`
	Endpoint        string `json:"endpoint,omitempty"`
	AccessKeyID     string `json:"accessKeyId,omitempty"`
	SecretAccessKey string `json:"secretAccessKey,omitempty"`
	SessionToken    string `json:"sessionToken,omitempty"`
	UsePathStyle    bool   `json:"usePathStyle,omitempty"`
}

// Store keeps SDK-specific behavior inside the object-store boundary.
type Store struct {
	client *s3.Client
	signer *s3.PresignClient
	bucket string
}

var (
	_ objectstore.Store     = (*Store)(nil)
	_ objectstore.Presigner = (*Store)(nil)
)

// New creates a configured driver. It does not probe or create the bucket.
func New(ctx context.Context, cfg Config) (*Store, error) {
	if cfg.Bucket == "" || (cfg.Provider != "s3" && cfg.Provider != "r2") {
		return nil, objectstore.ErrInvalidInput
	}
	if (cfg.AccessKeyID == "") != (cfg.SecretAccessKey == "") {
		return nil, objectstore.ErrInvalidInput
	}
	if cfg.Endpoint != "" {
		endpoint, err := url.Parse(cfg.Endpoint)
		if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
			return nil, objectstore.ErrInvalidInput
		}
	}
	if cfg.Provider == "r2" {
		if cfg.Endpoint == "" || cfg.AccessKeyID == "" {
			return nil, objectstore.ErrInvalidInput
		}
		cfg.Region = "auto"
	}
	opts := []func(*config.LoadOptions) error{config.WithRetryMaxAttempts(3)}
	if cfg.Region != "" {
		opts = append(opts, config.WithRegion(cfg.Region))
	}
	if cfg.AccessKeyID != "" {
		opts = append(opts, config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, cfg.SessionToken)))
	}
	sdkConfig, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("configure object store: %w", err)
	}
	if sdkConfig.Region == "" {
		return nil, objectstore.ErrInvalidInput
	}
	client := s3.NewFromConfig(sdkConfig, func(o *s3.Options) {
		o.UsePathStyle = cfg.UsePathStyle
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
		// R2 does not implement every optional AWS checksum feature.
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return &Store{client: client, signer: s3.NewPresignClient(client), bucket: cfg.Bucket}, nil
}

// Put streams input to S3. Non-seekable streams cannot be transparently retried.
func (s *Store) Put(ctx context.Context, input objectstore.PutInput) (objectstore.Info, error) {
	if err := objectstore.ValidatePut(input); err != nil {
		return objectstore.Info{}, err
	}
	req := &s3.PutObjectInput{Bucket: &s.bucket, Key: &input.Key, Body: input.Body, ContentLength: &input.Size, ContentType: &input.ContentType, Metadata: input.Metadata}
	if input.CacheControl != "" {
		req.CacheControl = &input.CacheControl
	}
	if input.IfAbsent {
		req.IfNoneMatch = aws.String("*")
	}
	out, err := s.client.PutObject(ctx, req, s3.WithAPIOptions(v4.SwapComputePayloadSHA256ForUnsignedPayloadMiddleware))
	if err != nil {
		return objectstore.Info{}, translateError(err)
	}
	return objectstore.Info{Size: input.Size, ContentType: input.ContentType, ETag: aws.ToString(out.ETag), CacheControl: input.CacheControl, Metadata: input.Metadata}, nil
}

// Get returns a stream owned by the caller.
func (s *Store) Get(ctx context.Context, key string) (io.ReadCloser, objectstore.Info, error) {
	if err := objectstore.ValidateKey(key); err != nil {
		return nil, objectstore.Info{}, err
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: &s.bucket, Key: &key})
	if err != nil {
		return nil, objectstore.Info{}, translateError(err)
	}
	return out.Body, objectstore.Info{Size: aws.ToInt64(out.ContentLength), ContentType: aws.ToString(out.ContentType), ETag: aws.ToString(out.ETag), CacheControl: aws.ToString(out.CacheControl), Metadata: out.Metadata}, nil
}

// Stat reads metadata without downloading bytes.
func (s *Store) Stat(ctx context.Context, key string) (objectstore.Info, error) {
	if err := objectstore.ValidateKey(key); err != nil {
		return objectstore.Info{}, err
	}
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &s.bucket, Key: &key})
	if err != nil {
		return objectstore.Info{}, translateError(err)
	}
	return objectstore.Info{Size: aws.ToInt64(out.ContentLength), ContentType: aws.ToString(out.ContentType), ETag: aws.ToString(out.ETag), CacheControl: aws.ToString(out.CacheControl), Metadata: out.Metadata}, nil
}

// Delete succeeds when the object is already absent.
func (s *Store) Delete(ctx context.Context, key string) error {
	if err := objectstore.ValidateKey(key); err != nil {
		return err
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &s.bucket, Key: &key})
	err = translateError(err)
	if errors.Is(err, objectstore.ErrNotFound) {
		return nil
	}
	return err
}

func validateTTL(ttl time.Duration) error {
	if ttl < time.Second || ttl > time.Hour {
		return objectstore.ErrInvalidInput
	}
	return nil
}

// PresignUpload signs content type and conditional creation, when requested.
// Callers must verify the uploaded object's size before finalizing a file record.
func (s *Store) PresignUpload(ctx context.Context, input objectstore.Upload, ttl time.Duration) (objectstore.SignedRequest, error) {
	if err := objectstore.ValidateKey(input.Key); err != nil {
		return objectstore.SignedRequest{}, err
	}
	if err := validateTTL(ttl); err != nil {
		return objectstore.SignedRequest{}, err
	}
	if strings.TrimSpace(input.ContentType) == "" {
		return objectstore.SignedRequest{}, objectstore.ErrInvalidInput
	}
	req := &s3.PutObjectInput{Bucket: &s.bucket, Key: &input.Key, ContentType: &input.ContentType}
	if input.IfAbsent {
		req.IfNoneMatch = aws.String("*")
	}
	expiresAt := time.Now().UTC().Add(ttl)
	out, err := s.signer.PresignPutObject(ctx, req, s3.WithPresignExpires(ttl))
	if err != nil {
		return objectstore.SignedRequest{}, translateError(err)
	}
	return objectstore.SignedRequest{URL: out.URL, Method: http.MethodPut, Headers: out.SignedHeader, ExpiresAt: expiresAt}, nil
}

// PresignDownload creates short-lived read access.
func (s *Store) PresignDownload(ctx context.Context, key string, ttl time.Duration) (objectstore.SignedRequest, error) {
	if err := objectstore.ValidateKey(key); err != nil {
		return objectstore.SignedRequest{}, err
	}
	if err := validateTTL(ttl); err != nil {
		return objectstore.SignedRequest{}, err
	}
	expiresAt := time.Now().UTC().Add(ttl)
	out, err := s.signer.PresignGetObject(ctx, &s3.GetObjectInput{Bucket: &s.bucket, Key: &key}, s3.WithPresignExpires(ttl))
	if err != nil {
		return objectstore.SignedRequest{}, translateError(err)
	}
	return objectstore.SignedRequest{URL: out.URL, Method: http.MethodGet, Headers: out.SignedHeader, ExpiresAt: expiresAt}, nil
}

func translateError(err error) error {
	if err == nil {
		return nil
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NoSuchKey", "NotFound":
			return fmt.Errorf("%w: %w", objectstore.ErrNotFound, err)
		case "PreconditionFailed", "ConditionalRequestConflict":
			return fmt.Errorf("%w: %w", objectstore.ErrAlreadyExists, err)
		}
	}
	return fmt.Errorf("object storage operation: %w", err)
}
