package objectstore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

type s3Store struct {
	client  *s3.Client
	presign *s3.PresignClient
	bucket  string
}

func newS3Store(ctx context.Context, cfg Config) (Store, error) {
	if cfg.AWSBucket == "" {
		return nil, fmt.Errorf("translation object store: AWS bucket is required")
	}
	if cfg.AWSRegion == "" {
		return nil, fmt.Errorf("translation object store: AWS region is required")
	}

	loadOptions := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(cfg.AWSRegion),
	}
	if cfg.AWSAccessKeyID != "" && cfg.AWSSecretAccessKey != "" {
		loadOptions = append(loadOptions, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AWSAccessKeyID, cfg.AWSSecretAccessKey, cfg.AWSSessionToken),
		))
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return nil, fmt.Errorf("translation object store: load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		if cfg.AWSEndpoint != "" {
			options.BaseEndpoint = aws.String(cfg.AWSEndpoint)
			options.UsePathStyle = true
		}
	})

	return &s3Store{
		client:  client,
		presign: s3.NewPresignClient(client),
		bucket:  cfg.AWSBucket,
	}, nil
}

func (s *s3Store) CreateUploadURL(ctx context.Context, req UploadRequest) (string, error) {
	presigned, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(req.Object.Bucket),
		Key:         aws.String(req.Object.Key),
		ContentType: aws.String(req.ContentType),
	}, func(options *s3.PresignOptions) {
		options.Expires = req.ExpiresAt.Sub(nowUTC())
	})
	if err != nil {
		return "", fmt.Errorf("translation object store: presign S3 upload: %w", err)
	}
	return presigned.URL, nil
}

func (s *s3Store) CreateDownloadURL(ctx context.Context, req DownloadRequest) (string, error) {
	presigned, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(req.Object.Bucket),
		Key:    aws.String(req.Object.Key),
	}, func(options *s3.PresignOptions) {
		options.Expires = req.ExpiresAt.Sub(nowUTC())
	})
	if err != nil {
		return "", fmt.Errorf("translation object store: presign S3 download: %w", err)
	}
	return presigned.URL, nil
}

func (s *s3Store) PutObject(ctx context.Context, req PutRequest) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(req.Object.Bucket),
		Key:         aws.String(req.Object.Key),
		ContentType: aws.String(req.ContentType),
		Body:        bytes.NewReader(req.Body),
	})
	if err != nil {
		return fmt.Errorf("translation object store: put S3 object: %w", err)
	}
	return nil
}

func (s *s3Store) GetObject(ctx context.Context, req GetRequest) ([]byte, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(req.Object.Bucket),
		Key:    aws.String(req.Object.Key),
	})
	if err != nil {
		if isS3NotFound(err) {
			return nil, fmt.Errorf("%w: get S3 object: %v", ErrObjectNotFound, err)
		}
		return nil, fmt.Errorf("translation object store: get S3 object: %w", err)
	}
	defer func() {
		_ = output.Body.Close()
	}()
	body, err := io.ReadAll(output.Body)
	if err != nil {
		return nil, fmt.Errorf("translation object store: read S3 object: %w", err)
	}
	return body, nil
}

func (s *s3Store) StatObject(ctx context.Context, req StatRequest) (ObjectInfo, error) {
	output, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(req.Object.Bucket),
		Key:    aws.String(req.Object.Key),
	})
	if err != nil {
		if isS3NotFound(err) {
			return ObjectInfo{}, fmt.Errorf("%w: stat S3 object: %v", ErrObjectNotFound, err)
		}
		return ObjectInfo{}, fmt.Errorf("translation object store: stat S3 object: %w", err)
	}
	return ObjectInfo{SizeBytes: aws.ToInt64(output.ContentLength)}, nil
}

func (s *s3Store) DeleteObject(ctx context.Context, req DeleteRequest) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(req.Object.Bucket),
		Key:    aws.String(req.Object.Key),
	})
	if err != nil {
		if isS3NotFound(err) {
			return fmt.Errorf("%w: delete S3 object: %v", ErrObjectNotFound, err)
		}
		return fmt.Errorf("translation object store: delete S3 object: %w", err)
	}
	return nil
}

func isS3NotFound(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	switch apiErr.ErrorCode() {
	case "NotFound", "NoSuchKey":
		return true
	default:
		return false
	}
}
